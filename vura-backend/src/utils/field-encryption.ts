import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

/**
 * Field-level encryption helper for storing sensitive identifiers (e.g., BVN)
 * in separate DB columns.
 *
 * AES-256-GCM
 * - key: ENCRYPTION_KEY (must be at least 32 chars; we use first 32 bytes)
 * - iv: 12 bytes recommended for GCM
 */

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

const getKey = (): Buffer => {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) throw new Error('ENCRYPTION_KEY environment variable is required');
  if (key.length < 32)
    throw new Error('ENCRYPTION_KEY must be at least 32 characters long');
  return Buffer.from(key.slice(0, 32));
};

export type EncryptedField = {
  ciphertext: string; // base64 (includes authTag appended)
  iv: string; // base64
};

/**
 * Encrypt plaintext into (ciphertext, iv).
 * ciphertext is base64 of: encryptedBytes + authTag(16 bytes)
 */
export const encryptToColumns = (plaintext: string): EncryptedField => {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);

  const enc = Buffer.concat([
    cipher.update(Buffer.from(plaintext, 'utf8')),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  const combined = Buffer.concat([enc, authTag]);

  return {
    ciphertext: combined.toString('base64'),
    iv: iv.toString('base64'),
  };
};

export const decryptFromColumns = (
  ciphertextBase64: string,
  ivBase64: string,
) => {
  const combined = Buffer.from(ciphertextBase64, 'base64');
  const iv = Buffer.from(ivBase64, 'base64');

  if (combined.length < 17) {
    throw new Error('Invalid ciphertext');
  }

  const authTag = combined.subarray(combined.length - 16);
  const enc = combined.subarray(0, combined.length - 16);

  const decipher = createDecipheriv(ALGORITHM, getKey(), iv);
  decipher.setAuthTag(authTag);
  const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
  return dec.toString('utf8');
};
