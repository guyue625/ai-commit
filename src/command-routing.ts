import type { ResolveActiveProfileResult } from './configuration/active-profile-resolver';
import {
  RuntimeProviderConfig,
  toRuntimeProviderConfig
} from './providers/runtime-provider-config';

export interface GenerateCommandDependencies {
  resolveActiveProfile(): Promise<ResolveActiveProfileResult>;
  getLegacyProvider(): string;
  openConfigCenter(reason: string): Promise<void>;
  generate(arg: unknown, runtimeConfig?: RuntimeProviderConfig): Promise<void>;
}

export async function runGenerateCommand(
  arg: unknown,
  dependencies: GenerateCommandDependencies
): Promise<void> {
  const resolved = await dependencies.resolveActiveProfile();
  if (resolved.ok === true) {
    await dependencies.generate(
      arg,
      toRuntimeProviderConfig(resolved.profile, resolved.apiKey)
    );
    return;
  }

  if (dependencies.getLegacyProvider() === 'gemini') {
    await dependencies.generate(arg);
    return;
  }

  await dependencies.openConfigCenter(resolved.reason);
}
