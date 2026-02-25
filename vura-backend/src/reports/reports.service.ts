import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Generate daily transaction report (CSV format)
   */
  async generateDailyTransactionReport(date: Date): Promise<string> {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const transactions = await this.prisma.transaction.findMany({
      where: {
        createdAt: {
          gte: startOfDay,
          lte: endOfDay,
        },
      },
      include: {
        sender: { select: { vuraTag: true, kycTier: true } },
        receiver: { select: { vuraTag: true, kycTier: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    // CSV Header
    const headers = [
      'Date',
      'Reference',
      'Type',
      'Amount',
      'Currency',
      'Status',
      'Sender',
      'Sender KYC',
      'Receiver',
      'Receiver KYC',
      'Is Flagged',
      'Flag Reason',
    ].join(',');

    // CSV Rows
    const rows = transactions.map((tx) => [
      tx.createdAt.toISOString(),
      tx.reference,
      tx.type,
      tx.amount.toString(),
      tx.currency,
      tx.status,
      tx.sender?.vuraTag || 'N/A',
      tx.sender?.kycTier || 'N/A',
      tx.receiver?.vuraTag || 'N/A',
      tx.receiver?.kycTier || 'N/A',
      tx.isFlagged ? 'Yes' : 'No',
      tx.flagReason || '',
    ].join(','));

    return [headers, ...rows].join('\n');
  }

  /**
   * Generate weekly KYC compliance report
   */
  async generateKYCComplianceReport(): Promise<string> {
    const users = await this.prisma.user.findMany({
      select: {
        id: true,
        vuraTag: true,
        kycTier: true,
        bvnVerified: true,
        biometricVerified: true,
        createdAt: true,
        _count: {
          select: {
            sentTransactions: true,
            receivedTransactions: true,
          },
        },
      },
    });

    // CSV Header
    const headers = [
      'User ID',
      'VuraTag',
      'KYC Tier',
      'BVN Verified',
      'Biometric Verified',
      'Account Created',
      'Sent Transactions',
      'Received Transactions',
      'Compliance Status',
    ].join(',');

    // CSV Rows
    const rows = users.map((user) => {
      const complianceStatus = this.getComplianceStatus(user.kycTier, user.bvnVerified);
      
      return [
        user.id,
        user.vuraTag,
        user.kycTier,
        user.bvnVerified ? 'Yes' : 'No',
        user.biometricVerified ? 'Yes' : 'No',
        user.createdAt.toISOString(),
        user._count.sentTransactions,
        user._count.receivedTransactions,
        complianceStatus,
      ].join(',');
    });

    return [headers, ...rows].join('\n');
  }

  /**
   * Generate Suspicious Activity Report (SAR)
   */
  async generateSARReport(): Promise<string> {
    const flaggedTransactions = await this.prisma.transaction.findMany({
      where: {
        isFlagged: true,
      },
      include: {
        sender: { select: { vuraTag: true, kycTier: true, fraudScore: true } },
        receiver: { select: { vuraTag: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    // CSV Header
    const headers = [
      'Date',
      'Reference',
      'Amount',
      'Currency',
      'Sender',
      'Sender KYC',
      'Sender Fraud Score',
      'Receiver',
      'Flag Reason',
      'Held Until',
      'Status',
    ].join(',');

    // CSV Rows
    const rows = flaggedTransactions.map((tx) => [
      tx.createdAt.toISOString(),
      tx.reference,
      tx.amount.toString(),
      tx.currency,
      tx.sender?.vuraTag || 'N/A',
      tx.sender?.kycTier || 'N/A',
      tx.sender?.fraudScore || 0,
      tx.receiver?.vuraTag || 'N/A',
      tx.flagReason || '',
      tx.heldUntil?.toISOString() || 'N/A',
      tx.status,
    ].join(','));

    return [headers, ...rows].join('\n');
  }

  /**
   * Generate large transaction report (>₦1m)
   */
  async generateLargeTransactionReport(): Promise<string> {
    const largeTransactions = await this.prisma.transaction.findMany({
      where: {
        amount: {
          gte: 1000000, // ₦1 million
        },
        currency: 'NGN',
      },
      include: {
        sender: { select: { vuraTag: true, kycTier: true } },
        receiver: { select: { vuraTag: true, kycTier: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    // CSV Header
    const headers = [
      'Date',
      'Reference',
      'Amount (NGN)',
      'Sender',
      'Sender KYC',
      'Receiver',
      'Receiver KYC',
      'Status',
      'Requires Review',
    ].join(',');

    // CSV Rows
    const rows = largeTransactions.map((tx) => [
      tx.createdAt.toISOString(),
      tx.reference,
      tx.amount.toString(),
      tx.sender?.vuraTag || 'N/A',
      tx.sender?.kycTier || 'N/A',
      tx.receiver?.vuraTag || 'N/A',
      tx.receiver?.kycTier || 'N/A',
      tx.status,
      tx.amount.gte(5000000) ? 'YES - Tier 3 Required' : 'No',
    ].join(','));

    return [headers, ...rows].join('\n');
  }

  /**
   * Get compliance status based on KYC tier
   */
  private getComplianceStatus(tier: number, bvnVerified: boolean): string {
    if (tier === 1 && !bvnVerified) return 'NON_COMPLIANT - BVN Required';
    if (tier === 1) return 'COMPLIANT - Tier 1';
    if (tier === 2) return 'COMPLIANT - Tier 2';
    if (tier === 3) return 'COMPLIANT - Tier 3';
    return 'UNKNOWN';
  }

  /**
   * Get summary statistics for dashboard
   */
  async getDashboardStats(): Promise<{
    totalUsers: number;
    totalTransactions: number;
    totalVolume: string;
    flaggedTransactions: number;
    frozenAccounts: number;
    tier1Users: number;
    tier2Users: number;
    tier3Users: number;
  }> {
    const [
      totalUsers,
      totalTransactions,
      volumeAgg,
      flaggedCount,
      frozenCount,
      tierCounts,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.transaction.count(),
      this.prisma.transaction.aggregate({
        where: { status: 'SUCCESS' },
        _sum: { amount: true },
      }),
      this.prisma.transaction.count({ where: { isFlagged: true } }),
      this.prisma.user.count({
        where: {
          lockedUntil: { gt: new Date() },
        },
      }),
      this.prisma.user.groupBy({
        by: ['kycTier'],
        _count: { id: true },
      }),
    ]);

    return {
      totalUsers,
      totalTransactions,
      totalVolume: (volumeAgg._sum.amount || 0).toString(),
      flaggedTransactions: flaggedCount,
      frozenAccounts: frozenCount,
      tier1Users: tierCounts.find((t) => t.kycTier === 1)?._count.id || 0,
      tier2Users: tierCounts.find((t) => t.kycTier === 2)?._count.id || 0,
      tier3Users: tierCounts.find((t) => t.kycTier === 3)?._count.id || 0,
    };
  }
}
