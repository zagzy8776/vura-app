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
    const bvnHash = this.qoreIdService.hashIDNumber(bvn);
    const existing = await this.prisma.user.findFirst({
      where: { bvnHash },
    });

    if (existing && existing.id !== userId) {
      throw new ConflictException('BVN already registered to another account');
    }

    // Flutterwave BVN is a 2-step consent flow:
    // 1) initiate consent -> returns url + reference
    // 2) after user completes consent -> retrieve by reference -> COMPLETED + names + BVN
    if (!firstName || !lastName) {
      throw new BadRequestException(
        'First name and last name are required for BVN consent verification',
      );
    }

    const redirectUrl = 'https://vura-app.vercel.app/kyc/bvn-callback';
    const initiation = await this.flutterwaveService.initiateBvnConsent({
      bvn,
      firstName,
      lastName,
      redirectUrl,
    });
    if (!initiation.success) {
      throw new BadRequestException(initiation.error || 'BVN consent failed');
    }

    // Persist pending consent details so user can resume later
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        // Prisma client is generated already, but TS language server may lag; keep this explicit.
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        bvnConsentReference: initiation.reference,
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        bvnConsentUrl: initiation.url,
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        bvnConsentStatus: 'PENDING_CONSENT',
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        bvnConsentInitiatedAt: new Date(),
      },
    });

    // Return a response to frontend so it can redirect user to Flutterwave consent page
    return {
      success: true,
      firstName,
      lastName,
      kycTier: 1,
    };
  }

  /**
   * Complete BVN verification after user consent.
   */
  async completeBvnConsent(userId: string, reference: string) {
    if (!reference) {
      throw new BadRequestException('Reference is required');
    }

    const info = await this.flutterwaveService.retrieveBvnInformation({
      reference,
    });
    if (!info.success) {
      throw new BadRequestException(
        info.error || 'Failed to retrieve BVN info',
      );
    }

    if (String(info.status).toUpperCase() !== 'COMPLETED') {
      throw new BadRequestException(
        `BVN consent not completed yet (status: ${info.status})`,
      );
    }
    if (!info.bvn || !info.firstName || !info.lastName) {
      throw new BadRequestException('Incomplete BVN details returned');
    }

    // Check if BVN already used
    const bvnHash = this.qoreIdService.hashIDNumber(info.bvn);
    const existing = await this.prisma.user.findFirst({
      where: { bvnHash },
    });
    if (existing && existing.id !== userId) {
      throw new ConflictException('BVN already registered to another account');
    }

    const encrypted = encryptToColumns(info.bvn);

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        bvnHash,
        bvnEncrypted: encrypted.ciphertext,
        bvnIv: encrypted.iv,
        legalFirstName: info.firstName,
        legalLastName: info.lastName,
        bvnVerified: true,
        bvnVerifiedAt: new Date(),
        kycTier: 2,
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        bvnConsentReference: reference,
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        bvnConsentStatus: 'COMPLETED',
      },
    });

    try {
      await this.virtualAccountsService.createOrGet(userId);
    } catch {
      // Non-fatal
    }

    await this.prisma.auditLog.create({
      data: {
        action: 'BVN_VERIFIED',
        userId,
        actorType: 'user',
        metadata: {
          kycTier: 2,
          provider: 'flutterwave',
          reference,
          last4: info.bvn.slice(-4),
        },
      },
    });

    return {
      success: true,
      firstName: info.firstName,
      lastName: info.lastName,
      kycTier: 2,
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
