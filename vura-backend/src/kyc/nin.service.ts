import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { hashIdNumber } from '../utils/kyc-hash';

export interface NINVerificationResult {
  success: boolean;
  firstName?: string;
  lastName?: string;
  middleName?: string;
  dateOfBirth?: string;
  gender?: string;
  phoneNumber?: string;
  nin?: string;
}

@Injectable()
export class NINService {
  constructor(private prisma: PrismaService) {}

  /**
   * Verify NIN. Tier 3 / NIN upgrade is handled by admin.
   * Use Settings or contact support; admin will verify and set tier.
   */
  async verifyNIN(
    _userId: string,
    nin: string,
  ): Promise<NINVerificationResult> {
    if (!/^\d{11}$/.test(nin)) {
      throw new BadRequestException('Invalid NIN format. Must be 11 digits.');
    }

    const ninHash = hashIdNumber(nin);
    const existing = await this.prisma.user.findFirst({
      where: { ninHash },
    });
    if (existing && existing.id !== _userId) {
      throw new BadRequestException(
        'NIN already registered to another account',
      );
    }

    throw new BadRequestException(
      'NIN verification is handled by admin. Complete BVN first for Tier 2, then contact support or use admin review for Tier 3.',
    );
  }

  /**
   * Check if user has verified NIN
   */
  async hasVerifiedNIN(userId: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { ninVerified: true },
    });
    return user?.ninVerified || false;
  }

  /**
   * Get NIN verification status for user
   */
  async getNINStatus(userId: string): Promise<{
    verified: boolean;
    verifiedAt: Date | null;
    kycTier: number;
  }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        ninVerified: true,
        ninVerifiedAt: true,
        kycTier: true,
      },
    });

    if (!user) {
      throw new BadRequestException('User not found');
    }

    return {
      verified: user.ninVerified,
      verifiedAt: user.ninVerifiedAt,
      kycTier: user.kycTier,
    };
  }

  /**
   * Get KYC status for user (combines BVN and NIN status)
   */
  async getKYCStatus(userId: string): Promise<{
    kycTier: number;
    bvnVerified: boolean;
    ninVerified: boolean;
    biometricVerified: boolean;
    tierName: string;
    limits: {
      dailySendLimit: string;
      maxBalance: string;
      cumulativeLimit: string;
    };
  }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        kycTier: true,
        bvnVerified: true,
        ninVerified: true,
        biometricVerified: true,
      },
    });

    if (!user) {
      throw new BadRequestException('User not found');
    }

    // Tier limits configuration
    const tierLimits: Record<
      number,
      {
        dailySendLimit: string;
        maxBalance: string;
        cumulativeLimit: string;
        tierName: string;
      }
    > = {
      1: {
        dailySendLimit: '30000',
        maxBalance: '300000',
        cumulativeLimit: '300000',
        tierName: 'Tier 1 - Basic',
      },
      2: {
        dailySendLimit: '200000',
        maxBalance: '500000',
        cumulativeLimit: '5000000',
        tierName: 'Tier 2 - Verified',
      },
      3: {
        dailySendLimit: '5000000',
        maxBalance: '10000000',
        cumulativeLimit: '50000000',
        tierName: 'Tier 3 - Premium',
      },
    };

    const tierInfo = tierLimits[user.kycTier] || tierLimits[1];

    return {
      kycTier: user.kycTier,
      bvnVerified: user.bvnVerified,
      ninVerified: user.ninVerified,
      biometricVerified: user.biometricVerified,
      tierName: tierInfo.tierName,
      limits: {
        dailySendLimit: tierInfo.dailySendLimit,
        maxBalance: tierInfo.maxBalance,
        cumulativeLimit: tierInfo.cumulativeLimit,
      },
    };
  }
}
