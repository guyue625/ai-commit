import { randomUUID } from 'node:crypto';
import {
  ChannelProfile,
  CreateProfileInput,
  EMPTY_PROFILE_CATALOG,
  ProfileCatalog,
  ProviderType,
  UpdateProfileInput
} from './profile-types';
import { KeyValueStore } from './storage';

export const PROFILE_CATALOG_KEY = 'aiCommit.profileCatalog.v1';

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function fail(code: string): never {
  throw new Error(code);
}

function normalizeName(value: string): string {
  const normalized = value.trim();
  if (!normalized) {
    fail('PROFILE_NAME_REQUIRED');
  }
  return normalized;
}

function normalizeModel(value: string): string {
  const normalized = value.trim();
  if (!normalized) {
    fail('PROFILE_MODEL_REQUIRED');
  }
  return normalized;
}

function normalizeBaseUrl(value: string): string {
  const normalized = value.trim();
  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    return fail('PROFILE_BASE_URL_INVALID');
  }

  if (
    (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') ||
    parsed.username ||
    parsed.password
  ) {
    fail('PROFILE_BASE_URL_INVALID');
  }

  return normalized.replace(/\/+$/, '');
}

export class ProfileRepository {
  constructor(
    private readonly store: KeyValueStore,
    private readonly now: () => number = Date.now,
    private readonly createId: () => string = randomUUID
  ) {}

  async getCatalog(): Promise<ProfileCatalog> {
    return clone(
      this.store.get<ProfileCatalog>(PROFILE_CATALOG_KEY, EMPTY_PROFILE_CATALOG) ??
        EMPTY_PROFILE_CATALOG
    );
  }

  async list(provider?: ProviderType): Promise<ChannelProfile[]> {
    const profiles = (await this.getCatalog()).profiles;
    return profiles.filter((profile) => !provider || profile.provider === provider);
  }

  async get(profileId: string): Promise<ChannelProfile | undefined> {
    return (await this.getCatalog()).profiles.find(
      (profile) => profile.id === profileId
    );
  }

  async create(input: CreateProfileInput): Promise<ChannelProfile> {
    const catalog = await this.getCatalog();
    const normalized = this.normalizeCreateInput(input);
    this.ensureUniqueName(catalog, normalized.provider, normalized.name);
    const timestamp = this.now();
    const profile = {
      ...normalized,
      id: this.createId(),
      createdAt: timestamp,
      updatedAt: timestamp
    } as ChannelProfile;

    catalog.profiles.push(profile);
    catalog.revision += 1;
    await this.save(catalog);
    return clone(profile);
  }

  async update(
    profileId: string,
    input: UpdateProfileInput
  ): Promise<ChannelProfile> {
    const catalog = await this.getCatalog();
    const index = catalog.profiles.findIndex((profile) => profile.id === profileId);
    if (index < 0) {
      fail('PROFILE_NOT_FOUND');
    }

    const current = catalog.profiles[index];
    const name = input.name === undefined ? current.name : normalizeName(input.name);
    this.ensureUniqueName(catalog, current.provider, name, current.id);

    const updated = {
      ...current,
      ...input,
      name,
      baseUrl:
        input.baseUrl === undefined
          ? current.baseUrl
          : normalizeBaseUrl(input.baseUrl),
      model:
        input.model === undefined ? current.model : normalizeModel(input.model),
      updatedAt: this.now()
    } as ChannelProfile;

    catalog.profiles[index] = updated;
    catalog.revision += 1;
    await this.save(catalog);
    return clone(updated);
  }

  async setDefault(profileId?: string): Promise<void> {
    const catalog = await this.getCatalog();
    if (
      profileId !== undefined &&
      !catalog.profiles.some((profile) => profile.id === profileId)
    ) {
      fail('PROFILE_NOT_FOUND');
    }
    catalog.defaultProfileId = profileId;
    catalog.revision += 1;
    await this.save(catalog);
  }

  async setEncryptedSyncState(
    enabled: boolean,
    vaultRevision?: number
  ): Promise<void> {
    const catalog = await this.getCatalog();
    catalog.encryptedSyncEnabled = enabled;
    catalog.vaultRevision = enabled ? vaultRevision : undefined;
    catalog.revision += 1;
    await this.save(catalog);
  }

  async delete(profileId: string): Promise<void> {
    const catalog = await this.getCatalog();
    if (catalog.defaultProfileId === profileId) {
      fail('PROFILE_IS_DEFAULT');
    }
    const nextProfiles = catalog.profiles.filter(
      (profile) => profile.id !== profileId
    );
    if (nextProfiles.length === catalog.profiles.length) {
      fail('PROFILE_NOT_FOUND');
    }
    catalog.profiles = nextProfiles;
    catalog.revision += 1;
    await this.save(catalog);
  }

  async restoreCatalog(catalog: ProfileCatalog): Promise<void> {
    await this.save(catalog);
  }

  private normalizeCreateInput(input: CreateProfileInput): CreateProfileInput {
    return {
      ...input,
      name: normalizeName(input.name),
      baseUrl: normalizeBaseUrl(input.baseUrl),
      model: normalizeModel(input.model),
      keyLabel: input.keyLabel?.trim() || undefined,
      keyHint: input.keyHint.trim()
    } as CreateProfileInput;
  }

  private ensureUniqueName(
    catalog: ProfileCatalog,
    provider: ProviderType,
    name: string,
    exceptProfileId?: string
  ): void {
    const comparableName = name.toLocaleLowerCase();
    const duplicate = catalog.profiles.some(
      (profile) =>
        profile.id !== exceptProfileId &&
        profile.provider === provider &&
        profile.name.toLocaleLowerCase() === comparableName
    );
    if (duplicate) {
      fail('PROFILE_NAME_DUPLICATE');
    }
  }

  private async save(catalog: ProfileCatalog): Promise<void> {
    await this.store.update(PROFILE_CATALOG_KEY, clone(catalog));
  }
}
