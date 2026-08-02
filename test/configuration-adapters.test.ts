import assert from 'node:assert/strict';
import { describe, it } from 'mocha';
import { KeyValueStore } from '../src/configuration/storage';
import {
  ConfigCenterSettingsAdapter,
  ConfigurationScope,
  ConfigurationStore,
  LegacySettingsAdapter
} from '../src/configuration/configuration-adapters';

class MemoryMarkerStore implements KeyValueStore {
  readonly values = new Map<string, unknown>();

  get<T>(key: string, defaultValue?: T): T | undefined {
    return (this.values.has(key) ? this.values.get(key) : defaultValue) as
      | T
      | undefined;
  }

  async update(key: string, value: unknown): Promise<void> {
    this.values.set(key, value);
  }
}

class MemoryConfiguration implements ConfigurationStore {
  readonly values = new Map<string, Partial<Record<ConfigurationScope, unknown>>>();
  readonly updates: Array<{
    key: string;
    value: unknown;
    scope: ConfigurationScope;
  }> = [];

  set(key: string, scope: ConfigurationScope, value: unknown): void {
    const scoped = this.values.get(key) ?? {};
    scoped[scope] = value;
    this.values.set(key, scoped);
  }

  get<T>(key: string, defaultValue?: T): T | undefined {
    const scoped = this.values.get(key);
    return (scoped?.workspaceFolder ??
      scoped?.workspace ??
      scoped?.global ??
      defaultValue) as T | undefined;
  }

  inspect<T>(key: string) {
    const scoped = this.values.get(key);
    return scoped
      ? {
          globalValue: scoped.global as T | undefined,
          workspaceValue: scoped.workspace as T | undefined,
          workspaceFolderValue: scoped.workspaceFolder as T | undefined
        }
      : undefined;
  }

  async update(
    key: string,
    value: unknown,
    scope: ConfigurationScope
  ): Promise<void> {
    this.updates.push({ key, value, scope });
    const scoped = this.values.get(key) ?? {};
    if (value === undefined) {
      delete scoped[scope];
    } else {
      scoped[scope] = value;
    }
    this.values.set(key, scoped);
  }
}

describe('configuration adapters', () => {
  it('reads and updates the existing language and Prompt settings', async () => {
    const configuration = new MemoryConfiguration();
    configuration.set('AI_COMMIT_LANGUAGE', 'global', 'English');
    configuration.set('AI_COMMIT_SYSTEM_PROMPT', 'global', 'custom');
    const settings = new ConfigCenterSettingsAdapter(configuration);

    assert.deepEqual(await settings.read(), {
      language: 'English',
      systemPrompt: 'custom'
    });
    await settings.update({
      language: 'Simplified Chinese',
      systemPrompt: ''
    });

    assert.equal(
      configuration.get('AI_COMMIT_LANGUAGE'),
      'Simplified Chinese'
    );
    assert.equal(configuration.get('AI_COMMIT_SYSTEM_PROMPT'), '');
  });

  it('clears and restores only legacy OpenAI and Claude keys at their original scopes', async () => {
    const configuration = new MemoryConfiguration();
    const marker = new MemoryMarkerStore();
    configuration.set('OPENAI_API_KEY', 'global', 'sk-openai');
    configuration.set('CLAUDE_API_KEY', 'workspace', 'sk-claude');
    configuration.set('GEMINI_API_KEY', 'global', 'gemini-must-remain');
    const legacy = new LegacySettingsAdapter(configuration, marker);

    const snapshot = await legacy.readSnapshot();
    await legacy.clearMigratedApiKeys();

    assert.equal(configuration.get('OPENAI_API_KEY', ''), '');
    assert.equal(configuration.get('CLAUDE_API_KEY', ''), '');
    assert.equal(configuration.get('GEMINI_API_KEY'), 'gemini-must-remain');

    await legacy.restoreApiKeys(snapshot);
    assert.equal(configuration.get('OPENAI_API_KEY'), 'sk-openai');
    assert.equal(configuration.get('CLAUDE_API_KEY'), 'sk-claude');
    assert.equal(
      configuration.inspect('OPENAI_API_KEY')?.globalValue,
      'sk-openai'
    );
    assert.equal(
      configuration.inspect('CLAUDE_API_KEY')?.workspaceValue,
      'sk-claude'
    );
  });

  it('stores the one-time migration marker outside plaintext settings', async () => {
    const marker = new MemoryMarkerStore();
    const legacy = new LegacySettingsAdapter(
      new MemoryConfiguration(),
      marker
    );

    assert.equal(await legacy.isMigrationComplete(), false);
    await legacy.markMigrationComplete();
    assert.equal(await legacy.isMigrationComplete(), true);
  });
});
