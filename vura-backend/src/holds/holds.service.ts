import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import Decimal from 'decimal.js';

@Injectable()
export class HoldsService {
  constructor(private prisma: PrismaService) {}

  private readonly FLAG_THRESHOLD = new Decimal(100000); // ₦100k
  private readonly HOLD_DAYS = 16;

  /**
   * Check if transaction should be flagged and held
   * Auto-flags transactions >₦100k from new users (< 30 days)
   */
  async shouldFlagTransaction(
    senderId: string,
    amount: Decimal,
    senderKycTier: number,
  ): Promise<{ shouldFlag: boolean; reason?: string }> {
    // Check amount threshold
    if (amount.lessThan(this.FLAG_THRESHOLD)) {
      return { shouldFlag: false };
    }

    // Get sender details
    const sender = await this.prisma.user.findUnique({
      where: { id: senderId },
      include: {
        sentTransactions: {
          where: { status: 'SUCCESS' },
          take: 1,
        },
      },
    });

    if (!sender) {
      return { shouldFlag: false };
    }

    // Flag if new user (no successful transactions yet)
    if (sender.sentTransactions.length === 0) {
      return {
        shouldFlag: true,
        reason: 'First-time sender with large amount',
      };
    }

    // Flag if low KYC tier with large amount
    if (senderKycTier === 1 && amount.greaterThan(50000)) {
      return {
        shouldFlag: true,
        reason: 'Tier 1 user exceeding recommended limit',
      };
    }

    // Check account age (flag if < 30 days old)
    const accountAge = Date.now() - sender.createdAt.getTime();
    const thirtyDays = 30 * 24 * 60 * 60 * 1000;
    
    if (accountAge < thirtyDays && amount.greaterThan(50000)) {
      return {
        shouldFlag: true,
        reason: 'New account (under 30 days) with large transaction',
      };
    }

    return { shouldFlag: false };
  }

  /**
   * Calculate hold expiration date (16 days from now)
   */
  calculateHoldExpiry(): Date {
    const expiry = new Date();
    expiry.setDate(expiry.getDate() + this.HOLD_DAYS);
    return expiry;
  }

  /**
   * Apply hold to a transaction
   */
  async applyHold(transactionId: string, reason: string): Promise<void> {
    await this.prisma.transaction.update({
      where: { id: transactionId },
      data: {
        isFlagged: true,
        flagReason: reason,
        heldUntil: this.calculateHoldExpiry(),
        status: 'HELD',
      },
    });
  }

  /**
   * Release a held transaction (admin only)
   */
  async releaseHold(transactionId: string, adminId: string): Promise<void> {
    const transaction = await this.prisma.transaction.findUnique({
      where: { id: transactionId },
    });

    if (!transaction) {
      throw new NotFoundException('Transaction not found');
    }

    if (!transaction.isFlagged || !transaction.heldUntil) {
      throw new BadRequestException('Transaction is not on hold');
    }

    // Update transaction status
    await this.prisma.transaction.update({
      where: { id: transactionId },
      data: {
        isFlagged: false,
        heldUntil: null,
        status: 'SUCCESS',
        metadata: {
          ...((transaction.metadata as object) || {}),
          holdReleasedAt: new Date().toISOString(),
          holdReleasedBy: adminId,
        },
      },
    });

    // Log the release
    await this.prisma.auditLog.create({
      data: {
        action: 'HOLD_RELEASED',
        userId: transaction.senderId,
        actorType: 'admin',
        actorId: adminId,
        metadata: {
          transactionId,
          amount: transaction.amount.toString(),
          originalReason: transaction.flagReason,
        },
      },
    });
  }

  /**
   * Get all held transactions (for admin review)
   */
  async getHeldTransactions(): Promise<any[]> {
    const held = await this.prisma.transaction.findMany({
      where: {
        isFlagged: true,
        heldUntil: { not: null },
      },
      orderBy: { createdAt: 'desc' },
      include: {
        sender: {
          select: {
            vuraTag: true,
            kycTier: true,
            createdAt: true,
          },
        },
        receiver: {
          select: {
            vuraTag: true,
          },
        },
      },
    });

    return held.map((tx) => ({
      id: tx.id,
      amount: tx.amount.toString(),
      currency: tx.currency,
      sender: tx.sender?.vuraTag,
      receiver: tx.receiver?.vuraTag,
      reason: tx.flagReason,
      heldUntil: tx.heldUntil,
      createdAt: tx.createdAt,
      daysRemaining: tx.heldUntil 
        ? Math.ceil((tx.heldUntil.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
        : 0,
    }));
  }

  /**
   * Check if held funds can be released (16 days passed)
   */
  async checkAutoRelease(): Promise<number> {
    const now = new Date();
    
    const eligible = await this.prisma.transaction.findMany({
      where: {
        isFlagged: true,
        heldUntil: { lte: now },
        status: 'HELD',
      },
    });

    // Auto-release all eligible
    for (const tx of eligible) {
      await this.prisma.transaction.update({
        where: { id: tx.id },
        data: {
          isFlagged: false,
          heldUntil: null,
          status: 'SUCCESS',
          metadata: {
            ...((tx.metadata as object) || {}),
            autoReleasedAt: now.toISOString(),
            autoReleaseReason: '16-day hold period completed',
          },
        },
      });
    }

    return eligible.length;
  }

  /**
   * Prevent spending held funds
   */
  async checkHeldFunds(userId: string, amount: Decimal): Promise<void> {
    const heldFunds = await this.prisma.transaction.aggregate({
      where: {
        senderId: userId,
        isFlagged: true,
        status: 'HELD',
      },
      _sum: { amount: true },
    });

    const totalHeld = new Decimal(heldFunds._sum.amount || 0);
    
    // Get available balance
    const balance = await this.prisma.balance.findUnique({
      where: { userId_currency: { userId, currency: 'NGN' } },
    });

    const available = new Decimal(balance?.amount || 0).minus(totalHeld);

    if (available.lessThan(amount)) {
      throw new BadRequestException(
        `Insufficient available balance. ` +
        `₦${totalHeld.toFixed(2)} is currently held. ` +
        `Available: ₦${available.toFixed(2)}`
      );
    }
  }
}
