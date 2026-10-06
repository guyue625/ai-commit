import {
  createProfileDraft,
  createProfileSubmission,
  ProfileFormValues,
  resolveDeleteProfileAction
} from './config-center-browser-actions';
import {
  ConfigCenterSection,
  ConfigCenterUiState,
  createEditorState,
  renderConfigCenter
} from './config-center-view';
import type {
  ConfigCenterResponse,
  ConfigCenterViewModel
} from './config-center-controller';
import type { TranslationKey } from './i18n';
import { ModelPicker } from './model-picker';

interface VsCodeApi<State> {
  postMessage(message: unknown): void;
  getState(): State | undefined;
  setState(state: State): void;
}

declare function acquireVsCodeApi<State>(): VsCodeApi<State>;

interface PersistedState {
  section?: ConfigCenterSection;
}

interface PendingAction {
  kind: string;
  notice?: TranslationKey;
  closeEditor?: boolean;
  activateAfterSave?: string;
  refreshOnError?: boolean;
  preserveNotice?: boolean;
}

const vscode = acquireVsCodeApi<PersistedState>();
const app = document.getElementById('app');
if (!app) {
  throw new Error('CONFIG_CENTER_ROOT_MISSING');
}

const persisted = vscode.getState();
const allowedSections: ConfigCenterSection[] = [
  'openai',
  'anthropic',
  'general',
  'prompt',
  'transfer'
];
const initialSection = allowedSections.includes(
  persisted?.section as ConfigCenterSection
)
  ? (persisted?.section as ConfigCenterSection)
  : 'openai';
const state: ConfigCenterUiState = { section: initialSection };
let view: ConfigCenterViewModel | undefined;
let requestCounter = 0;
const pendingActions = new Map<string, PendingAction>();
const modelPicker = new ModelPicker(app, () => state.modelOptions ?? [], () => !!state.busy);

function render(): void {
  if (!view) {
    app.innerHTML = '<div class="loading-shell">AI Commit</div>';
    return;
  }
  app.innerHTML = renderConfigCenter(view, state);
}

function setBusy(busy: boolean): void {
  state.busy = busy;
  app.querySelector('.config-center')?.classList.toggle('is-busy', busy);
}

function postRequest(
  type: string,
  payload: Record<string, unknown>,
  pending: PendingAction
): void {
  const requestId = `webview-${Date.now()}-${++requestCounter}`;
  pendingActions.set(requestId, pending);
  setBusy(true);
  vscode.postMessage({ type, requestId, payload });
}

function errorText(code: string): string {
  if (!view) {
    return code;
  }
  const t = view.translations;
  const errors: Record<string, string> = {
    PROFILE_NAME_DUPLICATE: t.errorDuplicateName,
    PROFILE_BASE_URL_INVALID: t.errorInvalidBaseUrl,
    MISSING_LOCAL_SECRET: t.errorMissingKey,
    PROFILE_IS_ACTIVE: t.errorActiveProfile,
    CONNECTION_TEST_FAILED: t.errorConnectionTest,
    CONNECTION_TEST_TIMEOUT: t.errorConnectionTimeout,
    MODEL_LIST_FAILED: t.errorModelList,
    BACKUP_DECRYPT_FAILED: t.errorBackupDecrypt,
    BACKUP_INVALID: t.errorBackupInvalid,
    BACKUP_UNSUPPORTED_VERSION: t.errorBackupVersion,
    BACKUP_MISSING_KEYS: t.errorBackupMissingKeys,
    BACKUP_EMPTY: t.errorBackupEmpty,
    BACKUP_TOO_LARGE: t.errorBackupLarge,
    BACKUP_READ_FAILED: t.errorBackupRead,
    BACKUP_WRITE_FAILED: t.errorBackupWrite,
    BACKUP_IMPORT_FAILED: t.errorBackupImport,
    BACKUP_ROLLBACK_FAILED: t.errorBackupRollback,
    BACKUP_PASSWORD_REQUIRED: t.errorBackupPassword
  };
  return errors[code] ?? t.requestFailed;
}

function showDomNotice(tone: 'success' | 'error', text: string): void {
  const current = app.querySelector('.notice');
  current?.remove();
  const layout = app.querySelector('.workspace-layout');
  if (!layout) {
    state.notice = { tone, text };
    render();
    return;
  }
  const notice = document.createElement('div');
  notice.className = `notice notice--${tone}`;
  notice.setAttribute('role', 'status');
  notice.textContent = text;
  layout.before(notice);
}

window.addEventListener('message', (event: MessageEvent<ConfigCenterResponse>) => {
  const response = event.data;
  if (!response || typeof response.requestId !== 'string') {
    return;
  }
  const pending = pendingActions.get(response.requestId);
  pendingActions.delete(response.requestId);

  if (response.ok === false) {
    setBusy(false);
    const text = errorText(response.error.code);
    state.notice = { tone: 'error', text };
    if (pending?.kind === 'models') {
      showDomNotice('error', text);
      return;
    }
    if (
      response.error.code === 'CONNECTION_TEST_FAILED' ||
      response.error.code === 'CONNECTION_TEST_TIMEOUT'
    ) {
      state.editor = undefined;
    }
    render();
    if (pending?.refreshOnError) {
      postRequest('ready', {}, { kind: 'refresh', preserveNotice: true });
    }
    return;
  }

  view = response.data.view;
  if (response.data.transfer) {
    const result = response.data.transfer;
    state.notice = result.status === 'cancelled' ? undefined : {
      tone: 'success',
      text: (pending?.kind === 'transfer.export' ? view.translations.exportComplete :
        pending?.kind === 'transfer.recoverLegacy' ? view.translations.recoveryComplete : view.translations.importComplete)
        .replace('{imported}', String(result.imported ?? 0))
        .replace('{skipped}', String(result.skipped ?? 0))
    };
  }
  if (pending?.kind === 'models') {
    const models = response.data.models ?? [];
    state.modelOptions = models;
    setBusy(false);
    modelPicker.modelsLoaded();
    showDomNotice('success', view.translations.modelsLoaded);
    return;
  }
  if (pending?.activateAfterSave) {
    postRequest(
      'profile.activate',
      { profileId: pending.activateAfterSave },
      {
        kind: 'activate',
        closeEditor: true,
        notice: 'profileActivated',
        refreshOnError: true
      }
    );
    return;
  }
  if (pending?.closeEditor) {
    state.editor = undefined;
    state.modelOptions = undefined;
  }
  if (pending?.notice && !pending.preserveNotice) {
    state.notice = {
      tone: 'success',
      text: view.translations[pending.notice]
    };
  }
  setBusy(false);
  render();
});

function profileFormValues(form: HTMLFormElement): ProfileFormValues {
  const data = new FormData(form);
  const value = (name: string) => String(data.get(name) ?? '');
  return {
    name: value('name'),
    baseUrl: value('baseUrl'),
    apiKey: value('apiKey'),
    keyLabel: value('keyLabel'),
    model: value('model'),
    temperature: value('temperature'),
    apiType: value('apiType'),
    reasoningEffort: value('reasoningEffort'),
    textVerbosity: value('textVerbosity'),
    apiVersion: value('apiVersion')
  };
}

function currentProvider(): 'openai' | 'anthropic' {
  if (state.section === 'anthropic') {
    return 'anthropic';
  }
  if (state.section === 'openai') {
    return 'openai';
  }
  return (
    view?.profiles.find((profile) => profile.id === view?.activeProfileId)
      ?.provider ?? 'openai'
  );
}

app.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof Element)) {
    return;
  }
  const actionTarget = target.closest<HTMLElement>('[data-action]');
  if (!actionTarget || state.busy || !view) {
    return;
  }
  const action = actionTarget.dataset.action;
  if (action !== 'delete-profile') {
    state.confirmDeleteProfileId = undefined;
  }

  if (action === 'navigate') {
    const section = actionTarget.dataset.section as ConfigCenterSection;
    if (!allowedSections.includes(section)) {
      return;
    }
    state.section = section;
    state.editor = undefined;
    state.modelOptions = undefined;
    state.notice = undefined;
    vscode.setState({ section });
    render();
    return;
  }

  if (action === 'add-profile') {
    const provider = currentProvider();
    state.section = provider;
    state.editor = createEditorState(provider);
    state.modelOptions = undefined;
    state.notice = undefined;
    vscode.setState({ section: provider });
    render();
    return;
  }

  if (action === 'cancel-editor') {
    state.editor = undefined;
    state.modelOptions = undefined;
    render();
    return;
  }

  const profileId = actionTarget.dataset.profileId;
  const profile = view.profiles.find((candidate) => candidate.id === profileId);
  if (action === 'edit-profile' && profile) {
    state.section = profile.provider;
    state.editor = createEditorState(profile);
    state.modelOptions = undefined;
    render();
    return;
  }
  if (action === 'test-profile' && profileId) {
    postRequest(
      'profile.test',
      { profileId },
      { kind: 'test', refreshOnError: true }
    );
    return;
  }
  if (action === 'activate-profile' && profileId) {
    postRequest(
      'profile.activate',
      { profileId },
      {
        kind: 'activate',
        notice: 'profileActivated',
        refreshOnError: true
      }
    );
    return;
  }
  if (action === 'delete-profile' && profile) {
    const deleteAction = resolveDeleteProfileAction(
      profile,
      state.confirmDeleteProfileId
    );
    if (deleteAction.kind === 'blocked') {
      state.confirmDeleteProfileId = undefined;
      state.notice = {
        tone: 'error',
        text: view.translations.errorActiveProfile
      };
      render();
      return;
    }
    if (deleteAction.kind === 'confirm') {
      state.confirmDeleteProfileId = deleteAction.profileId;
      state.notice = undefined;
      render();
      return;
    }
    state.confirmDeleteProfileId = undefined;
    postRequest(
      'profile.delete',
      { profileId: deleteAction.profileId },
      { kind: 'delete', notice: 'profileDeleted', refreshOnError: true }
    );
    return;
  }
  if (action === 'fetch-models' && state.editor) {
    const form = document.getElementById('profile-form');
    if (!(form instanceof HTMLFormElement) || !form.reportValidity()) {
      return;
    }
    const values = profileFormValues(form);
    const payload =
      state.editor.mode === 'edit' && !values.apiKey.trim()
        ? { profileId: state.editor.profileId }
        : { draft: createProfileDraft(state.editor, values) };
    postRequest('profile.models', payload, { kind: 'models' });
    return;
  }

});

app.addEventListener('submit', (event) => {
  event.preventDefault();
  if (state.busy || !view) {
    return;
  }
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) {
    return;
  }

  if (form.id === 'profile-form' && state.editor) {
    const submitter = (event as SubmitEvent).submitter as HTMLElement | null;
    const activate = submitter?.dataset.submit === 'activate';
    const submission = createProfileSubmission(
      state.editor,
      profileFormValues(form),
      activate
    );
    postRequest(submission.request.type, submission.request.payload, {
      kind: submission.request.type,
      closeEditor: true,
      activateAfterSave: submission.activateAfterSave,
      notice: activate ? 'profileActivated' : 'profileSaved',
      refreshOnError: true
    });
    return;
  }

  if (form.id === 'general-settings-form') {
    const data = new FormData(form);
    postRequest(
      'settings.update',
      { language: String(data.get('language') ?? '') },
      { kind: 'settings', notice: 'settingsSaved' }
    );
    return;
  }

  if (form.id === 'prompt-settings-form') {
    const data = new FormData(form);
    postRequest(
      'settings.update',
      { systemPrompt: String(data.get('systemPrompt') ?? '') },
      { kind: 'settings', notice: 'settingsSaved' }
    );
    return;
  }

  const transferTypes: Record<string, string> = {
    'export-form': 'transfer.export',
    'import-form': 'transfer.import',
    'legacy-recovery-form': 'transfer.recoverLegacy'
  };
  const type = transferTypes[form.id];
  if (type) {
    const data = new FormData(form);
    const password = String(data.get('password') ?? '');
    if (!password.trim()) {
      showDomNotice('error', view.translations.errorBackupPassword);
      return;
    }
    if (type === 'transfer.export' && password !== String(data.get('confirmPassword') ?? '')) {
      showDomNotice('error', view.translations.passwordMismatch);
      return;
    }
    form.reset();
    state.notice = undefined;
    app.querySelector('.notice')?.remove();
    postRequest(type, { password }, { kind: type, refreshOnError: true });
  }

});

render();
postRequest('ready', {}, { kind: 'ready' });
