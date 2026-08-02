import * as vscode from 'vscode';
import { CommandManager } from './commands';
import { ConfigurationManager } from './config';
import { Logger } from './logger';
import { createExtensionServices } from './services';

/** Activates lazily when one of the contributed commands is invoked. */
export async function activate(context: vscode.ExtensionContext): Promise<void> {
  try {
    Logger.initialize();
    Logger.info('Activating AI Commit extension...');

    const configManager = ConfigurationManager.getInstance(context);
    const services = await createExtensionServices(context);
    const commandManager = new CommandManager(context, services);
    commandManager.registerCommands();

    context.subscriptions.push(
      services,
      commandManager,
      {
        dispose: () => configManager.dispose()
      },
      {
        dispose: () => Logger.dispose()
      }
    );
  } catch (error) {
    Logger.error('Failed to activate extension:', error);
    throw error;
  }
}

export function deactivate(): void {}
