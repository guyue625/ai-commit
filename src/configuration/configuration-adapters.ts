import type {
  LegacyConfigurationSnapshot,
  LegacyConfigurationStore
} from './legacy-configuration-migrator';
import type {
  ConfigCenterSettings,
  ConfigCenterSettingsService
} from '../webview/config-center-controller';
import { KeyValueStore } from './storage';

export type ConfigurationScope = 'global' | 'workspace' | 'workspaceFolder';

export interface ConfigurationInspection<T> {
  globalValue?: T;
  workspaceValue?: T;
  workspaceFolderValue?: T;
}

export interface ConfigurationStore {
  get<T>(key: string, defaultValue?: T): T | undefined;
  inspect<T>(key: string): ConfigurationInspection<T> | undefined;
  update(
    key: string,
    value: unknown,
    scope: ConfigurationScope
  ): PromiseLike<void>;
}

export const LEGACY_MIGRATION_MARKER_KEY =
  'aiCommit.legacyConfigurationMigrated.v1';

export class ConfigCenterSettingsAdapter
  implements ConfigCenterSettingsService
{
  constructor(private readonly configuration: ConfigurationStore) {}

  async read(): Promise<ConfigCenterSettings> {
    return {
      language:
        this.configuration.get<string>('AI_COMMIT_LANGUAGE', 'English') ??
        'English',
      systemPrompt:
        this.configuration.get<string>('AI_COMMIT_SYSTEM_PROMPT', '') ?? ''
    };
  }

  async update(changes: Partial<ConfigCenterSettings>): Promise<void> {
    if (changes.language !== undefined) {
      await this.configuration.update(
        'AI_COMMIT_LANGUAGE',
        changes.language,
        'global'
      );
    }
    if (changes.systemPrompt !== undefined) {
      await this.configuration.update(
        'AI_COMMIT_SYSTEM_PROMPT',
        changes.systemPrompt,
        'global'
      );
    }
  }
}

type ApiKeySetting = 'OPENAI_API_KEY' | 'CLAUDE_API_KEY';

interface CapturedSetting {
  scope: ConfigurationScope;
  value: string;
}

export class LegacySettingsAdapter implements LegacyConfigurationStore {
  private readonly capturedApiKeys = new Map<
    ApiKeySetting,
    CapturedSetting[]
  >();

  constructor(
    private readonly configuration: ConfigurationStore,
    private readonly markerStore: KeyValueStore
  ) {}

  async readSnapshot(): Promise<LegacyConfigurationSnapshot> {
    this.captureApiKey('OPENAI_API_KEY');
    this.captureApiKey('CLAUDE_API_KEY');
    return {
      provider: this.configuration.get<string>('AI_PROVIDER'),
      openAiApiKey: this.configuration.get<string>('OPENAI_API_KEY'),
      openAiBaseUrl: this.configuration.get<string>('OPENAI_BASE_URL'),
      openAiModel: this.configuration.get<string>('OPENAI_MODEL'),
      openAiApiType: this.configuration.get('OPENAI_API_TYPE'),
      openAiTemperature: this.configuration.get('OPENAI_TEMPERATURE'),
      openAiReasoningEffort: this.configuration.get(
        'OPENAI_REASONING_EFFORT'
      ),
      openAiTextVerbosity: this.configuration.get('OPENAI_TEXT_VERBOSITY'),
      claudeApiKey: this.configuration.get<string>('CLAUDE_API_KEY'),
      claudeBaseUrl: this.configuration.get<string>('CLAUDE_BASE_URL'),
      claudeModel: this.configuration.get<string>('CLAUDE_MODEL'),
      claudeTemperature: this.configuration.get('CLAUDE_TEMPERATURE'),
      geminiApiKey: this.configuration.get<string>('GEMINI_API_KEY')
    };
  }

  async isMigrationComplete(): Promise<boolean> {
    return (
      this.markerStore.get<boolean>(LEGACY_MIGRATION_MARKER_KEY, false) ?? false
    );
  }

  async clearMigratedApiKeys(): Promise<void> {
    for (const key of ['OPENAI_API_KEY', 'CLAUDE_API_KEY'] as const) {
      for (const captured of this.capturedApiKeys.get(key) ?? []) {
        await this.configuration.update(key, undefined, captured.scope);
      }
    }
  }

  async restoreApiKeys(snapshot: LegacyConfigurationSnapshot): Promise<void> {
    await this.restoreApiKey(
      'OPENAI_API_KEY',
      snapshot.openAiApiKey
    );
    await this.restoreApiKey('CLAUDE_API_KEY', snapshot.claudeApiKey);
  }

  async markMigrationComplete(): Promise<void> {
    await this.markerStore.update(LEGACY_MIGRATION_MARKER_KEY, true);
  }

  private captureApiKey(key: ApiKeySetting): void {
    const inspection = this.configuration.inspect<string>(key);
    const captured: CapturedSetting[] = [];
    if (inspection?.globalValue !== undefined) {
      captured.push({ scope: 'global', value: inspection.globalValue });
    }
    if (inspection?.workspaceValue !== undefined) {
      captured.push({ scope: 'workspace', value: inspection.workspaceValue });
    }
    if (inspection?.workspaceFolderValue !== undefined) {
      captured.push({
        scope: 'workspaceFolder',
        value: inspection.workspaceFolderValue
      });
    }
    this.capturedApiKeys.set(key, captured);
  }

  private async restoreApiKey(
    key: ApiKeySetting,
    snapshotValue: string | undefined
  ): Promise<void> {
    const captured = this.capturedApiKeys.get(key) ?? [];
    if (captured.length === 0 && snapshotValue !== undefined) {
      await this.configuration.update(key, snapshotValue, 'global');
      return;
    }
    for (const setting of captured) {
      await this.configuration.update(key, setting.value, setting.scope);
    }
  }
}
