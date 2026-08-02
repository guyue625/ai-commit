import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';

suite('Lin AI Commit extension host smoke', () => {
  test('activates lazily through the contributed Config Center command', async () => {
    const extension = vscode.extensions.getExtension('sitoi.lin-ai-commit');
    assert.ok(extension, 'The Lin AI Commit extension should be discoverable');

    const manifest = extension.packageJSON as {
      activationEvents?: string[];
      contributes?: { commands?: Array<{ command?: string }> };
    };
    assert.equal(
      manifest.activationEvents?.includes('onStartupFinished') ?? false,
      false,
      'The extension should not require startup activation'
    );

    const contributedCommands =
      manifest.contributes?.commands?.map((command) => command.command) ?? [];
    assert.ok(
      contributedCommands.includes('ai-commit.openConfigCenter'),
      'The Config Center command should be contributed'
    );

    assert.equal(
      extension.isActive,
      false,
      'The extension should remain inactive until a contributed command runs'
    );

    await vscode.commands.executeCommand('ai-commit.openConfigCenter');

    assert.equal(
      extension.isActive,
      true,
      'Executing the contributed command should activate the extension'
    );
    const commandsAfterActivation = await vscode.commands.getCommands(true);
    assert.ok(
      commandsAfterActivation.includes('extension.ai-commit'),
      'The generation command should be registered after activation'
    );

    await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
  });
});
