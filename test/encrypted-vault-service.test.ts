import assert from 'node:assert/strict';
import { describe, it } from 'mocha';
import {
  DEFAULT_VAULT_KDF_PARAMS,
  EncryptedVaultEnvelope
} from '../src/sync/encrypted-vault-types';
import { EncryptedVaultService } from '../src/sync/encrypted-vault-service';

const TEST_KDF = {
  ...DEFAULT_VAULT_KDF_PARAMS,
  N: 1024
};

function deterministicRandom() {
  let call = 0;
  return (size: number) => {
    call += 1;
    return Buffer.alloc(size, call);
  };
}

function tamperBase64(value: string): string {
  const bytes = Buffer.from(value, 'base64');
  bytes[0] ^= 0xff;
  return bytes.toString('base64');
}

describe('EncryptedVaultService', () => {
  it('encrypts and decrypts all channel keys with one password', async () => {
    const service = new EncryptedVaultService(
      deterministicRandom(),
      () => 123456,
      TEST_KDF
    );
    const secrets = [
      { profileId: 'profile-a', apiKey: 'sk-a' },
      { profileId: 'profile-b', apiKey: 'sk-ant-b' }
    ];

    const envelope = await service.encrypt(
      secrets,
      'correct horse battery staple',
      7
    );
    const plaintext = await service.decrypt(
      envelope,
      'correct horse battery staple'
    );

    assert.deepEqual(plaintext, {
      version: 1,
      revision: 7,
      updatedAt: 123456,
      secrets
    });
    assert.equal(envelope.version, 1);
    assert.equal(envelope.revision, 7);
    assert.equal(envelope.kdf, 'scrypt');
    assert.equal(envelope.ciphertext.includes('sk-a'), false);
  });

  it('rejects a wrong password without exposing any stored key', async () => {
    const service = new EncryptedVaultService(
      deterministicRandom(),
      () => 123456,
      TEST_KDF
    );
    const envelope = await service.encrypt(
      [{ profileId: 'profile-a', apiKey: 'sk-super-secret' }],
      'right password',
      1
    );

    await assert.rejects(service.decrypt(envelope, 'wrong password'), (error) => {
      assert.equal((error as Error).message, 'VAULT_DECRYPT_FAILED');
      assert.equal((error as Error).message.includes('sk-super-secret'), false);
      return true;
    });
  });

  for (const field of ['ciphertext', 'nonce', 'authTag'] as const) {
    it(`detects tampering with ${field}`, async () => {
      const service = new EncryptedVaultService(
        deterministicRandom(),
        () => 123456,
        TEST_KDF
      );
      const envelope = await service.encrypt(
        [{ profileId: 'profile-a', apiKey: 'sk-secret' }],
        'password',
        1
      );
      const tampered: EncryptedVaultEnvelope = {
        ...envelope,
        [field]: tamperBase64(envelope[field])
      };

      await assert.rejects(
        service.decrypt(tampered, 'password'),
        /VAULT_DECRYPT_FAILED/
      );
    });
  }

  it('rejects unsupported envelope versions before decrypting', async () => {
    const service = new EncryptedVaultService(
      deterministicRandom(),
      () => 123456,
      TEST_KDF
    );
    const envelope = await service.encrypt([], 'password', 1);

    await assert.rejects(
      service.decrypt({ ...envelope, version: 2 as 1 }, 'password'),
      /VAULT_UNSUPPORTED_VERSION/
    );
  });

  it('requires a non-empty sync password', async () => {
    const service = new EncryptedVaultService(
      deterministicRandom(),
      () => 123456,
      TEST_KDF
    );

    await assert.rejects(service.encrypt([], '   ', 1), /SYNC_PASSWORD_REQUIRED/);
  });
});
