import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from 'crypto';

/**
 * AES-256-GCM Encryption Utility for sensitive data
 * Uses environment variable ENCRYPTION_KEY (must be 32 bytes)
 */

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const SALT_LENGTH = 32;

// Get encryption key from environment
const getEncryptionKey = (): Buffer => {
  const key = process.env.ENCRYPTION_KEY;

  if (!key) {
    throw new Error('ENCRYPTION_KEY environment variable is required');
  }

  if (key.length < 32) {
    throw new Error('ENCRYPTION_KEY must be at least 32 characters long');
  }

  // Use first 32 characters as key
  return Buffer.from(key.slice(0, 32));
};

/**
 * Encrypt sensitive data (phone numbers, BVN, etc.)
 * Returns format: salt:iv:authTag:encryptedData (all base64)
 */
export const encrypt = (plaintext: string): string => {
  try {
    const key = getEncryptionKey();

    // Generate random salt and IV
    const salt = randomBytes(SALT_LENGTH);
    const iv = randomBytes(IV_LENGTH);

    // Create cipher
    const cipher = createCipheriv(ALGORITHM, key, iv);

    // Encrypt
    let encrypted = cipher.update(plaintext, 'utf8', 'base64');
    encrypted += cipher.final('base64');

    // Get auth tag
    const authTag = cipher.getAuthTag();

    // Combine all parts: salt:iv:authTag:encryptedData
    const result = [
      salt.toString('base64'),
      iv.toString('base64'),
      authTag.toString('base64'),
      encrypted,
    ].join(':');

    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Encryption failed: ${message}`);
  }
};

/**
 * Decrypt data encrypted with encrypt()
 * Expects format: salt:iv:authTag:encryptedData (all base64)
 */
export const decrypt = (encryptedData: string): string => {
  try {
    const key = getEncryptionKey();

    // Split parts
    const parts = encryptedData.split(':');
    if (parts.length !== 4) {
      throw new Error('Invalid encrypted data format');
    }

    const [saltBase64, ivBase64, authTagBase64, encrypted] = parts;

    // Decode parts (salt kept for future key derivation if needed)
    Buffer.from(saltBase64, 'base64');
    const iv = Buffer.from(ivBase64, 'base64');
    const authTag = Buffer.from(authTagBase64, 'base64');

    // Create decipher
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    // Decrypt
    let decrypted = decipher.update(encrypted, 'base64', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Decryption failed: ${message}`);
  }
};

/**
 * Hash sensitive data for comparison (one-way)
 * Use for BVN hashing (store hash, not encrypted)
 */
export const hashSensitive = (data: string): string => {
  const salt = randomBytes(16);
  const hash = scryptSync(data, salt, 64);
  return salt.toString('base64') + ':' + hash.toString('base64');
};

/**
 * Verify hashed sensitive data
 */
export const verifyHash = (data: string, hashed: string): boolean => {
  const [saltBase64, hashBase64] = hashed.split(':');
  const salt = Buffer.from(saltBase64, 'base64');
  const newHash = scryptSync(data, salt, 64);
  const newHashBase64 = newHash.toString('base64');
  return newHashBase64 === hashBase64;
};

/**
 * Generate a secure encryption key for .env
 * Run this once and save the output to ENCRYPTION_KEY
 */
export const generateEncryptionKey = (): string => {
  return randomBytes(32).toString('base64');
};

/**
 * Mask phone number for display (e.g., +234****1234)
 */
export const maskPhone = (phone: string): string => {
  if (phone.length < 8) return phone;
  return phone.slice(0, 4) + '****' + phone.slice(-4);
};

/**
 * Validate phone number format (Nigerian)
 */
export const validatePhone = (phone: string): boolean => {
  // Nigerian format: +234XXXXXXXXXX or 0XXXXXXXXXX
  const nigerianRegex = /^(?:\+234|0)[7-9][0-1][0-9]{8}$/;
  return nigerianRegex.test(phone);
};

/**
 * Normalize phone number to +234 format
 */
export const normalizePhone = (phone: string): string => {
  // Remove spaces and dashes
  let normalized = phone.replace(/[\s-]/g, '');

  // Convert 0XXXXXXXXXX to +234XXXXXXXXXX
  if (normalized.startsWith('0')) {
    normalized = '+234' + normalized.slice(1);
  }

  return normalized;
};
