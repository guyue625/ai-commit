import * as fs from 'fs-extra';
import { ChatCompletionMessageParam } from 'openai/resources';
import * as vscode from 'vscode';
import { ConfigKeys, ConfigurationManager } from './config';
import { getDiffStaged } from './git-utils';
import { ChatGPTAPI, ResponsesAPI } from './openai-utils';
import { getMainCommitPrompt } from './prompts';
import { ProgressHandler } from './utils';
import { GeminiAPI } from './gemini-utils';
import { ClaudeAPI } from './claude-utils';
import { Logger } from './logger';
import {
  buildCommitMessages,
  cleanCommitMessage
} from './generation/message-helpers';
import { invokeCommitProvider } from './generation/provider-invocation';
import { RuntimeProviderConfig } from './providers/runtime-provider-config';

/**
 * Generates a chat completion prompt for the commit message based on the provided diff.
 *
 * @param {string} diff - The diff string representing changes to be committed.
 * @param {string} additionalContext - Additional context for the changes.
 * @returns {Promise<Array<{ role: string, content: string }>>} - A promise that resolves to an array of messages for the chat completion.
 */
const generateCommitMessageChatCompletionPrompt = async (
  diff: string,
  additionalContext?: string
) => {
  const INIT_MESSAGES_PROMPT = await getMainCommitPrompt();
  return buildCommitMessages(
    INIT_MESSAGES_PROMPT[0].content,
    diff,
    additionalContext
  );
};

/**
 * Retrieves the repository associated with the provided argument.
 *
 * @param {any} arg - The input argument containing the root URI of the repository.
 * @returns {Promise<vscode.SourceControlRepository>} - A promise that resolves to the repository object.
 */
export async function getRepo(arg) {
  const gitApi = vscode.extensions.getExtension('vscode.git')?.exports.getAPI(1);
  if (!gitApi) {
    throw new Error('Git extension not found');
  }

  if (typeof arg === 'object' && arg.rootUri) {
    const resourceUri = arg.rootUri;
    const realResourcePath: string = fs.realpathSync(resourceUri!.fsPath);
    for (let i = 0; i < gitApi.repositories.length; i++) {
      const repo = gitApi.repositories[i];
      if (realResourcePath.startsWith(repo.rootUri.fsPath)) {
        return repo;
      }
    }
  }
  return gitApi.repositories[0];
}

/**
 * Generates a commit message based on the changes staged in the repository.
 *
 * @param {any} arg - The input argument containing the root URI of the repository.
 * @returns {Promise<void>} - A promise that resolves when the commit message has been generated and set in the SCM input box.
 */
export async function generateCommitMsg(
  arg: unknown,
  runtimeConfig?: RuntimeProviderConfig
) {
  return ProgressHandler.withProgress('', async (progress) => {
    try {
      const configManager = ConfigurationManager.getInstance();
      const repo = await getRepo(arg);

      const aiProvider =
        runtimeConfig?.provider ??
        configManager.getConfig<string>(ConfigKeys.AI_PROVIDER, 'openai');
      Logger.info(`Using AI provider: ${aiProvider}`);

      progress.report({ message: 'Getting staged changes...' });
      const { diff, error } = await getDiffStaged(repo);

      if (error) {
        throw new Error(`Failed to get staged changes: ${error}`);
      }

      if (!diff || diff === 'No changes staged.') {
        throw new Error('No changes staged for commit');
      }

      const scmInputBox = repo.inputBox;
      if (!scmInputBox) {
        throw new Error('Unable to find the SCM input box');
      }

      const additionalContext = scmInputBox.value.trim();

      progress.report({
        message: additionalContext
          ? 'Analyzing changes with additional context...'
          : 'Analyzing changes...'
      });
      const messages = await generateCommitMessageChatCompletionPrompt(
        diff,
        additionalContext
      );

      progress.report({
        message: additionalContext
          ? 'Generating commit message with additional context...'
          : 'Generating commit message...'
      });
      try {
        let commitMessage = await invokeCommitProvider(
          messages as ChatCompletionMessageParam[],
          runtimeConfig,
          {
            getLegacyProvider: () =>
              configManager.getConfig<string>(ConfigKeys.AI_PROVIDER, 'openai'),
            getLegacyOpenAIApiType: () =>
              configManager.getConfig<string>(
                ConfigKeys.OPENAI_API_TYPE,
                'completion'
              ),
            openAIChat: async (providerMessages, config) => {
              if (
                !config &&
                !configManager.getConfig<string>(ConfigKeys.OPENAI_API_KEY)
              ) {
                throw new Error('OpenAI API Key not configured');
              }
              return ChatGPTAPI(providerMessages, config);
            },
            openAIResponses: async (providerMessages, config) => {
              if (
                !config &&
                !configManager.getConfig<string>(ConfigKeys.OPENAI_API_KEY)
              ) {
                throw new Error('OpenAI API Key not configured');
              }
              return ResponsesAPI(providerMessages, config);
            },
            anthropic: async (providerMessages, config) => {
              if (
                !config &&
                !configManager.getConfig<string>(ConfigKeys.CLAUDE_API_KEY)
              ) {
                throw new Error('Claude API Key not configured');
              }
              return ClaudeAPI(providerMessages, config);
            },
            gemini: async (providerMessages) => {
              if (!configManager.getConfig<string>(ConfigKeys.GEMINI_API_KEY)) {
                throw new Error('Gemini API Key not configured');
              }
              return GeminiAPI(providerMessages);
            }
          }
        );

        if (commitMessage) {
          // 清理 think 标签内容
          commitMessage = cleanCommitMessage(commitMessage);
          Logger.info('Commit message generated successfully');
          scmInputBox.value = commitMessage;
        } else {
          throw new Error('Failed to generate commit message');
        }
      } catch (err: any) {
        Logger.error(`${aiProvider} API call failed:`, err);
        let errorMessage =
          (err instanceof Error && err.message) ||
          (typeof err === 'string' ? err : 'An unexpected error occurred');

        if (aiProvider === 'openai' && err?.response?.status) {
          switch (err.response.status) {
            case 401:
              errorMessage = 'Invalid OpenAI API key or unauthorized access';
              break;
            case 429:
              errorMessage = 'Rate limit exceeded. Please try again later';
              break;
            case 500:
              errorMessage = 'OpenAI server error. Please try again later';
              break;
            case 503:
              errorMessage = 'OpenAI service is temporarily unavailable';
              break;
          }
        } else if (aiProvider === 'gemini') {
          errorMessage = `Gemini API error: ${err.message}`;
        } else if (aiProvider === 'claude' || aiProvider === 'anthropic') {
          errorMessage = `Claude API error: ${err.message}`;
        }

        throw new Error(errorMessage);
      }
    } catch (error) {
      throw error;
    }
  });
}
