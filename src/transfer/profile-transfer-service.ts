import { ProfileRepository } from '../configuration/profile-repository';
import { ChannelProfile } from '../configuration/profile-types';
import { SecretRepository } from '../configuration/secret-repository';
import { KeyValueStore } from '../configuration/storage';
import { EncryptedVaultEnvelope } from '../sync/encrypted-vault-types';
import { EncryptedVaultService } from '../sync/encrypted-vault-service';
import { BackupProfile, EncryptedProfileBackup } from './encrypted-profile-backup';

export interface TransferFiles {
  save(contents: Uint8Array): Promise<boolean>;
  open(): Promise<Uint8Array | undefined>;
}

export interface TransferResult {
  status: 'completed' | 'cancelled';
  imported?: number;
  skipped?: number;
}

export interface ConfigCenterTransferService {
  getState(): Promise<{ legacyAvailable: boolean }>;
  export(password: string): Promise<TransferResult>;
  import(password: string): Promise<TransferResult>;
  recoverLegacy(password: string): Promise<TransferResult>;
}

export class ProfileTransferService implements ConfigCenterTransferService {
  constructor(
    private readonly profiles: ProfileRepository,
    private readonly secrets: SecretRepository,
    private readonly files: TransferFiles,
    private readonly globalStore: KeyValueStore,
    private readonly codec = new EncryptedProfileBackup()
  ) {}

  async getState(): Promise<{ legacyAvailable: boolean }> {
    const profiles = await this.profiles.list();
    const hasMissing = (await Promise.all(profiles.map(profile => this.secrets.hasApiKey(profile.id)))).some(has => !has);
    return { legacyAvailable: hasMissing && this.legacyEnvelopes().length > 0 };
  }

  async export(password: string): Promise<TransferResult> {
    const profiles: BackupProfile[] = [];
    for (const profile of await this.profiles.list()) {
      const apiKey = await this.secrets.getApiKey(profile.id);
      if (!apiKey) { throw new Error('BACKUP_MISSING_KEYS'); }
      profiles.push({
        id: profile.id, provider: profile.provider, name: profile.name,
        baseUrl: profile.baseUrl, model: profile.model, keyLabel: profile.keyLabel,
        options: { ...profile.options }, apiKey
      });
    }
    if (profiles.length === 0) { throw new Error('BACKUP_EMPTY'); }
    const contents = await this.codec.encrypt(profiles, password);
    try {
      return { status: await this.files.save(contents) ? 'completed' : 'cancelled' };
    } catch { throw new Error('BACKUP_WRITE_FAILED'); }
  }

  async import(password: string): Promise<TransferResult> {
    let contents: Uint8Array | undefined;
    try { contents = await this.files.open(); }
    catch (error) {
      if (error instanceof Error && error.message === 'BACKUP_TOO_LARGE') { throw error; }
      throw new Error('BACKUP_READ_FAILED');
    }
    if (!contents) { return { status: 'cancelled' }; }
    const entries = await this.codec.decrypt(contents, password);
    const before = await this.profiles.getCatalog();
    const next = { ...before, profiles: [...before.profiles], encryptedSyncEnabled: false, vaultRevision: undefined };
    const written = new Map<string, string | undefined>();
    let skipped = 0;
    let catalogAttempted = false;
    try {
      for (const entry of entries) {
        if (next.profiles.some(profile => profile.id === entry.id ||
          (profile.provider === entry.provider && profile.name.toLocaleLowerCase() === entry.name.trim().toLocaleLowerCase()))) {
          skipped++;
          continue;
        }
        const id = entry.id;
        written.set(id, await this.secrets.getApiKey(id));
        await this.writeVerifiedKey(id, entry.apiKey);
        const now = Date.now();
        next.profiles.push({
          id, provider: entry.provider, name: entry.name.trim(),
          baseUrl: entry.baseUrl.trim().replace(/\/+$/, ''), model: entry.model.trim(),
          keyLabel: entry.keyLabel?.trim() || undefined, keyHint: this.secrets.createHint(entry.apiKey),
          options: { ...entry.options }, createdAt: now, updatedAt: now
        } as ChannelProfile);
      }
      if (written.size > 0) {
        next.revision++;
        catalogAttempted = true;
        await this.profiles.restoreCatalog(next);
      }
      return { status: 'completed', imported: written.size, skipped };
    } catch {
      const rollback = await Promise.allSettled([
        ...(catalogAttempted ? [this.profiles.restoreCatalog(before)] : []),
        ...[...written].map(([id, key]) => key === undefined ? this.secrets.deleteApiKey(id) : this.secrets.storeApiKey(id, key))
      ]);
      if (rollback.some(result => result.status === 'rejected')) { throw new Error('BACKUP_ROLLBACK_FAILED'); }
      throw new Error('BACKUP_IMPORT_FAILED');
    }
  }

  async recoverLegacy(password: string): Promise<TransferResult> {
    const envelopes = this.legacyEnvelopes();
    if (envelopes.length === 0) { throw new Error('BACKUP_LEGACY_UNAVAILABLE'); }
    const keys = new Map<string, string>();
    const crypto = new EncryptedVaultService();
    let decrypted = false;
    for (const envelope of envelopes) {
      try {
        const payload = await crypto.decrypt(envelope, password);
        decrypted = true;
        for (const entry of payload.secrets) {
          if (!keys.has(entry.profileId) && entry.apiKey.trim()) { keys.set(entry.profileId, entry.apiKey); }
        }
      } catch { /* The older local backup may use a different password. */ }
    }
    if (!decrypted) { throw new Error('BACKUP_DECRYPT_FAILED'); }
    const written: string[] = [];
    try {
      for (const profile of await this.profiles.list()) {
        const key = keys.get(profile.id);
        if (key && !(await this.secrets.hasApiKey(profile.id))) {
          written.push(profile.id);
          await this.writeVerifiedKey(profile.id, key);
        }
      }
      return { status: 'completed', imported: written.length, skipped: 0 };
    } catch {
      const rollback = await Promise.allSettled(written.map(id => this.secrets.deleteApiKey(id)));
      if (rollback.some(result => result.status === 'rejected')) { throw new Error('BACKUP_ROLLBACK_FAILED'); }
      throw new Error('BACKUP_IMPORT_FAILED');
    }
  }

  private async writeVerifiedKey(id: string, apiKey: string): Promise<void> {
    await this.secrets.storeApiKey(id, apiKey);
    if (await this.secrets.getApiKey(id) !== apiKey.trim()) { throw new Error('SECRET_VERIFICATION_FAILED'); }
  }

  private legacyEnvelopes(): EncryptedVaultEnvelope[] {
    return ['aiCommit.encryptedVault.v1', 'aiCommit.encryptedVault.localBackup.v1']
      .map(key => this.globalStore.get<EncryptedVaultEnvelope>(key))
      .filter((value): value is EncryptedVaultEnvelope => !!value)
      .sort((a, b) => b.revision - a.revision);
  }
}
