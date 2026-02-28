import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import Decimal from 'decimal.js';

@Injectable()
export class LimitsService {
  constructor(private prisma: PrismaService) {}

  // Tier limits configuration (2026 CBN standards)
  private readonly TIER_LIMITS: Record<
    number,
    {
      dailySendLimit: Decimal;
      maxBalance: Decimal;
      requiresBiometric: boolean;
      cumulativeLimit: Decimal; // Annual cumulative limit
    }
  > = {
    1: {
      dailySendLimit: new Decimal(30000), // ₦30k (2026 CBN standard for Tier 1)
      maxBalance: new Decimal(300000), // ₦300k
      requiresBiometric: false,
      cumulativeLimit: new Decimal(300000), // ₦300k annual cumulative
    },
    2: {
      dailySendLimit: new Decimal(200000), // ₦200k
      maxBalance: new Decimal(500000), // ₦500k
      requiresBiometric: false,
      cumulativeLimit: new Decimal(5000000), // ₦5m annual cumulative
    },
    3: {
      dailySendLimit: new Decimal(5000000), // ₦5m
      maxBalance: new Decimal(10000000), // ₦10m
      requiresBiometric: true,
      cumulativeLimit: new Decimal(50000000), // ₦50m annual cumulative
    },
  };

  /**
   * Check if user can send the specified amount
   */
  async checkSendLimit(
    userId: string,
    amount: Decimal,
    currency: string = 'NGN',
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { balances: true },
    });

    if (!user) {
      throw new BadRequestException('User not found');
    }

    const tierLimits = this.TIER_LIMITS[user.kycTier];
    if (!tierLimits) {
      throw new BadRequestException('Invalid KYC tier');
    }

    // Check biometric requirement for Tier 3
    if (tierLimits.requiresBiometric && !user.biometricVerified) {
      throw new BadRequestException(
        'Biometric verification required for Tier 3 transactions',
      );
    }

    // Get today's sent amount
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const dailySent = await this.prisma.transaction.aggregate({
      where: {
        senderId: userId,
        currency,
        type: 'send',
        status: { in: ['PENDING', 'COMPLETED'] },
        createdAt: { gte: today },
      },
      _sum: { amount: true },
    });

    const totalSent = new Decimal(dailySent._sum.amount || 0);
    const newTotal = totalSent.plus(amount);

    if (newTotal.greaterThan(tierLimits.dailySendLimit)) {
      const remaining = tierLimits.dailySendLimit.minus(totalSent);
      throw new BadRequestException(
        `Daily limit exceeded. Remaining: ₦${remaining.toFixed(2)}. ` +
          `Upgrade to Tier ${user.kycTier + 1} for higher limits.`,
      );
    }
  }

  /**
   * Check if balance would exceed max allowed
   */
  async checkMaxBalance(
    userId: string,
    incomingAmount: Decimal,
    currency: string = 'NGN',
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { balances: true },
    });

    if (!user) {
      throw new BadRequestException('User not found');
    }

    const tierLimits = this.TIER_LIMITS[user.kycTier];
    if (!tierLimits) {
      throw new BadRequestException('Invalid KYC tier');
    }

    const balance = user.balances.find((b) => b.currency === currency);
    const currentBalance = new Decimal(balance?.amount || 0);
    const newBalance = currentBalance.plus(incomingAmount);

    if (newBalance.greaterThan(tierLimits.maxBalance)) {
      const maxAllowed = tierLimits.maxBalance.minus(currentBalance);
      throw new BadRequestException(
        `Maximum balance limit exceeded. You can only receive up to ₦${maxAllowed.toFixed(2)}. ` +
          `Upgrade to Tier ${user.kycTier + 1} for higher limits.`,
      );
    }
  }

  /**
   * Get user's current limits and usage
   */
  async getUserLimits(userId: string): Promise<{
    tier: number;
    dailySendLimit: string;
    maxBalance: string;
    dailySent: string;
    currentBalance: string;
    remainingDaily: string;
    requiresBiometric: boolean;
    biometricVerified: boolean;
  }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { balances: true },
    });

    if (!user) {
      throw new BadRequestException('User not found');
    }

    const tierLimits = this.TIER_LIMITS[user.kycTier];

    // Get today's sent amount
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const dailySent = await this.prisma.transaction.aggregate({
      where: {
        senderId: userId,
        currency: 'NGN',
        type: 'send',
        status: { in: ['PENDING', 'COMPLETED'] },
        createdAt: { gte: today },
      },
      _sum: { amount: true },
    });

    const ngnBalance = user.balances.find((b) => b.currency === 'NGN');
    const currentBalance = new Decimal(ngnBalance?.amount || 0);
    const sentToday = new Decimal(dailySent._sum.amount || 0);
    const remaining = tierLimits.dailySendLimit.minus(sentToday);

    return {
      tier: user.kycTier,
      dailySendLimit: tierLimits.dailySendLimit.toFixed(2),
      maxBalance: tierLimits.maxBalance.toFixed(2),
      dailySent: sentToday.toFixed(2),
      currentBalance: currentBalance.toFixed(2),
      remainingDaily: remaining.toFixed(2),
      requiresBiometric: tierLimits.requiresBiometric,
      biometricVerified: user.biometricVerified,
    };
  }
}
