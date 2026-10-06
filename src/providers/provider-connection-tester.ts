import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { ConnectionTestMethod } from '../configuration/profile-types';
import {
  buildAnthropicClientOptions,
  buildOpenAIClientOptions,
  RuntimeProviderConfig
} from './runtime-provider-config';

const CONNECTION_TEST_TIMEOUT_MS = 30_000;
const PROBE_CLIENT_OPTIONS = {
  maxRetries: 0,
  timeout: CONNECTION_TEST_TIMEOUT_MS
};

export interface ConnectionTestResult {
  latencyMs: number;
  method: ConnectionTestMethod;
}

export interface ProviderConnectionProbe {
  listModels(
    config: RuntimeProviderConfig,
    signal?: AbortSignal
  ): Promise<string[]>;
  testConnection(
    config: RuntimeProviderConfig,
    signal?: AbortSignal
  ): Promise<ConnectionTestMethod>;
}

export class ProviderConnectionTester {
  constructor(
    private readonly probe: ProviderConnectionProbe =
      new SdkProviderConnectionProbe(),
    private readonly now: () => number = Date.now,
    private readonly timeoutMs: number = CONNECTION_TEST_TIMEOUT_MS
  ) {}

  async listModels(
    config: RuntimeProviderConfig,
    signal?: AbortSignal
  ): Promise<string[]> {
    const models = await this.runWithDeadline(
      (probeSignal) => this.probe.listModels(config, probeSignal),
      signal
    );
    return Array.from(
      new Set(models.map((model) => model.trim()).filter(Boolean))
    ).sort((left, right) => left.localeCompare(right));
  }

  async testConnection(
    config: RuntimeProviderConfig,
    signal?: AbortSignal
  ): Promise<ConnectionTestResult> {
    this.ensureNotCancelled(signal);
    const startedAt = this.now();
    const method = await this.runWithDeadline(
      (probeSignal) => this.probe.testConnection(config, probeSignal),
      signal
    );
    return { latencyMs: Math.max(0, this.now() - startedAt), method };
  }

  private async runWithDeadline<T>(
    operation: (signal: AbortSignal) => Promise<T>,
    signal?: AbortSignal
  ): Promise<T> {
    this.ensureNotCancelled(signal);
    const controller = new AbortController();
    let rejectCancellation: (error: Error) => void;
    const cancellation = new Promise<never>((_resolve, reject) => {
      rejectCancellation = reject;
    });
    const abort = (code: string) => {
      rejectCancellation(new Error(code));
      controller.abort();
    };
    const onAbort = () => abort('CONNECTION_TEST_CANCELLED');
    signal?.addEventListener('abort', onAbort, { once: true });
    const timeout = setTimeout(
      () => abort('CONNECTION_TEST_TIMEOUT'),
      this.timeoutMs
    );

    try {
      return await Promise.race([
        cancellation,
        operation(controller.signal)
      ]);
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', onAbort);
    }
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
      const client = new OpenAI({
        ...buildOpenAIClientOptions(config),
        ...PROBE_CLIENT_OPTIONS
      });
      const page = await client.models.list({ signal });
      return this.modelIds(page.data);
    }

    const client = new Anthropic({
      ...buildAnthropicClientOptions(config),
      ...PROBE_CLIENT_OPTIONS
    });
    const page = await client.models.list({ limit: 1000 }, { signal });
    return this.modelIds(page.data);
  }

  async testConnection(
    config: RuntimeProviderConfig,
    signal?: AbortSignal
  ): Promise<ConnectionTestMethod> {
    try {
      const models = await this.listModels(config, signal);
      if (models.includes(config.model.trim())) {
        return 'models';
      }
    } catch (error) {
      // Some gateways allow generation but omit or restrict model listing.
      // Auth failures, rate limits, and outages must not trigger more requests.
      if (
        !(error instanceof OpenAI.APIError || error instanceof Anthropic.APIError) ||
        ![400, 403, 404, 405, 501].includes(error.status)
      ) {
        throw error;
      }
    }

    await this.testModel(config, signal);
    return 'generation';
  }

  private modelIds(data: unknown): string[] {
    if (!Array.isArray(data)) {
      return [];
    }
    return data
      .map((model) => model?.id)
      .filter((id): id is string => typeof id === 'string')
      .map((id) => id.trim())
      .filter(Boolean);
  }

  private async testModel(
    config: RuntimeProviderConfig,
    signal?: AbortSignal
  ): Promise<void> {
    if (config.provider === 'openai') {
      const client = new OpenAI({
        ...buildOpenAIClientOptions(config),
        ...PROBE_CLIENT_OPTIONS
      });
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

    const client = new Anthropic({
      ...buildAnthropicClientOptions(config),
      ...PROBE_CLIENT_OPTIONS
    });
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
