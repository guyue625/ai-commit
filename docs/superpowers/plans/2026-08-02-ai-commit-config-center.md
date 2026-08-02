# AI Commit Config Center Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Do not use Git commands or create commits unless the user later gives explicit permission.

**Goal:** Add a lightweight visual multi-channel configuration center with secure local secrets, optional end-to-end encrypted Settings Sync, safe legacy migration, and unchanged commit-generation behavior.

**Architecture:** Keep the existing diff/prompt/result pipeline intact and insert an `ActiveProfileResolver` immediately before provider invocation. Store profile metadata in synced global state, workspace selection in workspace state, full keys in SecretStorage, and an optional AES-256-GCM encrypted key vault in synced global state. Render the configuration UI with a framework-free VS Code Webview that only receives masked secrets.

**Tech Stack:** TypeScript, VS Code Extension API, Node.js `crypto`, OpenAI SDK, Anthropic SDK, Webpack, Mocha, VS Code Extension Test Electron, native HTML/CSS/DOM.

**Source design:** `docs/superpowers/specs/2026-08-02-ai-commit-config-center-design.md`

**Execution constraint:** Do not run `git`, commit, branch, push, pull, fetch, reset, checkout, clean, stash, or any other Git operation.

---

## File map

### Existing files to modify

- `package.json`: commands, localization, scripts, dependencies, activation behavior, packaging metadata.
- `webpack.config.js`: add a browser-targeted Webview bundle.
- `tsconfig.json`: shared strict-enough compiler configuration.
- `.vscodeignore`: remove development-only files and design artifacts from VSIX.
- `src/extension.ts`: initialize services and register lazy commands.
- `src/commands.ts`: open the configuration center and route generation through services.
- `src/generate-commit-msg.ts`: resolve the current runtime profile immediately before provider invocation.
- `src/openai-utils.ts`: accept explicit runtime config without changing request semantics.
- `src/claude-utils.ts`: accept explicit runtime config and custom Base URL.
- `src/config.ts`: retain legacy settings and add migration-safe helpers.
- `README.md`, `README.zh_CN.md`: document the configuration center and remove GIF references.

### Existing files to delete

- `.eslintrc.json`: replaced by ESLint flat config.
- `aicommit.gif`: no longer packaged or referenced.

### New production files

- `eslint.config.mjs`: ESLint 10 flat configuration.
- `tsconfig.test.json`: compile unit and integration tests.
- `package.nls.json`, `package.nls.zh-cn.json`: command localization.
- `src/configuration/profile-types.ts`: profile and catalog types.
- `src/configuration/storage.ts`: testable storage interfaces and VS Code adapters.
- `src/configuration/profile-repository.ts`: catalog CRUD and validation.
- `src/configuration/secret-repository.ts`: SecretStorage access and safe key hints.
- `src/configuration/active-profile-resolver.ts`: workspace/global profile resolution.
- `src/configuration/legacy-configuration-migrator.ts`: transactional old-settings migration.
- `src/sync/encrypted-vault-types.ts`: encrypted vault schemas.
- `src/sync/encrypted-vault-service.ts`: scrypt and AES-GCM implementation.
- `src/providers/runtime-provider-config.ts`: provider runtime config types.
- `src/providers/provider-connection-tester.ts`: model listing and minimal connection tests.
- `src/webview/messages.ts`: typed Webview message contracts and validation.
- `src/webview/i18n.ts`: Chinese and English strings.
- `src/webview/config-center-controller.ts`: message handling and ViewModel creation.
- `src/webview/config-center-panel.ts`: Webview lifecycle, CSP, and HTML shell.
- `src/webview/config-center-main.ts`: browser-side rendering and interaction.
- `media/config-center.css`: VS Code-themed layout.
- `src/services.ts`: extension-wide service composition.

### New tests

- `test/profile-repository.test.ts`
- `test/secret-repository.test.ts`
- `test/active-profile-resolver.test.ts`
- `test/encrypted-vault-service.test.ts`
- `test/legacy-configuration-migrator.test.ts`
- `test/generation-regression.test.ts`
- `test/webview-messages.test.ts`
- `test/i18n.test.ts`

---

### Task 1: Repair the build, lint, test, and packaging baseline

**Files:**
- Modify: `package.json`
- Modify: `tsconfig.json`
- Modify: `webpack.config.js`
- Create: `tsconfig.test.json`
- Create: `eslint.config.mjs`
- Delete: `.eslintrc.json`

- [ ] **Step 1: Add deterministic unit-test scripts and required development tools**

Update scripts so tests compile to `out/` and run with Mocha:

```json
{
  "scripts": {
    "clean": "node -e \"require('fs').rmSync('dist',{recursive:true,force:true});require('fs').rmSync('out',{recursive:true,force:true})\"",
    "build": "webpack --mode production --devtool hidden-source-map",
    "compile": "webpack --mode development",
    "compile-tests": "tsc -p tsconfig.test.json",
    "lint": "eslint src test webpack.config.js",
    "test:unit": "npm run compile-tests && mocha \"out/test/**/*.test.js\"",
    "test": "npm run test:unit",
    "package": "npm run build && vsce package --no-dependencies",
    "vscode:prepublish": "npm run build"
  }
}
```

Add `@vscode/vsce` as a dev dependency so `npm run package` does not rely on a global executable.

- [ ] **Step 2: Create a test compiler configuration**

Create `tsconfig.test.json`:

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "rootDir": ".",
    "outDir": "out",
    "sourceMap": true,
    "noEmit": false
  },
  "include": ["src/**/*.ts", "test/**/*.ts"],
  "exclude": ["node_modules", "dist", "out"]
}
```

- [ ] **Step 3: Replace legacy ESLint config with flat config**

Create `eslint.config.mjs` using `@typescript-eslint/parser` and plugin, ignore `dist`, `out`, `.superpowers`, and generated Webview output, and preserve existing rule intent for semicolons, curly braces, equality, and thrown values.

- [ ] **Step 4: Install dependencies without creating a tracked lockfile requirement**

Run:

```powershell
npm install
```

Expected: exit code 0 and `node_modules` populated. `package-lock.json` may be generated locally but remains ignored by the existing repository policy.

- [ ] **Step 5: Run the repaired baseline commands**

Run:

```powershell
npm run compile
npm run lint
```

Expected: both commands succeed before feature code is added. If current source exposes ESLint 10 compatibility errors, fix only mechanical lint issues in existing files.

---

### Task 2: Lock the existing generation behavior with regression tests

**Files:**
- Create: `test/generation-regression.test.ts`
- Modify: `src/prompts.ts` only if a pure export is required for testing; do not alter prompt text.
- Modify: `src/generate-commit-msg.ts` only to export the pure prompt assembly and think-tag cleanup helpers.

- [ ] **Step 1: Write failing tests for prompt replacement and message order**

Create tests equivalent to:

```ts
assert.equal(getEffectiveSystemPrompt('', 'English'), DEFAULT_PROMPT_ENGLISH);
assert.equal(getEffectiveSystemPrompt('custom', 'English'), 'custom');

assert.deepEqual(
  buildCommitMessages('DEFAULT', 'diff text', 'context text'),
  [
    { role: 'system', content: 'DEFAULT' },
    { role: 'user', content: 'Additional context for the changes:\ncontext text' },
    { role: 'user', content: 'diff text' }
  ]
);

assert.equal(cleanCommitMessage('<think>private</think>\nfix: result'), 'fix: result');
```

- [ ] **Step 2: Run the regression test and verify it fails because helpers are not exported**

Run:

```powershell
npm run test:unit -- --grep "generation regression"
```

Expected: FAIL with missing exports or missing helper functions.

- [ ] **Step 3: Extract pure helpers without changing behavior**

Expose:

```ts
export function buildCommitMessages(
  systemPrompt: string,
  diff: string,
  additionalContext?: string
): Array<{ role: 'system' | 'user'; content: string }>;

export function cleanCommitMessage(value: string): string;
```

Keep the existing default prompt string byte-for-byte unchanged and keep custom Prompt replacement semantics.

- [ ] **Step 4: Run the regression tests**

Run `npm run test:unit -- --grep "generation regression"`.

Expected: PASS.

---

### Task 3: Implement Profile types, validation, and catalog storage

**Files:**
- Create: `src/configuration/profile-types.ts`
- Create: `src/configuration/storage.ts`
- Create: `src/configuration/profile-repository.ts`
- Create: `test/profile-repository.test.ts`

- [ ] **Step 1: Define the domain types in the failing test**

The test must exercise this public API:

```ts
const repository = new ProfileRepository(globalStore);
const profile = await repository.create({
  provider: 'openai',
  name: 'DeepSeek personal',
  baseUrl: 'https://api.deepseek.com/v1',
  model: 'deepseek-chat',
  keyHint: 'sk-••••2A9F',
  options: { apiType: 'completion', temperature: 0.7 }
});

assert.equal((await repository.list('openai')).length, 1);
await assert.rejects(
  repository.create({ ...input, name: 'DeepSeek personal' }),
  /PROFILE_NAME_DUPLICATE/
);
```

Cover create, update, provider filtering, default profile, revision increment, non-HTTP URL rejection, empty model rejection, and refusal to delete the default profile.

- [ ] **Step 2: Run the test and verify it fails**

Run `npm run test:unit -- --grep "ProfileRepository"`.

Expected: FAIL because the repository does not exist.

- [ ] **Step 3: Implement storage interfaces and profile types**

Define:

```ts
export interface KeyValueStore {
  get<T>(key: string, defaultValue?: T): T | undefined;
  update(key: string, value: unknown): PromiseLike<void>;
}

export type ProviderType = 'openai' | 'anthropic';
export interface ChannelProfile { /* fields from the design spec */ }
export interface ProfileCatalog { /* schemaVersion, revision, profiles, default */ }
```

Add VS Code adapters in the same file only after pure interfaces are defined.

- [ ] **Step 4: Implement ProfileRepository minimally**

Use one catalog key, immutable copies on read, `crypto.randomUUID()` for IDs, URL parsing for validation, normalized trailing slash handling without changing path semantics, and explicit error codes.

- [ ] **Step 5: Run repository tests**

Run `npm run test:unit -- --grep "ProfileRepository"`.

Expected: PASS.

---

### Task 4: Implement SecretRepository and active-profile resolution

**Files:**
- Create: `src/configuration/secret-repository.ts`
- Create: `src/configuration/active-profile-resolver.ts`
- Create: `test/secret-repository.test.ts`
- Create: `test/active-profile-resolver.test.ts`

- [ ] **Step 1: Write failing SecretRepository tests**

Test this API:

```ts
await secrets.storeApiKey('profile-1', 'sk-example-7K2P');
assert.equal(await secrets.hasApiKey('profile-1'), true);
assert.equal(await secrets.getApiKey('profile-1'), 'sk-example-7K2P');
assert.equal(secrets.createHint('sk-example-7K2P'), 'sk-••••7K2P');
await secrets.deleteApiKey('profile-1');
```

Test short keys, Anthropic prefixes, whitespace trimming, and ensure error messages never contain the full key.

- [ ] **Step 2: Write failing ActiveProfileResolver tests**

Cover:

```ts
assert.equal((await resolver.resolve()).profile.id, workspaceProfile.id);
assert.equal((await resolver.resolveWithoutWorkspaceSelection()).profile.id, defaultProfile.id);
assert.equal((await resolver.resolveMissingSecret()).reason, 'MISSING_LOCAL_SECRET');
assert.equal((await resolver.resolveNoSelection()).reason, 'NO_ACTIVE_PROFILE');
```

- [ ] **Step 3: Run focused tests and verify failure**

Run:

```powershell
npm run test:unit -- --grep "SecretRepository|ActiveProfileResolver"
```

Expected: FAIL because implementations do not exist.

- [ ] **Step 4: Implement SecretRepository**

Use secret keys `aiCommit.profile.<id>.apiKey`. Never expose all secrets as a collection. Trim input, reject empty values, and compute only prefix plus final four characters.

- [ ] **Step 5: Implement ActiveProfileResolver**

Return a discriminated union:

```ts
type ResolveResult =
  | { ok: true; profile: ChannelProfile; apiKey: string }
  | { ok: false; reason: 'NO_ACTIVE_PROFILE' | 'PROFILE_NOT_FOUND' | 'MISSING_LOCAL_SECRET' };
```

Workspace selection wins over global default. Do not silently choose another profile.

- [ ] **Step 6: Run focused tests**

Expected: PASS.

---

### Task 5: Implement the encrypted sync vault

**Files:**
- Create: `src/sync/encrypted-vault-types.ts`
- Create: `src/sync/encrypted-vault-service.ts`
- Create: `test/encrypted-vault-service.test.ts`

- [ ] **Step 1: Write failing cryptographic round-trip tests**

Use a deterministic test random source and assert:

```ts
const envelope = await service.encrypt(
  [{ profileId: 'a', apiKey: 'sk-a' }, { profileId: 'b', apiKey: 'sk-b' }],
  'correct horse battery staple',
  7
);
const plaintext = await service.decrypt(envelope, 'correct horse battery staple');
assert.deepEqual(plaintext.secrets, expectedSecrets);
assert.equal(plaintext.revision, 7);
```

Also test wrong password, changed ciphertext, changed nonce, changed authTag, changed AAD version, and that thrown errors contain no secret values.

- [ ] **Step 2: Run focused test and verify failure**

Run `npm run test:unit -- --grep "EncryptedVaultService"`.

Expected: FAIL because implementation does not exist.

- [ ] **Step 3: Implement vault schemas**

Define `VaultPlaintext`, `EncryptedVaultEnvelope`, KDF parameters, Base64 fields, and the fixed AAD string `ai-commit-key-vault:v1`.

- [ ] **Step 4: Implement scrypt and AES-256-GCM**

Use asynchronous `crypto.scrypt`, 16-byte salt, 12-byte nonce, 32-byte key, 16-byte auth tag, and `timingSafeEqual` only where comparing derived verification data is necessary. Fill the derived key Buffer with zeros in `finally`.

- [ ] **Step 5: Run focused tests**

Expected: PASS.

---

### Task 6: Implement transactional legacy migration

**Files:**
- Create: `src/configuration/legacy-configuration-migrator.ts`
- Create: `test/legacy-configuration-migrator.test.ts`
- Modify: `src/config.ts`

- [ ] **Step 1: Write failing migration tests**

Cover these cases:

```ts
await migrator.migrate();
assert.equal((await profiles.list('openai')).length, 1);
assert.equal(await secrets.getApiKey(importedId), legacyOpenAiKey);
assert.equal(legacyConfig.openAiKey, undefined);
```

Also assert:

- Claude imports as Anthropic with default Base URL when absent.
- Secret write failure leaves all legacy keys untouched.
- Secret read-back mismatch leaves all legacy keys untouched.
- Re-running after migration marker is a no-op.
- Legacy Gemini settings are not removed.

- [ ] **Step 2: Run focused test and verify failure**

Run `npm run test:unit -- --grep "LegacyConfigurationMigrator"`.

- [ ] **Step 3: Add a testable legacy configuration adapter**

Expose an interface with `readSnapshot()`, `clearOpenAiKey()`, `clearClaudeKey()`, and `markMigrationComplete()`. The VS Code implementation wraps `workspace.getConfiguration('ai-commit')` and global updates.

- [ ] **Step 4: Implement the migration transaction**

Build the full migration plan first, store and read back every secret, then update the catalog, then clear legacy keys. On any failure before the final clear, leave legacy state untouched and remove partially created new secrets.

- [ ] **Step 5: Run focused tests**

Expected: PASS.

---

### Task 7: Add explicit runtime provider configuration and connection testing

**Files:**
- Create: `src/providers/runtime-provider-config.ts`
- Create: `src/providers/provider-connection-tester.ts`
- Modify: `src/openai-utils.ts`
- Modify: `src/claude-utils.ts`
- Add focused tests to: `test/generation-regression.test.ts`

- [ ] **Step 1: Write failing tests proving explicit config overrides legacy settings**

Mock provider client construction and assert:

```ts
createOpenAIApi({
  provider: 'openai',
  apiKey: 'profile-key',
  baseUrl: 'https://proxy.example/v1',
  model: 'proxy-model',
  options: { apiType: 'completion', temperature: 0.2 }
});
```

uses the supplied values and does not read the legacy API key. Do the same for Anthropic `baseURL`.

- [ ] **Step 2: Run focused tests and verify failure**

Run `npm run test:unit -- --grep "runtime provider"`.

- [ ] **Step 3: Add RuntimeProviderConfig discriminated unions**

```ts
type RuntimeProviderConfig =
  | { provider: 'openai'; apiKey: string; baseUrl: string; model: string; options: OpenAIProfileOptions }
  | { provider: 'anthropic'; apiKey: string; baseUrl: string; model: string; options: AnthropicProfileOptions };
```

- [ ] **Step 4: Refactor provider helpers to accept explicit config**

Keep existing request payload construction and output extraction. Add optional legacy fallback parameters only for unchanged Gemini behavior; do not alter Prompt construction.

- [ ] **Step 5: Implement connection tester**

Provide:

```ts
listModels(config, token): Promise<string[]>;
testConnection(config, token): Promise<{ latencyMs: number }>;
```

Try provider model listing first. When a compatible endpoint lacks model listing, perform the smallest valid completion/message request. Respect cancellation and a bounded timeout.

- [ ] **Step 6: Run provider and generation regression tests**

Expected: PASS.

---

### Task 8: Define Webview messages and localization

**Files:**
- Create: `src/webview/messages.ts`
- Create: `src/webview/i18n.ts`
- Create: `test/webview-messages.test.ts`
- Create: `test/i18n.test.ts`
- Create: `package.nls.json`
- Create: `package.nls.zh-cn.json`

- [ ] **Step 1: Write failing message-validation tests**

Validate allowed messages such as:

```ts
{ type: 'profile.create', requestId: '1', payload: validInput }
{ type: 'profile.activate', requestId: '2', payload: { profileId: 'id' } }
{ type: 'vault.unlock', requestId: '3', payload: { password: 'secret', remember: true } }
```

Reject unknown types, prototype-bearing objects, missing request IDs, invalid providers, invalid URLs, and any payload that tries to set server-controlled `keyHint` or test status.

- [ ] **Step 2: Write failing i18n completeness tests**

Assert English and Simplified Chinese dictionaries expose identical keys and unknown locales fall back to English.

- [ ] **Step 3: Run focused tests and verify failure**

Run `npm run test:unit -- --grep "webview messages|i18n"`.

- [ ] **Step 4: Implement validators and dictionaries**

Use explicit property checks; do not use `eval`, dynamic constructors, or trust arbitrary Webview payloads. Keep all user-visible runtime strings in dictionaries.

- [ ] **Step 5: Add package localization files**

Localize command names for opening the configuration center, generating a commit message, and showing models.

- [ ] **Step 6: Run focused tests**

Expected: PASS.

---

### Task 9: Implement Config Center controller and native Webview UI

**Files:**
- Create: `src/webview/config-center-controller.ts`
- Create: `src/webview/config-center-panel.ts`
- Create: `src/webview/config-center-main.ts`
- Create: `media/config-center.css`
- Modify: `webpack.config.js`

- [ ] **Step 1: Add controller tests to `test/webview-messages.test.ts` using fake repositories**

Test that ViewModels contain:

```ts
assert.equal(view.profiles[0].keyHint, 'sk-••••2A9F');
assert.equal('apiKey' in view.profiles[0], false);
assert.equal(view.activeProfileId, 'profile-1');
assert.equal(view.sync.status, 'locked');
```

Test create, update, save draft, test, activate, delete refusal for active profile, vault enable, unlock, rebuild, and disable.

- [ ] **Step 2: Run controller tests and verify failure**

Expected: FAIL because controller does not exist.

- [ ] **Step 3: Implement ConfigCenterController**

The controller validates every inbound message, invokes repositories/services, catches structured errors, and returns `{ requestId, ok, data | error }`. It never sends full keys back to the Webview.

- [ ] **Step 4: Implement ConfigCenterPanel**

Create a singleton panel with:

```ts
enableScripts: true;
retainContextWhenHidden: false;
localResourceRoots: [extensionUri/dist/webview, extensionUri/media];
```

Generate a nonce-based CSP that permits only the bundled script and local stylesheet. Dispose all listeners with the panel.

- [ ] **Step 5: Implement the browser UI**

Render:

- fixed active-profile summary;
- provider sidebar with counts;
- profile table showing name, Base URL, model, key hint, status, and actions;
- create/edit form with Base URL, key, key label, model, fetch models, advanced options;
- general settings and multiline custom Prompt warning;
- encrypted-sync enable/unlock/rebuild status;
- Chinese/English strings supplied by the Extension Host.

Use delegated DOM events and VS Code CSS variables. Do not add a UI framework or external CDN.

- [ ] **Step 6: Add a second Webpack target**

Bundle `src/webview/config-center-main.ts` for `target: 'web'` to `dist/webview/config-center.js`. Keep the extension bundle at `dist/extension.js`.

- [ ] **Step 7: Run tests and build**

Run:

```powershell
npm run test:unit
npm run build
```

Expected: PASS and both bundles exist.

---

### Task 10: Wire services, commands, migration, and generation together

**Files:**
- Create: `src/services.ts`
- Modify: `src/extension.ts`
- Modify: `src/commands.ts`
- Modify: `src/generate-commit-msg.ts`
- Modify: `package.json`

- [ ] **Step 1: Add integration-level tests around command routing**

Using fake services, assert:

```ts
await runGenerateCommand(noActiveProfile);
assert.equal(configCenter.openCount, 1);
assert.equal(generator.callCount, 0);

await runGenerateCommand(validProfile);
assert.equal(configCenter.openCount, 0);
assert.equal(generator.runtimeConfig.profileId, validProfile.id);
```

Also assert legacy Gemini fallback remains callable when no new Profile is selected.

- [ ] **Step 2: Run integration tests and verify failure**

Expected: FAIL because service composition does not exist.

- [ ] **Step 3: Compose services in `src/services.ts`**

Create one service container per ExtensionContext. Register global-state sync keys, initialize repositories, create migration and vault services, and expose `dispose()`.

- [ ] **Step 4: Update activation and commands**

Register:

- `extension.ai-commit` for generation;
- `ai-commit.openConfigCenter` for the Webview;
- existing model-list command routed through the active profile where applicable.

Do not add `onStartupFinished`. Remove or correct the mismatched current activation event; VS Code command contributions should trigger activation on supported engine versions.

- [ ] **Step 5: Add the minimal generation seam**

Immediately before provider invocation:

```ts
const resolved = await services.activeProfileResolver.resolve();
if (!resolved.ok) {
  await services.configCenter.open({ reason: resolved.reason });
  return;
}
const runtimeConfig = toRuntimeProviderConfig(resolved.profile, resolved.apiKey);
```

Pass `runtimeConfig` to the existing OpenAI or Anthropic call. Do not change diff retrieval, Prompt assembly, think cleanup, or SCM assignment.

- [ ] **Step 6: Run the full unit suite and production build**

Run:

```powershell
npm run test:unit
npm run lint
npm run build
```

Expected: all pass.

---

### Task 11: Remove the GIF, update documentation, and tighten VSIX contents

**Files:**
- Delete: `aicommit.gif`
- Modify: `README.md`
- Modify: `README.zh_CN.md`
- Modify: `.vscodeignore`
- Modify: `package.json`

- [ ] **Step 1: Remove GIF references from both READMEs**

Delete the animated image block and replace it with concise configuration-center usage instructions. Do not add another large binary asset.

- [ ] **Step 2: Delete `aicommit.gif` with `apply_patch`**

Remove only the exact repository file `aicommit.gif`. No filesystem recursion or broad deletion is permitted.

- [ ] **Step 3: Update `.vscodeignore`**

Exclude at least:

```text
.superpowers/**
docs/superpowers/**
test/**
out/**
src/**
*.map
tsconfig*.json
eslint.config.mjs
```

Keep `dist/**`, `media/**`, icons, package metadata, license, and README files.

- [ ] **Step 4: Update package metadata and configuration descriptions**

Mark legacy plaintext API-key settings as deprecated and direct users to the configuration center. Keep them available for migration and Gemini compatibility during this phase.

- [ ] **Step 5: Run documentation and package-content checks**

Run:

```powershell
rg -n "aicommit\.gif" README.md README.zh_CN.md package.json .vscodeignore
npx vsce ls
```

Expected: no GIF references; VSIX listing excludes tests, design docs, `.superpowers`, source, and the deleted GIF.

---

### Task 12: Final verification and local VSIX delivery

**Files:**
- Create only if needed: `test/runTest.ts`, `test/suite/index.ts`, focused VS Code host tests.
- Modify scripts only if required to run the extension-host suite.

- [ ] **Step 1: Add the smallest Extension Host smoke test**

Verify the extension activates through the contributed command, the configuration-center command exists, and no startup activation event is required.

- [ ] **Step 2: Run every automated check**

Run:

```powershell
npm run clean
npm run test:unit
npm run lint
npm run build
```

Expected: all commands exit 0.

- [ ] **Step 3: Package the VSIX**

Run:

```powershell
npm run package
```

Expected: one `.vsix` file is created in the repository root.

- [ ] **Step 4: Inspect the VSIX size and contents**

Record:

- VSIX file size;
- extension bundle size;
- Webview bundle size;
- absence of GIF, tests, source, `.superpowers`, and design docs.

- [ ] **Step 5: Perform local installation only after confirming it remains within the user's authorization**

If installation is authorized, run:

```powershell
code --install-extension <generated-file>.vsix --force
```

Expected: VS Code reports successful installation. If authorization is not explicit at execution time, stop after producing the VSIX and report its path.

- [ ] **Step 6: Manually verify the critical workflow in Extension Development Host or installed VS Code**

Verify:

1. No profile: first AI Commit invocation opens Config Center.
2. Create two OpenAI profiles and one Anthropic profile.
3. Profile list shows full Base URLs and masked Key hints.
4. Switching the viewed provider does not switch the active Profile.
5. Save-and-activate changes the fixed active summary.
6. Another workspace can select a different Profile.
7. Enable encrypted sync, create a vault, lock, and unlock once to restore all keys.
8. Existing staged-diff generation still fills the SCM input box with the same default Prompt behavior.

---

## Completion evidence

Do not claim completion until all of the following exist and have been inspected:

- passing unit and extension-host test output;
- passing lint and production build output;
- generated VSIX path and measured size;
- VSIX content listing proving excluded development assets;
- manual workflow results for profile creation, activation, migration, encrypted vault unlock, and commit generation;
- no Git commands executed during implementation.
