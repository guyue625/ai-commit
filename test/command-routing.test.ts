import assert from 'node:assert/strict';
import { describe, it } from 'mocha';
import { runGenerateCommand } from '../src/command-routing';
import { ResolveActiveProfileResult } from '../src/configuration/active-profile-resolver';
import { ChannelProfile } from '../src/configuration/profile-types';
import { RuntimeProviderConfig } from '../src/providers/runtime-provider-config';

const profile: ChannelProfile = {
  id: 'profile-1',
  provider: 'openai',
  name: 'DeepSeek personal',
  baseUrl: 'https://api.deepseek.com/v1',
  model: 'deepseek-chat',
  keyHint: 'sk-••••A9F',
  createdAt: 1,
  updatedAt: 1,
  options: {
    apiType: 'completion',
    temperature: 0.7,
    reasoningEffort: 'medium',
    textVerbosity: 'medium'
  }
};

function createHarness() {
  const calls = {
    open: [] as string[],
    generate: [] as Array<{ arg: unknown; profileId?: string }>
  };
  let resolveActiveProfile: () => Promise<ResolveActiveProfileResult> = async () => ({
    ok: false,
    reason: 'NO_ACTIVE_PROFILE'
  });
  return {
    calls,
    dependencies: {
      get resolveActiveProfile() {
        return resolveActiveProfile;
      },
      set resolveActiveProfile(value) {
        resolveActiveProfile = value;
      },
      getLegacyProvider: () => 'openai',
      openConfigCenter: async (reason: string) => {
        calls.open.push(reason);
      },
      generate: async (arg: unknown, runtimeConfig?: RuntimeProviderConfig) => {
        calls.generate.push({ arg, profileId: runtimeConfig?.profileId });
      }
    }
  };
}

describe('generate command routing', () => {
  it('opens the Config Center instead of generating when no profile is active', async () => {
    const harness = createHarness();

    await runGenerateCommand('repo', harness.dependencies);

    assert.deepEqual(harness.calls.open, ['NO_ACTIVE_PROFILE']);
    assert.deepEqual(harness.calls.generate, []);
  });

  it('passes the exact resolved profile to the unchanged generation pipeline', async () => {
    const harness = createHarness();
    harness.dependencies.resolveActiveProfile = async () => ({
      ok: true,
      profile,
      apiKey: 'sk-secret-A9F'
    });

    await runGenerateCommand('repo', harness.dependencies);

    assert.deepEqual(harness.calls.open, []);
    assert.deepEqual(harness.calls.generate, [
      { arg: 'repo', profileId: 'profile-1' }
    ]);
  });

  it('keeps the legacy Gemini branch callable when no new profile is selected', async () => {
    const harness = createHarness();
    harness.dependencies.getLegacyProvider = () => 'gemini';

    await runGenerateCommand('repo', harness.dependencies);

    assert.deepEqual(harness.calls.open, []);
    assert.deepEqual(harness.calls.generate, [
      { arg: 'repo', profileId: undefined }
    ]);
  });
});
