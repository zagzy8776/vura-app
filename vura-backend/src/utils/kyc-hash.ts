import * as crypto from 'crypto';

/**
 * Hash an ID number (BVN, NIN) for deduplication.
 * Same algorithm as before (SHA-256 hex); no external service.
 */
export function hashIdNumber(idNumber: string): string {
  return crypto.createHash('sha256').update(idNumber).digest('hex');
}
