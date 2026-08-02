import {
  OpenAIApiType,
  ReasoningEffort,
  TextVerbosity
} from './profile-types';
import { ProfileRepository } from './profile-repository';
import { SecretRepository } from './secret-repository';

export interface LegacyConfigurationSnapshot {
  provider?: string;
  openAiApiKey?: string;
  openAiBaseUrl?: string;
  openAiModel?: string;
  openAiApiType?: OpenAIApiType;
  openAiTemperature?: number;
  openAiReasoningEffort?: ReasoningEffort;
  openAiTextVerbosity?: TextVerbosity;
  claudeApiKey?: string;
  claudeBaseUrl?: string;
  claudeModel?: string;
  claudeTemperature?: number;
  geminiApiKey?: string;
}

export interface LegacyConfigurationStore {
  readSnapshot(): Promise<LegacyConfigurationSnapshot>;
  isMigrationComplete(): Promise<boolean>;
  clearMigratedApiKeys(): Promise<void>;
  restoreApiKeys(snapshot: LegacyConfigurationSnapshot): Promise<void>;
  markMigrationComplete(): Promise<void>;
}

export type MigrationResult =
  | { status: 'skipped' }
  | { status: 'nothing-to-migrate' }
  | { status: 'migrated'; profileIds: string[] };

export class LegacyConfigurationMigrator {
  constructor(
    private readonly profiles: ProfileRepository,
    private readonly secrets: SecretRepository,
    private readonly legacy: LegacyConfigurationStore
  ) {}

  async migrate(): Promise<MigrationResult> {
    if (await this.legacy.isMigrationComplete()) {
      return { status: 'skipped' };
    }

    const snapshot = await this.legacy.readSnapshot();
    const catalogBeforeMigration = await this.profiles.getCatalog();
    const createdProfileIds: string[] = [];

    try {
      const openAiProfileId = await this.importOpenAi(
        snapshot,
        createdProfileIds
      );

      const anthropicProfileId = await this.importAnthropic(
        snapshot,
        createdProfileIds
      );

      if (snapshot.provider === 'openai' && openAiProfileId) {
        await this.profiles.setDefault(openAiProfileId);
      } else if (snapshot.provider === 'claude' && anthropicProfileId) {
        await this.profiles.setDefault(anthropicProfileId);
      }

      await this.legacy.clearMigratedApiKeys();
      await this.legacy.markMigrationComplete();

      return createdProfileIds.length
        ? { status: 'migrated', profileIds: createdProfileIds }
        : { status: 'nothing-to-migrate' };
    } catch {
      await this.rollback(
        catalogBeforeMigration,
        createdProfileIds,
        snapshot
      );
      throw new Error('MIGRATION_FAILED');
    }
  }

  private async importOpenAi(
    snapshot: LegacyConfigurationSnapshot,
    createdProfileIds: string[]
  ): Promise<string | undefined> {
    const apiKey = snapshot.openAiApiKey?.trim();
    if (!apiKey) {
      return undefined;
    }

    const profile = await this.profiles.create({
      provider: 'openai',
      name: 'Imported OpenAI',
      baseUrl: snapshot.openAiBaseUrl?.trim() || 'https://api.openai.com/v1',
      model: snapshot.openAiModel?.trim() || 'gpt-4o',
      keyHint: this.secrets.createHint(apiKey),
      options: {
        apiType: snapshot.openAiApiType ?? 'completion',
        temperature: snapshot.openAiTemperature ?? 0.7,
        reasoningEffort: snapshot.openAiReasoningEffort ?? 'medium',
        textVerbosity: snapshot.openAiTextVerbosity ?? 'medium'
      }
    });
    createdProfileIds.push(profile.id);
    await this.storeAndVerify(profile.id, apiKey);
    return profile.id;
  }

  private async importAnthropic(
    snapshot: LegacyConfigurationSnapshot,
    createdProfileIds: string[]
  ): Promise<string | undefined> {
    const apiKey = snapshot.claudeApiKey?.trim();
    if (!apiKey) {
      return undefined;
    }

    const profile = await this.profiles.create({
      provider: 'anthropic',
      name: 'Imported Anthropic',
      baseUrl: snapshot.claudeBaseUrl?.trim() || 'https://api.anthropic.com',
      model: snapshot.claudeModel?.trim() || 'claude-sonnet-4-5',
      keyHint: this.secrets.createHint(apiKey),
      options: {
        temperature: snapshot.claudeTemperature ?? 0.7
      }
    });
    createdProfileIds.push(profile.id);
    await this.storeAndVerify(profile.id, apiKey);
    return profile.id;
  }

  private async storeAndVerify(profileId: string, apiKey: string): Promise<void> {
    await this.secrets.storeApiKey(profileId, apiKey);
    if ((await this.secrets.getApiKey(profileId)) !== apiKey) {
      throw new Error('SECRET_VERIFICATION_FAILED');
    }
  }

  private async rollback(
    catalogBeforeMigration: Awaited<ReturnType<ProfileRepository['getCatalog']>>,
    createdProfileIds: string[],
    snapshot: LegacyConfigurationSnapshot
  ): Promise<void> {
    for (const profileId of createdProfileIds) {
      try {
        await this.secrets.deleteApiKey(profileId);
      } catch {
        // Preserve the original migration error while continuing rollback.
      }
    }
    await this.profiles.restoreCatalog(catalogBeforeMigration);
    await this.legacy.restoreApiKeys(snapshot);
  }
}
