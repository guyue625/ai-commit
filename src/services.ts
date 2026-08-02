import * as vscode from 'vscode';
import { ActiveProfileResolver } from './configuration/active-profile-resolver';
import {
  ConfigCenterSettingsAdapter,
  ConfigurationScope,
  ConfigurationStore,
  LegacySettingsAdapter
} from './configuration/configuration-adapters';
import { LegacyConfigurationMigrator } from './configuration/legacy-configuration-migrator';
import {
  PROFILE_CATALOG_KEY,
  ProfileRepository
} from './configuration/profile-repository';
import { SecretRepository } from './configuration/secret-repository';
import {
  MementoKeyValueStore,
  SecretStorageStore
} from './configuration/storage';
import { Logger } from './logger';
import { ProviderConnectionTester } from './providers/provider-connection-tester';
import {
  ENCRYPTED_VAULT_KEY,
  EncryptedVaultCoordinator
} from './sync/encrypted-vault-coordinator';
import { ConfigCenterController } from './webview/config-center-controller';
import { ConfigCenterPanel } from './webview/config-center-panel';

class VsCodeConfigurationStore implements ConfigurationStore {
  get<T>(key: string, defaultValue?: T): T | undefined {
    return vscode.workspace
      .getConfiguration('ai-commit')
      .get<T>(key, defaultValue as T);
  }

  inspect<T>(key: string) {
    return vscode.workspace.getConfiguration('ai-commit').inspect<T>(key);
  }

  update(
    key: string,
    value: unknown,
    scope: ConfigurationScope
  ): Thenable<void> {
    const target =
      scope === 'global'
        ? vscode.ConfigurationTarget.Global
        : scope === 'workspace'
          ? vscode.ConfigurationTarget.Workspace
          : vscode.ConfigurationTarget.WorkspaceFolder;
    return vscode.workspace
      .getConfiguration('ai-commit')
      .update(key, value, target);
  }
}

export class ExtensionServices implements vscode.Disposable {
  readonly profiles: ProfileRepository;
  readonly secrets: SecretRepository;
  readonly activeProfiles: ActiveProfileResolver;
  readonly connectionTester: ProviderConnectionTester;
  readonly settings: ConfigCenterSettingsAdapter;
  readonly vault: EncryptedVaultCoordinator;
  readonly migrator: LegacyConfigurationMigrator;
  readonly configCenter: ConfigCenterPanel;

  constructor(private readonly context: vscode.ExtensionContext) {
    const globalStore = new MementoKeyValueStore(context.globalState);
    const workspaceStore = new MementoKeyValueStore(context.workspaceState);
    const localSecrets = new SecretStorageStore(context.secrets);
    const configuration = new VsCodeConfigurationStore();

    context.globalState.setKeysForSync([
      PROFILE_CATALOG_KEY,
      ENCRYPTED_VAULT_KEY
    ]);

    this.profiles = new ProfileRepository(globalStore);
    this.secrets = new SecretRepository(localSecrets);
    this.activeProfiles = new ActiveProfileResolver(
      this.profiles,
      this.secrets,
      workspaceStore
    );
    this.connectionTester = new ProviderConnectionTester();
    this.settings = new ConfigCenterSettingsAdapter(configuration);
    this.vault = new EncryptedVaultCoordinator(
      this.profiles,
      this.secrets,
      globalStore,
      localSecrets
    );
    this.migrator = new LegacyConfigurationMigrator(
      this.profiles,
      this.secrets,
      new LegacySettingsAdapter(configuration, globalStore)
    );
    const controller = new ConfigCenterController({
      profiles: this.profiles,
      secrets: this.secrets,
      activeProfiles: this.activeProfiles,
      connectionTester: this.connectionTester,
      settings: this.settings,
      vault: this.vault,
      locale: vscode.env.language
    });
    this.configCenter = new ConfigCenterPanel(context.extensionUri, controller);
  }

  async initialize(): Promise<void> {
    try {
      await this.migrator.migrate();
    } catch (error) {
      Logger.warn('Legacy configuration migration was not completed:', error);
    }
    await this.vault.initialize();
  }

  async openConfigCenter(_reason?: string): Promise<void> {
    await this.configCenter.open();
  }

  dispose(): void {
    this.configCenter.dispose();
    this.vault.dispose();
  }
}

export async function createExtensionServices(
  context: vscode.ExtensionContext
): Promise<ExtensionServices> {
  const services = new ExtensionServices(context);
  await services.initialize();
  return services;
}
