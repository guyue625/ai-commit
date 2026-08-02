import type { ProfileEditorState } from './config-center-view';
import type { ProfileFormPayload } from './messages';

export interface ProfileFormValues {
  name: string;
  baseUrl: string;
  apiKey: string;
  keyLabel: string;
  model: string;
  temperature: string;
  apiType?: string;
  reasoningEffort?: string;
  textVerbosity?: string;
  apiVersion?: string;
}

export interface ProfileSubmission {
  request:
    | { type: 'profile.create'; payload: Record<string, unknown> }
    | { type: 'profile.update'; payload: Record<string, unknown> };
  activateAfterSave?: string;
}

export type DeleteProfileAction =
  | { kind: 'confirm'; profileId: string }
  | { kind: 'delete'; profileId: string }
  | { kind: 'blocked'; profileId: string };

export function resolveDeleteProfileAction(
  profile: { id: string; isActive: boolean },
  confirmingProfileId?: string
): DeleteProfileAction {
  if (profile.isActive) {
    return { kind: 'blocked', profileId: profile.id };
  }
  return confirmingProfileId === profile.id
    ? { kind: 'delete', profileId: profile.id }
    : { kind: 'confirm', profileId: profile.id };
}

function profileOptions(
  editor: ProfileEditorState,
  values: ProfileFormValues
): Record<string, unknown> {
  const temperature = Number(values.temperature);
  if (!Number.isFinite(temperature)) {
    throw new Error('PROFILE_TEMPERATURE_INVALID');
  }
  if (editor.provider === 'anthropic') {
    return { temperature };
  }

  const apiType =
    values.apiType === 'response' ? 'response' : 'completion';
  const reasoningEffort = ['minimal', 'low', 'medium', 'high'].includes(
    values.reasoningEffort ?? ''
  )
    ? values.reasoningEffort
    : 'medium';
  const textVerbosity = ['low', 'medium', 'high'].includes(
    values.textVerbosity ?? ''
  )
    ? values.textVerbosity
    : 'medium';
  const apiVersion = values.apiVersion?.trim();
  return {
    apiType,
    temperature,
    reasoningEffort,
    textVerbosity,
    ...(apiVersion ? { apiVersion } : {})
  };
}

export function createProfileSubmission(
  editor: ProfileEditorState,
  values: ProfileFormValues,
  activate: boolean
): ProfileSubmission {
  const common = {
    name: values.name.trim(),
    baseUrl: values.baseUrl.trim(),
    keyLabel: values.keyLabel.trim(),
    model: values.model.trim(),
    options: profileOptions(editor, values)
  };
  const apiKey = values.apiKey.trim();

  if (editor.mode === 'create') {
    return {
      request: {
        type: 'profile.create',
        payload: {
          provider: editor.provider,
          ...common,
          apiKey,
          activate
        }
      }
    };
  }

  if (!editor.profileId) {
    throw new Error('PROFILE_ID_REQUIRED');
  }
  return {
    request: {
      type: 'profile.update',
      payload: {
        profileId: editor.profileId,
        changes: {
          ...common,
          ...(apiKey ? { apiKey } : {})
        }
      }
    },
    ...(activate ? { activateAfterSave: editor.profileId } : {})
  };
}

export function createProfileDraft(
  editor: ProfileEditorState,
  values: ProfileFormValues
): Omit<ProfileFormPayload, 'activate'> {
  const submission = createProfileSubmission(
    { ...editor, mode: 'create' },
    values,
    false
  );
  const payload = {
    ...(submission.request.payload as unknown as ProfileFormPayload)
  };
  delete payload.activate;
  return payload;
}
