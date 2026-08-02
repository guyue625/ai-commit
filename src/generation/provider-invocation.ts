import type { ChatCompletionMessageParam } from 'openai/resources';
import type {
  RuntimeAnthropicConfig,
  RuntimeOpenAIConfig,
  RuntimeProviderConfig
} from '../providers/runtime-provider-config';

export interface CommitProviderInvoker {
  getLegacyProvider(): string;
  getLegacyOpenAIApiType(): string;
  openAIChat(
    messages: ChatCompletionMessageParam[],
    runtimeConfig?: RuntimeOpenAIConfig
  ): Promise<string | null | undefined>;
  openAIResponses(
    messages: ChatCompletionMessageParam[],
    runtimeConfig?: RuntimeOpenAIConfig
  ): Promise<string | undefined>;
  anthropic(
    messages: ChatCompletionMessageParam[],
    runtimeConfig?: RuntimeAnthropicConfig
  ): Promise<string | undefined>;
  gemini(messages: ChatCompletionMessageParam[]): Promise<string | undefined>;
}

export async function invokeCommitProvider(
  messages: ChatCompletionMessageParam[],
  runtimeConfig: RuntimeProviderConfig | undefined,
  invoker: CommitProviderInvoker
): Promise<string | null | undefined> {
  if (runtimeConfig?.provider === 'openai') {
    return runtimeConfig.options.apiType === 'response'
      ? invoker.openAIResponses(messages, runtimeConfig)
      : invoker.openAIChat(messages, runtimeConfig);
  }
  if (runtimeConfig?.provider === 'anthropic') {
    return invoker.anthropic(messages, runtimeConfig);
  }

  const legacyProvider = invoker.getLegacyProvider();
  if (legacyProvider === 'gemini') {
    return invoker.gemini(messages);
  }
  if (legacyProvider === 'claude') {
    return invoker.anthropic(messages);
  }
  return invoker.getLegacyOpenAIApiType() === 'response'
    ? invoker.openAIResponses(messages)
    : invoker.openAIChat(messages);
}
