import assert from 'node:assert/strict';
import { describe, it } from 'mocha';
import { ProfileRepository, PROFILE_CATALOG_KEY } from '../src/configuration/profile-repository';
import { SecretRepository } from '../src/configuration/secret-repository';
import { KeyValueStore, SecretStore } from '../src/configuration/storage';
import { EncryptedProfileBackup, BackupProfile } from '../src/transfer/encrypted-profile-backup';
import { ProfileTransferService, TransferFiles } from '../src/transfer/profile-transfer-service';
import { EncryptedVaultService } from '../src/sync/encrypted-vault-service';

class MemoryStore implements KeyValueStore {
  values = new Map<string, unknown>();
  failNextCatalogWrite = false;
  get<T>(key: string, fallback?: T): T | undefined { return (this.values.get(key) ?? fallback) as T | undefined; }
  async update(key: string, value: unknown) {
    if (key === PROFILE_CATALOG_KEY && this.failNextCatalogWrite) {
      this.failNextCatalogWrite = false;
      throw new Error('WRITE_FAILED');
    }
    this.values.set(key, value);
  }
}

class MemorySecrets implements SecretStore {
  values = new Map<string, string>();
  failOnValue?: string;
  async get(key: string) { return this.values.get(key); }
  async store(key: string, value: string) {
    if (value === this.failOnValue) { throw new Error('WRITE_FAILED'); }
    this.values.set(key, value);
  }
  async delete(key: string) { this.values.delete(key); }
}

class MemoryFiles implements TransferFiles {
  contents?: Uint8Array;
  cancelSave = false;
  async save(contents: Uint8Array) {
    if (this.cancelSave) { return false; }
    this.contents = contents;
    return true;
  }
  async open() { return this.contents; }
}

const fixture = {
  id: 'source-profile', provider: 'openai', name: 'Personal',
  baseUrl: 'https://example.com/v1', model: 'model-1', apiKey: 'sk-very-secret-1234',
  options: { apiType: 'response', temperature: 0.7, reasoningEffort: 'high', textVerbosity: 'low' }
} satisfies BackupProfile;

const { apiKey: _fixtureKey, id: _fixtureId, ...profileInput } = fixture;

function harness() {
  const store = new MemoryStore();
  const local = new MemorySecrets();
  const profiles = new ProfileRepository(store);
  const secrets = new SecretRepository(local);
  const files = new MemoryFiles();
  return { store, local, profiles, secrets, files, service: new ProfileTransferService(profiles, secrets, files, store) };
}

describe('encrypted profile backup', () => {
  const codec = new EncryptedProfileBackup();
  it('encrypts all profile data with a fresh salt and nonce and restores both providers', async () => {
    const profiles: BackupProfile[] = [fixture, { ...fixture, id: 'anthropic', name: 'Claude', provider: 'anthropic', options: { temperature: 0.5 } }];
    const first = await codec.encrypt(profiles, 'password');
    const second = await codec.encrypt(profiles, 'password');
    assert.notDeepEqual(first, second);
    for (const plaintext of [fixture.apiKey, fixture.baseUrl, fixture.name, 'password']) {
      assert.equal(Buffer.from(first).toString().includes(plaintext), false);
    }
    assert.deepEqual(await codec.decrypt(first, 'password'), profiles);
  });
  it('rejects wrong passwords, tampering, unsupported versions and unbounded KDF parameters', async () => {
    const bytes = await codec.encrypt([fixture], 'password');
    await assert.rejects(codec.decrypt(bytes, 'wrong'), /BACKUP_DECRYPT_FAILED/);
    const envelope = JSON.parse(Buffer.from(bytes).toString());
    for (const changes of [
      { ciphertext: 'AAAA' }, { nonce: 'AAAA' }, { authTag: 'AAAA' },
      { version: 99 }, { kdfParams: { N: 1073741824, r: 8, p: 1 } }
    ]) {
      await assert.rejects(codec.decrypt(Buffer.from(JSON.stringify({ ...envelope, ...changes })), 'password'), /BACKUP_/);
    }
  });
  it('rejects invalid profile data before encryption', async () => {
    for (const changes of [{ baseUrl: 'file:///secret' }, { apiKey: '' }, { options: { temperature: 99 } }, { provider: 'other' }]) {
      await assert.rejects(codec.encrypt([{ ...fixture, ...changes } as BackupProfile], 'password'), /BACKUP_INVALID/);
    }
    await assert.rejects(codec.encrypt([fixture, fixture], 'password'), /BACKUP_INVALID/);
    await assert.rejects(codec.encrypt([fixture], ' '), /BACKUP_PASSWORD_REQUIRED/);
  });
});

describe('profile file transfer', () => {
  it('recognizes the original ID after an imported profile is renamed', async () => {
    const target = harness();
    target.files.contents = await new EncryptedProfileBackup().encrypt([fixture], 'password');
    await target.service.import('password');
    const [profile] = await target.profiles.list();
    await target.profiles.update(profile.id, { name: 'Renamed locally' });
    assert.deepEqual(await target.service.import('password'), { status: 'completed', imported: 0, skipped: 1 });
  });
  it('round trips profiles and keys without changing the active selection or storing plaintext in metadata', async () => {
    const source = harness();
    const profile = await source.profiles.create({ ...profileInput, keyHint: source.secrets.createHint(fixture.apiKey) });
    await source.secrets.storeApiKey(profile.id, fixture.apiKey);
    await source.profiles.setDefault(profile.id);
    assert.equal((await source.service.export('password')).status, 'completed');
    const target = harness();
    target.files.contents = source.files.contents;
    assert.deepEqual(await target.service.import('password'), { status: 'completed', imported: 1, skipped: 0 });
    const [imported] = await target.profiles.list();
    assert.equal(await target.secrets.getApiKey(imported.id), fixture.apiKey);
    assert.equal(imported.name, fixture.name);
    assert.deepEqual(imported.options, fixture.options);
    assert.equal((await target.profiles.getCatalog()).defaultProfileId, undefined);
    assert.equal(JSON.stringify([...target.store.values]).includes(fixture.apiKey), false);
  });
  it('skips existing IDs and same-provider names and preserves their keys and current selection', async () => {
    const target = harness();
    const existing = await target.profiles.create({ ...profileInput, name: 'PERSONAL', keyHint: 'masked' });
    await target.secrets.storeApiKey(existing.id, 'sk-local-key');
    await target.profiles.setDefault(existing.id);
    target.files.contents = await new EncryptedProfileBackup().encrypt([fixture], 'password');
    assert.deepEqual(await target.service.import('password'), { status: 'completed', imported: 0, skipped: 1 });
    assert.equal(await target.secrets.getApiKey(existing.id), 'sk-local-key');
    assert.equal((await target.profiles.getCatalog()).defaultProfileId, existing.id);
  });
  it('does not mutate any data for a wrong password or a cancelled dialog', async () => {
    const target = harness();
    assert.deepEqual(await target.service.import('password'), { status: 'cancelled' });
    target.files.contents = await new EncryptedProfileBackup().encrypt([fixture], 'password');
    await assert.rejects(target.service.import('wrong'), /BACKUP_DECRYPT_FAILED/);
    assert.deepEqual(await target.profiles.list(), []);
    assert.equal(target.local.values.size, 0);
  });
  it('rolls back earlier secret writes when a later secret or catalog write fails', async () => {
    for (const failCatalog of [false, true]) {
      const target = harness();
      const before = await target.profiles.getCatalog();
      const second = { ...fixture, id: 'second', name: 'Second', apiKey: 'sk-second' };
      target.files.contents = await new EncryptedProfileBackup().encrypt([fixture, second], 'password');
      if (failCatalog) { target.store.failNextCatalogWrite = true; }
      else { target.local.failOnValue = second.apiKey; }
      await assert.rejects(target.service.import('password'), /BACKUP_IMPORT_FAILED/);
      assert.deepEqual(await target.profiles.getCatalog(), before);
      assert.equal(target.local.values.size, 0);
    }
  });
  it('refuses to export a partial backup when a profile has no local key', async () => {
    const source = harness();
    await source.profiles.create({ ...profileInput, keyHint: 'masked' });
    await assert.rejects(source.service.export('password'), /BACKUP_MISSING_KEYS/);
    assert.equal(source.files.contents, undefined);
  });
  it('reports export cancellation and file errors without modifying the catalog', async () => {
    const source = harness();
    const profile = await source.profiles.create({ ...profileInput, keyHint: 'masked' });
    await source.secrets.storeApiKey(profile.id, fixture.apiKey);
    const before = await source.profiles.getCatalog();
    source.files.cancelSave = true;
    assert.deepEqual(await source.service.export('password'), { status: 'cancelled' });
    source.files.save = async () => { throw new Error('filesystem details'); };
    await assert.rejects(source.service.export('password'), /BACKUP_WRITE_FAILED/);
    source.files.open = async () => { throw new Error('filesystem details'); };
    await assert.rejects(source.service.import('password'), /BACKUP_READ_FAILED/);
    assert.deepEqual(await source.profiles.getCatalog(), before);
  });
  it('rejects an oversized or malformed file without touching local secrets', async () => {
    const target = harness();
    target.files.contents = Buffer.alloc(5 * 1024 * 1024 + 1);
    await assert.rejects(target.service.import('password'), /BACKUP_TOO_LARGE/);
    target.files.contents = Buffer.from('{broken json');
    await assert.rejects(target.service.import('password'), /BACKUP_INVALID/);
    assert.equal(target.local.values.size, 0);
  });
  it('recovers only missing legacy keys without enabling sync or changing existing keys', async () => {
    const target = harness();
    const first = await target.profiles.create({ ...profileInput, keyHint: 'masked' });
    const second = await target.profiles.create({ ...profileInput, name: 'Second', keyHint: 'masked' });
    await target.secrets.storeApiKey(second.id, 'sk-new-local-key');
    const envelope = await new EncryptedVaultService().encrypt([
      { profileId: first.id, apiKey: fixture.apiKey },
      { profileId: second.id, apiKey: 'sk-old-key' }
    ], 'old password', 1);
    target.store.values.set('aiCommit.encryptedVault.localBackup.v1', envelope);
    assert.equal((await target.service.getState()).legacyAvailable, true);
    await assert.rejects(target.service.recoverLegacy('wrong'), /BACKUP_DECRYPT_FAILED/);
    assert.equal(await target.secrets.getApiKey(first.id), undefined);
    assert.deepEqual(await target.service.recoverLegacy('old password'), { status: 'completed', imported: 1, skipped: 0 });
    assert.equal(await target.secrets.getApiKey(first.id), fixture.apiKey);
    assert.equal(await target.secrets.getApiKey(second.id), 'sk-new-local-key');
    assert.equal((await target.service.getState()).legacyAvailable, false);
    assert.equal((await target.profiles.getCatalog()).encryptedSyncEnabled, false);
  });
});
