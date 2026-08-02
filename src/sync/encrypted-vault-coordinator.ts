import { ProfileRepository } from '../configuration/profile-repository';
import { SecretRepository } from '../configuration/secret-repository';
import { KeyValueStore, SecretStore } from '../configuration/storage';
import type {
  ConfigCenterVaultService,
  ConfigCenterVaultState
} from '../webview/config-center-controller';
import { EncryptedVaultEnvelope, VaultSecretEntry } from './encrypted-vault-types';
import { EncryptedVaultService } from './encrypted-vault-service';

export const ENCRYPTED_VAULT_KEY = 'aiCommit.encryptedVault.v1';
export const SYNC_PASSWORD_SECRET_KEY = 'aiCommit.sync.masterPassword';
export const LAST_APPLIED_VAULT_REVISION_KEY =
  'aiCommit.sync.lastAppliedVaultRevision';

export class EncryptedVaultCoordinator
  implements ConfigCenterVaultService
{
  private sessionPassword?: string;

  constructor(
    private readonly profiles: ProfileRepository,
    private readonly profileSecrets: SecretRepository,
    private readonly globalStore: KeyValueStore,
    private readonly localSecrets: SecretStore,
    private readonly crypto: EncryptedVaultService = new EncryptedVaultService()
  ) {}

  async initialize(): Promise<void> {
    const catalog = await this.profiles.getCatalog();
    if (!catalog.encryptedSyncEnabled) {
      return;
    }
    const remembered = await this.localSecrets.get(SYNC_PASSWORD_SECRET_KEY);
    if (!remembered) {
      return;
    }
    try {
      await this.unlock(remembered, true);
    } catch {
      this.sessionPassword = undefined;
      await this.localSecrets.delete(SYNC_PASSWORD_SECRET_KEY);
    }
  }

  async getState(): Promise<ConfigCenterVaultState> {
    const catalog = await this.profiles.getCatalog();
    if (!catalog.encryptedSyncEnabled) {
      return { enabled: false, status: 'disabled' };
    }
    const envelope = this.globalStore.get<EncryptedVaultEnvelope>(
      ENCRYPTED_VAULT_KEY
    );
    return {
      enabled: true,
      status: this.sessionPassword ? 'unlocked' : 'locked',
      revision: catalog.vaultRevision ?? envelope?.revision
    };
  }

  async enable(password: string, remember: boolean): Promise<void> {
    const catalogBefore = await this.profiles.getCatalog();
    const envelopeBefore = this.globalStore.get<EncryptedVaultEnvelope>(
      ENCRYPTED_VAULT_KEY
    );
    const rememberedBefore = await this.localSecrets.get(
      SYNC_PASSWORD_SECRET_KEY
    );
    const lastAppliedBefore = await this.localSecrets.get(
      LAST_APPLIED_VAULT_REVISION_KEY
    );
    const revision =
      Math.max(catalogBefore.vaultRevision ?? 0, envelopeBefore?.revision ?? 0) +
      1;
    const envelope = await this.crypto.encrypt(
      await this.collectLocalSecrets(),
      password,
      revision
    );

    try {
      await this.globalStore.update(ENCRYPTED_VAULT_KEY, envelope);
      await this.profiles.setEncryptedSyncState(true, revision);
      await this.storeRememberedPassword(password, remember);
      await this.localSecrets.store(
        LAST_APPLIED_VAULT_REVISION_KEY,
        String(revision)
      );
      this.sessionPassword = password;
    } catch (error) {
      await this.globalStore.update(ENCRYPTED_VAULT_KEY, envelopeBefore);
      await this.profiles.restoreCatalog(catalogBefore);
      await this.restoreLocalSecret(
        SYNC_PASSWORD_SECRET_KEY,
        rememberedBefore
      );
      await this.restoreLocalSecret(
        LAST_APPLIED_VAULT_REVISION_KEY,
        lastAppliedBefore
      );
      throw error;
    }
  }

  async unlock(password: string, remember: boolean): Promise<void> {
    const envelope = this.globalStore.get<EncryptedVaultEnvelope>(
      ENCRYPTED_VAULT_KEY
    );
    if (!envelope) {
      throw new Error('VAULT_NOT_AVAILABLE');
    }
    const plaintext = await this.crypto.decrypt(envelope, password);
    const previousKeys = new Map<string, string | undefined>();
    const rememberedBefore = await this.localSecrets.get(
      SYNC_PASSWORD_SECRET_KEY
    );
    const lastAppliedBefore = await this.localSecrets.get(
      LAST_APPLIED_VAULT_REVISION_KEY
    );

    try {
      for (const entry of plaintext.secrets) {
        previousKeys.set(
          entry.profileId,
          await this.profileSecrets.getApiKey(entry.profileId)
        );
        await this.profileSecrets.storeApiKey(entry.profileId, entry.apiKey);
        if ((await this.profileSecrets.getApiKey(entry.profileId)) !== entry.apiKey) {
          throw new Error('SECRET_VERIFICATION_FAILED');
        }
      }
      await this.storeRememberedPassword(password, remember);
      await this.localSecrets.store(
        LAST_APPLIED_VAULT_REVISION_KEY,
        String(envelope.revision)
      );
      const catalog = await this.profiles.getCatalog();
      if (
        !catalog.encryptedSyncEnabled ||
        catalog.vaultRevision !== envelope.revision
      ) {
        await this.profiles.setEncryptedSyncState(true, envelope.revision);
      }
      this.sessionPassword = password;
    } catch (error) {
      for (const [profileId, previousKey] of previousKeys) {
        if (previousKey === undefined) {
          await this.profileSecrets.deleteApiKey(profileId);
        } else {
          await this.profileSecrets.storeApiKey(profileId, previousKey);
        }
      }
      await this.restoreLocalSecret(
        SYNC_PASSWORD_SECRET_KEY,
        rememberedBefore
      );
      await this.restoreLocalSecret(
        LAST_APPLIED_VAULT_REVISION_KEY,
        lastAppliedBefore
      );
      throw error;
    }
  }

  async rebuild(): Promise<void> {
    const catalogBefore = await this.profiles.getCatalog();
    if (!catalogBefore.encryptedSyncEnabled) {
      throw new Error('VAULT_NOT_ENABLED');
    }
    const password =
      this.sessionPassword ??
      (await this.localSecrets.get(SYNC_PASSWORD_SECRET_KEY));
    if (!password) {
      throw new Error('VAULT_LOCKED');
    }
    const envelopeBefore = this.globalStore.get<EncryptedVaultEnvelope>(
      ENCRYPTED_VAULT_KEY
    );
    const revision =
      Math.max(catalogBefore.vaultRevision ?? 0, envelopeBefore?.revision ?? 0) +
      1;
    const envelope = await this.crypto.encrypt(
      await this.collectLocalSecrets(),
      password,
      revision
    );

    try {
      await this.globalStore.update(ENCRYPTED_VAULT_KEY, envelope);
      await this.profiles.setEncryptedSyncState(true, revision);
      await this.localSecrets.store(
        LAST_APPLIED_VAULT_REVISION_KEY,
        String(revision)
      );
      this.sessionPassword = password;
    } catch (error) {
      await this.globalStore.update(ENCRYPTED_VAULT_KEY, envelopeBefore);
      await this.profiles.restoreCatalog(catalogBefore);
      throw error;
    }
  }

  async disable(): Promise<void> {
    await this.globalStore.update(ENCRYPTED_VAULT_KEY, undefined);
    await this.profiles.setEncryptedSyncState(false);
    await this.localSecrets.delete(SYNC_PASSWORD_SECRET_KEY);
    await this.localSecrets.delete(LAST_APPLIED_VAULT_REVISION_KEY);
    this.sessionPassword = undefined;
  }

  async secretsChanged(): Promise<void> {
    if (!(await this.profiles.getCatalog()).encryptedSyncEnabled) {
      return;
    }
    await this.rebuild();
  }

  dispose(): void {
    this.sessionPassword = undefined;
  }

  private async collectLocalSecrets(): Promise<VaultSecretEntry[]> {
    const entries: VaultSecretEntry[] = [];
    for (const profile of await this.profiles.list()) {
      const apiKey = await this.profileSecrets.getApiKey(profile.id);
      if (apiKey) {
        entries.push({ profileId: profile.id, apiKey });
      }
    }
    return entries;
  }

  private async storeRememberedPassword(
    password: string,
    remember: boolean
  ): Promise<void> {
    if (remember) {
      await this.localSecrets.store(SYNC_PASSWORD_SECRET_KEY, password);
    } else {
      await this.localSecrets.delete(SYNC_PASSWORD_SECRET_KEY);
    }
  }

  private async restoreLocalSecret(
    key: string,
    value: string | undefined
  ): Promise<void> {
    if (value === undefined) {
      await this.localSecrets.delete(key);
    } else {
      await this.localSecrets.store(key, value);
    }
  }
}
