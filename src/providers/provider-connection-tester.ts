import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import {
  buildAnthropicClientOptions,
  buildOpenAIClientOptions,
  RuntimeProviderConfig
} from './runtime-provider-config';

export interface ProviderConnectionProbe {
  listModels(
    config: RuntimeProviderConfig,
    signal?: AbortSignal
  ): Promise<string[]>;
  testConnection(
    config: RuntimeProviderConfig,
    signal?: AbortSignal
  ): Promise<void>;
}

export class ProviderConnectionTester {
  constructor(
    private readonly probe: ProviderConnectionProbe =
      new SdkProviderConnectionProbe(),
    private readonly now: () => number = Date.now
  ) {}

  async listModels(
    config: RuntimeProviderConfig,
    signal?: AbortSignal
  ): Promise<string[]> {
    this.ensureNotCancelled(signal);
    const models = await this.probe.listModels(config, signal);
    return Array.from(
      new Set(models.map((model) => model.trim()).filter(Boolean))
    ).sort((left, right) => left.localeCompare(right));
  }

  async testConnection(
    config: RuntimeProviderConfig,
    signal?: AbortSignal
  ): Promise<{ latencyMs: number }> {
    this.ensureNotCancelled(signal);
    const startedAt = this.now();
    await this.probe.testConnection(config, signal);
    return { latencyMs: Math.max(0, this.now() - startedAt) };
  }

  private ensureNotCancelled(signal?: AbortSignal): void {
    if (signal?.aborted) {
      throw new Error('CONNECTION_TEST_CANCELLED');
    }
  }
}

export class SdkProviderConnectionProbe implements ProviderConnectionProbe {
  async listModels(
    config: RuntimeProviderConfig,
    signal?: AbortSignal
  ): Promise<string[]> {
    if (config.provider === 'openai') {
      const client = new OpenAI(buildOpenAIClientOptions(config));
      const page = await client.models.list({ signal });
      return page.data.map((model) => model.id);
    }

    const client = new Anthropic(buildAnthropicClientOptions(config));
    const page = await client.models.list({ limit: 1000 }, { signal });
    return page.data.map((model) => model.id);
  }

  async testConnection(
    config: RuntimeProviderConfig,
    signal?: AbortSignal
  ): Promise<void> {
    if (config.provider === 'openai') {
      const client = new OpenAI(buildOpenAIClientOptions(config));
      if (config.options.apiType === 'response') {
        await client.responses.create(
          {
            model: config.model,
            input: 'Reply with OK.',
            max_output_tokens: 16
          },
          { signal }
        );
      } else {
        await client.chat.completions.create(
          {
            model: config.model,
            messages: [{ role: 'user', content: 'Reply with OK.' }],
            max_tokens: 1,
            temperature: 0
          },
          { signal }
        );
      }
      return;
    }

    const client = new Anthropic(buildAnthropicClientOptions(config));
    await client.messages.create(
      {
        model: config.model,
        max_tokens: 1,
        messages: [{ role: 'user', content: 'Reply with OK.' }]
      },
      { signal }
    );
  }
}
