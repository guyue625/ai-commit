import assert from 'node:assert/strict';
import { describe, it } from 'mocha';
import {
  MementoKeyValueStore,
  SecretStorageStore
} from '../src/configuration/storage';

describe('VS Code storage adapters', () => {
  it('delegates typed reads and updates to a Memento-compatible store', async () => {
    const values = new Map<string, unknown>([['count', 2]]);
    const store = new MementoKeyValueStore({
      get<T>(key: string, defaultValue?: T) {
        return (values.has(key) ? values.get(key) : defaultValue) as T;
      },
      async update(key: string, value: unknown) {
        values.set(key, value);
      }
    });

    assert.equal(store.get<number>('count'), 2);
    assert.equal(store.get<number>('missing', 7), 7);
    await store.update('count', 3);
    assert.equal(values.get('count'), 3);
  });

  it('delegates get, store, and delete to SecretStorage', async () => {
    const values = new Map<string, string>();
    const store = new SecretStorageStore({
      async get(key: string) {
        return values.get(key);
      },
      async store(key: string, value: string) {
        values.set(key, value);
      },
      async delete(key: string) {
        values.delete(key);
      }
    });

    await store.store('key', 'secret');
    assert.equal(await store.get('key'), 'secret');
    await store.delete('key');
    assert.equal(await store.get('key'), undefined);
  });
});
