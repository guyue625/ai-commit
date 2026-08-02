import {
  AnthropicProfileOptions,
  ChannelProfile,
  OpenAIProfileOptions
} from '../configuration/profile-types';

interface RuntimeProviderBase {
  profileId: string;
  profileName: string;
  apiKey: string;
  baseUrl: string;
  model: string;
}

export type RuntimeOpenAIConfig = RuntimeProviderBase & {
  provider: 'openai';
  options: OpenAIProfileOptions;
};

export type RuntimeAnthropicConfig = RuntimeProviderBase & {
  provider: 'anthropic';
  options: AnthropicProfileOptions;
};

export type RuntimeProviderConfig =
  | RuntimeOpenAIConfig
  | RuntimeAnthropicConfig;

export interface OpenAIClientOptions {
  apiKey: string;
  baseURL?: string;
  defaultQuery?: { 'api-version': string };
  defaultHeaders?: { 'api-key': string };
}

export interface AnthropicClientOptions {
  apiKey: string;
  baseURL?: string;
}

export function toRuntimeProviderConfig(
  profile: ChannelProfile,
  apiKey: string
): RuntimeProviderConfig {
  const base = {
    profileId: profile.id,
    profileName: profile.name,
    apiKey,
    baseUrl: profile.baseUrl,
    model: profile.model
  };

  if (profile.provider === 'openai') {
    return { ...base, provider: 'openai', options: profile.options };
  }
  return { ...base, provider: 'anthropic', options: profile.options };
}

export function buildOpenAIClientOptions(
  config: RuntimeOpenAIConfig
): OpenAIClientOptions {
  const options: OpenAIClientOptions = {
    apiKey: config.apiKey,
    baseURL: config.baseUrl || undefined
  };

  if (config.options.apiVersion) {
    options.defaultQuery = { 'api-version': config.options.apiVersion };
    options.defaultHeaders = { 'api-key': config.apiKey };
  }
  return options;
}

export function buildAnthropicClientOptions(
  config: RuntimeAnthropicConfig
): AnthropicClientOptions {
  return {
    apiKey: config.apiKey,
    baseURL: config.baseUrl || undefined
  };
}
