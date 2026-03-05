import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma.service';
import { CoinGeckoService } from './coingecko.service';
import { BlockchainMonitorService, VerifiedTransaction } from './blockchain-monitor.service';
import Decimal from 'decimal.js';

// Pending deposits older than this are marked failed (no matching on-chain tx found)
const EXPIRY_MINUTES = 120;

@Injectable()
export class DepositMonitorCron {
  private readonly logger = new Logger(DepositMonitorCron.name);
  private isRunning = false;

  constructor(
    private prisma: PrismaService,
    private coinGecko: CoinGeckoService,
    private blockchain: BlockchainMonitorService,
  ) {}

  /**
   * Runs every 3 minutes. For each pending deposit:
   *  1. If tx hash exists → verify directly on-chain
   *  2. If no tx hash → scan business wallet for matching amount
   *  3. If verified → auto-credit NGN to user
   *  4. If expired (2 hours, no match) → mark as failed
   */
  @Cron('*/3 * * * *') // every 3 minutes
  async checkPendingDeposits() {
    if (this.isRunning) return;
    this.isRunning = true;

    try {
      const pending = await this.prisma.cryptoDepositTransaction.findMany({
        where: { status: 'pending' },
        include: { deposit: true },
        orderBy: { createdAt: 'asc' },
        take: 20,
      });

      if (pending.length === 0) {
        this.isRunning = false;
        return;
      }

      this.logger.log(`Checking ${pending.length} pending deposits...`);

      for (const tx of pending) {
        try {
          await this.processDeposit(tx);
        } catch (err) {
          this.logger.error(
            `Error processing deposit ${tx.id}: ${(err as Error).message}`,
          );
        }
      }
    } finally {
      this.isRunning = false;
    }
  }

  private async processDeposit(tx: any) {
    const metadata = (tx.metadata || {}) as Record<string, any>;
    const txHash = metadata.txHash as string | null;
    const asset = tx.asset;
    const network = tx.network;
    const expectedAmount = new Decimal(tx.cryptoAmount.toString());

    let verified: VerifiedTransaction | null = null;

    // Strategy 1: Direct tx hash verification
    if (txHash && txHash !== 'null' && !txHash.startsWith('manual_')) {
      verified = await this.blockchain.verifyByTxHash(
        txHash,
        asset,
        network,
        expectedAmount,
      );

      if (verified.found) {
        this.logger.log(
          `TX hash verified: ${txHash} — ${verified.amount} ${asset} (${verified.confirmations} confs)`,
        );
      }
    }

    // Strategy 2: Scan wallet for matching deposit
    if (!verified?.found) {
      const sinceTimestamp = new Date(tx.createdAt).getTime() - 5 * 60_000;
      const walletTxs = await this.blockchain.scanWalletForDeposits(
        asset,
        network,
        sinceTimestamp,
      );

      // Find a tx that matches the expected amount and hasn't been claimed
      for (const wtx of walletTxs) {
        if (!this.amountClose(wtx.amount, expectedAmount)) continue;

        // Check this tx hash hasn't been used for another deposit
        const alreadyClaimed = await this.prisma.cryptoDepositTransaction.findFirst({
          where: {
            providerTxId: wtx.txHash,
            status: { in: ['confirmed', 'confirming'] },
          },
        });

        if (alreadyClaimed) continue;

        verified = wtx;
        this.logger.log(
          `Wallet scan match: ${wtx.txHash} — ${wtx.amount} ${asset}`,
        );
        break;
      }
    }

    // Result: verified and confirmed → auto-credit
    if (verified?.found && verified.confirmed) {
      await this.creditDeposit(tx, verified);
      return;
    }

    // Result: verified but not enough confirmations → update status
    if (verified?.found && !verified.confirmed) {
      await this.prisma.cryptoDepositTransaction.update({
        where: { id: tx.id },
        data: {
          status: 'confirming',
          confirmations: verified.confirmations,
          providerTxId: verified.txHash,
          metadata: {
            ...metadata,
            txHash: verified.txHash,
            lastChecked: new Date().toISOString(),
            onChainAmount: verified.amount.toString(),
          },
        },
      });
      this.logger.log(
        `Deposit ${tx.id}: ${verified.confirmations} confirmations (need more)`,
      );
      return;
    }

    // Result: not found — check if expired
    const ageMinutes =
      (Date.now() - new Date(tx.createdAt).getTime()) / 60_000;

    if (ageMinutes > EXPIRY_MINUTES) {
      await this.prisma.cryptoDepositTransaction.update({
        where: { id: tx.id },
        data: {
          status: 'failed',
          metadata: {
            ...metadata,
            failReason: 'No matching transaction found on blockchain within 2 hours',
            expiredAt: new Date().toISOString(),
          },
        },
      });

      await this.prisma.auditLog.create({
        data: {
          action: 'CRYPTO_DEPOSIT_EXPIRED',
          userId: tx.userId,
          actorType: 'system',
          metadata: {
            txId: tx.id,
            asset,
            network,
            expectedAmount: expectedAmount.toString(),
          },
        },
      });

      this.logger.warn(`Deposit ${tx.id} expired — no on-chain match found`);
    }
  }

  /**
   * Credit the user's NGN balance after on-chain verification.
   */
  private async creditDeposit(tx: any, verified: VerifiedTransaction) {
    const metadata = (tx.metadata || {}) as Record<string, any>;

    // Calculate NGN amount from actual on-chain amount
    const { ngnAmount, rate } = await this.coinGecko.calculateNgnAmount(
      verified.amount,
      verified.asset,
    );

    await this.prisma.$transaction(async (prisma) => {
      // Credit NGN balance
      const balance = await prisma.balance.findUnique({
        where: { userId_currency: { userId: tx.userId, currency: 'NGN' } },
      });

      const before = balance
        ? new Decimal(balance.amount.toString())
        : new Decimal(0);
      const after = before.add(ngnAmount);

      await prisma.balance.upsert({
        where: { userId_currency: { userId: tx.userId, currency: 'NGN' } },
        create: {
          userId: tx.userId,
          currency: 'NGN',
          amount: ngnAmount.toNumber(),
          lastUpdatedBy: 'blockchain_monitor',
        },
        update: {
          amount: after.toNumber(),
          lastUpdatedBy: 'blockchain_monitor',
        },
      });

      // Update deposit tx as confirmed
      await prisma.cryptoDepositTransaction.update({
        where: { id: tx.id },
        data: {
          status: 'confirmed',
          confirmations: verified.confirmations,
          exchangeRate: rate.toNumber(),
          ngnAmount: ngnAmount.toNumber(),
          creditedAt: new Date(),
          providerTxId: verified.txHash,
          metadata: {
            ...metadata,
            txHash: verified.txHash,
            onChainAmount: verified.amount.toString(),
            onChainFrom: verified.from,
            verifiedAt: new Date().toISOString(),
            verifiedBy: 'blockchain_monitor',
          },
        },
      });

      // Create transaction record
      await prisma.transaction.create({
        data: {
          receiverId: tx.userId,
          amount: ngnAmount.toNumber(),
          currency: 'NGN',
          type: 'crypto_deposit',
          status: 'SUCCESS',
          idempotencyKey: `crypto_${verified.txHash}`,
          providerTxId: verified.txHash,
          beforeBalance: before.toNumber(),
          afterBalance: after.toNumber(),
          reference: `CRYPTO-${verified.txHash.substring(0, 12)}`,
          externalReference: verified.asset,
          metadata: {
            cryptoAmount: verified.amount.toString(),
            cryptoCurrency: verified.asset,
            network: verified.network,
            exchangeRate: rate.toString(),
            confirmations: verified.confirmations,
            verifiedBy: 'blockchain_monitor',
          },
        },
      });

      // Audit log
      await prisma.auditLog.create({
        data: {
          action: 'CRYPTO_DEPOSIT_AUTO_CREDITED',
          userId: tx.userId,
          actorType: 'system',
          metadata: {
            txId: tx.id,
            txHash: verified.txHash,
            cryptoAmount: verified.amount.toString(),
            ngnAmount: ngnAmount.toString(),
            exchangeRate: rate.toString(),
            confirmations: verified.confirmations,
          },
        },
      });
    });

    this.logger.log(
      `AUTO-CREDITED: ${verified.amount} ${verified.asset} → ₦${ngnAmount.toFixed(2)} for user ${tx.userId}`,
    );
  }

  private amountClose(actual: Decimal, expected: Decimal): boolean {
    if (expected.isZero()) return actual.greaterThan(0);
    const diff = actual.sub(expected).abs();
    const tolerance = expected.mul(0.05);
    return diff.lessThanOrEqualTo(tolerance);
  }
}
