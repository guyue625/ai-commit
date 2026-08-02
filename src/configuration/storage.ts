export interface KeyValueStore {
  get<T>(key: string, defaultValue?: T): T | undefined;
  update(key: string, value: unknown): PromiseLike<void>;
}

export interface SecretStore {
  get(key: string): PromiseLike<string | undefined>;
  store(key: string, value: string): PromiseLike<void>;
  delete(key: string): PromiseLike<void>;
}

export interface MementoLike {
  get<T>(key: string, defaultValue?: T): T | undefined;
  update(key: string, value: unknown): PromiseLike<void>;
}

export interface SecretStorageLike {
  get(key: string): PromiseLike<string | undefined>;
  store(key: string, value: string): PromiseLike<void>;
  delete(key: string): PromiseLike<void>;
}

export class MementoKeyValueStore implements KeyValueStore {
  constructor(private readonly memento: MementoLike) {}

  get<T>(key: string, defaultValue?: T): T | undefined {
    return this.memento.get(key, defaultValue);
  }

  update(key: string, value: unknown): PromiseLike<void> {
    return this.memento.update(key, value);
  }
}

export class SecretStorageStore implements SecretStore {
  constructor(private readonly secrets: SecretStorageLike) {}

  get(key: string): PromiseLike<string | undefined> {
    return this.secrets.get(key);
  }

  store(key: string, value: string): PromiseLike<void> {
    return this.secrets.store(key, value);
  }

  delete(key: string): PromiseLike<void> {
    return this.secrets.delete(key);
  }
}
