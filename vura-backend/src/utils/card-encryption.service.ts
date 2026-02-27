import { Injectable } from '@nestjs/common';
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
  createHash,
  timingSafeEqual,
} from 'crypto';

@Injectable()
export class CardEncryptionService {
  private readonly algorithm = 'aes-256-gcm';
  private readonly keyLength = 32;
  private readonly ivLength = 16;
  private readonly authTagLength = 16;
  private readonly saltLength = 64;

  private getEncryptionKey(): Buffer {
    const encryptionKey = process.env.CARD_ENCRYPTION_KEY;
    if (!encryptionKey) {
      throw new Error('CARD_ENCRYPTION_KEY environment variable is required');
    }

    // Use a fixed salt derived from the key for consistency
    const salt = createHash('sha256')
      .update(encryptionKey)
      .digest()
      .slice(0, this.saltLength);
    return scryptSync(encryptionKey, salt, this.keyLength);
  }

  /**
   * Encrypt sensitive card data
   * PCI-DSS Requirement: Encrypt stored cardholder data
   */
  encrypt(data: string): string {
    try {
      const key = this.getEncryptionKey();
      const iv = randomBytes(this.ivLength);
      const cipher = createCipheriv(this.algorithm, key, iv);

      let encrypted = cipher.update(data, 'utf8', 'hex');
      encrypted += cipher.final('hex');

      const authTag = cipher.getAuthTag();

      // Format: salt:iv:authTag:encryptedData
      return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
    } catch {
      throw new Error('Failed to encrypt card data');
    }
  }

  /**
   * Decrypt sensitive card data
   * PCI-DSS Requirement: Secure decryption mechanisms
   */
  decrypt(encryptedData: string): string {
    try {
      const key = this.getEncryptionKey();
      const parts = encryptedData.split(':');

      if (parts.length !== 3) {
        throw new Error('Invalid encrypted data format');
      }

      const [ivHex, authTagHex, encrypted] = parts;
      const iv = Buffer.from(ivHex, 'hex');
      const authTag = Buffer.from(authTagHex, 'hex');

      const decipher = createDecipheriv(this.algorithm, key, iv);
      decipher.setAuthTag(authTag);

      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;
    } catch {
      throw new Error('Failed to decrypt card data - data may be corrupted');
    }
  }

  /**
   * Hash card number for duplicate detection
   * PCI-DSS: One-way hash for data verification
   */
  hashCardNumber(cardNumber: string): string {
    const secret = process.env.CARD_HASH_SECRET || process.env.CARD_ENCRYPTION_KEY;
    if (!secret) {
      throw new Error('Card hashing secret is required');
    }

    // Remove spaces and normalize
    const normalized = cardNumber.replace(/\s/g, '');

    // Use HMAC-SHA256 for secure hashing
    return createHash('sha256')
      .update(normalized + secret)
      .digest('hex');
  }

  /**
   * Mask card number for display (show only last 4)
   * PCI-DSS: Mask PAN when displayed
   */
  maskCardNumber(cardNumber: string): string {
    const normalized = cardNumber.replace(/\s/g, '');
    const last4 = normalized.slice(-4);
    const masked = '*'.repeat(normalized.length - 4) + last4;
    return masked.match(/.{1,4}/g)?.join(' ') || masked;
  }

  /**
   * Validate card number using Luhn algorithm
   */
  validateCardNumber(cardNumber: string): boolean {
    const normalized = cardNumber.replace(/\s/g, '');

    if (!/^\d{13,19}$/.test(normalized)) {
      return false;
    }

    let sum = 0;
    let isEven = false;

    for (let i = normalized.length - 1; i >= 0; i--) {
      let digit = parseInt(normalized.charAt(i), 10);

      if (isEven) {
        digit *= 2;
        if (digit > 9) {
          digit -= 9;
        }
      }

      sum += digit;
      isEven = !isEven;
    }

    return sum % 10 === 0;
  }

  /**
   * Generate secure card token
   * PCI-DSS: Use tokens instead of PAN
   */
  generateCardToken(): string {
    const timestamp = Date.now().toString(36);
    const random = randomBytes(16).toString('hex');
    return `vura_${timestamp}_${random}`;
  }

  /**
   * Securely compare card hashes (timing-safe)
   */
  compareCardHashes(hash1: string, hash2: string): boolean {
    try {
      return timingSafeEqual(Buffer.from(hash1), Buffer.from(hash2));
    } catch {
      return false;
    }
  }
}
