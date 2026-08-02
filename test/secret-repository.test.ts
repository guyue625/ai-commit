import assert from 'node:assert/strict';
import { describe, it } from 'mocha';
import { SecretRepository } from '../src/configuration/secret-repository';
import { SecretStore } from '../src/configuration/storage';

class MemorySecretStore implements SecretStore {
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

describe('SecretRepository', () => {
  it('stores and retrieves a trimmed API key by profile id', async () => {
    const store = new MemorySecretStore();
    const repository = new SecretRepository(store);

    await repository.storeApiKey('profile-1', '  sk-example-7K2P  ');

    assert.equal(await repository.hasApiKey('profile-1'), true);
    assert.equal(await repository.getApiKey('profile-1'), 'sk-example-7K2P');
    assert.equal(
      store.values.get('aiCommit.profile.profile-1.apiKey'),
      'sk-example-7K2P'
    );
  });

  it('creates recognizable hints without exposing the full key', () => {
    const repository = new SecretRepository(new MemorySecretStore());

    assert.equal(repository.createHint('sk-example-7K2P'), 'sk-••••7K2P');
    assert.equal(
      repository.createHint('sk-ant-example-91MX'),
      'sk-ant-••••91MX'
    );
    assert.equal(repository.createHint('key-company-ABCD'), 'key-••••ABCD');
    assert.equal(repository.createHint('12345678'), '••••5678');
  });

  it('rejects empty keys without including secret input in the error', async () => {
    const repository = new SecretRepository(new MemorySecretStore());

    await assert.rejects(repository.storeApiKey('profile-1', '   '), (error) => {
      assert.equal((error as Error).message, 'API_KEY_REQUIRED');
      assert.equal((error as Error).message.includes('profile-1'), false);
      return true;
    });
  });

  it('deletes a stored API key', async () => {
    const repository = new SecretRepository(new MemorySecretStore());
    await repository.storeApiKey('profile-1', 'sk-example-7K2P');

    await repository.deleteApiKey('profile-1');

    assert.equal(await repository.getApiKey('profile-1'), undefined);
  });
});
