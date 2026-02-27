/**
 * Secure PIN Hashing Utilities
 * 
 * IMPORTANT: This implements client-side hashing to ensure PINs are never
 * transmitted in plain text over the network.
 * 
 * Flow:
 * 1. User enters PIN
 * 2. Client generates a random salt
 * 3. Client hashes: SHA256(PIN + salt)
 * 4. Client sends { hash, salt } to server
 * 5. Server compares against stored hash using the same salt
 */

import { createHmac } from 'crypto';

/**
 * Generate a random salt for PIN hashing
 */
export const generateSalt = (): string => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let salt = '';
  for (let i = 0; i < 32; i++) {
    salt += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return salt;
};

/**
 * Hash PIN with salt using SHA-256
 * This is used client-side before sending to server
 */
export const hashPin = (pin: string, salt: string): string => {
  // Create HMAC-SHA256 hash
  const hmac = createHmac('sha256', salt);
  hmac.update(pin + salt); // Prepend salt to PIN for additional security
  return hmac.digest('hex');
};

/**
 * Verify PIN against stored hash
 * This is used server-side to compare hashes
 */
export const verifyPin = (pin: string, salt: string, storedHash: string): boolean => {
  const computedHash = hashPin(pin, salt);
  return computedHash === storedHash;
};

/**
 * Generate a challenge for transaction signing
 * This adds an additional layer of security for sensitive operations
 */
export const generateTransactionChallenge = (transactionId: string, amount: string, salt: string): string => {
  const hmac = createHmac('sha256', salt);
  hmac.update(transactionId + amount + salt);
  return hmac.digest('hex');
};

/**
 * Hash PIN for storage (server-side)
 * Uses bcrypt-like approach with multiple rounds
 */
export const hashPinForStorage = async (pin: string, salt: string): Promise<string> => {
  let hash = pin + salt;
  // Multiple rounds of hashing for additional security
  for (let i = 0; i < 10000; i++) {
    const hmac = createHmac('sha256', salt);
    hmac.update(hash);
    hash = hmac.digest('hex');
  }
  return hash;
};
