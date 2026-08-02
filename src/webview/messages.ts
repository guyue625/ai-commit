import {
  AnthropicProfileOptions,
  OpenAIProfileOptions,
  ProviderType,
  UpdateProfileInput
} from '../configuration/profile-types';

export interface ProfileFormPayload {
  provider: ProviderType;
  name: string;
  baseUrl: string;
  model: string;
  apiKey: string;
  keyLabel?: string;
  options: OpenAIProfileOptions | AnthropicProfileOptions;
  activate?: boolean;
}

export type ProfileModelPayload =
  | { profileId: string }
  | { draft: Omit<ProfileFormPayload, 'activate'> };

export type WebviewRequest =
  | { type: 'ready'; requestId: string; payload: Record<string, never> }
  | { type: 'profile.create'; requestId: string; payload: ProfileFormPayload }
  | {
      type: 'profile.update';
      requestId: string;
      payload: {
        profileId: string;
        changes: UpdateProfileInput & { apiKey?: string };
      };
    }
  | {
      type: 'profile.delete' | 'profile.activate' | 'profile.test';
      requestId: string;
      payload: { profileId: string };
    }
  | {
      type: 'profile.models';
      requestId: string;
      payload: ProfileModelPayload;
    }
  | {
      type: 'settings.update';
      requestId: string;
      payload: { language?: string; systemPrompt?: string };
    }
  | {
      type: 'vault.enable';
      requestId: string;
      payload: { password: string; remember: boolean };
    }
  | {
      type: 'vault.unlock';
      requestId: string;
      payload: { password: string; remember: boolean };
    }
  | {
      type: 'vault.disable' | 'vault.rebuild';
      requestId: string;
      payload: Record<string, never>;
    };

const SIMPLE_PROFILE_ACTIONS = new Set([
  'profile.delete',
  'profile.activate',
  'profile.test'
]);

function invalid(): never {
  throw new Error('WEBVIEW_MESSAGE_INVALID');
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  allowedKeys: readonly string[]
): boolean {
  return Object.keys(value).every((key) => allowedKeys.includes(key));
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === 'string';
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

function isHttpUrl(value: unknown): value is string {
  if (!isNonEmptyString(value)) {
    return false;
  }
  try {
    const parsed = new URL(value);
    return (
      (parsed.protocol === 'https:' || parsed.protocol === 'http:') &&
      !parsed.username &&
      !parsed.password
    );
  } catch {
    return false;
  }
}

function validateOpenAIOptions(value: unknown): value is OpenAIProfileOptions {
  if (
    !isPlainObject(value) ||
    !hasOnlyKeys(value, [
      'apiType',
      'temperature',
      'reasoningEffort',
      'textVerbosity',
      'apiVersion'
    ])
  ) {
    return false;
  }
  return (
    (value.apiType === 'completion' || value.apiType === 'response') &&
    typeof value.temperature === 'number' &&
    value.temperature >= 0 &&
    value.temperature <= 2 &&
    ['minimal', 'low', 'medium', 'high'].includes(
      value.reasoningEffort as string
    ) &&
    ['low', 'medium', 'high'].includes(value.textVerbosity as string) &&
    isOptionalString(value.apiVersion)
  );
}

function validateAnthropicOptions(
  value: unknown
): value is AnthropicProfileOptions {
  return (
    isPlainObject(value) &&
    hasOnlyKeys(value, ['temperature']) &&
    typeof value.temperature === 'number' &&
    value.temperature >= 0 &&
    value.temperature <= 1
  );
}

function validateProfileForm(payload: unknown): payload is ProfileFormPayload {
  if (
    !isPlainObject(payload) ||
    !hasOnlyKeys(payload, [
      'provider',
      'name',
      'baseUrl',
      'model',
      'apiKey',
      'keyLabel',
      'options',
      'activate'
    ]) ||
    (payload.provider !== 'openai' && payload.provider !== 'anthropic') ||
    !isNonEmptyString(payload.name) ||
    !isHttpUrl(payload.baseUrl) ||
    !isNonEmptyString(payload.model) ||
    !isNonEmptyString(payload.apiKey) ||
    !isOptionalString(payload.keyLabel) ||
    (payload.activate !== undefined && !isBoolean(payload.activate))
  ) {
    return false;
  }

  return payload.provider === 'openai'
    ? validateOpenAIOptions(payload.options)
    : validateAnthropicOptions(payload.options);
}

function validateProfileChanges(value: unknown): boolean {
  if (
    !isPlainObject(value) ||
    Object.keys(value).length === 0 ||
    !hasOnlyKeys(value, [
      'name',
      'baseUrl',
      'model',
      'apiKey',
      'keyLabel',
      'options'
    ])
  ) {
    return false;
  }
  if (value.name !== undefined && !isNonEmptyString(value.name)) {
    return false;
  }
  if (value.baseUrl !== undefined && !isHttpUrl(value.baseUrl)) {
    return false;
  }
  if (value.model !== undefined && !isNonEmptyString(value.model)) {
    return false;
  }
  if (value.apiKey !== undefined && !isNonEmptyString(value.apiKey)) {
    return false;
  }
  if (!isOptionalString(value.keyLabel)) {
    return false;
  }
  return (
    value.options === undefined ||
    validateOpenAIOptions(value.options) ||
    validateAnthropicOptions(value.options)
  );
}

export function parseWebviewRequest(input: unknown): WebviewRequest {
  if (
    !isPlainObject(input) ||
    !hasOnlyKeys(input, ['type', 'requestId', 'payload']) ||
    !isNonEmptyString(input.type) ||
    !isNonEmptyString(input.requestId) ||
    !isPlainObject(input.payload)
  ) {
    return invalid();
  }

  if (input.type === 'profile.create') {
    if (!validateProfileForm(input.payload)) {
      return invalid();
    }
    return input as WebviewRequest;
  }

  if (input.type === 'profile.update') {
    if (
      !hasOnlyKeys(input.payload, ['profileId', 'changes']) ||
      !isNonEmptyString(input.payload.profileId) ||
      !validateProfileChanges(input.payload.changes)
    ) {
      return invalid();
    }
    return input as WebviewRequest;
  }

  if (input.type === 'profile.models') {
    const profileRequest =
      hasOnlyKeys(input.payload, ['profileId']) &&
      isNonEmptyString(input.payload.profileId);
    const draftRequest =
      hasOnlyKeys(input.payload, ['draft']) &&
      validateProfileForm(input.payload.draft) &&
      input.payload.draft.activate === undefined;
    if (!profileRequest && !draftRequest) {
      return invalid();
    }
    return input as WebviewRequest;
  }

  if (SIMPLE_PROFILE_ACTIONS.has(input.type)) {
    if (
      !hasOnlyKeys(input.payload, ['profileId']) ||
      !isNonEmptyString(input.payload.profileId)
    ) {
      return invalid();
    }
    return input as WebviewRequest;
  }

  if (input.type === 'settings.update') {
    if (
      !hasOnlyKeys(input.payload, ['language', 'systemPrompt']) ||
      !isOptionalString(input.payload.language) ||
      !isOptionalString(input.payload.systemPrompt)
    ) {
      return invalid();
    }
    return input as WebviewRequest;
  }

  if (input.type === 'vault.enable' || input.type === 'vault.unlock') {
    if (
      !hasOnlyKeys(input.payload, ['password', 'remember']) ||
      !isNonEmptyString(input.payload.password) ||
      !isBoolean(input.payload.remember)
    ) {
      return invalid();
    }
    return input as WebviewRequest;
  }

  if (
    input.type === 'ready' ||
    input.type === 'vault.disable' ||
    input.type === 'vault.rebuild'
  ) {
    if (Object.keys(input.payload).length !== 0) {
      return invalid();
    }
    return input as WebviewRequest;
  }

  return invalid();
}
