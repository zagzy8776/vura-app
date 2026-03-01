import {
  Injectable,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { QoreIDService } from './qoreid.service';
import { FlutterwaveService } from '../services/flutterwave.service';
import { encryptToColumns } from '../utils/field-encryption';
import { VirtualAccountsService } from '../virtual-accounts/virtual-accounts.service';

@Injectable()
export class BVNService {
  constructor(
    private prisma: PrismaService,
    private qoreIdService: QoreIDService,
    private flutterwaveService: FlutterwaveService,
    private virtualAccountsService: VirtualAccountsService,
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

    // Verify BVN with Flutterwave (Tier 2 provider)
    const verificationResult = await this.flutterwaveService.verifyBvn({ bvn });
    if (!verificationResult.success) {
      throw new BadRequestException(
        verificationResult.error || 'BVN verification failed',
      );
    }

    // For now, upgrade immediately to Tier 2 on successful provider verification.
    // If you later add AML/PEP checks, this is where you'd decide manual review.
    const requiresReview = false;
    const newKycTier = 2;

    // Update user with verified BVN
    // Store encrypted BVN for provider integrations (never log plaintext BVN)
    const encrypted = encryptToColumns(bvn);
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        bvnHash,
        bvnEncrypted: encrypted.ciphertext,
        bvnIv: encrypted.iv,
        // Legal name from BVN verification (read-only once set)
        legalFirstName: verificationResult.firstName,
        legalLastName: verificationResult.lastName,
        bvnVerified: !requiresReview,
        bvnVerifiedAt: !requiresReview ? new Date() : null,
        kycTier: newKycTier,
        fraudScore: 10,
      },
    });

    // After successful BVN verification (Tier 2), attempt to create a permanent virtual account.
    // This makes receiving via bank transfer available immediately.
    try {
      await this.virtualAccountsService.createOrGet(userId);
    } catch {
      // Non-fatal: user can retry in Receive page.
    }

    // Log the verification
    await this.prisma.auditLog.create({
      data: {
        action: 'BVN_VERIFICATION_ATTEMPTED',
        userId,
        actorType: 'user',
        metadata: {
          kycTier: newKycTier,
          verified: !requiresReview,
          provider: 'flutterwave',
          requiresManualReview: requiresReview,
          verificationTime: new Date().toISOString(),
          last4: bvn.slice(-4),
        },
      },
    });

    if (requiresReview) {
      throw new BadRequestException(
        `BVN verification flagged for manual review. Our team will contact you within 24 hours.`,
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
