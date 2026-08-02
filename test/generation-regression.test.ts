import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { describe, it } from 'mocha';
import {
  createDefaultSystemPrompt,
  selectSystemPrompt
} from '../src/generation/prompt-template';
import {
  buildCommitMessages,
  cleanCommitMessage
} from '../src/generation/message-helpers';
import { invokeCommitProvider } from '../src/generation/provider-invocation';
import { RuntimeProviderConfig } from '../src/providers/runtime-provider-config';

describe('generation regression', () => {
  it('keeps the existing English default prompt byte-for-byte', () => {
    const prompt = createDefaultSystemPrompt('English');

    assert.equal(prompt.length, 3077);
    assert.equal(
      createHash('sha256').update(prompt).digest('hex'),
      '13cff059344dc7dd7f22f1e7cce54a9f9414aac905bd813f29110e83a64c712c'
    );
  });

  it('uses a custom prompt as a full replacement when it is configured', () => {
    assert.equal(selectSystemPrompt('default prompt', 'custom prompt'), 'custom prompt');
    assert.equal(selectSystemPrompt('default prompt', ''), 'default prompt');
  });

  it('keeps additional context between the system prompt and diff', () => {
    assert.deepEqual(
      buildCommitMessages('default prompt', 'diff text', 'context text'),
      [
        { role: 'system', content: 'default prompt' },
        {
          role: 'user',
          content: 'Additional context for the changes:\ncontext text'
        },
        { role: 'user', content: 'diff text' }
      ]
    );
  });

  it('omits the additional context message when the input is empty', () => {
    assert.deepEqual(buildCommitMessages('default prompt', 'diff text'), [
      { role: 'system', content: 'default prompt' },
      { role: 'user', content: 'diff text' }
    ]);
  });

  it('keeps the existing think-tag cleanup behavior', () => {
    assert.equal(
      cleanCommitMessage('<think>private reasoning</think>\nfix: result'),
      'fix: result'
    );
  });

  it('routes an explicit profile without consulting the legacy provider setting', async () => {
    const calls: string[] = [];
    const runtimeConfig: RuntimeProviderConfig = {
      profileId: 'profile-1',
      profileName: 'OpenAI Responses',
      provider: 'openai',
      apiKey: 'sk-secret',
      baseUrl: 'https://proxy.example/v1',
      model: 'gpt-5-mini',
      options: {
        apiType: 'response',
        temperature: 0.2,
        reasoningEffort: 'high',
        textVerbosity: 'low'
      }
    };
    const messages = [{ role: 'user', content: 'diff' }] as any[];

    const result = await invokeCommitProvider(messages, runtimeConfig, {
      getLegacyProvider() {
        throw new Error('legacy provider must not be read');
      },
      getLegacyOpenAIApiType() {
        throw new Error('legacy API type must not be read');
      },
      async openAIChat() {
        calls.push('chat');
        return 'chat';
      },
      async openAIResponses(receivedMessages, receivedConfig) {
        assert.equal(receivedMessages, messages);
        assert.equal(receivedConfig, runtimeConfig);
        calls.push('responses');
        return 'result';
      },
      async anthropic() {
        calls.push('anthropic');
        return 'anthropic';
      },
      async gemini() {
        calls.push('gemini');
        return 'gemini';
      }
    });

    assert.equal(result, 'result');
    assert.deepEqual(calls, ['responses']);
  });

  it('keeps the legacy Gemini invocation when no runtime profile is supplied', async () => {
    const calls: string[] = [];

    const result = await invokeCommitProvider([], undefined, {
      getLegacyProvider: () => 'gemini',
      getLegacyOpenAIApiType: () => 'completion',
      async openAIChat() {
        calls.push('chat');
        return 'chat';
      },
      async openAIResponses() {
        calls.push('responses');
        return 'responses';
      },
      async anthropic() {
        calls.push('anthropic');
        return 'anthropic';
      },
      async gemini() {
        calls.push('gemini');
        return 'gemini-result';
      }
    });

    assert.equal(result, 'gemini-result');
    assert.deepEqual(calls, ['gemini']);
  });
});
