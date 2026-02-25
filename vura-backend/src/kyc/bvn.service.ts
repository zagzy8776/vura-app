import { Injectable, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import * as crypto from 'crypto';

@Injectable()
export class BVNService {
  constructor(private prisma: PrismaService) {}

  /**
   * Hash BVN for storage (SHA-256)
   */
  private hashBVN(bvn: string): string {
    return crypto.createHash('sha256').update(bvn).digest('hex');
  }

  /**
   * Verify BVN (mock implementation - replace with real API)
   */
  async verifyBVN(userId: string, bvn: string): Promise<{
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
    const bvnHash = this.hashBVN(bvn);
    const existing = await this.prisma.user.findFirst({
      where: { bvnHash },
    });

    if (existing && existing.id !== userId) {
      throw new ConflictException('BVN already registered to another account');
    }

    // TODO: Integrate with real BVN verification API (VerifyMe, YouVerify)
    // For now, mock the verification
    const mockVerification = await this.mockBVNVerification(bvn);

    if (!mockVerification.success) {
      throw new BadRequestException('BVN verification failed');
    }

    // Update user with verified BVN
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        bvnHash,
        bvnVerified: true,
        bvnVerifiedAt: new Date(),
        kycTier: 2, // Upgrade to Tier 2 after BVN verification
      },
    });

    // Log the verification
    await this.prisma.auditLog.create({
      data: {
        action: 'BVN_VERIFIED',
        userId,
        actorType: 'user',
        metadata: {
          kycTier: 2,
          verifiedAt: new Date().toISOString(),
        },
      },
    });

    return {
      success: true,
      firstName: mockVerification.firstName,
      lastName: mockVerification.lastName,
      kycTier: 2,
    };
  }

  /**
   * Mock BVN verification (replace with real API)
   */
  private async mockBVNVerification(bvn: string): Promise<{
    success: boolean;
    firstName: string;
    lastName: string;
  }> {
    // In production, call VerifyMe/YouVerify API
    // Example: POST https://api.verifyme.ng/v1/bvn/verify
    return {
      success: true,
      firstName: 'John',
      lastName: 'Doe',
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
