import * as vscode from 'vscode';
import { runGenerateCommand } from './command-routing';
import { ConfigKeys, ConfigurationManager } from './config';
import { generateCommitMsg } from './generate-commit-msg';
import { Logger } from './logger';
import { toRuntimeProviderConfig } from './providers/runtime-provider-config';
import { ExtensionServices } from './services';

/** Manages command registration and disposal. */
export class CommandManager implements vscode.Disposable {
  private readonly disposables: vscode.Disposable[] = [];

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly services: ExtensionServices
  ) {}

  registerCommands(): void {
    this.registerCommand('extension.ai-commit', async (arg: unknown) => {
      const configManager = ConfigurationManager.getInstance();
      await runGenerateCommand(arg, {
        resolveActiveProfile: () => this.services.activeProfiles.resolve(),
        getLegacyProvider: () =>
          configManager.getConfig<string>(ConfigKeys.AI_PROVIDER, 'openai'),
        openConfigCenter: (reason) =>
          this.services.openConfigCenter(reason),
        generate: (commandArg, runtimeConfig) =>
          generateCommitMsg(commandArg, runtimeConfig)
      });
    });

    this.registerCommand('ai-commit.openConfigCenter', () =>
      this.services.openConfigCenter()
    );
    this.registerCommand('extension.configure-ai-commit', () =>
      this.services.openConfigCenter()
    );
    this.registerCommand('ai-commit.showAvailableModels', () =>
      this.showAvailableModels()
    );
  }

  dispose(): void {
    for (const disposable of this.disposables.splice(0)) {
      disposable.dispose();
    }
  }

  private async showAvailableModels(): Promise<void> {
    const resolved = await this.services.activeProfiles.resolve();
    if (resolved.ok === false) {
      await this.services.openConfigCenter(resolved.reason);
      return;
    }
    const models = await this.services.connectionTester.listModels(
      toRuntimeProviderConfig(resolved.profile, resolved.apiKey)
    );
    const selected = await vscode.window.showQuickPick(models, {
      placeHolder: 'Select a model for the active channel profile'
    });
    if (selected) {
      await this.services.profiles.update(resolved.profile.id, {
        model: selected,
        lastTest: undefined
      });
    }
  }

  private registerCommand(
    command: string,
    handler: (...args: unknown[]) => unknown
  ): void {
    const disposable = vscode.commands.registerCommand(
      command,
      async (...args: unknown[]) => {
        try {
          Logger.info(`Executing command: ${command}`);
          await handler(...args);
        } catch (error) {
          Logger.error(`Command '${command}' failed:`, error);
          const message =
            error instanceof Error ? error.message : 'Unexpected command error';
          const result = await vscode.window.showErrorMessage(
            `Failed: ${message}`,
            'Retry',
            'Configure'
          );
          if (result === 'Retry') {
            await handler(...args);
          } else if (result === 'Configure') {
            await this.services.openConfigCenter();
          }
        }
      }
    );

    this.disposables.push(disposable);
    this.context.subscriptions.push(disposable);
  }
}
