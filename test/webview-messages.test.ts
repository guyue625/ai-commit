import assert from 'node:assert/strict';
import { describe, it } from 'mocha';
import { ActiveProfileResolver } from '../src/configuration/active-profile-resolver';
import { ProfileRepository } from '../src/configuration/profile-repository';
import { SecretRepository } from '../src/configuration/secret-repository';
import { KeyValueStore, SecretStore } from '../src/configuration/storage';
import {
  ConfigCenterController,
  ConfigCenterSettingsService,
  ConfigCenterVaultService,
  ConfigCenterVaultState
} from '../src/webview/config-center-controller';
import { parseWebviewRequest } from '../src/webview/messages';

class MemoryKeyValueStore implements KeyValueStore {
  private readonly values = new Map<string, unknown>();

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

class MemorySecretStore implements SecretStore {
  private readonly values = new Map<string, string>();

  async get(key: string): Promise<string | undefined> {
    return this.values.get(key);
  }

  async store(key: string, value: string): Promise<void> {
    this.values.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.values.delete(key);
  }
}

class FakeSettingsService implements ConfigCenterSettingsService {
  value = { language: 'English', systemPrompt: '' };
  updates: Array<Partial<typeof this.value>> = [];

  async read() {
    return { ...this.value };
  }

  async update(changes: Partial<typeof this.value>): Promise<void> {
    this.updates.push({ ...changes });
    this.value = { ...this.value, ...changes };
  }
}

class FakeVaultService implements ConfigCenterVaultService {
  state: ConfigCenterVaultState = {
    enabled: true,
    status: 'locked',
    revision: 2
  };
  calls: string[] = [];

  async getState() {
    return { ...this.state };
  }

  async enable(_password: string, _remember: boolean): Promise<void> {
    this.calls.push('enable');
    this.state = { ...this.state, enabled: true, status: 'unlocked' };
  }

  async unlock(_password: string, _remember: boolean): Promise<void> {
    this.calls.push('unlock');
    this.state = { ...this.state, status: 'unlocked' };
  }

  async rebuild(): Promise<void> {
    this.calls.push('rebuild');
  }

  async disable(): Promise<void> {
    this.calls.push('disable');
    this.state = { enabled: false, status: 'disabled', revision: 2 };
  }

  async secretsChanged(): Promise<void> {
    this.calls.push('secretsChanged');
  }
}

class FakeConnectionTester {
  models = ['gpt-4.1', 'gpt-5-mini'];
  testCalls = 0;
  listCalls = 0;
  testError?: Error;

  async listModels(): Promise<string[]> {
    this.listCalls += 1;
    return [...this.models];
  }

  async testConnection(): Promise<{ latencyMs: number }> {
    this.testCalls += 1;
    if (this.testError) {
      throw this.testError;
    }
    return { latencyMs: 42 };
  }
}

function createControllerHarness() {
  const globalStore = new MemoryKeyValueStore();
  const workspaceStore = new MemoryKeyValueStore();
  const secretStore = new MemorySecretStore();
  let nextId = 1;
  const profiles = new ProfileRepository(
    globalStore,
    Date.now,
    () => `profile-${nextId++}`
  );
  const secrets = new SecretRepository(secretStore);
  const activeProfiles = new ActiveProfileResolver(
    profiles,
    secrets,
    workspaceStore
  );
  const connectionTester = new FakeConnectionTester();
  const settings = new FakeSettingsService();
  const vault = new FakeVaultService();
  const controller = new ConfigCenterController({
    profiles,
    secrets,
    activeProfiles,
    connectionTester,
    settings,
    vault,
    locale: 'en'
  });

  return {
    controller,
    profiles,
    secrets,
    activeProfiles,
    connectionTester,
    settings,
    vault
  };
}

async function createOpenAIProfile(
  harness: ReturnType<typeof createControllerHarness>
) {
  const profile = await harness.profiles.create({
    provider: 'openai',
    name: 'OpenAI official',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-5-mini',
    keyHint: 'sk-••••K2P1',
    options: {
      apiType: 'completion',
      temperature: 0.7,
      reasoningEffort: 'medium',
      textVerbosity: 'medium'
    }
  });
  await harness.secrets.storeApiKey(profile.id, 'sk-openai-K2P1');
  return profile;
}

describe('webview messages', () => {
  it('accepts a valid OpenAI profile creation request', () => {
    const message = {
      type: 'profile.create',
      requestId: 'request-1',
      payload: {
        provider: 'openai',
        name: 'DeepSeek personal',
        baseUrl: 'https://api.deepseek.com/v1',
        model: 'deepseek-chat',
        apiKey: 'sk-secret',
        keyLabel: 'Personal DeepSeek',
        options: {
          apiType: 'completion',
          temperature: 0.7,
          reasoningEffort: 'medium',
          textVerbosity: 'medium'
        }
      }
    };

    assert.deepEqual(parseWebviewRequest(message), message);
  });

  it('accepts a vault unlock request', () => {
    const message = {
      type: 'vault.unlock',
      requestId: 'request-2',
      payload: { password: 'sync password', remember: true }
    };

    assert.deepEqual(parseWebviewRequest(message), message);
  });

  it('accepts an explicit model request for an unsaved profile draft', () => {
    const message = {
      type: 'profile.models',
      requestId: 'request-draft-models',
      payload: {
        draft: {
          provider: 'openai',
          name: 'Unsaved proxy',
          baseUrl: 'https://openai.example.com/v1',
          model: 'gpt-5-mini',
          apiKey: 'sk-unsaved-secret',
          options: {
            apiType: 'completion',
            temperature: 0.7,
            reasoningEffort: 'medium',
            textVerbosity: 'medium'
          }
        }
      }
    };

    assert.deepEqual(parseWebviewRequest(message), message);
  });

  it('rejects unknown message types and empty request ids', () => {
    assert.throws(
      () =>
        parseWebviewRequest({
          type: 'profile.stealSecrets',
          requestId: 'request-3',
          payload: {}
        }),
      /WEBVIEW_MESSAGE_INVALID/
    );
    assert.throws(
      () =>
        parseWebviewRequest({
          type: 'profile.delete',
          requestId: ' ',
          payload: { profileId: 'profile-1' }
        }),
      /WEBVIEW_MESSAGE_INVALID/
    );
  });

  it('rejects invalid providers and non-http Base URLs', () => {
    const base = {
      type: 'profile.create',
      requestId: 'request-4',
      payload: {
        provider: 'openai',
        name: 'Invalid',
        baseUrl: 'https://api.example/v1',
        model: 'model',
        apiKey: 'key',
        options: {
          apiType: 'completion',
          temperature: 0.7,
          reasoningEffort: 'medium',
          textVerbosity: 'medium'
        }
      }
    };

    assert.throws(
      () =>
        parseWebviewRequest({
          ...base,
          payload: { ...base.payload, provider: 'gemini' }
        }),
      /WEBVIEW_MESSAGE_INVALID/
    );
    assert.throws(
      () =>
        parseWebviewRequest({
          ...base,
          payload: { ...base.payload, baseUrl: 'file:///tmp/secret' }
        }),
      /WEBVIEW_MESSAGE_INVALID/
    );
  });

  it('rejects server-controlled fields supplied by the Webview', () => {
    assert.throws(
      () =>
        parseWebviewRequest({
          type: 'profile.create',
          requestId: 'request-5',
          payload: {
            provider: 'anthropic',
            name: 'Claude',
            baseUrl: 'https://api.anthropic.com',
            model: 'claude-sonnet-4-5',
            apiKey: 'key',
            keyHint: 'full-secret',
            options: { temperature: 0.7 }
          }
        }),
      /WEBVIEW_MESSAGE_INVALID/
    );
  });

  it('rejects objects with inherited prototypes', () => {
    const message = Object.assign(Object.create({ inherited: true }), {
      type: 'profile.delete',
      requestId: 'request-6',
      payload: { profileId: 'profile-1' }
    });

    assert.throws(() => parseWebviewRequest(message), /WEBVIEW_MESSAGE_INVALID/);
  });
});

describe('ConfigCenterController', () => {
  it('builds a masked ViewModel without exposing any full API key', async () => {
    const globalStore = new MemoryKeyValueStore();
    const workspaceStore = new MemoryKeyValueStore();
    const profiles = new ProfileRepository(globalStore, () => 100, () => 'profile-1');
    const secrets = new SecretRepository(new MemorySecretStore());
    const profile = await profiles.create({
      provider: 'openai',
      name: 'DeepSeek personal',
      baseUrl: 'https://api.deepseek.com/v1',
      model: 'deepseek-chat',
      keyLabel: 'Personal',
      keyHint: 'sk-••••A9F',
      options: {
        apiType: 'completion',
        temperature: 0.7,
        reasoningEffort: 'medium',
        textVerbosity: 'medium'
      }
    });
    await secrets.storeApiKey(profile.id, 'sk-secret-A9F');
    const activeProfiles = new ActiveProfileResolver(
      profiles,
      secrets,
      workspaceStore
    );
    await activeProfiles.setWorkspaceActiveProfile(profile.id);
    const controller = new ConfigCenterController({
      profiles,
      secrets,
      activeProfiles,
      connectionTester: {
        async listModels() {
          return [];
        },
        async testConnection() {
          return { latencyMs: 0 };
        }
      },
      settings: new FakeSettingsService(),
      vault: new FakeVaultService(),
      locale: 'en'
    });

    const response = await controller.handle({
      type: 'ready',
      requestId: 'ready-1',
      payload: {}
    });

    assert.equal(response.ok, true);
    if (!response.ok) {
      return;
    }
    assert.equal(response.data.view.profiles[0].keyHint, 'sk-••••A9F');
    assert.equal('apiKey' in response.data.view.profiles[0], false);
    assert.equal(response.data.view.activeProfileId, 'profile-1');
    assert.equal(response.data.view.sync.status, 'locked');
    assert.equal(
      JSON.stringify(response).includes('sk-secret-A9F'),
      false
    );
  });

  it('saves a new profile draft and stores its full key only in SecretStorage', async () => {
    const harness = createControllerHarness();

    const response = await harness.controller.handle({
      type: 'profile.create',
      requestId: 'create-1',
      payload: {
        provider: 'anthropic',
        name: 'Claude company gateway',
        baseUrl: 'https://claude.example.com',
        model: 'claude-sonnet-4-5',
        apiKey: 'sk-ant-company-7K2P',
        keyLabel: 'Company',
        options: { temperature: 0.5 },
        activate: false
      }
    });

    assert.equal(response.ok, true);
    const profiles = await harness.profiles.list();
    assert.equal(profiles.length, 1);
    assert.equal(profiles[0].keyHint, 'sk-ant-••••7K2P');
    assert.equal(
      await harness.secrets.getApiKey(profiles[0].id),
      'sk-ant-company-7K2P'
    );
    assert.equal(
      harness.activeProfiles.getWorkspaceActiveProfileId(),
      undefined
    );
    assert.deepEqual(harness.vault.calls, ['secretsChanged']);
    assert.equal(
      JSON.stringify(response).includes('sk-ant-company-7K2P'),
      false
    );
  });

  it('updates profile metadata and rotates its SecretStorage key', async () => {
    const harness = createControllerHarness();
    const profile = await harness.profiles.create({
      provider: 'openai',
      name: 'OpenAI old',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4.1',
      keyHint: 'sk-••••OLD1',
      options: {
        apiType: 'completion',
        temperature: 0.7,
        reasoningEffort: 'medium',
        textVerbosity: 'medium'
      }
    });
    await harness.secrets.storeApiKey(profile.id, 'sk-old-OLD1');

    const response = await harness.controller.handle({
      type: 'profile.update',
      requestId: 'update-1',
      payload: {
        profileId: profile.id,
        changes: {
          name: 'OpenAI proxy',
          baseUrl: 'https://openai.example.com/v1',
          model: 'gpt-5-mini',
          apiKey: 'sk-new-NEW2',
          keyLabel: 'Proxy',
          options: {
            apiType: 'response',
            temperature: 0.2,
            reasoningEffort: 'high',
            textVerbosity: 'low'
          }
        }
      }
    });

    assert.equal(response.ok, true);
    const updated = await harness.profiles.get(profile.id);
    assert.equal(updated?.name, 'OpenAI proxy');
    assert.equal(updated?.baseUrl, 'https://openai.example.com/v1');
    assert.equal(updated?.keyHint, 'sk-••••NEW2');
    assert.equal(
      await harness.secrets.getApiKey(profile.id),
      'sk-new-NEW2'
    );
    assert.deepEqual(harness.vault.calls, ['secretsChanged']);
    assert.equal(JSON.stringify(response).includes('sk-new-NEW2'), false);
  });

  it('tests an existing profile and records only safe connection status', async () => {
    const harness = createControllerHarness();
    const profile = await createOpenAIProfile(harness);

    const response = await harness.controller.handle({
      type: 'profile.test',
      requestId: 'test-1',
      payload: { profileId: profile.id }
    });

    assert.equal(response.ok, true);
    assert.equal(harness.connectionTester.testCalls, 1);
    const tested = await harness.profiles.get(profile.id);
    assert.equal(tested?.lastTest?.status, 'success');
    assert.equal(tested?.lastTest?.latencyMs, 42);
    assert.equal(typeof tested?.lastTest?.testedAt, 'number');
    assert.equal(
      JSON.stringify(response).includes('sk-openai-K2P1'),
      false
    );
  });

  it('records a safe failure without returning an upstream error that may contain a key', async () => {
    const harness = createControllerHarness();
    const profile = await createOpenAIProfile(harness);
    harness.connectionTester.testError = new Error(
      'upstream rejected sk-openai-K2P1'
    );

    const response = await harness.controller.handle({
      type: 'profile.test',
      requestId: 'test-2',
      payload: { profileId: profile.id }
    });

    assert.deepEqual(response, {
      requestId: 'test-2',
      ok: false,
      error: { code: 'CONNECTION_TEST_FAILED' }
    });
    const tested = await harness.profiles.get(profile.id);
    assert.equal(tested?.lastTest?.status, 'failure');
    assert.equal(tested?.lastTest?.message, 'CONNECTION_TEST_FAILED');
    assert.equal(JSON.stringify(response).includes('sk-openai-K2P1'), false);
  });

  it('returns model ids for an explicit profile without exposing its key', async () => {
    const harness = createControllerHarness();
    const profile = await createOpenAIProfile(harness);

    const response = await harness.controller.handle({
      type: 'profile.models',
      requestId: 'models-1',
      payload: { profileId: profile.id }
    });

    assert.equal(response.ok, true);
    if (!response.ok) {
      return;
    }
    assert.deepEqual(response.data.models, ['gpt-4.1', 'gpt-5-mini']);
    assert.equal(harness.connectionTester.listCalls, 1);
    assert.equal(JSON.stringify(response).includes('sk-openai-K2P1'), false);
  });

  it('lists models for an unsaved draft without creating a profile', async () => {
    const harness = createControllerHarness();

    const response = await harness.controller.handle({
      type: 'profile.models',
      requestId: 'models-draft-1',
      payload: {
        draft: {
          provider: 'openai',
          name: 'Unsaved proxy',
          baseUrl: 'https://openai.example.com/v1',
          model: 'gpt-5-mini',
          apiKey: 'sk-unsaved-secret',
          options: {
            apiType: 'completion',
            temperature: 0.7,
            reasoningEffort: 'medium',
            textVerbosity: 'medium'
          }
        }
      }
    });

    assert.equal(response.ok, true);
    if (response.ok) {
      assert.deepEqual(response.data.models, ['gpt-4.1', 'gpt-5-mini']);
    }
    assert.deepEqual(await harness.profiles.list(), []);
    assert.equal(JSON.stringify(response).includes('sk-unsaved-secret'), false);
  });

  it('tests then activates a profile only for the current workspace', async () => {
    const harness = createControllerHarness();
    const profile = await createOpenAIProfile(harness);

    const response = await harness.controller.handle({
      type: 'profile.activate',
      requestId: 'activate-1',
      payload: { profileId: profile.id }
    });

    assert.equal(response.ok, true);
    assert.equal(harness.connectionTester.testCalls, 1);
    assert.equal(
      harness.activeProfiles.getWorkspaceActiveProfileId(),
      profile.id
    );
    assert.equal((await harness.profiles.getCatalog()).defaultProfileId, undefined);
    if (response.ok) {
      assert.equal(response.data.view.activeProfileId, profile.id);
    }
  });

  it('supports save and activate for a newly created profile', async () => {
    const harness = createControllerHarness();

    const response = await harness.controller.handle({
      type: 'profile.create',
      requestId: 'create-active-1',
      payload: {
        provider: 'openai',
        name: 'DeepSeek active',
        baseUrl: 'https://api.deepseek.com/v1',
        model: 'deepseek-chat',
        apiKey: 'sk-deepseek-ACT1',
        options: {
          apiType: 'completion',
          temperature: 0.7,
          reasoningEffort: 'medium',
          textVerbosity: 'medium'
        },
        activate: true
      }
    });

    assert.equal(response.ok, true);
    const [profile] = await harness.profiles.list();
    assert.equal(harness.connectionTester.testCalls, 1);
    assert.equal(
      harness.activeProfiles.getWorkspaceActiveProfileId(),
      profile.id
    );
  });

  it('refuses to delete the profile that is active in this workspace', async () => {
    const harness = createControllerHarness();
    const profile = await createOpenAIProfile(harness);
    await harness.activeProfiles.setWorkspaceActiveProfile(profile.id);

    const response = await harness.controller.handle({
      type: 'profile.delete',
      requestId: 'delete-active-1',
      payload: { profileId: profile.id }
    });

    assert.deepEqual(response, {
      requestId: 'delete-active-1',
      ok: false,
      error: { code: 'PROFILE_IS_ACTIVE' }
    });
    assert.notEqual(await harness.profiles.get(profile.id), undefined);
    assert.equal(
      await harness.secrets.getApiKey(profile.id),
      'sk-openai-K2P1'
    );
  });

  it('deletes an inactive profile together with its local key', async () => {
    const harness = createControllerHarness();
    const profile = await createOpenAIProfile(harness);

    const response = await harness.controller.handle({
      type: 'profile.delete',
      requestId: 'delete-1',
      payload: { profileId: profile.id }
    });

    assert.equal(response.ok, true);
    assert.equal(await harness.profiles.get(profile.id), undefined);
    assert.equal(await harness.secrets.getApiKey(profile.id), undefined);
    assert.deepEqual(harness.vault.calls, ['secretsChanged']);
  });

  it('routes encrypted vault enable, unlock, rebuild, and disable actions', async () => {
    const harness = createControllerHarness();
    harness.vault.state = { enabled: false, status: 'disabled' };

    const enable = await harness.controller.handle({
      type: 'vault.enable',
      requestId: 'vault-enable-1',
      payload: { password: 'sync password', remember: true }
    });
    const unlock = await harness.controller.handle({
      type: 'vault.unlock',
      requestId: 'vault-unlock-1',
      payload: { password: 'sync password', remember: false }
    });
    const rebuild = await harness.controller.handle({
      type: 'vault.rebuild',
      requestId: 'vault-rebuild-1',
      payload: {}
    });
    const disable = await harness.controller.handle({
      type: 'vault.disable',
      requestId: 'vault-disable-1',
      payload: {}
    });

    assert.equal(enable.ok, true);
    assert.equal(unlock.ok, true);
    assert.equal(rebuild.ok, true);
    assert.equal(disable.ok, true);
    assert.deepEqual(harness.vault.calls, [
      'enable',
      'unlock',
      'rebuild',
      'disable'
    ]);
    if (disable.ok) {
      assert.equal(disable.data.view.sync.status, 'disabled');
    }
  });

  it('updates the existing language and custom prompt settings', async () => {
    const harness = createControllerHarness();

    const response = await harness.controller.handle({
      type: 'settings.update',
      requestId: 'settings-1',
      payload: {
        language: 'Simplified Chinese',
        systemPrompt: 'custom prompt'
      }
    });

    assert.equal(response.ok, true);
    assert.deepEqual(harness.settings.updates, [
      {
        language: 'Simplified Chinese',
        systemPrompt: 'custom prompt'
      }
    ]);
    if (response.ok) {
      assert.equal(
        response.data.view.settings.language,
        'Simplified Chinese'
      );
      assert.equal(
        response.data.view.settings.systemPrompt,
        'custom prompt'
      );
    }
  });
});
