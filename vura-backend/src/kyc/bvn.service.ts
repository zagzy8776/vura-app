import {
  Injectable,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { QoreIDService } from './qoreid.service';

@Injectable()
export class BVNService {
  constructor(
    private prisma: PrismaService,
    private qoreIdService: QoreIDService,
  ) {}

  /**
   * Verify BVN using QoreID
   * Returns verified user information with AML screening
   */
  async verifyBVN(
    userId: string,
    bvn: string,
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
    const bvnHash = this.qoreIdService.hashIDNumber(bvn);
    const existing = await this.prisma.user.findFirst({
      where: { bvnHash },
    });

    if (existing && existing.id !== userId) {
      throw new ConflictException('BVN already registered to another account');
    }

    // Verify BVN with QoreID
    const verificationResult = await this.qoreIdService.verifyBVN(bvn);

    if (!verificationResult.success) {
      throw new BadRequestException('BVN verification failed');
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

    // Update user with verified BVN
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        bvnHash,
        bvnVerified: !requiresReview,
        bvnVerifiedAt: !requiresReview ? new Date() : null,
        kycTier: newKycTier,
        fraudScore: verificationResult.riskLevel === 'high' ? 75 : 10,
      },
    });

    // Log the verification
    await this.prisma.auditLog.create({
      data: {
        action: 'BVN_VERIFICATION_ATTEMPTED',
        userId,
        actorType: 'user',
        metadata: {
          kycTier: newKycTier,
          verified: !requiresReview,
          riskLevel: verificationResult.riskLevel,
          amlStatus: verificationResult.amlStatus,
          requiresManualReview: requiresReview,
          verificationTime: new Date().toISOString(),
          last4: bvn.slice(-4),
        },
      },
    });

    if (requiresReview) {
      throw new BadRequestException(
        `BVN verification flagged for manual review. Risk level: ${verificationResult.riskLevel}. Our team will contact you within 24 hours.`,
      );
    }

    return {
      success: true,
      firstName: verificationResult.firstName,
      lastName: verificationResult.lastName,
      kycTier: newKycTier,
    };
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
