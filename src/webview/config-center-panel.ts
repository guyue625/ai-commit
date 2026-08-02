import { randomBytes } from 'node:crypto';
import * as vscode from 'vscode';
import { ConfigCenterController } from './config-center-controller';
import { buildConfigCenterHtml } from './config-center-html';
import { getTranslations } from './i18n';

export class ConfigCenterPanel implements vscode.Disposable {
  private panel?: vscode.WebviewPanel;
  private panelDisposables: vscode.Disposable[] = [];

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly controller: ConfigCenterController
  ) {}

  async open(): Promise<void> {
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.Active, true);
      await this.postViewModel();
      return;
    }

    const translations = getTranslations(vscode.env.language);
    const panel = vscode.window.createWebviewPanel(
      'aiCommit.configCenter',
      translations.configCenterTitle,
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: false,
        localResourceRoots: [
          vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview'),
          vscode.Uri.joinPath(this.extensionUri, 'media')
        ]
      }
    );
    this.panel = panel;

    const scriptUri = panel.webview.asWebviewUri(
      vscode.Uri.joinPath(
        this.extensionUri,
        'dist',
        'webview',
        'config-center.js'
      )
    );
    const styleUri = panel.webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'media', 'config-center.css')
    );
    panel.webview.html = buildConfigCenterHtml({
      cspSource: panel.webview.cspSource,
      scriptUri: scriptUri.toString(),
      styleUri: styleUri.toString(),
      nonce: randomBytes(18).toString('base64url'),
      locale: vscode.env.language,
      title: translations.configCenterTitle
    });

    this.panelDisposables.push(
      panel.webview.onDidReceiveMessage(async (message: unknown) => {
        const response = await this.controller.handle(message);
        await panel.webview.postMessage(response);
      }),
      panel.onDidDispose(() => {
        this.panel = undefined;
        this.disposePanelListeners();
      })
    );
  }

  dispose(): void {
    const panel = this.panel;
    this.panel = undefined;
    this.disposePanelListeners();
    panel?.dispose();
  }

  private async postViewModel(): Promise<void> {
    if (!this.panel) {
      return;
    }
    const response = await this.controller.handle({
      type: 'ready',
      requestId: `host-${Date.now()}`,
      payload: {}
    });
    await this.panel.webview.postMessage(response);
  }

  private disposePanelListeners(): void {
    for (const disposable of this.panelDisposables.splice(0)) {
      disposable.dispose();
    }
  }
}
