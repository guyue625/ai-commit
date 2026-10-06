import { createCipheriv, createDecipheriv, randomBytes, scrypt } from 'node:crypto';
import { ProfileFormPayload, validateProfileForm } from '../webview/messages';

export type BackupProfile = Omit<ProfileFormPayload, 'activate'> & { id: string };
export const MAX_BACKUP_BYTES = 5 * 1024 * 1024;
const FORMAT = 'ai-commit-profile-backup';
const AAD = Buffer.from(`${FORMAT}:v1`);
const KDF = { N: 32768, r: 8, p: 1 };

function requirePassword(password: string): void {
  if (!password.trim()) { throw new Error('BACKUP_PASSWORD_REQUIRED'); }
}

function validateProfiles(value: unknown): asserts value is BackupProfile[] {
  if (!Array.isArray(value) || value.length > 1000) { throw new Error('BACKUP_INVALID'); }
  const ids = new Set<string>();
  const names = new Set<string>();
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') { throw new Error('BACKUP_INVALID'); }
    const { id, ...form } = entry;
    if (typeof id !== 'string' || !id.trim() || !validateProfileForm(form) || 'activate' in form) {
      throw new Error('BACKUP_INVALID');
    }
    const name = `${form.provider}:${form.name.trim().toLocaleLowerCase()}`;
    if (ids.has(id) || names.has(name)) { throw new Error('BACKUP_INVALID'); }
    ids.add(id);
    names.add(name);
  }
}

function deriveKey(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 32, { ...KDF, maxmem: 64 * 1024 * 1024 }, (error, key) => {
      if (error) { reject(error); } else { resolve(key); }
    });
  });
}

function decode(value: unknown, length?: number): Buffer {
  if (typeof value !== 'string' || !value || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) {
    throw new Error('BACKUP_INVALID');
  }
  const decoded = Buffer.from(value, 'base64');
  if (decoded.toString('base64') !== value || (length !== undefined && decoded.length !== length)) {
    throw new Error('BACKUP_INVALID');
  }
  return decoded;
}

export class EncryptedProfileBackup {
  async encrypt(profiles: BackupProfile[], password: string): Promise<Uint8Array> {
    requirePassword(password);
    validateProfiles(profiles);
    const plaintext = Buffer.from(JSON.stringify({ version: 1, profiles }));
    const salt = randomBytes(16);
    const nonce = randomBytes(12);
    let key: Buffer | undefined;
    try {
      if (plaintext.length > MAX_BACKUP_BYTES / 2) { throw new Error('BACKUP_TOO_LARGE'); }
      key = await deriveKey(password, salt);
      const cipher = createCipheriv('aes-256-gcm', key, nonce);
      cipher.setAAD(AAD);
      const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
      return Buffer.from(JSON.stringify({
        format: FORMAT, version: 1, kdf: 'scrypt', kdfParams: KDF,
        salt: salt.toString('base64'), nonce: nonce.toString('base64'),
        authTag: cipher.getAuthTag().toString('base64'), ciphertext: ciphertext.toString('base64')
      }, null, 2));
    } finally {
      key?.fill(0);
      plaintext.fill(0);
    }
  }

  async decrypt(contents: Uint8Array, password: string): Promise<BackupProfile[]> {
    requirePassword(password);
    if (contents.length > MAX_BACKUP_BYTES) { throw new Error('BACKUP_TOO_LARGE'); }
    let key: Buffer | undefined;
    let plaintext: Buffer | undefined;
    try {
      const envelope = JSON.parse(Buffer.from(contents).toString('utf8'));
      if (envelope?.format !== FORMAT) { throw new Error('BACKUP_INVALID'); }
      if (envelope.version !== 1) { throw new Error('BACKUP_UNSUPPORTED_VERSION'); }
      // Accept only the bounded v1 KDF parameters, before performing any KDF work.
      if (envelope.kdf !== 'scrypt' || envelope.kdfParams?.N !== KDF.N ||
          envelope.kdfParams?.r !== KDF.r || envelope.kdfParams?.p !== KDF.p) {
        throw new Error('BACKUP_INVALID');
      }
      const salt = decode(envelope.salt, 16);
      const nonce = decode(envelope.nonce, 12);
      const tag = decode(envelope.authTag, 16);
      const ciphertext = decode(envelope.ciphertext);
      key = await deriveKey(password, salt);
      const decipher = createDecipheriv('aes-256-gcm', key, nonce);
      decipher.setAAD(AAD);
      decipher.setAuthTag(tag);
      try {
        plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
      } catch {
        throw new Error('BACKUP_DECRYPT_FAILED');
      }
      const payload = JSON.parse(plaintext.toString('utf8'));
      if (payload?.version !== 1) { throw new Error('BACKUP_INVALID'); }
      validateProfiles(payload.profiles);
      return payload.profiles;
    } catch (error) {
      if (error instanceof Error && /^BACKUP_[A-Z_]+$/.test(error.message)) { throw error; }
      throw new Error('BACKUP_INVALID');
    } finally {
      key?.fill(0);
      plaintext?.fill(0);
    }
  }
}
