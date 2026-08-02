import assert from 'node:assert/strict';
import { describe, it } from 'mocha';
import { ActiveProfileResolver } from '../src/configuration/active-profile-resolver';
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

async function createFixture() {
  let id = 0;
  const globalStore = new MemoryStore();
  const workspaceStore = new MemoryStore();
  const profileRepository = new ProfileRepository(
    globalStore,
    () => 1000,
    () => `profile-${++id}`
  );
  const secretRepository = new SecretRepository(new MemorySecretStore());
  const resolver = new ActiveProfileResolver(
    profileRepository,
    secretRepository,
    workspaceStore
  );
  const first = await profileRepository.create({
    provider: 'openai',
    name: 'OpenAI official',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-5-mini',
    keyHint: 'sk-••••AAAA',
    options: {
      apiType: 'completion',
      temperature: 0.7,
      reasoningEffort: 'medium',
      textVerbosity: 'medium'
    }
  });
  const second = await profileRepository.create({
    provider: 'anthropic',
    name: 'Claude company',
    baseUrl: 'https://api.anthropic.com',
    model: 'claude-sonnet-4-5',
    keyHint: 'sk-ant-••••BBBB',
    options: { temperature: 0.7 }
  });
  await secretRepository.storeApiKey(first.id, 'sk-first-AAAA');
  await secretRepository.storeApiKey(second.id, 'sk-ant-second-BBBB');

  return {
    resolver,
    profileRepository,
    secretRepository,
    workspaceStore,
    first,
    second
  };
}

describe('ActiveProfileResolver', () => {
  it('uses the workspace selection before the global default', async () => {
    const fixture = await createFixture();
    await fixture.profileRepository.setDefault(fixture.first.id);
    await fixture.resolver.setWorkspaceActiveProfile(fixture.second.id);

    const result = await fixture.resolver.resolve();

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.profile.id, fixture.second.id);
      assert.equal(result.apiKey, 'sk-ant-second-BBBB');
    }
  });

  it('falls back to the global default when the workspace has no selection', async () => {
    const fixture = await createFixture();
    await fixture.profileRepository.setDefault(fixture.first.id);

    const result = await fixture.resolver.resolve();

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.profile.id, fixture.first.id);
    }
  });

  it('reports a missing local secret instead of silently choosing another profile', async () => {
    const fixture = await createFixture();
    await fixture.profileRepository.setDefault(fixture.first.id);
    await fixture.resolver.setWorkspaceActiveProfile(fixture.second.id);
    await fixture.secretRepository.deleteApiKey(fixture.second.id);

    const result = await fixture.resolver.resolve();

    assert.deepEqual(result, {
      ok: false,
      reason: 'MISSING_LOCAL_SECRET',
      profileId: fixture.second.id
    });
  });

  it('reports a missing selected profile', async () => {
    const fixture = await createFixture();
    await fixture.resolver.setWorkspaceActiveProfile('missing-profile');

    assert.deepEqual(await fixture.resolver.resolve(), {
      ok: false,
      reason: 'PROFILE_NOT_FOUND',
      profileId: 'missing-profile'
    });
  });

  it('reports no active profile when neither workspace nor global selection exists', async () => {
    const fixture = await createFixture();

    assert.deepEqual(await fixture.resolver.resolve(), {
      ok: false,
      reason: 'NO_ACTIVE_PROFILE'
    });
  });
});
