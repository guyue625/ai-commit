import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { describe, it } from 'mocha';
import * as browserActions from '../src/webview/config-center-browser-actions';
import {
  createProfileDraft,
  createProfileSubmission,
  ProfileFormValues
} from '../src/webview/config-center-browser-actions';
import { createEditorState } from '../src/webview/config-center-view';

const openAIValues: ProfileFormValues = {
  name: ' DeepSeek personal ',
  baseUrl: ' https://api.deepseek.com/v1 ',
  apiKey: ' sk-deepseek-secret ',
  keyLabel: ' Personal ',
  model: ' deepseek-chat ',
  temperature: '0.2',
  apiType: 'response',
  reasoningEffort: 'high',
  textVerbosity: 'low',
  apiVersion: '2025-01-01'
};

describe('Config Center browser actions', () => {
  it('builds a normalized create-and-activate request for OpenAI', () => {
    const result = createProfileSubmission(
      createEditorState('openai'),
      openAIValues,
      true
    );

    assert.deepEqual(result, {
      request: {
        type: 'profile.create',
        payload: {
          provider: 'openai',
          name: 'DeepSeek personal',
          baseUrl: 'https://api.deepseek.com/v1',
          apiKey: 'sk-deepseek-secret',
          keyLabel: 'Personal',
          model: 'deepseek-chat',
          options: {
            apiType: 'response',
            temperature: 0.2,
            reasoningEffort: 'high',
            textVerbosity: 'low',
            apiVersion: '2025-01-01'
          },
          activate: true
        }
      }
    });
  });

  it('omits a blank key when editing and requests activation after save', () => {
    const editor = createEditorState('anthropic');
    editor.mode = 'edit';
    editor.profileId = 'anthropic-1';
    const result = createProfileSubmission(
      editor,
      {
        ...openAIValues,
        apiKey: ' ',
        temperature: '0.5'
      },
      true
    );

    assert.deepEqual(result, {
      request: {
        type: 'profile.update',
        payload: {
          profileId: 'anthropic-1',
          changes: {
            name: 'DeepSeek personal',
            baseUrl: 'https://api.deepseek.com/v1',
            keyLabel: 'Personal',
            model: 'deepseek-chat',
            options: { temperature: 0.5 }
          }
        }
      },
      activateAfterSave: 'anthropic-1'
    });
  });

  it('builds an unsaved draft for an explicit model request', () => {
    const draft = createProfileDraft(
      createEditorState('openai'),
      openAIValues
    );

    assert.equal(draft.provider, 'openai');
    assert.equal(draft.apiKey, 'sk-deepseek-secret');
    assert.equal('activate' in draft, false);
    assert.deepEqual(draft.options, {
      apiType: 'response',
      temperature: 0.2,
      reasoningEffort: 'high',
      textVerbosity: 'low',
      apiVersion: '2025-01-01'
    });
  });

  it('resolves delete clicks without relying on a browser confirmation dialog', () => {
    type DeleteProfileAction =
      | { kind: 'confirm'; profileId: string }
      | { kind: 'delete'; profileId: string }
      | { kind: 'blocked'; profileId: string };
    const resolveDeleteProfileAction = (
      browserActions as unknown as {
        resolveDeleteProfileAction?: (
          profile: { id: string; isActive: boolean },
          confirmingProfileId?: string
        ) => DeleteProfileAction;
      }
    ).resolveDeleteProfileAction;

    assert.equal(typeof resolveDeleteProfileAction, 'function');
    if (!resolveDeleteProfileAction) {
      return;
    }

    assert.deepEqual(resolveDeleteProfileAction({ id: 'p1', isActive: false }), {
      kind: 'confirm',
      profileId: 'p1'
    });
    assert.deepEqual(
      resolveDeleteProfileAction({ id: 'p1', isActive: false }, 'p1'),
      { kind: 'delete', profileId: 'p1' }
    );
    assert.deepEqual(resolveDeleteProfileAction({ id: 'p2', isActive: true }), {
      kind: 'blocked',
      profileId: 'p2'
    });
  });

  it('does not call the unsupported Webview browser confirmation API', () => {
    const source = readFileSync(
      path.join(process.cwd(), 'src/webview/config-center-main.ts'),
      'utf8'
    );

    assert.equal(source.includes('window.confirm'), false);
  });
});
