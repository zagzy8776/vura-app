import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  BadRequestException,
  Logger,
  Headers,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { ConfigService } from '@nestjs/config';
import Decimal from 'decimal.js';
import { v4 as uuid } from 'uuid';

@Controller('admin')
export class AdminController {
  private readonly logger = new Logger(AdminController.name);
  private readonly adminSecret: string;

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {
    const raw = this.config.get('ADMIN_SECRET', 'change-me-in-production') || '';
    this.adminSecret = (typeof raw === 'string' ? raw : String(raw)).trim();
  }

  private checkAdmin(authHeader?: string) {
    const token = (authHeader || '').replace(/^Bearer\s+/i, '').trim();
    if (!token || token !== this.adminSecret) {
      this.logger.warn('Admin auth failed: token length ' + (token?.length ?? 0) + ', expected length ' + this.adminSecret.length);
      throw new BadRequestException('Unauthorized');
    }
  }

  /**
   * Manually credit a user's wallet (admin only)
   */
  @Post('credit')
  async creditUser(
    @Headers('authorization') authHeader: string,
    @Body() body: { userId?: string; vuraTag?: string; amount: number; reason: string; currency?: string },
  ) {
    this.checkAdmin(authHeader);

    const { amount, reason, currency = 'NGN' } = body;

    if (!amount || amount <= 0 || amount > 50000000) {
      throw new BadRequestException('Amount must be between ₦1 and ₦50,000,000');
    }

    if (!reason) {
      throw new BadRequestException('Reason is required');
    }

    let userId = body.userId;
    if (!userId && body.vuraTag) {
      const user = await this.prisma.user.findFirst({
        where: { vuraTag: body.vuraTag },
        select: { id: true },
      });
      if (!user) throw new BadRequestException('User not found with that vuraTag');
      userId = user.id;
    }

    if (!userId) {
      throw new BadRequestException('Provide userId or vuraTag');
    }

    const reference = `ADMIN-CREDIT-${uuid()}`;
    const creditAmount = new Decimal(amount);

    const result = await this.prisma.$transaction(async (prisma) => {
      const balance = await prisma.balance.findUnique({
        where: { userId_currency: { userId, currency } },
      });

      const before = new Decimal(balance?.amount?.toString() ?? '0');
      const after = before.add(creditAmount);

      await prisma.balance.upsert({
        where: { userId_currency: { userId, currency } },
        create: { userId, currency, amount: after.toNumber(), lastUpdatedBy: 'admin_credit' },
        update: { amount: after.toNumber(), lastUpdatedBy: 'admin_credit' },
      });

      const transaction = await prisma.transaction.create({
        data: {
          receiverId: userId,
          amount: creditAmount.toNumber(),
          currency,
          type: 'deposit',
          status: 'SUCCESS',
          idempotencyKey: reference,
          reference,
          beforeBalance: before.toNumber(),
          afterBalance: after.toNumber(),
          metadata: { method: 'admin_credit', reason },
        },
      });

      return { transaction, before, after };
    });

    await this.prisma.auditLog.create({
      data: {
        action: 'ADMIN_CREDIT',
        userId,
        actorType: 'admin',
        metadata: {
          reference,
          amount: creditAmount.toString(),
          currency,
          reason,
          before: result.before.toString(),
          after: result.after.toString(),
        },
      },
    });

    this.logger.log(`Admin credited ₦${amount} to ${userId}: ${reason}`);

    return {
      success: true,
      message: `₦${amount.toLocaleString()} credited to user`,
      data: {
        reference,
        userId,
        amount,
        balanceBefore: result.before.toFixed(2),
        balanceAfter: result.after.toFixed(2),
      },
    };
  }

  /**
   * No-auth check: returns expected secret length so admin can verify they're hitting the right backend and typing the right length.
   */
  @Get('check')
  async check() {
    return { secretLength: this.adminSecret.length, message: 'Set ADMIN_SECRET on this backend (Render env) and enter it above.' };
  }

  /**
   * Get all users with their KYC status. Requires admin secret in Authorization header.
   */
  @Get('users')
  async getUsers(
    @Headers('authorization') authHeader: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '20',
    @Query('kycStatus') kycStatus?: string,
  ) {
    this.checkAdmin(authHeader);
    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 20;
    const skip = (pageNum - 1) * limitNum;

    const where: any = {};

    if (kycStatus) {
      where.kycStatus = kycStatus.toUpperCase();
    }

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: {
          id: true,
          vuraTag: true,
          legalFirstName: true,
          legalLastName: true,
          kycTier: true,
          kycStatus: true,
          bvnVerified: true,
          bvnVerifiedAt: true,
          ninVerified: true,
          ninVerifiedAt: true,
          lastLoginAt: true,
          fraudScore: true,
          reservedAccountNumber: true,
          reservedAccountBankName: true,
          flutterwaveOrderRef: true,
          idCardUrl: true,
          selfieUrl: true,
          idType: true,
          kycRejectionReason: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: limitNum,
        skip,
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      users,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum),
    };
  }

  /**
   * Get user details for admin review. Requires admin secret.
   */
  @Get('users/:id')
  async getUserDetails(
    @Headers('authorization') authHeader: string,
    @Param('id') userId: string,
  ) {
    this.checkAdmin(authHeader);
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        vuraTag: true,
        emailEncrypted: true,
        phoneEncrypted: true,
        legalFirstName: true,
        legalLastName: true,
        kycTier: true,
        kycStatus: true,
        bvnVerified: true,
        bvnVerifiedAt: true,
        ninVerified: true,
        ninVerifiedAt: true,
        reservedAccountNumber: true,
        reservedAccountBankName: true,
        flutterwaveOrderRef: true,
        flutterwaveRef: true,
        idCardUrl: true,
        selfieUrl: true,
        idType: true,
        createdAt: true,
        updatedAt: true,
        balances: true,
        cards: {
          select: {
            id: true,
            type: true,
            last4: true,
            status: true,
          },
        },
        bankAccounts: {
          select: {
            id: true,
            accountNumber: true,
            bankName: true,
            isPrimary: true,
            status: true,
          },
        },
      },
    });

    if (!user) {
      throw new BadRequestException('User not found');
    }

    return user;
  }

  /**
   * Manually set user to Tier 2 (BVN-equivalent) so they can receive money and get higher limits.
   * Use when BVN API (Korapay/Prembly) is failing but you have verified the user (e.g. offline).
   * Sets kycTier=2, bvnVerified=true, legalFirstName, legalLastName so virtual account creation works.
   */
  @Post('users/:id/set-tier-2')
  async setTier2(
    @Headers('authorization') authHeader: string,
    @Param('id') userId: string,
    @Body() body: { firstName: string; lastName: string; reason?: string },
  ) {
    this.checkAdmin(authHeader);

    const firstName = (body.firstName || '').trim();
    const lastName = (body.lastName || '').trim();
    if (!firstName || !lastName) {
      throw new BadRequestException('firstName and lastName are required (for virtual account name)');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, vuraTag: true, kycTier: true },
    });
    if (!user) throw new BadRequestException('User not found');

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        kycTier: 2,
        bvnVerified: true,
        bvnVerifiedAt: new Date(),
        legalFirstName: firstName,
        legalLastName: lastName,
        bvnConsentStatus: 'COMPLETED',
      },
    });

    await this.prisma.auditLog.create({
      data: {
        action: 'ADMIN_SET_TIER_2',
        userId,
        actorType: 'admin',
        metadata: {
          reason: body.reason || 'Manual Tier 2 (BVN API unavailable or bypass)',
          legalFirstName: firstName,
          legalLastName: lastName,
          at: new Date().toISOString(),
        },
      },
    });

    return {
      success: true,
      message: 'User set to Tier 2. They can now generate a virtual account and receive money.',
      user: { id: user.id, vuraTag: user.vuraTag, kycTier: 2 },
    };
  }

  /**
   * Verify user's KYC (Tier 3). Requires admin secret.
   */
  @Post('users/:id/verify-kyc')
  async verifyKYC(
    @Headers('authorization') authHeader: string,
    @Param('id') userId: string,
    @Body() body: { tier?: number; notes?: string; firstName?: string; lastName?: string },
  ) {
    this.checkAdmin(authHeader);
    const { tier = 3, notes, firstName, lastName } = body;

    const updateData: {
      kycTier: number;
      kycStatus: 'VERIFIED';
      kycRejectionReason: null;
      bvnVerified: boolean;
      bvnVerifiedAt: Date;
      legalFirstName?: string;
      legalLastName?: string;
    } = {
      kycTier: tier,
      kycStatus: 'VERIFIED',
      kycRejectionReason: null,
      bvnVerified: true,
      bvnVerifiedAt: new Date(),
    };
    const first = (firstName ?? '').trim();
    const last = (lastName ?? '').trim();
    if (first) updateData.legalFirstName = first;
    if (last) updateData.legalLastName = last;

    // Update user KYC status and clear any previous rejection reason.
    // Set bvnVerified so they can generate a Vura bank account on the Receive page without being sent to BVN again.
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: updateData,
    });

    // Create audit log
    await this.prisma.auditLog.create({
      data: {
        action: 'KYC_VERIFIED_BY_ADMIN',
        userId,
        actorType: 'admin',
        metadata: { tier, notes, verifiedAt: new Date().toISOString() },
      },
    });

    return {
      success: true,
      message: 'KYC verified successfully',
      user: {
        id: user.id,
        vuraTag: user.vuraTag,
        kycTier: user.kycTier,
        kycStatus: user.kycStatus,
      },
    };
  }

  /**
   * Reject user's KYC. Requires admin secret.
   */
  @Post('users/:id/reject-kyc')
  async rejectKYC(
    @Headers('authorization') authHeader: string,
    @Param('id') userId: string,
    @Body() body: { reason: string },
  ) {
    this.checkAdmin(authHeader);
    const { reason } = body;

    if (!reason) {
      throw new BadRequestException('Rejection reason is required');
    }

    // Update user KYC status and store reason so user can see it
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        kycStatus: 'REJECTED',
        kycRejectionReason: reason,
      },
    });

    // Create audit log
    await this.prisma.auditLog.create({
      data: {
        action: 'KYC_REJECTED_BY_ADMIN',
        userId,
        actorType: 'admin',
        metadata: { reason, rejectedAt: new Date().toISOString() },
      },
    });

    return {
      success: true,
      message: 'KYC rejected',
      reason,
      user: {
        id: user.id,
        vuraTag: user.vuraTag,
        kycStatus: user.kycStatus,
      },
    };
  }

  /**
   * Get KYC statistics. Requires admin secret.
   */
  @Get('stats/kyc')
  async getKYCStats(@Headers('authorization') authHeader: string) {
    this.checkAdmin(authHeader);
    const [
      totalUsers,
      tier1Users,
      tier2Users,
      tier3Users,
      pendingKYC,
      verifiedKYC,
      rejectedKYC,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { kycTier: 1 } }),
      this.prisma.user.count({ where: { kycTier: 2 } }),
      this.prisma.user.count({ where: { kycTier: 3 } }),
      this.prisma.user.count({ where: { kycStatus: 'PENDING' } }),
      this.prisma.user.count({ where: { kycStatus: 'VERIFIED' } }),
      this.prisma.user.count({ where: { kycStatus: 'REJECTED' } }),
    ]);

    return {
      totalUsers,
      tierBreakdown: {
        tier1: tier1Users,
        tier2: tier2Users,
        tier3: tier3Users,
      },
      kycStatusBreakdown: {
        pending: pendingKYC,
        verified: verifiedKYC,
        rejected: rejectedKYC,
      },
    };
  }
}
