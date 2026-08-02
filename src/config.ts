import * as vscode from 'vscode';

export enum ConfigKeys {
  OPENAI_API_KEY = 'OPENAI_API_KEY',
  OPENAI_BASE_URL = 'OPENAI_BASE_URL',
  OPENAI_MODEL = 'OPENAI_MODEL',
  AZURE_API_VERSION = 'AZURE_API_VERSION',
  AI_COMMIT_LANGUAGE = 'AI_COMMIT_LANGUAGE',
  SYSTEM_PROMPT = 'AI_COMMIT_SYSTEM_PROMPT',
  OPENAI_TEMPERATURE = 'OPENAI_TEMPERATURE',

  GEMINI_API_KEY = 'GEMINI_API_KEY',
  GEMINI_MODEL = 'GEMINI_MODEL',
  GEMINI_TEMPERATURE = 'GEMINI_TEMPERATURE',
  AI_PROVIDER = 'AI_PROVIDER',

  CLAUDE_API_KEY = 'CLAUDE_API_KEY',
  CLAUDE_MODEL = 'CLAUDE_MODEL',
  CLAUDE_TEMPERATURE = 'CLAUDE_TEMPERATURE',

  OPENAI_API_TYPE = 'OPENAI_API_TYPE',
  OPENAI_REASONING_EFFORT = 'OPENAI_REASONING_EFFORT',
  OPENAI_TEXT_VERBOSITY = 'OPENAI_TEXT_VERBOSITY'
}

/** Cached access to legacy VS Code settings used by generation and migration. */
export class ConfigurationManager implements vscode.Disposable {
  private static instance: ConfigurationManager;
  private readonly configCache = new Map<string, unknown>();
  private readonly disposable: vscode.Disposable;

  private constructor(_context: vscode.ExtensionContext) {
    this.disposable = vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('ai-commit')) {
        this.configCache.clear();
      }
    });
  }

  static getInstance(context?: vscode.ExtensionContext): ConfigurationManager {
    if (!this.instance && context) {
      this.instance = new ConfigurationManager(context);
    }
    return this.instance;
  }

  getConfig<T>(key: string, defaultValue?: T): T {
    if (!this.configCache.has(key)) {
      const config = vscode.workspace.getConfiguration('ai-commit');
      this.configCache.set(key, config.get<T>(key, defaultValue));
    }
    return this.configCache.get(key) as T;
  }

  dispose(): void {
    this.disposable.dispose();
    this.configCache.clear();
  }
}
