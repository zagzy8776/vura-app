import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { PrismaService } from '../prisma.service';

@Controller('admin')
export class AdminController {
  constructor(private prisma: PrismaService) {}

  // Guard - In production, add proper admin role check
  private async checkAdmin() {
    // TODO: Add proper admin role verification
    return true;
  }

  /**
   * Get all users with their KYC status
   */
  @Get('users')
  async getUsers(
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '20',
    @Query('kycStatus') kycStatus?: string,
  ) {
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
          reservedAccountNumber: true,
          reservedAccountBankName: true,
          flutterwaveOrderRef: true,
          idCardUrl: true,
          selfieUrl: true,
          idType: true,
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
   * Get user details for admin review
   */
  @Get('users/:id')
  async getUserDetails(@Param('id') userId: string) {
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
   * Verify user's KYC (Tier 3)
   */
  @Post('users/:id/verify-kyc')
  async verifyKYC(
    @Param('id') userId: string,
    @Body() body: { tier?: number; notes?: string },
  ) {
    const { tier = 3, notes } = body;

    // Update user KYC status
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        kycTier: tier,
        kycStatus: 'VERIFIED',
      },
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
   * Reject user's KYC
   */
  @Post('users/:id/reject-kyc')
  async rejectKYC(
    @Param('id') userId: string,
    @Body() body: { reason: string },
  ) {
    const { reason } = body;

    if (!reason) {
      throw new BadRequestException('Rejection reason is required');
    }

    // Update user KYC status
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        kycStatus: 'REJECTED',
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
   * Get KYC statistics
   */
  @Get('stats/kyc')
  async getKYCStats() {
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
