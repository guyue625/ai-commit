import assert from 'node:assert/strict';
import { describe, it } from 'mocha';
import {
  ProviderConnectionProbe,
  ProviderConnectionTester
} from '../src/providers/provider-connection-tester';
import { RuntimeProviderConfig } from '../src/providers/runtime-provider-config';

const runtimeConfig: RuntimeProviderConfig = {
  profileId: 'profile-1',
  profileName: 'OpenAI official',
  provider: 'openai',
  apiKey: 'sk-secret',
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-5-mini',
  options: {
    apiType: 'completion',
    temperature: 0.7,
    reasoningEffort: 'medium',
    textVerbosity: 'medium'
  }
};

class FakeProbe implements ProviderConnectionProbe {
  listCalls = 0;
  testCalls = 0;

  async listModels(): Promise<string[]> {
    this.listCalls += 1;
    return ['gpt-5-mini', '', 'gpt-5-mini', 'gpt-4.1'];
  }

  async testConnection(): Promise<void> {
    this.testCalls += 1;
  }
}

describe('ProviderConnectionTester', () => {
  it('returns a sorted unique model list on explicit request', async () => {
    const probe = new FakeProbe();
    const tester = new ProviderConnectionTester(probe);

    assert.deepEqual(await tester.listModels(runtimeConfig), [
      'gpt-4.1',
      'gpt-5-mini'
    ]);
    assert.equal(probe.listCalls, 1);
  });

  it('measures an explicit connection test without background polling', async () => {
    const probe = new FakeProbe();
    const times = [100, 142];
    const tester = new ProviderConnectionTester(
      probe,
      () => times.shift() ?? 142
    );

    assert.deepEqual(await tester.testConnection(runtimeConfig), {
      latencyMs: 42
    });
    assert.equal(probe.testCalls, 1);
  });

  it('rejects a request that is already cancelled before contacting a provider', async () => {
    const probe = new FakeProbe();
    const tester = new ProviderConnectionTester(probe);
    const controller = new AbortController();
    controller.abort();

    await assert.rejects(
      tester.listModels(runtimeConfig, controller.signal),
      /CONNECTION_TEST_CANCELLED/
    );
    assert.equal(probe.listCalls, 0);
  });
});
