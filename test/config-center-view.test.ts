import assert from 'node:assert/strict';
import { describe, it } from 'mocha';
import { ConfigCenterViewModel } from '../src/webview/config-center-controller';
import {
  createEditorState,
  renderConfigCenter,
  ConfigCenterUiState
} from '../src/webview/config-center-view';
import { getTranslations } from '../src/webview/i18n';

function createView(): ConfigCenterViewModel {
  return {
    locale: 'en',
    translations: getTranslations('en'),
    activeProfileId: 'openai-1',
    providerCounts: { openai: 1, anthropic: 1 },
    settings: { language: 'English', systemPrompt: '' },
    sync: { enabled: true, status: 'locked', revision: 3 },
    profiles: [
      {
        id: 'openai-1',
        provider: 'openai',
        name: 'DeepSeek personal',
        baseUrl: 'https://api.deepseek.com/v1',
        model: 'deepseek-chat',
        keyLabel: 'Personal',
        keyHint: 'sk-••••A9F',
        hasLocalKey: true,
        isActive: true,
        isDefault: false,
        createdAt: 1,
        updatedAt: 2,
        lastTest: { status: 'success', testedAt: 3, latencyMs: 86 },
        options: {
          apiType: 'completion',
          temperature: 0.7,
          reasoningEffort: 'medium',
          textVerbosity: 'medium'
        }
      },
      {
        id: 'anthropic-1',
        provider: 'anthropic',
        name: 'Claude company',
        baseUrl: 'https://claude.example.com',
        model: 'claude-sonnet-4-5',
        keyHint: 'sk-ant-••••K2P',
        hasLocalKey: true,
        isActive: false,
        isDefault: false,
        createdAt: 1,
        updatedAt: 2,
        options: { temperature: 0.5 }
      }
    ]
  };
}

describe('Config Center browser view', () => {
  it('keeps the actual active profile visible while viewing another provider', () => {
    const view = createView();
    const state: ConfigCenterUiState = { section: 'anthropic' };

    const html = renderConfigCenter(view, state);

    assert.match(html, /data-region="active-summary"/);
    assert.match(html, /data-active-profile-id="openai-1"/);
    assert.match(html, /https:\/\/api\.deepseek\.com\/v1/);
    assert.match(html, /deepseek-chat/);
    assert.match(html, /sk-••••A9F/);
    assert.match(html, /data-section="anthropic" aria-current="page"/);
    assert.match(html, /data-profile-id="anthropic-1"/);
  });

  it('never inserts a stored key into the edit form', () => {
    const view = createView();
    const profile = view.profiles[0];
    const html = renderConfigCenter(view, {
      section: 'openai',
      editor: createEditorState(profile)
    });

    assert.match(html, /name="apiKey"[^>]*value=""/);
    assert.equal(html.includes('sk-secret'), false);
    assert.match(html, /sk-••••A9F/);
  });

  it('escapes profile fields rendered from synced metadata', () => {
    const view = createView();
    view.profiles[1].name = '<script>alert(1)</script>';

    const html = renderConfigCenter(view, { section: 'anthropic' });

    assert.equal(html.includes('<script>alert(1)</script>'), false);
    assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  });
});
