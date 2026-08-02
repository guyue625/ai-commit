import { ActiveProfileResolver } from '../configuration/active-profile-resolver';
import {
  AnthropicProfileOptions,
  ChannelProfile,
  ConnectionTestState,
  OpenAIProfileOptions,
  ProviderType,
  UpdateProfileInput
} from '../configuration/profile-types';
import { ProfileRepository } from '../configuration/profile-repository';
import { SecretRepository } from '../configuration/secret-repository';
import {
  RuntimeProviderConfig,
  toRuntimeProviderConfig
} from '../providers/runtime-provider-config';
import { getTranslations, TranslationDictionary } from './i18n';
import {
  parseWebviewRequest,
  ProfileFormPayload
} from './messages';

export interface ConfigCenterSettings {
  language: string;
  systemPrompt: string;
}

export interface ConfigCenterSettingsService {
  read(): Promise<ConfigCenterSettings>;
  update(changes: Partial<ConfigCenterSettings>): Promise<void>;
}

export type ConfigCenterVaultState = {
  enabled: boolean;
  status: 'disabled' | 'locked' | 'unlocked';
  revision?: number;
};

export interface ConfigCenterVaultService {
  getState(): Promise<ConfigCenterVaultState>;
  enable(password: string, remember: boolean): Promise<void>;
  unlock(password: string, remember: boolean): Promise<void>;
  rebuild(): Promise<void>;
  disable(): Promise<void>;
  secretsChanged(): Promise<void>;
}

export interface ConfigCenterConnectionTester {
  listModels(
    config: RuntimeProviderConfig,
    signal?: AbortSignal
  ): Promise<string[]>;
  testConnection(
    config: RuntimeProviderConfig,
    signal?: AbortSignal
  ): Promise<{ latencyMs: number }>;
}

export interface ConfigCenterProfileView {
  id: string;
  provider: ProviderType;
  name: string;
  baseUrl: string;
  model: string;
  keyLabel?: string;
  keyHint: string;
  hasLocalKey: boolean;
  isActive: boolean;
  isDefault: boolean;
  createdAt: number;
  updatedAt: number;
  lastTest?: ConnectionTestState;
  options: ChannelProfile['options'];
}

export interface ConfigCenterViewModel {
  locale: string;
  translations: TranslationDictionary;
  profiles: ConfigCenterProfileView[];
  activeProfileId?: string;
  providerCounts: Record<ProviderType, number>;
  settings: ConfigCenterSettings;
  sync: ConfigCenterVaultState;
}

export type ConfigCenterResponse =
  | {
      requestId: string;
      ok: true;
      data: { view: ConfigCenterViewModel; models?: string[] };
    }
  | {
      requestId: string;
      ok: false;
      error: { code: string };
    };

export interface ConfigCenterControllerDependencies {
  profiles: ProfileRepository;
  secrets: SecretRepository;
  activeProfiles: ActiveProfileResolver;
  connectionTester: ConfigCenterConnectionTester;
  settings: ConfigCenterSettingsService;
  vault: ConfigCenterVaultService;
  locale?: string;
}

function safeErrorCode(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  return /^[A-Z][A-Z0-9_]*$/.test(message)
    ? message
    : 'CONFIG_CENTER_REQUEST_FAILED';
}

export class ConfigCenterController {
  constructor(private readonly dependencies: ConfigCenterControllerDependencies) {}

  async handle(input: unknown): Promise<ConfigCenterResponse> {
    let requestId = '';
    let models: string[] | undefined;
    try {
      const request = parseWebviewRequest(input);
      requestId = request.requestId;
      if (request.type === 'profile.create') {
        await this.createProfile(request.payload);
      } else if (request.type === 'profile.update') {
        await this.updateProfile(
          request.payload.profileId,
          request.payload.changes
        );
      } else if (request.type === 'profile.test') {
        await this.testProfile(request.payload.profileId);
      } else if (request.type === 'profile.models') {
        if ('profileId' in request.payload) {
          models = await this.listModels(request.payload.profileId);
        } else {
          models = await this.listDraftModels(request.payload.draft);
        }
      } else if (request.type === 'profile.activate') {
        await this.activateProfile(request.payload.profileId);
      } else if (request.type === 'profile.delete') {
        await this.deleteProfile(request.payload.profileId);
      } else if (request.type === 'settings.update') {
        await this.dependencies.settings.update(request.payload);
      } else if (request.type === 'vault.enable') {
        await this.dependencies.vault.enable(
          request.payload.password,
          request.payload.remember
        );
      } else if (request.type === 'vault.unlock') {
        await this.dependencies.vault.unlock(
          request.payload.password,
          request.payload.remember
        );
      } else if (request.type === 'vault.rebuild') {
        await this.dependencies.vault.rebuild();
      } else if (request.type === 'vault.disable') {
        await this.dependencies.vault.disable();
      } else if (request.type !== 'ready') {
        throw new Error('WEBVIEW_MESSAGE_UNSUPPORTED');
      }
      return {
        requestId,
        ok: true,
        data: { view: await this.buildViewModel(), models }
      };
    } catch (error) {
      return {
        requestId,
        ok: false,
        error: { code: safeErrorCode(error) }
      };
    }
  }

  private async listModels(profileId: string): Promise<string[]> {
    const runtimeConfig = await this.getRuntimeConfig(profileId);
    try {
      return await this.dependencies.connectionTester.listModels(runtimeConfig);
    } catch {
      throw new Error('MODEL_LIST_FAILED');
    }
  }

  private async listDraftModels(
    draft: Omit<ProfileFormPayload, 'activate'>
  ): Promise<string[]> {
    const common = {
      profileId: 'unsaved-draft',
      profileName: draft.name,
      apiKey: draft.apiKey,
      baseUrl: draft.baseUrl,
      model: draft.model
    };
    const runtimeConfig: RuntimeProviderConfig =
      draft.provider === 'openai'
        ? {
            ...common,
            provider: 'openai',
            options: draft.options as OpenAIProfileOptions
          }
        : {
            ...common,
            provider: 'anthropic',
            options: draft.options as AnthropicProfileOptions
          };
    try {
      return await this.dependencies.connectionTester.listModels(runtimeConfig);
    } catch {
      throw new Error('MODEL_LIST_FAILED');
    }
  }

  private async activateProfile(profileId: string): Promise<void> {
    await this.testProfile(profileId);
    await this.dependencies.activeProfiles.setWorkspaceActiveProfile(profileId);
  }

  private async deleteProfile(profileId: string): Promise<void> {
    const { profiles, secrets, vault } = this.dependencies;
    const catalog = await profiles.getCatalog();
    const activeProfileId =
      this.dependencies.activeProfiles.getWorkspaceActiveProfileId() ??
      catalog.defaultProfileId;
    if (activeProfileId === profileId) {
      throw new Error('PROFILE_IS_ACTIVE');
    }

    const previousKey = await secrets.getApiKey(profileId);
    await profiles.delete(profileId);
    try {
      await secrets.deleteApiKey(profileId);
    } catch (error) {
      await profiles.restoreCatalog(catalog);
      if (previousKey !== undefined) {
        await secrets.storeApiKey(profileId, previousKey);
      }
      throw error;
    }
    await vault.secretsChanged();
  }

  private async createProfile(payload: ProfileFormPayload): Promise<void> {
    const { profiles, secrets, vault } = this.dependencies;
    const keyHint = secrets.createHint(payload.apiKey);
    const common = {
      name: payload.name,
      baseUrl: payload.baseUrl,
      model: payload.model,
      keyLabel: payload.keyLabel,
      keyHint
    };
    const profile =
      payload.provider === 'openai'
        ? await profiles.create({
            ...common,
            provider: 'openai',
            options: payload.options as OpenAIProfileOptions
          })
        : await profiles.create({
            ...common,
            provider: 'anthropic',
            options: payload.options as AnthropicProfileOptions
          });

    try {
      await secrets.storeApiKey(profile.id, payload.apiKey);
    } catch (error) {
      await profiles.delete(profile.id);
      throw error;
    }
    await vault.secretsChanged();
    if (payload.activate) {
      await this.activateProfile(profile.id);
    }
  }

  private async updateProfile(
    profileId: string,
    input: UpdateProfileInput & { apiKey?: string }
  ): Promise<void> {
    const { profiles, secrets, vault } = this.dependencies;
    const current = await profiles.get(profileId);
    if (!current) {
      throw new Error('PROFILE_NOT_FOUND');
    }
    if (
      input.options &&
      ((current.provider === 'openai' && !('apiType' in input.options)) ||
        (current.provider === 'anthropic' && 'apiType' in input.options))
    ) {
      throw new Error('PROFILE_OPTIONS_INVALID');
    }

    const { apiKey, ...profileChanges } = input;
    let previousKey: string | undefined;
    if (apiKey !== undefined) {
      previousKey = await secrets.getApiKey(profileId);
      await secrets.storeApiKey(profileId, apiKey);
      profileChanges.keyHint = secrets.createHint(apiKey);
    }

    try {
      await profiles.update(profileId, profileChanges);
    } catch (error) {
      if (apiKey !== undefined) {
        if (previousKey === undefined) {
          await secrets.deleteApiKey(profileId);
        } else {
          await secrets.storeApiKey(profileId, previousKey);
        }
      }
      throw error;
    }

    if (apiKey !== undefined) {
      await vault.secretsChanged();
    }
  }

  private async testProfile(profileId: string): Promise<void> {
    const { profiles, connectionTester } = this.dependencies;
    const runtimeConfig = await this.getRuntimeConfig(profileId);
    try {
      const result = await connectionTester.testConnection(runtimeConfig);
      await profiles.update(profileId, {
        lastTest: {
          status: 'success',
          testedAt: Date.now(),
          latencyMs: result.latencyMs
        }
      });
    } catch {
      await profiles.update(profileId, {
        lastTest: {
          status: 'failure',
          testedAt: Date.now(),
          message: 'CONNECTION_TEST_FAILED'
        }
      });
      throw new Error('CONNECTION_TEST_FAILED');
    }
  }

  private async getRuntimeConfig(
    profileId: string
  ): Promise<RuntimeProviderConfig> {
    const { profiles, secrets } = this.dependencies;
    const profile = await profiles.get(profileId);
    if (!profile) {
      throw new Error('PROFILE_NOT_FOUND');
    }
    const apiKey = await secrets.getApiKey(profileId);
    if (!apiKey) {
      throw new Error('MISSING_LOCAL_SECRET');
    }
    return toRuntimeProviderConfig(profile, apiKey);
  }

  async buildViewModel(): Promise<ConfigCenterViewModel> {
    const { profiles, secrets, activeProfiles, settings, vault } =
      this.dependencies;
    const [catalog, currentSettings, sync] = await Promise.all([
      profiles.getCatalog(),
      settings.read(),
      vault.getState()
    ]);
    const activeProfileId =
      activeProfiles.getWorkspaceActiveProfileId() ?? catalog.defaultProfileId;
    const profileViews = await Promise.all(
      catalog.profiles.map(async (profile): Promise<ConfigCenterProfileView> => ({
        id: profile.id,
        provider: profile.provider,
        name: profile.name,
        baseUrl: profile.baseUrl,
        model: profile.model,
        keyLabel: profile.keyLabel,
        keyHint: profile.keyHint,
        hasLocalKey: await secrets.hasApiKey(profile.id),
        isActive: profile.id === activeProfileId,
        isDefault: profile.id === catalog.defaultProfileId,
        createdAt: profile.createdAt,
        updatedAt: profile.updatedAt,
        lastTest: profile.lastTest ? { ...profile.lastTest } : undefined,
        options: { ...profile.options }
      }))
    );

    return {
      locale: this.dependencies.locale ?? 'en',
      translations: getTranslations(this.dependencies.locale),
      profiles: profileViews,
      activeProfileId,
      providerCounts: {
        openai: profileViews.filter((profile) => profile.provider === 'openai')
          .length,
        anthropic: profileViews.filter(
          (profile) => profile.provider === 'anthropic'
        ).length
      },
      settings: currentSettings,
      sync
    };
  }
}
