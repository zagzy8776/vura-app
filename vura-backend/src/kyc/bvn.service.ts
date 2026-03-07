import {
  Injectable,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { hashIdNumber } from '../utils/kyc-hash';
import { PremblyService } from '../services/prembly.service';
import { KorapayIdentityService } from '../services/korapay-identity.service';
import { encryptToColumns } from '../utils/field-encryption';
import { VirtualAccountsService } from '../virtual-accounts/virtual-accounts.service';

@Injectable()
export class BVNService {
  constructor(
    private prisma: PrismaService,
    private premblyService: PremblyService,
    private korapayIdentityService: KorapayIdentityService,
    private virtualAccountsService: VirtualAccountsService,
  ) {}

  /**
   * Verify BVN using Korapay (if configured) or Prembly. On success, user moves to Tier 2 and gets a Paystack virtual account.
   */
  async verifyBVN(
    userId: string,
    bvn: string,
    firstName?: string,
    lastName?: string,
  ): Promise<{
    success: boolean;
    firstName: string;
    lastName: string;
    kycTier: number;
  }> {
    // Validate BVN format (11 digits)
    if (!/^\d{11}$/.test(bvn)) {
      throw new BadRequestException('Invalid BVN format. Must be 11 digits.');
    }

    // Check if BVN already used
    const bvnHash = hashIdNumber(bvn);
    const existing = await this.prisma.user.findFirst({
      where: { bvnHash },
    });

    if (existing && existing.id !== userId) {
      throw new ConflictException('BVN already registered to another account');
    }

    const korapayConfigured = this.korapayIdentityService.isConfigured();
    const premblyConfigured = this.premblyService.isConfigured();

    if (!korapayConfigured && !premblyConfigured) {
      throw new BadRequestException(
        'BVN verification is not configured. Set KORAPAY_SECRET_KEY or PREMBLY_API_KEY (and PREMBLY_APP_ID for Prembly) in your backend environment.',
      );
    }

    let provider: 'korapay' | 'prembly' = 'prembly';
    let fName = '';
    let lName = '';

    // Use Korapay when configured (primary). Skip Prembly so we get a clear Korapay result.
    if (korapayConfigured) {
      const korapayResult = await this.korapayIdentityService.verifyBvn(bvn, {
        firstName: firstName?.trim(),
        lastName: lastName?.trim(),
      });
      if (korapayResult.success) {
        provider = 'korapay';
        fName = korapayResult.firstName?.trim() || firstName?.trim() || '';
        lName = korapayResult.lastName?.trim() || lastName?.trim() || '';
      } else {
        // Korapay failed — don't fall back to Prembly when user asked to use Kora; surface Korapay error.
        throw new BadRequestException(
          korapayResult.message ||
            'Korapay BVN verification failed. Check KORAPAY_SECRET_KEY and that Identity/BVN is enabled on your Korapay account.',
        );
      }
    } else if (premblyConfigured) {
      const premblyResult = await this.premblyService.verifyBvn(bvn);
      if (!premblyResult.success) {
        throw new BadRequestException(
          premblyResult.message || 'Prembly BVN verification failed.',
        );
      }
      provider = 'prembly';
      fName = premblyResult.firstName?.trim() || firstName?.trim() || '';
      lName = premblyResult.lastName?.trim() || lastName?.trim() || '';
    }

    if (!fName && !lName) {
      throw new BadRequestException(
        'Could not verify your name from BVN. Please enter your first and last name as they appear on your BVN and try again.',
      );
    }

    await this.persistVerifiedBvn(
      userId,
      bvn,
      fName || 'N/A',
      lName || 'N/A',
      provider,
    );
    try {
      await this.virtualAccountsService.createOrGet(userId);
    } catch {
      // Non-fatal: user is still Tier 2; they can generate VA from Receive later
    }
    return {
      success: true,
      firstName: fName || 'N/A',
      lastName: lName || 'N/A',
      kycTier: 2,
    };
  }

  private async persistVerifiedBvn(
    userId: string,
    bvn: string,
    firstName: string,
    lastName: string,
    provider: string,
  ): Promise<void> {
    const bvnHash = hashIdNumber(bvn);
    const encrypted = encryptToColumns(bvn);

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        bvnHash,
        bvnEncrypted: encrypted.ciphertext,
        bvnIv: encrypted.iv,
        legalFirstName: firstName,
        legalLastName: lastName,
        bvnVerified: true,
        bvnVerifiedAt: new Date(),
        kycTier: 2,
        bvnConsentStatus: 'COMPLETED',
      },
    });

    await this.prisma.auditLog.create({
      data: {
        action: 'BVN_VERIFIED',
        userId,
        actorType: 'user',
        metadata: {
          kycTier: 2,
          provider,
          last4: bvn.slice(-4),
        },
      },
    });
  }

  /**
   * Complete BVN verification after redirect (legacy). BVN is now verified via Prembly only in verifyBVN.
   */
  completeBvnConsent(userId: string, reference: string): never {
    void userId;
    void reference;
    throw new BadRequestException(
      'BVN verification now uses instant verification. Please go to Settings → BVN Verification and enter your BVN with first and last name.',
    );
  }

  /**
   * Check if user has verified BVN
   */
  async hasVerifiedBVN(userId: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { bvnVerified: true },
    });
    return user?.bvnVerified || false;
  }

  /**
   * Get BVN status for user
   */
  async getBVNStatus(userId: string): Promise<{
    verified: boolean;
    verifiedAt: Date | null;
    kycTier: number;
  }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        bvnVerified: true,
        bvnVerifiedAt: true,
        kycTier: true,
      },
    });

    if (!user) {
      throw new BadRequestException('User not found');
    }

    return {
      verified: user.bvnVerified,
      verifiedAt: user.bvnVerifiedAt,
      kycTier: user.kycTier,
    };
  }
}
