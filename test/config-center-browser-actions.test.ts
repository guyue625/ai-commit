import assert from 'node:assert/strict';
import { describe, it } from 'mocha';
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
});
