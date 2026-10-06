import assert from 'node:assert/strict';
import { describe, it } from 'mocha';
import {
  PROFILE_CATALOG_BACKUP_KEY,
  PROFILE_CATALOG_KEY,
  ProfileRepository
} from '../src/configuration/profile-repository';
import { KeyValueStore } from '../src/configuration/storage';

class MemoryStore implements KeyValueStore {
  readonly values = new Map<string, unknown>();

  get<T>(key: string, defaultValue?: T): T | undefined {
    return (this.values.has(key) ? this.values.get(key) : defaultValue) as
      | T
      | undefined;
  }

  async update(key: string, value: unknown): Promise<void> {
    if (value === undefined) {
      this.values.delete(key);
      return;
    }
    this.values.set(key, value);
  }
}

const openAiInput = {
  provider: 'openai' as const,
  name: 'DeepSeek personal',
  baseUrl: 'https://api.deepseek.com/v1/',
  model: 'deepseek-chat',
  keyHint: 'sk-••••2A9F',
  options: {
    apiType: 'completion' as const,
    temperature: 0.7,
    reasoningEffort: 'medium' as const,
    textVerbosity: 'medium' as const
  }
};

describe('ProfileRepository', () => {
  it('recovers the v2 backup before considering legacy migration when the primary is missing', async () => {
    const store = new MemoryStore();
    const repository = new ProfileRepository(store);
    const profile = await repository.create(openAiInput);
    store.values.delete(PROFILE_CATALOG_KEY);
    assert.deepEqual((await repository.getCatalog()).profiles, [profile]);
  });
  it('migrates the newest old catalog once and ignores later legacy sync writes', async () => {
    const source = new ProfileRepository(new MemoryStore(), () => 1000, () => 'legacy-profile');
    const profile = await source.create(openAiInput);
    await source.setDefault(profile.id);
    const backup = { ...await source.getCatalog(), encryptedSyncEnabled: true, vaultRevision: 7 };
    const store = new MemoryStore();
    store.values.set('aiCommit.profileCatalog.v1', { ...backup, profiles: [], revision: 0 });
    store.values.set('aiCommit.profileCatalog.localBackup.v1', backup);
    const repository = new ProfileRepository(store);
    const migrated = await repository.getCatalog();
    assert.deepEqual(migrated.profiles, [profile]);
    assert.equal(migrated.defaultProfileId, profile.id);
    assert.equal(migrated.encryptedSyncEnabled, false);
    assert.equal(migrated.vaultRevision, undefined);
    await repository.setDefault(undefined);
    await repository.delete(profile.id);
    store.values.set('aiCommit.profileCatalog.v1', { ...backup, revision: 999 });
    assert.deepEqual((await repository.getCatalog()).profiles, []);
  });
  it('creates a normalized profile and increments the catalog revision', async () => {
    const repository = new ProfileRepository(
      new MemoryStore(),
      () => 1000,
      () => 'profile-1'
    );

    const profile = await repository.create(openAiInput);
    const catalog = await repository.getCatalog();

    assert.equal(profile.id, 'profile-1');
    assert.equal(profile.baseUrl, 'https://api.deepseek.com/v1');
    assert.equal(profile.createdAt, 1000);
    assert.equal(catalog.schemaVersion, 1);
    assert.equal(catalog.revision, 1);
    assert.deepEqual(await repository.list('openai'), [profile]);
  });

  it('rejects duplicate names within the same provider case-insensitively', async () => {
    let id = 0;
    const repository = new ProfileRepository(
      new MemoryStore(),
      () => 1000,
      () => `profile-${++id}`
    );
    await repository.create(openAiInput);

    await assert.rejects(
      repository.create({ ...openAiInput, name: '  deepseek PERSONAL  ' }),
      /PROFILE_NAME_DUPLICATE/
    );
  });

  it('allows the same name for a different provider', async () => {
    let id = 0;
    const repository = new ProfileRepository(
      new MemoryStore(),
      () => 1000,
      () => `profile-${++id}`
    );
    await repository.create(openAiInput);

    const anthropic = await repository.create({
      provider: 'anthropic',
      name: openAiInput.name,
      baseUrl: 'https://api.anthropic.com',
      model: 'claude-sonnet-4-5',
      keyHint: 'sk-ant-••••91MX',
      options: { temperature: 0.7 }
    });

    assert.equal(anthropic.provider, 'anthropic');
  });

  it('rejects invalid URLs and empty models', async () => {
    const repository = new ProfileRepository(new MemoryStore());

    await assert.rejects(
      repository.create({ ...openAiInput, baseUrl: 'file:///tmp/api' }),
      /PROFILE_BASE_URL_INVALID/
    );
    await assert.rejects(
      repository.create({ ...openAiInput, model: '   ' }),
      /PROFILE_MODEL_REQUIRED/
    );
  });

  it('updates a profile without changing its identity or creation time', async () => {
    const repository = new ProfileRepository(
      new MemoryStore(),
      (() => {
        const times = [1000, 2000];
        return () => times.shift() ?? 2000;
      })(),
      () => 'profile-1'
    );
    const created = await repository.create(openAiInput);

    const updated = await repository.update(created.id, {
      name: 'OpenAI official',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-5-mini'
    });

    assert.equal(updated.id, created.id);
    assert.equal(updated.createdAt, created.createdAt);
    assert.equal(updated.updatedAt, 2000);
    assert.equal((await repository.getCatalog()).revision, 2);
  });

  it('sets a default profile and refuses to delete it', async () => {
    const repository = new ProfileRepository(
      new MemoryStore(),
      () => 1000,
      () => 'profile-1'
    );
    const profile = await repository.create(openAiInput);

    await repository.setDefault(profile.id);

    assert.equal((await repository.getCatalog()).defaultProfileId, profile.id);
    await assert.rejects(repository.delete(profile.id), /PROFILE_IS_DEFAULT/);
  });

  it('returns defensive copies instead of mutable catalog references', async () => {
    const repository = new ProfileRepository(
      new MemoryStore(),
      () => 1000,
      () => 'profile-1'
    );
    await repository.create(openAiInput);

    const first = await repository.getCatalog();
    first.profiles[0].name = 'mutated outside repository';

    assert.equal(
      (await repository.getCatalog()).profiles[0].name,
      'DeepSeek personal'
    );
  });

  it('recovers a local catalog backup when the primary catalog is empty and older', async () => {
    const store = new MemoryStore();
    const repository = new ProfileRepository(
      store,
      () => 1000,
      () => 'profile-1'
    );
    const profile = await repository.create(openAiInput);
    store.values.set(PROFILE_CATALOG_KEY, {
      schemaVersion: 1,
      revision: 0,
      profiles: [],
      encryptedSyncEnabled: false
    });

    const recovered = await repository.getCatalog();

    assert.deepEqual(recovered.profiles, [profile]);
    assert.deepEqual(store.values.get(PROFILE_CATALOG_BACKUP_KEY), recovered);
  });
});
