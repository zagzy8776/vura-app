import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import * as crypto from 'crypto';

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
   * Hash NIN for storage (SHA-256)
   */
  private hashNIN(nin: string): string {
    return crypto.createHash('sha256').update(nin).digest('hex');
  }

  /**
   * Verify NIN using mock provider
   * In production, replace with real NIN verification API (NIMC, VerifyMe, etc.)
   */
  async verifyNIN(userId: string, nin: string): Promise<NINVerificationResult> {
    // Validate NIN format (11 digits)
    if (!/^\d{11}$/.test(nin)) {
      throw new BadRequestException('Invalid NIN format. Must be 11 digits.');
    }

    // Check if NIN already used
    const ninHash = this.hashNIN(nin);
    const existing = await this.prisma.user.findFirst({
      where: { ninHash },
    });

    if (existing && existing.id !== userId) {
      throw new BadRequestException('NIN already registered to another account');
    }

    // TODO: Integrate with real NIN verification API (NIMC, VerifyMe, YouVerify)
    // For production: POST https://api.nimc.gov.ng/v2/enrollment/verify_nin
    const mockResult = await this.mockNINVerification(nin);

    if (!mockResult.success) {
      throw new BadRequestException('NIN verification failed. Please check and try again.');
    }

    // Determine KYC tier upgrade
    // Tier 1: Basic (phone + tag) - already done at registration
    // Tier 2: NIN verified - upgrade here
    const newKycTier = 2;

    // Update user with verified NIN
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        ninHash,
        ninVerified: true,
        ninVerifiedAt: new Date(),
        kycTier: newKycTier,
      },
    });

    // Log the verification
    await this.prisma.auditLog.create({
      data: {
        action: 'NIN_VERIFIED',
        userId,
        actorType: 'user',
        metadata: {
          kycTier: newKycTier,
          verifiedAt: new Date().toISOString(),
          last4: nin.slice(-4),
        },
      },
    });

    return {
      success: true,
      firstName: mockResult.firstName,
      lastName: mockResult.lastName,
      middleName: mockResult.middleName,
      dateOfBirth: mockResult.dateOfBirth,
      gender: mockResult.gender,
      phoneNumber: mockResult.phoneNumber,
    };
  }

  /**
   * Mock NIN verification for development/testing
   * Replace with real API call in production
   */
  private async mockNINVerification(nin: string): Promise<NINVerificationResult> {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 500));

    // Mock response based on NIN number pattern
    // In production, this would call the NIMC API
    return {
      success: true,
      firstName: 'John',
      lastName: 'Doe',
      middleName: 'Michael',
      dateOfBirth: '1990-01-15',
      gender: 'Male',
      phoneNumber: '08012345678',
      nin: nin,
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
    const tierLimits: Record<number, { dailySendLimit: string; maxBalance: string; cumulativeLimit: string; tierName: string }> = {
      1: { dailySendLimit: '30000', maxBalance: '300000', cumulativeLimit: '300000', tierName: 'Tier 1 - Basic' },
      2: { dailySendLimit: '200000', maxBalance: '500000', cumulativeLimit: '5000000', tierName: 'Tier 2 - Verified' },
      3: { dailySendLimit: '5000000', maxBalance: '10000000', cumulativeLimit: '50000000', tierName: 'Tier 3 - Premium' },
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
