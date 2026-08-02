import { ChannelProfile } from './profile-types';
import { ProfileRepository } from './profile-repository';
import { SecretRepository } from './secret-repository';
import { KeyValueStore } from './storage';

export const WORKSPACE_ACTIVE_PROFILE_KEY =
  'aiCommit.workspace.activeProfileId';

export type ResolveActiveProfileResult =
  | { ok: true; profile: ChannelProfile; apiKey: string }
  | { ok: false; reason: 'NO_ACTIVE_PROFILE' }
  | {
      ok: false;
      reason: 'PROFILE_NOT_FOUND' | 'MISSING_LOCAL_SECRET';
      profileId: string;
    };

export class ActiveProfileResolver {
  constructor(
    private readonly profiles: ProfileRepository,
    private readonly secrets: SecretRepository,
    private readonly workspaceStore: KeyValueStore
  ) {}

  async setWorkspaceActiveProfile(profileId?: string): Promise<void> {
    await this.workspaceStore.update(WORKSPACE_ACTIVE_PROFILE_KEY, profileId);
  }

  getWorkspaceActiveProfileId(): string | undefined {
    return this.workspaceStore.get<string>(WORKSPACE_ACTIVE_PROFILE_KEY);
  }

  async resolve(): Promise<ResolveActiveProfileResult> {
    const catalog = await this.profiles.getCatalog();
    const selectedProfileId =
      this.getWorkspaceActiveProfileId() ?? catalog.defaultProfileId;

    if (!selectedProfileId) {
      return { ok: false, reason: 'NO_ACTIVE_PROFILE' };
    }

    const profile = catalog.profiles.find(
      (candidate) => candidate.id === selectedProfileId
    );
    if (!profile) {
      return {
        ok: false,
        reason: 'PROFILE_NOT_FOUND',
        profileId: selectedProfileId
      };
    }

    const apiKey = await this.secrets.getApiKey(profile.id);
    if (!apiKey) {
      return {
        ok: false,
        reason: 'MISSING_LOCAL_SECRET',
        profileId: profile.id
      };
    }

    return { ok: true, profile, apiKey };
  }
}
