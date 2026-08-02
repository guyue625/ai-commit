import type {
  ConfigCenterProfileView,
  ConfigCenterViewModel
} from './config-center-controller';
import type { ProviderType } from '../configuration/profile-types';

export type ConfigCenterSection =
  | ProviderType
  | 'general'
  | 'prompt'
  | 'sync';

export interface ProfileEditorState {
  mode: 'create' | 'edit';
  profileId?: string;
  provider: ProviderType;
  name: string;
  baseUrl: string;
  apiKey: string;
  keyLabel: string;
  model: string;
  options: {
    apiType?: 'completion' | 'response';
    temperature: number;
    reasoningEffort?: 'minimal' | 'low' | 'medium' | 'high';
    textVerbosity?: 'low' | 'medium' | 'high';
    apiVersion?: string;
  };
}

export interface ConfigCenterUiState {
  section: ConfigCenterSection;
  editor?: ProfileEditorState;
  modelOptions?: string[];
  busy?: boolean;
  notice?: { tone: 'success' | 'error'; text: string };
}

function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(
    /[&<>"']/g,
    (character) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      })[character] ?? character
  );
}

function selected(value: string, current: string | undefined): string {
  return value === current ? ' selected' : '';
}

function providerName(
  view: ConfigCenterViewModel,
  provider: ProviderType
): string {
  return provider === 'openai'
    ? view.translations.openai
    : view.translations.anthropic;
}

export function createEditorState(
  source: ConfigCenterProfileView | ProviderType
): ProfileEditorState {
  if (typeof source === 'string') {
    return source === 'openai'
      ? {
          mode: 'create',
          provider: 'openai',
          name: '',
          baseUrl: 'https://api.openai.com/v1',
          apiKey: '',
          keyLabel: '',
          model: 'gpt-4o',
          options: {
            apiType: 'completion',
            temperature: 0.7,
            reasoningEffort: 'medium',
            textVerbosity: 'medium',
            apiVersion: ''
          }
        }
      : {
          mode: 'create',
          provider: 'anthropic',
          name: '',
          baseUrl: 'https://api.anthropic.com',
          apiKey: '',
          keyLabel: '',
          model: 'claude-sonnet-4-5',
          options: { temperature: 0.7 }
        };
  }

  const openAIOptions =
    source.provider === 'openai' && 'apiType' in source.options
      ? source.options
      : undefined;
  return {
    mode: 'edit',
    profileId: source.id,
    provider: source.provider,
    name: source.name,
    baseUrl: source.baseUrl,
    apiKey: '',
    keyLabel: source.keyLabel ?? '',
    model: source.model,
    options: {
      apiType: openAIOptions?.apiType,
      temperature: source.options.temperature,
      reasoningEffort: openAIOptions?.reasoningEffort,
      textVerbosity: openAIOptions?.textVerbosity,
      apiVersion: openAIOptions?.apiVersion ?? ''
    }
  };
}

function renderNotice(state: ConfigCenterUiState): string {
  if (!state.notice) {
    return '';
  }
  return `<div class="notice notice--${state.notice.tone}" role="status">${escapeHtml(
    state.notice.text
  )}</div>`;
}

function renderProfileStatus(
  view: ConfigCenterViewModel,
  profile: ConfigCenterProfileView
): string {
  const t = view.translations;
  if (!profile.hasLocalKey) {
    return `<span class="status status--warning">${escapeHtml(
      t.missingLocalKey
    )}</span>`;
  }
  if (profile.lastTest?.status === 'success') {
    const latency =
      profile.lastTest.latencyMs === undefined
        ? ''
        : ` · ${profile.lastTest.latencyMs} ms`;
    return `<span class="status status--success">${escapeHtml(
      t.connected
    )}${escapeHtml(latency)}</span>`;
  }
  if (profile.lastTest?.status === 'failure') {
    return `<span class="status status--danger">${escapeHtml(
      t.connectionFailed
    )}</span>`;
  }
  return `<span class="status status--muted">${escapeHtml(
    t.notTested
  )}</span>`;
}

function renderActiveSummary(view: ConfigCenterViewModel): string {
  const t = view.translations;
  const active = view.profiles.find(
    (profile) => profile.id === view.activeProfileId
  );
  if (!active) {
    return `<section class="active-summary active-summary--empty" data-region="active-summary">
      <div>
        <p class="eyebrow">${escapeHtml(t.activeProfile)}</p>
        <h1>${escapeHtml(t.noActiveProfile)}</h1>
        <p>${escapeHtml(t.activeProfileDescription)}</p>
      </div>
      <button class="button button--primary" data-action="add-profile">${escapeHtml(
        t.configure
      )}</button>
    </section>`;
  }

  return `<section class="active-summary" data-region="active-summary" data-active-profile-id="${escapeHtml(
    active.id
  )}">
    <div class="active-summary__identity">
      <p class="eyebrow">${escapeHtml(t.activeProfile)} · ${escapeHtml(
        t.workspaceScope
      )}</p>
      <div class="active-summary__title-row">
        <span class="provider-mark provider-mark--${escapeHtml(
          active.provider
        )}">${escapeHtml(providerName(view, active.provider).slice(0, 1))}</span>
        <div>
          <h1>${escapeHtml(active.name)}</h1>
          <p>${escapeHtml(providerName(view, active.provider))}</p>
        </div>
      </div>
    </div>
    <dl class="active-summary__details">
      <div><dt>${escapeHtml(t.baseUrl)}</dt><dd>${escapeHtml(
        active.baseUrl
      )}</dd></div>
      <div><dt>${escapeHtml(t.model)}</dt><dd>${escapeHtml(
        active.model
      )}</dd></div>
      <div><dt>${escapeHtml(t.apiKey)}</dt><dd>${escapeHtml(
        active.keyLabel ? `${active.keyLabel} · ${active.keyHint}` : active.keyHint
      )}</dd></div>
      <div><dt>${escapeHtml(t.status)}</dt><dd>${renderProfileStatus(
        view,
        active
      )}</dd></div>
    </dl>
  </section>`;
}

function navButton(
  view: ConfigCenterViewModel,
  state: ConfigCenterUiState,
  section: ConfigCenterSection,
  label: string,
  count?: number,
  activeProvider?: boolean
): string {
  const current = state.section === section;
  return `<button class="nav-item${current ? ' nav-item--current' : ''}" data-action="navigate" data-section="${escapeHtml(
    section
  )}" aria-current="${current ? 'page' : 'false'}">
    <span class="nav-item__label">${escapeHtml(label)}</span>
    <span class="nav-item__meta">${
      activeProvider ? '<span class="active-dot" aria-hidden="true"></span>' : ''
    }${count === undefined ? '' : escapeHtml(count)}</span>
  </button>`;
}

function renderNavigation(
  view: ConfigCenterViewModel,
  state: ConfigCenterUiState
): string {
  const t = view.translations;
  const activeProvider = view.profiles.find(
    (profile) => profile.id === view.activeProfileId
  )?.provider;
  return `<aside class="sidebar">
    <p class="sidebar__heading">${escapeHtml(t.providers)}</p>
    <nav class="nav-list" aria-label="${escapeHtml(t.configCenterTitle)}">
      ${navButton(
        view,
        state,
        'openai',
        t.openai,
        view.providerCounts.openai,
        activeProvider === 'openai'
      )}
      ${navButton(
        view,
        state,
        'anthropic',
        t.anthropic,
        view.providerCounts.anthropic,
        activeProvider === 'anthropic'
      )}
      <div class="nav-divider"></div>
      ${navButton(view, state, 'general', t.generalSettings)}
      ${navButton(view, state, 'prompt', t.customPrompt)}
      ${navButton(view, state, 'sync', t.encryptedSync)}
    </nav>
  </aside>`;
}

function renderProfileRows(
  view: ConfigCenterViewModel,
  profiles: ConfigCenterProfileView[]
): string {
  const t = view.translations;
  if (profiles.length === 0) {
    return `<div class="empty-state">
      <p>${escapeHtml(t.noProfiles)}</p>
      <button class="button button--primary" data-action="add-profile">${escapeHtml(
        t.addProfile
      )}</button>
    </div>`;
  }

  return `<div class="profile-list" role="list">
    ${profiles
      .map(
        (profile) => `<article class="profile-card${
          profile.isActive ? ' profile-card--active' : ''
        }" role="listitem" data-profile-id="${escapeHtml(profile.id)}">
          <div class="profile-card__header">
            <div>
              <div class="profile-card__name-row">
                <h3>${escapeHtml(profile.name)}</h3>
                ${
                  profile.isActive
                    ? `<span class="pill pill--active">${escapeHtml(
                        t.current
                      )}</span>`
                    : ''
                }
              </div>
              <p class="profile-card__url">${escapeHtml(profile.baseUrl)}</p>
            </div>
            ${renderProfileStatus(view, profile)}
          </div>
          <dl class="profile-card__grid">
            <div><dt>${escapeHtml(t.model)}</dt><dd>${escapeHtml(
              profile.model
            )}</dd></div>
            <div><dt>${escapeHtml(t.apiKey)}</dt><dd>${escapeHtml(
              profile.keyLabel
                ? `${profile.keyLabel} · ${profile.keyHint}`
                : profile.keyHint
            )}</dd></div>
            <div><dt>${escapeHtml(t.lastTest)}</dt><dd>${
              profile.lastTest
                ? escapeHtml(
                    new Date(profile.lastTest.testedAt).toLocaleString(
                      view.locale
                    )
                  )
                : escapeHtml(t.notTested)
            }</dd></div>
          </dl>
          <div class="profile-card__actions">
            <button class="button button--quiet" data-action="test-profile" data-profile-id="${escapeHtml(
              profile.id
            )}">${escapeHtml(t.testConnection)}</button>
            <button class="button button--quiet" data-action="edit-profile" data-profile-id="${escapeHtml(
              profile.id
            )}">${escapeHtml(t.edit)}</button>
            <button class="button button--quiet" data-action="activate-profile" data-profile-id="${escapeHtml(
              profile.id
            )}"${profile.isActive ? ' disabled' : ''}>${escapeHtml(
              t.activate
            )}</button>
            <button class="button button--danger" data-action="delete-profile" data-profile-id="${escapeHtml(
              profile.id
            )}"${profile.isActive ? ' disabled' : ''}>${escapeHtml(
              t.delete
            )}</button>
          </div>
        </article>`
      )
      .join('')}
  </div>`;
}

function renderOpenAIOptions(
  view: ConfigCenterViewModel,
  editor: ProfileEditorState
): string {
  const t = view.translations;
  return `<div class="form-grid form-grid--advanced">
    <label class="field">
      <span>${escapeHtml(t.apiType)}</span>
      <select name="apiType">
        <option value="completion"${selected(
          'completion',
          editor.options.apiType
        )}>${escapeHtml(t.optionCompletion)}</option>
        <option value="response"${selected(
          'response',
          editor.options.apiType
        )}>${escapeHtml(t.optionResponse)}</option>
      </select>
    </label>
    <label class="field">
      <span>${escapeHtml(t.reasoningEffort)}</span>
      <select name="reasoningEffort">
        ${(['minimal', 'low', 'medium', 'high'] as const)
          .map(
            (value) =>
              `<option value="${value}"${selected(
                value,
                editor.options.reasoningEffort
              )}>${escapeHtml(
                value === 'minimal'
                  ? t.optionMinimal
                  : value === 'low'
                    ? t.optionLow
                    : value === 'high'
                      ? t.optionHigh
                      : t.optionMedium
              )}</option>`
          )
          .join('')}
      </select>
    </label>
    <label class="field">
      <span>${escapeHtml(t.textVerbosity)}</span>
      <select name="textVerbosity">
        ${(['low', 'medium', 'high'] as const)
          .map(
            (value) =>
              `<option value="${value}"${selected(
                value,
                editor.options.textVerbosity
              )}>${escapeHtml(
                value === 'low'
                  ? t.optionLow
                  : value === 'high'
                    ? t.optionHigh
                    : t.optionMedium
              )}</option>`
          )
          .join('')}
      </select>
    </label>
    <label class="field">
      <span>${escapeHtml(t.apiVersion)}</span>
      <input name="apiVersion" value="${escapeHtml(
        editor.options.apiVersion
      )}">
    </label>
  </div>`;
}

function renderEditor(
  view: ConfigCenterViewModel,
  state: ConfigCenterUiState,
  editor: ProfileEditorState
): string {
  const t = view.translations;
  const modelOptions = state.modelOptions ?? [];
  return `<section class="editor-panel">
    <div class="content-heading">
      <div>
        <p class="eyebrow">${escapeHtml(
          providerName(view, editor.provider)
        )}</p>
        <h2>${escapeHtml(
          editor.mode === 'create' ? t.addProfile : t.editProfile
        )}</h2>
      </div>
      <button class="icon-button" data-action="cancel-editor" aria-label="${escapeHtml(
        t.close
      )}">×</button>
    </div>
    <form id="profile-form" data-mode="${editor.mode}" data-profile-id="${escapeHtml(
      editor.profileId
    )}" data-provider="${editor.provider}">
      <div class="form-grid">
        <label class="field">
          <span>${escapeHtml(t.profileName)}</span>
          <input name="name" required value="${escapeHtml(editor.name)}">
        </label>
        <label class="field field--wide">
          <span>${escapeHtml(t.baseUrl)}</span>
          <input name="baseUrl" type="url" required value="${escapeHtml(
            editor.baseUrl
          )}">
        </label>
        <label class="field">
          <span>${escapeHtml(t.apiKey)}</span>
          <input name="apiKey" type="password" autocomplete="off" value=""${
            editor.mode === 'create' ? ' required' : ''
          }>
          <small>${escapeHtml(
            editor.mode === 'edit' ? t.keepExistingKey : t.fullKeyNeverShown
          )}</small>
        </label>
        <label class="field">
          <span>${escapeHtml(t.keyLabel)}</span>
          <input name="keyLabel" value="${escapeHtml(editor.keyLabel)}">
        </label>
        <label class="field field--wide">
          <span>${escapeHtml(t.model)}</span>
          <div class="field-with-action">
            <input name="model" list="model-options" required value="${escapeHtml(
              editor.model
            )}" placeholder="${escapeHtml(t.manualModel)}">
            <button class="button button--quiet" type="button" data-action="fetch-models">${escapeHtml(
              t.fetchModels
            )}</button>
          </div>
          <datalist id="model-options">${modelOptions
            .map((model) => `<option value="${escapeHtml(model)}"></option>`)
            .join('')}</datalist>
        </label>
        <label class="field">
          <span>${escapeHtml(t.temperature)}</span>
          <input name="temperature" type="number" step="0.1" min="0" max="${
            editor.provider === 'openai' ? '2' : '1'
          }" value="${escapeHtml(editor.options.temperature)}">
        </label>
      </div>
      <details class="advanced-panel">
        <summary>${escapeHtml(t.advancedSettings)}</summary>
        ${
          editor.provider === 'openai'
            ? renderOpenAIOptions(view, editor)
            : ''
        }
      </details>
      <div class="form-actions">
        <button class="button button--quiet" type="button" data-action="cancel-editor">${escapeHtml(
          t.cancel
        )}</button>
        <button class="button" type="submit" data-submit="save">${escapeHtml(
          t.save
        )}</button>
        <button class="button button--primary" type="submit" data-submit="activate">${escapeHtml(
          t.saveAndActivate
        )}</button>
      </div>
    </form>
  </section>`;
}

function renderProviderSection(
  view: ConfigCenterViewModel,
  state: ConfigCenterUiState,
  provider: ProviderType
): string {
  const t = view.translations;
  if (state.editor?.provider === provider) {
    return renderEditor(view, state, state.editor);
  }
  const profiles = view.profiles.filter(
    (profile) => profile.provider === provider
  );
  return `<section>
    <div class="content-heading">
      <div>
        <p class="eyebrow">${escapeHtml(t.viewing)} · ${escapeHtml(
          providerName(view, provider)
        )}</p>
        <h2>${escapeHtml(t.profilesTitle)}</h2>
      </div>
      <button class="button button--primary" data-action="add-profile">${escapeHtml(
        t.addProfile
      )}</button>
    </div>
    ${renderProfileRows(view, profiles)}
  </section>`;
}

const LANGUAGES = [
  'Simplified Chinese',
  'Traditional Chinese',
  'Japanese',
  'Korean',
  'Czech',
  'German',
  'French',
  'Italian',
  'Dutch',
  'Portuguese',
  'Vietnamese',
  'English',
  'Spanish',
  'Swedish',
  'Russian',
  'Bahasa',
  'Polish',
  'Turkish',
  'Thai'
];

function renderGeneralSettings(view: ConfigCenterViewModel): string {
  const t = view.translations;
  return `<section>
    <div class="content-heading"><div><p class="eyebrow">${escapeHtml(
      t.configure
    )}</p><h2>${escapeHtml(t.generalSettings)}</h2></div></div>
    <form id="general-settings-form" class="settings-card">
      <label class="field">
        <span>${escapeHtml(t.commitLanguage)}</span>
        <select name="language">${LANGUAGES.map(
          (language) =>
            `<option value="${escapeHtml(language)}"${selected(
              language,
              view.settings.language
            )}>${escapeHtml(language)}</option>`
        ).join('')}</select>
      </label>
      <div class="form-actions"><button class="button button--primary" type="submit">${escapeHtml(
        t.saveSettings
      )}</button></div>
    </form>
  </section>`;
}

function renderPromptSettings(view: ConfigCenterViewModel): string {
  const t = view.translations;
  return `<section>
    <div class="content-heading"><div><p class="eyebrow">${escapeHtml(
      t.advancedSettings
    )}</p><h2>${escapeHtml(t.customPrompt)}</h2></div></div>
    <form id="prompt-settings-form" class="settings-card">
      <label class="field">
        <span>${escapeHtml(t.customPrompt)}</span>
        <textarea name="systemPrompt" rows="14">${escapeHtml(
          view.settings.systemPrompt
        )}</textarea>
        <small class="warning-copy">${escapeHtml(
          t.customPromptWarning
        )}</small>
      </label>
      <div class="form-actions"><button class="button button--primary" type="submit">${escapeHtml(
        t.saveSettings
      )}</button></div>
    </form>
  </section>`;
}

function renderSyncSettings(view: ConfigCenterViewModel): string {
  const t = view.translations;
  const stateLabel =
    view.sync.status === 'unlocked'
      ? t.vaultUnlocked
      : view.sync.status === 'locked'
        ? t.vaultLocked
        : t.vaultDisabled;
  const passwordForm =
    view.sync.status === 'unlocked'
      ? ''
      : `<form id="vault-form" class="vault-form" data-mode="${
          view.sync.enabled ? 'unlock' : 'enable'
        }">
          <label class="field"><span>${escapeHtml(
            t.syncPassword
          )}</span><input name="password" type="password" autocomplete="off" required></label>
          ${
            view.sync.enabled
              ? ''
              : `<label class="field"><span>${escapeHtml(
                  t.confirmSyncPassword
                )}</span><input name="confirmPassword" type="password" autocomplete="off" required></label>`
          }
          <label class="check-field"><input name="remember" type="checkbox"><span>${escapeHtml(
            t.rememberOnDevice
          )}</span></label>
          <button class="button button--primary" type="submit">${escapeHtml(
            view.sync.enabled ? t.unlockVault : t.enableSync
          )}</button>
        </form>`;
  return `<section>
    <div class="content-heading"><div><p class="eyebrow">VS Code Settings Sync</p><h2>${escapeHtml(
      t.encryptedSync
    )}</h2><p>${escapeHtml(t.encryptedSyncDescription)}</p></div></div>
    <div class="sync-card">
      <div class="sync-card__status"><span class="vault-icon" aria-hidden="true">◇</span><div><strong>${escapeHtml(
        stateLabel
      )}</strong><p>${escapeHtml(t.fullKeyNeverShown)}</p></div></div>
      ${passwordForm}
      <div class="form-actions">
        ${
          view.sync.enabled
            ? `<button class="button" data-action="rebuild-vault">${escapeHtml(
                t.rebuildVault
              )}</button><button class="button button--danger" data-action="disable-vault">${escapeHtml(
                t.disableSync
              )}</button>`
            : ''
        }
      </div>
    </div>
  </section>`;
}

function renderContent(
  view: ConfigCenterViewModel,
  state: ConfigCenterUiState
): string {
  if (state.section === 'openai' || state.section === 'anthropic') {
    return renderProviderSection(view, state, state.section);
  }
  if (state.section === 'general') {
    return renderGeneralSettings(view);
  }
  if (state.section === 'prompt') {
    return renderPromptSettings(view);
  }
  return renderSyncSettings(view);
}

export function renderConfigCenter(
  view: ConfigCenterViewModel,
  state: ConfigCenterUiState
): string {
  return `<div class="config-center${state.busy ? ' is-busy' : ''}">
    ${renderActiveSummary(view)}
    ${renderNotice(state)}
    <div class="workspace-layout">
      ${renderNavigation(view, state)}
      <div class="content-pane">${renderContent(view, state)}</div>
    </div>
    ${state.busy ? '<div class="busy-bar" aria-hidden="true"></div>' : ''}
  </div>`;
}
