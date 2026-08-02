import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scrypt
} from 'node:crypto';
import {
  DEFAULT_VAULT_KDF_PARAMS,
  EncryptedVaultEnvelope,
  VaultKdfParams,
  VaultPlaintext,
  VaultSecretEntry
} from './encrypted-vault-types';

const VAULT_AAD = Buffer.from('ai-commit-key-vault:v1', 'utf8');
const KEY_LENGTH = 32;
const SALT_LENGTH = 16;
const NONCE_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

type RandomBytesSource = (size: number) => Buffer;

function validatePassword(password: string): void {
  if (!password.trim()) {
    throw new Error('SYNC_PASSWORD_REQUIRED');
  }
}

function validateSecrets(secrets: VaultSecretEntry[]): void {
  const invalid = secrets.some(
    (entry) => !entry.profileId.trim() || !entry.apiKey.trim()
  );
  if (invalid) {
    throw new Error('VAULT_SECRET_INVALID');
  }
}

function isVaultPlaintext(value: unknown): value is VaultPlaintext {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Partial<VaultPlaintext>;
  return (
    candidate.version === 1 &&
    typeof candidate.revision === 'number' &&
    typeof candidate.updatedAt === 'number' &&
    Array.isArray(candidate.secrets) &&
    candidate.secrets.every(
      (entry) =>
        entry &&
        typeof entry.profileId === 'string' &&
        typeof entry.apiKey === 'string'
    )
  );
}

export class EncryptedVaultService {
  constructor(
    private readonly getRandomBytes: RandomBytesSource = randomBytes,
    private readonly now: () => number = Date.now,
    private readonly defaultKdfParams: VaultKdfParams =
      DEFAULT_VAULT_KDF_PARAMS
  ) {}

  async encrypt(
    secrets: VaultSecretEntry[],
    password: string,
    revision: number
  ): Promise<EncryptedVaultEnvelope> {
    validatePassword(password);
    validateSecrets(secrets);

    const updatedAt = this.now();
    const plaintext: VaultPlaintext = {
      version: 1,
      revision,
      updatedAt,
      secrets: secrets.map((entry) => ({ ...entry }))
    };
    const salt = this.getRandomBytes(SALT_LENGTH);
    const nonce = this.getRandomBytes(NONCE_LENGTH);
    const key = await this.deriveKey(password, salt, this.defaultKdfParams);
    let plaintextBuffer: Buffer | undefined;

    try {
      plaintextBuffer = Buffer.from(JSON.stringify(plaintext), 'utf8');
      const cipher = createCipheriv('aes-256-gcm', key, nonce, {
        authTagLength: AUTH_TAG_LENGTH
      });
      cipher.setAAD(VAULT_AAD);
      const ciphertext = Buffer.concat([
        cipher.update(plaintextBuffer),
        cipher.final()
      ]);

      return {
        version: 1,
        revision,
        kdf: 'scrypt',
        kdfParams: { ...this.defaultKdfParams },
        salt: salt.toString('base64'),
        nonce: nonce.toString('base64'),
        ciphertext: ciphertext.toString('base64'),
        authTag: cipher.getAuthTag().toString('base64'),
        updatedAt
      };
    } finally {
      key.fill(0);
      plaintextBuffer?.fill(0);
    }
  }

  async decrypt(
    envelope: EncryptedVaultEnvelope,
    password: string
  ): Promise<VaultPlaintext> {
    validatePassword(password);
    if (envelope.version !== 1 || envelope.kdf !== 'scrypt') {
      throw new Error('VAULT_UNSUPPORTED_VERSION');
    }

    let key: Buffer | undefined;
    let plaintextBuffer: Buffer | undefined;
    try {
      const salt = Buffer.from(envelope.salt, 'base64');
      const nonce = Buffer.from(envelope.nonce, 'base64');
      const ciphertext = Buffer.from(envelope.ciphertext, 'base64');
      const authTag = Buffer.from(envelope.authTag, 'base64');
      key = await this.deriveKey(password, salt, envelope.kdfParams);

      const decipher = createDecipheriv('aes-256-gcm', key, nonce, {
        authTagLength: AUTH_TAG_LENGTH
      });
      decipher.setAAD(VAULT_AAD);
      decipher.setAuthTag(authTag);
      plaintextBuffer = Buffer.concat([
        decipher.update(ciphertext),
        decipher.final()
      ]);
      const parsed = JSON.parse(plaintextBuffer.toString('utf8')) as unknown;
      if (!isVaultPlaintext(parsed) || parsed.revision !== envelope.revision) {
        throw new Error('VAULT_INVALID_PLAINTEXT');
      }
      return parsed;
    } catch (error) {
      if ((error as Error).message === 'SYNC_PASSWORD_REQUIRED') {
        throw error;
      }
      throw new Error('VAULT_DECRYPT_FAILED');
    } finally {
      key?.fill(0);
      plaintextBuffer?.fill(0);
    }
  }

  private deriveKey(
    password: string,
    salt: Buffer,
    params: VaultKdfParams
  ): Promise<Buffer> {
    const minimumMemory = 128 * params.N * params.r;
    const maxmem = Math.max(64 * 1024 * 1024, minimumMemory * 2);
    return new Promise((resolve, reject) => {
      scrypt(
        password,
        salt,
        KEY_LENGTH,
        { N: params.N, r: params.r, p: params.p, maxmem },
        (error, derivedKey) => {
          if (error) {
            reject(error);
            return;
          }
          resolve(derivedKey);
        }
      );
    });
  }
}
