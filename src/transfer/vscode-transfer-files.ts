import * as vscode from 'vscode';
import { MAX_BACKUP_BYTES } from './encrypted-profile-backup';
import { TransferFiles } from './profile-transfer-service';
import { getTranslations } from '../webview/i18n';

export class VsCodeTransferFiles implements TransferFiles {
  async save(contents: Uint8Array): Promise<boolean> {
    const t = getTranslations(vscode.env.language);
    const uri = await vscode.window.showSaveDialog({
      title: t.exportProfiles, saveLabel: t.exportProfiles,
      filters: { 'AI Commit Backup': ['aicommit'] }
    });
    if (!uri) { return false; }
    await vscode.workspace.fs.writeFile(uri, contents);
    return true;
  }

  async open(): Promise<Uint8Array | undefined> {
    const t = getTranslations(vscode.env.language);
    const uris = await vscode.window.showOpenDialog({
      title: t.importProfiles, openLabel: t.importProfiles,
      canSelectFiles: true, canSelectFolders: false, canSelectMany: false,
      filters: { 'AI Commit Backup': ['aicommit'] }
    });
    if (!uris?.[0]) { return undefined; }
    if ((await vscode.workspace.fs.stat(uris[0])).size > MAX_BACKUP_BYTES) {
      throw new Error('BACKUP_TOO_LARGE');
    }
    return vscode.workspace.fs.readFile(uris[0]);
  }
}
