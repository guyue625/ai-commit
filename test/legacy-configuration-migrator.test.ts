import assert from 'node:assert/strict';
import { describe, it } from 'mocha';
import {
  LegacyConfigurationMigrator,
  LegacyConfigurationSnapshot,
  LegacyConfigurationStore
} from '../src/configuration/legacy-configuration-migrator';
import { ProfileRepository } from '../src/configuration/profile-repository';
import { SecretRepository } from '../src/configuration/secret-repository';
import { KeyValueStore, SecretStore } from '../src/configuration/storage';

class MemoryStore implements KeyValueStore {
  private readonly values = new Map<string, unknown>();

  get<T>(key: string, defaultValue?: T): T | undefined {
    return (this.values.has(key) ? this.values.get(key) : defaultValue) as
      | T
      | undefined;
  }

  async update(key: string, value: unknown): Promise<void> {
    if (value === undefined) {
      this.values.delete(key);
    } else {
      this.values.set(key, value);
    }
  }
}

class ControlledSecretStore implements SecretStore {
  readonly values = new Map<string, string>();
  failStore = false;
  corruptRead = false;

  async get(key: string): Promise<string | undefined> {
    const value = this.values.get(key);
    return this.corruptRead && value ? `${value}-corrupted` : value;
  }

  async store(key: string, value: string): Promise<void> {
    if (this.failStore) {
      throw new Error('secret store unavailable');
    }
    this.values.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.values.delete(key);
  }
}

class MemoryLegacyStore implements LegacyConfigurationStore {
  migrationComplete = false;
  failClear = false;

  constructor(public snapshot: LegacyConfigurationSnapshot) {}

  async readSnapshot(): Promise<LegacyConfigurationSnapshot> {
    return { ...this.snapshot };
  }

  async isMigrationComplete(): Promise<boolean> {
    return this.migrationComplete;
  }

  async clearMigratedApiKeys(): Promise<void> {
    if (this.failClear) {
      throw new Error('settings update unavailable');
    }
    this.snapshot.openAiApiKey = undefined;
    this.snapshot.claudeApiKey = undefined;
  }

  async restoreApiKeys(snapshot: LegacyConfigurationSnapshot): Promise<void> {
    this.snapshot.openAiApiKey = snapshot.openAiApiKey;
    this.snapshot.claudeApiKey = snapshot.claudeApiKey;
  }

  async markMigrationComplete(): Promise<void> {
    this.migrationComplete = true;
  }
}

const legacySnapshot = (): LegacyConfigurationSnapshot => ({
  provider: 'openai',
  openAiApiKey: 'sk-openai-AAAA',
  openAiBaseUrl: 'https://proxy.example/v1',
  openAiModel: 'proxy-model',
  openAiApiType: 'response',
  openAiTemperature: 0.3,
  openAiReasoningEffort: 'high',
  openAiTextVerbosity: 'low',
  claudeApiKey: 'sk-ant-claude-BBBB',
  claudeBaseUrl: '',
  claudeModel: 'claude-sonnet-4-5',
  claudeTemperature: 0.4,
  geminiApiKey: 'gemini-key-must-remain'
});

function createFixture(snapshot = legacySnapshot()) {
  let id = 0;
  const profileRepository = new ProfileRepository(
    new MemoryStore(),
    () => 1000,
    () => `profile-${++id}`
  );
  const secretStore = new ControlledSecretStore();
  const secretRepository = new SecretRepository(secretStore);
  const legacyStore = new MemoryLegacyStore(snapshot);
  const migrator = new LegacyConfigurationMigrator(
    profileRepository,
    secretRepository,
    legacyStore
  );
  return {
    profileRepository,
    secretRepository,
    secretStore,
    legacyStore,
    migrator
  };
}

describe('LegacyConfigurationMigrator', () => {
  it('imports OpenAI and Claude settings, verifies secrets, then clears plaintext keys', async () => {
    const fixture = createFixture();

    const result = await fixture.migrator.migrate();
    const catalog = await fixture.profileRepository.getCatalog();

    assert.equal(result.status, 'migrated');
    assert.equal(catalog.profiles.length, 2);
    assert.equal(catalog.defaultProfileId, 'profile-1');
    assert.equal(catalog.profiles[0].baseUrl, 'https://proxy.example/v1');
    assert.equal(catalog.profiles[1].baseUrl, 'https://api.anthropic.com');
    assert.equal(
      await fixture.secretRepository.getApiKey('profile-1'),
      'sk-openai-AAAA'
    );
    assert.equal(
      await fixture.secretRepository.getApiKey('profile-2'),
      'sk-ant-claude-BBBB'
    );
    assert.equal(fixture.legacyStore.snapshot.openAiApiKey, undefined);
    assert.equal(fixture.legacyStore.snapshot.claudeApiKey, undefined);
    assert.equal(
      fixture.legacyStore.snapshot.geminiApiKey,
      'gemini-key-must-remain'
    );
    assert.equal(fixture.legacyStore.migrationComplete, true);
  });

  it('uses Claude as the default when the legacy provider is claude', async () => {
    const fixture = createFixture({ ...legacySnapshot(), provider: 'claude' });

    await fixture.migrator.migrate();

    assert.equal(
      (await fixture.profileRepository.getCatalog()).defaultProfileId,
      'profile-2'
    );
  });

  it('rolls back profiles and preserves legacy keys when SecretStorage write fails', async () => {
    const fixture = createFixture();
    fixture.secretStore.failStore = true;

    await assert.rejects(fixture.migrator.migrate(), /MIGRATION_FAILED/);

    assert.equal((await fixture.profileRepository.list()).length, 0);
    assert.equal(fixture.legacyStore.snapshot.openAiApiKey, 'sk-openai-AAAA');
    assert.equal(fixture.legacyStore.snapshot.claudeApiKey, 'sk-ant-claude-BBBB');
    assert.equal(fixture.legacyStore.migrationComplete, false);
  });

  it('rolls back when SecretStorage read-back verification differs', async () => {
    const fixture = createFixture();
    fixture.secretStore.corruptRead = true;

    await assert.rejects(fixture.migrator.migrate(), /MIGRATION_FAILED/);

    assert.equal((await fixture.profileRepository.list()).length, 0);
    assert.equal(fixture.secretStore.values.size, 0);
    assert.equal(fixture.legacyStore.snapshot.openAiApiKey, 'sk-openai-AAAA');
  });

  it('restores old keys and catalog when clearing Settings fails', async () => {
    const fixture = createFixture();
    fixture.legacyStore.failClear = true;

    await assert.rejects(fixture.migrator.migrate(), /MIGRATION_FAILED/);

    assert.equal((await fixture.profileRepository.list()).length, 0);
    assert.equal(fixture.secretStore.values.size, 0);
    assert.equal(fixture.legacyStore.snapshot.openAiApiKey, 'sk-openai-AAAA');
    assert.equal(fixture.legacyStore.snapshot.claudeApiKey, 'sk-ant-claude-BBBB');
  });

  it('does nothing after the migration marker is set', async () => {
    const fixture = createFixture();
    fixture.legacyStore.migrationComplete = true;

    assert.deepEqual(await fixture.migrator.migrate(), { status: 'skipped' });
    assert.equal((await fixture.profileRepository.list()).length, 0);
    assert.equal(fixture.legacyStore.snapshot.openAiApiKey, 'sk-openai-AAAA');
  });
});
