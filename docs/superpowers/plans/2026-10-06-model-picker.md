# Model picker and field alignment

**Goal:** Let users switch to any fetched model without clearing the current value, and align API Key / Key Label inputs.

**Design:** Replace native datalist with a themed editable combobox. Opening by focus, click, or arrow shows every fetched model while preserving the input. Typing filters suggestions; reopening resets the filter. Arrow keys navigate, Enter selects, Escape and outside focus close. Manual values remain valid. Fetch results update only the picker so other draft fields survive. Field grids align contents to the top rather than stretch uneven rows.

- [x] Add failing view/browser regressions for full-list opening with a populated model and the misaligned fields.
- [x] Add `src/webview/model-picker.ts`; connect its DOM events in `config-center-main.ts` and accessible markup in `config-center-view.ts`.
- [x] Add VS Code theme styles and localized empty-list messages; align form fields.
- [x] Verify click/keyboard/manual entry, fetch completion, escaping, light/dark themes and narrow layout with Python Playwright; run unit tests, lint and production packaging.

Native select was considered but makes free-form input awkward. Clearing the input on focus was rejected because it discards the visible selection. The combobox keeps both free-form editing and an unfiltered list on open.

## Verification

- 127 unit tests passing; lint and production build passing.
- Python Playwright with headless Chrome: full-list opening with a prefilled model, typing filter/reopen reset, click and keyboard selection, Escape/Tab dismissal, immediate keyboard use after fetching, no focus stealing when editing another field, custom-name saving, draft preservation, escaped model labels, light/dark colors and 600 px layout passed.
- The browser test reproduces the old CSS alignment bug (Key Label y offset 11 px and stretched height) using `--baseline-css`; current styles pass.
- Independent review keyboard-focus finding reproduced and fixed before packaging.
- Installable artifact: `lin-ai-commit-0.1.4-model-picker-fix.vsix` (also includes the earlier import/export work).
