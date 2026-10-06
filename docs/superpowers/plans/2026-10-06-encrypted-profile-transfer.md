# Encrypted Profile Transfer Implementation Plan

**Goal:** Replace automatic encrypted key sync with password-encrypted channel profile import/export.

**Architecture:** A backup codec validates and encrypts a versioned profile payload. A transfer service owns native file interaction and transactional merge; the controller exposes only status/counts. Local catalog migration isolates data from legacy sync. Existing vault cryptography is retained only for manual recovery.

**Tech Stack:** TypeScript, Node crypto, VS Code workspace.fs / native dialogs, Mocha.

- [x] Add failing protocol and backup round-trip/security/merge tests in `test/profile-transfer.test.ts` and `test/webview-messages.test.ts`; run `npm run test:unit` to confirm failure.
- [x] Implement `src/transfer/encrypted-profile-backup.ts` and `src/transfer/profile-transfer-service.ts`: fixed bounded KDF parameters, full payload validation, file-size limit, skip conflicts, verified secret writes, rollback, explicit cancelled results.
- [x] Implement `src/transfer/vscode-transfer-files.ts` with native open/save dialogs and ciphertext-only IO. Migrate the catalog to local-only keys in `src/configuration/profile-repository.ts`; remove sync coordinator wiring in `src/services.ts`.
- [x] Replace vault messages, controller state, navigation and forms in `src/webview/`; localize success/error/counts in `src/webview/i18n.ts`. Preserve old vault manual recovery only when keys are missing.
- [x] Update impacted tests and English/Chinese READMEs. Run `npm run test:unit`, `npm run lint`, `npm run build`, and `npm run test:extension`; inspect final diff.

Import result contract: `{ status: 'completed' | 'cancelled', imported?: number, skipped?: number }`. Native file port: `save(contents: Uint8Array): Promise<boolean>` and `open(): Promise<Uint8Array | undefined>`. Transfer messages accept only `{ password: string }`; paths and decrypted payloads never cross the Webview bridge.

## Verification

- `npm run test:unit`: 126 passing (stale compiled coordinator tests removed).
- `npm run lint`: passed.
- `npm run build`: production extension and Webview bundles compiled.
- `npm run test:extension`: 1 extension-host smoke test passing.
- Headless Chrome with Python Playwright: Chinese labels, password confirmation, request dispatch, password clearing, cancellation, import counts, error feedback, and 600 px responsive layout passed.
- Independent review findings fixed and regression-tested: prefer v2 local backup during recovery; retain imported IDs to avoid duplicates after renaming; preserve UTF-8 Chinese translations.
- Existing connection-test fakes updated to return the required `method` field so the baseline test suite compiles.
