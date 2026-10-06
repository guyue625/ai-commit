# Connection Test Latency Implementation Plan

**Goal:** Make Config Center connection checks inexpensive and bounded, and explain what the displayed time measures.

**Architecture:** Implement the existing Config Center design, section 9.7: query the authenticated model list first and use the existing minimal generation request when listing is unsupported or does not contain the configured model. Keep inference out of the normal connection-check path. Persist the check method alongside elapsed time so the UI distinguishes API checks, generation checks, and older measurements.

**Tech Stack:** TypeScript, OpenAI and Anthropic SDKs, native VS Code Webview, Mocha.

## Decisions

- A streamed generation check still depends on upstream scheduling and inference. An authenticated model-list request directly addresses the current unnecessary inference cost.
- A model-list success confirms access to the listing endpoint and the presence of the selected model. It does not guarantee generation permissions, quota, speed, or support for the selected generation API.
- If listing returns HTTP 400, 403, 404, 405, or 501, or the returned list omits the selected model, perform one minimal generation request using the configured API type.
- Authentication failures (401), rate limits (429), network errors, and other server errors fail without automatic retries or generation fallback.
- Both SDKs disable retries for these probes. A 30-second total deadline covers listing, fallback, and response-body consumption; cancellation aborts the active request.
- The fallback time includes the preceding model-list attempt. Historical results remain explicitly labelled as test time until retested.
- Commit generation behavior and provider settings are outside this change.

## Task 1: Reproduce and fix unnecessary generation

Files: `test/sdk-provider-connection-probe.test.ts`, `test/provider-connection-tester.test.ts`, `src/providers/provider-connection-tester.ts`, `src/configuration/profile-types.ts`.

- [ ] Exercise real SDK request construction with an in-memory HTTP transport. Assert that a listed model only needs `GET /models` (or Anthropic's `/v1/models`), while unsupported listing and unlisted aliases use the configured generation endpoint.
- [ ] Run `npm run compile-tests` and `node node_modules/mocha/bin/mocha.js out/test/sdk-provider-connection-probe.test.js`; verify failures against the current implementation.
- [ ] Implement `ConnectionTestMethod = 'models' | 'generation'` and return `{ latencyMs, method }` from the tester.
- [ ] Use SDK client options `{ maxRetries: 0, timeout: 30_000 }` for probes, preserve configured authentication, Base URLs, and Azure API versions, and bound the complete operation with an abortable deadline.
- [ ] Cover failures, fallback, cancellation, and stalled response bodies. Re-run the focused tests.

## Task 2: Display honest measurements and actionable timeout feedback

Files: `src/webview/config-center-controller.ts`, `src/webview/config-center-view.ts`, `src/webview/config-center-main.ts`, `src/webview/i18n.ts`, `test/webview-messages.test.ts`, `test/config-center-view.test.ts`.

- [ ] Persist the check method in `lastTest.method`, leaving it optional for existing profiles.
- [ ] Render localized API-check and model-check labels with an explanation of inference and fallback overhead; keep historical measurements labelled as test time.
- [ ] Preserve the safe `CONNECTION_TEST_TIMEOUT` error code and refresh the view after timeout failures, just as after other failed tests.
- [ ] Verify persisted method, legacy rendering, both languages, timeout feedback, and that a failed activation keeps the previous profile active.

## Task 3: Document and verify

Files: `README.md`, `README.zh_CN.md`.

- [ ] Explain fast checks, compatibility fallback, the deadline, and the limits of connection-test measurements.
- [ ] Run `npm test`, `npm run lint`, `npm run build`, and `git diff --check`.
- [ ] Review the final diff and report local validation separately from live provider performance, which cannot be inferred from the screenshots.
