export type ProviderType = 'openai' | 'anthropic';
export type OpenAIApiType = 'completion' | 'response';
export type ReasoningEffort = 'minimal' | 'low' | 'medium' | 'high';
export type TextVerbosity = 'low' | 'medium' | 'high';

export interface OpenAIProfileOptions {
  apiType: OpenAIApiType;
  temperature: number;
  reasoningEffort: ReasoningEffort;
  textVerbosity: TextVerbosity;
  apiVersion?: string;
}

export interface AnthropicProfileOptions {
  temperature: number;
}

export interface ConnectionTestState {
  status: 'success' | 'failure';
  testedAt: number;
  latencyMs?: number;
  message?: string;
}

interface ProfileFields {
  name: string;
  baseUrl: string;
  model: string;
  keyLabel?: string;
  keyHint: string;
  lastTest?: ConnectionTestState;
}

export type CreateProfileInput =
  | (ProfileFields & {
      provider: 'openai';
      options: OpenAIProfileOptions;
    })
  | (ProfileFields & {
      provider: 'anthropic';
      options: AnthropicProfileOptions;
    });

export type ChannelProfile = CreateProfileInput & {
  id: string;
  createdAt: number;
  updatedAt: number;
};

export interface UpdateProfileInput {
  name?: string;
  baseUrl?: string;
  model?: string;
  keyLabel?: string;
  keyHint?: string;
  lastTest?: ConnectionTestState;
  options?: OpenAIProfileOptions | AnthropicProfileOptions;
}

export interface ProfileCatalog {
  schemaVersion: 1;
  revision: number;
  profiles: ChannelProfile[];
  defaultProfileId?: string;
  encryptedSyncEnabled: boolean;
  vaultRevision?: number;
}

export const EMPTY_PROFILE_CATALOG: ProfileCatalog = {
  schemaVersion: 1,
  revision: 0,
  profiles: [],
  encryptedSyncEnabled: false
};
