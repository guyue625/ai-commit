import assert from 'node:assert/strict';
import { describe, it } from 'mocha';
import { ChannelProfile } from '../src/configuration/profile-types';
import {
  buildAnthropicClientOptions,
  buildOpenAIClientOptions,
  toRuntimeProviderConfig
} from '../src/providers/runtime-provider-config';

describe('runtime provider config', () => {
  it('maps an OpenAI profile and secret without reading legacy settings', () => {
    const profile: ChannelProfile = {
      id: 'openai-profile',
      provider: 'openai',
      name: 'Company gateway',
      baseUrl: 'https://proxy.example/v1',
      model: 'company-model',
      keyHint: 'sk-••••AAAA',
      createdAt: 1,
      updatedAt: 1,
      options: {
        apiType: 'response',
        temperature: 0.2,
        reasoningEffort: 'high',
        textVerbosity: 'low',
        apiVersion: '2025-01-01-preview'
      }
    };

    const runtime = toRuntimeProviderConfig(profile, 'profile-secret');

    assert.equal(runtime.provider, 'openai');
    assert.equal(runtime.apiKey, 'profile-secret');
    assert.equal(runtime.baseUrl, 'https://proxy.example/v1');
    assert.equal(runtime.model, 'company-model');
    assert.deepEqual(buildOpenAIClientOptions(runtime), {
      apiKey: 'profile-secret',
      baseURL: 'https://proxy.example/v1',
      defaultQuery: { 'api-version': '2025-01-01-preview' },
      defaultHeaders: { 'api-key': 'profile-secret' }
    });
  });

  it('maps an Anthropic profile with a custom Base URL', () => {
    const profile: ChannelProfile = {
      id: 'anthropic-profile',
      provider: 'anthropic',
      name: 'Claude proxy',
      baseUrl: 'https://claude-proxy.example',
      model: 'claude-sonnet-4-5',
      keyHint: 'sk-ant-••••BBBB',
      createdAt: 1,
      updatedAt: 1,
      options: { temperature: 0.4 }
    };

    const runtime = toRuntimeProviderConfig(profile, 'anthropic-secret');

    assert.equal(runtime.provider, 'anthropic');
    assert.deepEqual(buildAnthropicClientOptions(runtime), {
      apiKey: 'anthropic-secret',
      baseURL: 'https://claude-proxy.example'
    });
  });
});
