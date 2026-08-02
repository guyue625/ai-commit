import { ConfigKeys, ConfigurationManager } from './config';
import {
  createDefaultSystemPrompt,
  selectSystemPrompt
} from './generation/prompt-template';

/**
 * Initializes the main prompt for generating commit messages.
 *
 * @param {string} language - The language to be used in the prompt.
 * @returns {Object} - The main prompt object containing role and content.
 */
const INIT_MAIN_PROMPT = (language: string) => ({
  role: 'system',
  content: selectSystemPrompt(
    createDefaultSystemPrompt(language),
    ConfigurationManager.getInstance().getConfig<string>(ConfigKeys.SYSTEM_PROMPT)
  )
});

/**
 * Retrieves the main commit prompt.
 *
 * @returns {Promise<Array<Object>>} - A promise that resolves to an array of prompts.
 */
export const getMainCommitPrompt = async () => {
  const language = ConfigurationManager.getInstance().getConfig<string>(
    ConfigKeys.AI_COMMIT_LANGUAGE
  );
  return [INIT_MAIN_PROMPT(language)];
};
