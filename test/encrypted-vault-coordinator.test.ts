import assert from 'node:assert/strict';
import { describe, it } from 'mocha';
import { ProfileRepository } from '../src/configuration/profile-repository';
import { SecretRepository } from '../src/configuration/secret-repository';
import { KeyValueStore, SecretStore } from '../src/configuration/storage';
import {
  EncryptedVaultCoordinator,
  ENCRYPTED_VAULT_KEY
} from '../src/sync/encrypted-vault-coordinator';
import { EncryptedVaultEnvelope } from '../src/sync/encrypted-vault-types';
import { EncryptedVaultService } from '../src/sync/encrypted-vault-service';

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
    } else {
      this.values.set(key, value);
    }
  }
}

class MemorySecrets implements SecretStore {
  readonly values = new Map<string, string>();

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

function deterministicRandom() {
  let call = 0;
  return (size: number) => Buffer.alloc(size, ++call);
}

async function createProfiles(
  profiles: ProfileRepository,
  secrets: SecretRepository
) {
  const openai = await profiles.create({
    provider: 'openai',
    name: 'OpenAI',
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
  const anthropic = await profiles.create({
    provider: 'anthropic',
    name: 'Anthropic',
    baseUrl: 'https://api.anthropic.com',
    model: 'claude-sonnet-4-5',
    keyHint: 'sk-ant-••••BBBB',
    options: { temperature: 0.7 }
  });
  await secrets.storeApiKey(openai.id, 'sk-openai-AAAA');
  await secrets.storeApiKey(anthropic.id, 'sk-ant-anthropic-BBBB');
  return { openai, anthropic };
}

function createCrypto() {
  return new EncryptedVaultService(
    deterministicRandom(),
    () => 123456,
    { N: 1024, r: 8, p: 1 }
  );
}

describe('EncryptedVaultCoordinator', () => {
  it('encrypts every local profile key and never stores plaintext in global state', async () => {
    const globalStore = new MemoryStore();
    const localStore = new MemorySecrets();
    const profiles = new ProfileRepository(globalStore, () => 1, (() => {
      let id = 0;
      return () => `profile-${++id}`;
    })());
    const secrets = new SecretRepository(localStore);
    await createProfiles(profiles, secrets);
    const coordinator = new EncryptedVaultCoordinator(
      profiles,
      secrets,
      globalStore,
      localStore,
      createCrypto()
    );

    await coordinator.enable('sync password', true);

    const envelope = globalStore.get<EncryptedVaultEnvelope>(
      ENCRYPTED_VAULT_KEY
    );
    assert.ok(envelope);
    assert.equal(JSON.stringify(envelope).includes('sk-openai-AAAA'), false);
    assert.equal(
      JSON.stringify(envelope).includes('sk-ant-anthropic-BBBB'),
      false
    );
    assert.deepEqual(await coordinator.getState(), {
      enabled: true,
      status: 'unlocked',
      revision: 1
    });
    assert.equal(
      (await createCrypto().decrypt(envelope, 'sync password')).secrets.length,
      2
    );
  });

  it('restores all keys on a new device after one successful unlock', async () => {
    const globalStore = new MemoryStore();
    const firstDeviceStore = new MemorySecrets();
    let id = 0;
    const profiles = new ProfileRepository(
      globalStore,
      () => 1,
      () => `profile-${++id}`
    );
    const firstDeviceSecrets = new SecretRepository(firstDeviceStore);
    const created = await createProfiles(profiles, firstDeviceSecrets);
    const firstDevice = new EncryptedVaultCoordinator(
      profiles,
      firstDeviceSecrets,
      globalStore,
      firstDeviceStore,
      createCrypto()
    );
    await firstDevice.enable('sync password', false);

    const secondDeviceStore = new MemorySecrets();
    const secondDeviceSecrets = new SecretRepository(secondDeviceStore);
    const secondDevice = new EncryptedVaultCoordinator(
      profiles,
      secondDeviceSecrets,
      globalStore,
      secondDeviceStore,
      createCrypto()
    );
    await secondDevice.unlock('sync password', true);

    assert.equal(
      await secondDeviceSecrets.getApiKey(created.openai.id),
      'sk-openai-AAAA'
    );
    assert.equal(
      await secondDeviceSecrets.getApiKey(created.anthropic.id),
      'sk-ant-anthropic-BBBB'
    );
    assert.equal((await secondDevice.getState()).status, 'unlocked');
  });

  it('does not overwrite local keys when the sync password is wrong', async () => {
    const globalStore = new MemoryStore();
    const firstDeviceStore = new MemorySecrets();
    let id = 0;
    const profiles = new ProfileRepository(
      globalStore,
      () => 1,
      () => `profile-${++id}`
    );
    const firstSecrets = new SecretRepository(firstDeviceStore);
    const created = await createProfiles(profiles, firstSecrets);
    const firstDevice = new EncryptedVaultCoordinator(
      profiles,
      firstSecrets,
      globalStore,
      firstDeviceStore,
      createCrypto()
    );
    await firstDevice.enable('right password', false);

    const secondDeviceStore = new MemorySecrets();
    const secondSecrets = new SecretRepository(secondDeviceStore);
    await secondSecrets.storeApiKey(created.openai.id, 'local-key-must-remain');
    const secondDevice = new EncryptedVaultCoordinator(
      profiles,
      secondSecrets,
      globalStore,
      secondDeviceStore,
      createCrypto()
    );

    await assert.rejects(
      secondDevice.unlock('wrong password', false),
      /VAULT_DECRYPT_FAILED/
    );
    assert.equal(
      await secondSecrets.getApiKey(created.openai.id),
      'local-key-must-remain'
    );
  });
});
