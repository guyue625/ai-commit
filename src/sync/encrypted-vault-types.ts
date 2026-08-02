export interface VaultKdfParams {
  N: number;
  r: number;
  p: number;
}

export const DEFAULT_VAULT_KDF_PARAMS: VaultKdfParams = {
  N: 32768,
  r: 8,
  p: 1
};

export interface VaultSecretEntry {
  profileId: string;
  apiKey: string;
}

export interface VaultPlaintext {
  version: 1;
  revision: number;
  updatedAt: number;
  secrets: VaultSecretEntry[];
}

export interface EncryptedVaultEnvelope {
  version: 1;
  revision: number;
  kdf: 'scrypt';
  kdfParams: VaultKdfParams;
  salt: string;
  nonce: string;
  ciphertext: string;
  authTag: string;
  updatedAt: number;
}
