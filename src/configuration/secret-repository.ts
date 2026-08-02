import { SecretStore } from './storage';

const secretKey = (profileId: string) =>
  `aiCommit.profile.${profileId}.apiKey`;

export class SecretRepository {
  constructor(private readonly store: SecretStore) {}

  async storeApiKey(profileId: string, apiKey: string): Promise<void> {
    const normalized = apiKey.trim();
    if (!normalized) {
      throw new Error('API_KEY_REQUIRED');
    }
    await this.store.store(secretKey(profileId), normalized);
  }

  async getApiKey(profileId: string): Promise<string | undefined> {
    return this.store.get(secretKey(profileId));
  }

  async hasApiKey(profileId: string): Promise<boolean> {
    return (await this.getApiKey(profileId)) !== undefined;
  }

  async deleteApiKey(profileId: string): Promise<void> {
    await this.store.delete(secretKey(profileId));
  }

  createHint(apiKey: string): string {
    const normalized = apiKey.trim();
    if (!normalized) {
      throw new Error('API_KEY_REQUIRED');
    }

    const suffix = normalized.slice(-4);
    const prefix = normalized.startsWith('sk-ant-')
      ? 'sk-ant-'
      : normalized.match(/^([A-Za-z0-9]+-)/)?.[1] ?? '';
    return `${prefix}••••${suffix}`;
  }
}
