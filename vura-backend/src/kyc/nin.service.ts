import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { QoreIDService } from './qoreid.service';

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
  constructor(
    private prisma: PrismaService,
    private qoreIdService: QoreIDService,
  ) {}

  /**
   * Verify NIN using QoreID
   * Returns verified user information with AML screening
   */
  async verifyNIN(userId: string, nin: string): Promise<NINVerificationResult> {
    // Validate NIN format (11 digits)
    if (!/^\d{11}$/.test(nin)) {
      throw new BadRequestException('Invalid NIN format. Must be 11 digits.');
    }

    // Check if NIN already used
    const ninHash = this.qoreIdService.hashIDNumber(nin);
    const existing = await this.prisma.user.findFirst({
      where: { ninHash },
    });

    if (existing && existing.id !== userId) {
      throw new BadRequestException(
        'NIN already registered to another account',
      );
    }

    // Verify NIN with QoreID
    const verificationResult = await this.qoreIdService.verifyNIN(nin);

    if (!verificationResult.success) {
      throw new BadRequestException(
        'NIN verification failed. Please check and try again.',
      );
    }

    // Check if manual review is required based on AML screening
    const requiresReview = this.qoreIdService.requiresManualReview({
      aml_status: verificationResult.amlStatus,
      pep_status: verificationResult.pepStatus,
      sanction_status: 'clear',
      adverse_media_status: 'clear',
      risk_level: verificationResult.riskLevel,
      risk_reasons: verificationResult.riskReasons,
    });

    // Determine KYC tier based on risk level
    // Low risk: Tier 2
    // Medium/High risk: Tier 1 (manual review required before upgrade)
    const newKycTier = requiresReview ? 1 : 2;

    // Update user with verified NIN
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        ninHash,
        ninVerified: !requiresReview, // Only mark as verified if no manual review needed
        ninVerifiedAt: !requiresReview ? new Date() : null,
        kycTier: newKycTier,
        fraudScore: verificationResult.riskLevel === 'high' ? 75 : 10,
      },
    });

    // Log the verification
    await this.prisma.auditLog.create({
      data: {
        action: 'NIN_VERIFICATION_ATTEMPTED',
        userId,
        actorType: 'user',
        metadata: {
          kycTier: newKycTier,
          verified: !requiresReview,
          riskLevel: verificationResult.riskLevel,
          amlStatus: verificationResult.amlStatus,
          requiresManualReview: requiresReview,
          verificationTime: new Date().toISOString(),
          last4: nin.slice(-4),
        },
      },
    });

    if (requiresReview) {
      throw new BadRequestException(
        `NIN verification flagged for manual review. Risk level: ${verificationResult.riskLevel}. Our team will contact you within 24 hours.`,
      );
    }

    return {
      success: true,
      firstName: verificationResult.firstName,
      lastName: verificationResult.lastName,
      middleName: verificationResult.middleName,
      dateOfBirth: verificationResult.dateOfBirth,
      gender: verificationResult.gender,
      phoneNumber: verificationResult.phoneNumber,
    };
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
