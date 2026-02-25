import {
  Controller,
  Post,
  Headers,
  Body,
  BadRequestException,
  UnauthorizedException,
  Logger,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';

import { PrismaService } from '../prisma.service';
import { YellowCardService } from './yellowcard.service';
import Decimal from 'decimal.js';
import { Prisma } from '@prisma/client';

// Minimum confirmation requirements
const MIN_CONFIRMATIONS = {
  USDT: { TRC20: 19, BEP20: 15, ERC20: 12 },
  BTC: { BTC: 3 },
  ETH: { ETH: 12 },
};

// KYC Tier limits (NGN)
const TIER_LIMITS = {
  1: { daily: 50000, maxBalance: 300000 },
  2: { daily: 200000, maxBalance: 500000 },
  3: { daily: 5000000, maxBalance: 10000000 },
};

@Controller('webhooks')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  constructor(
    private prisma: PrismaService,
    private yellowcard: YellowCardService,
  ) {}

  /**
   * Handle Yellow Card deposit webhooks
   * Security: Signature verification + idempotency + atomic transactions
   */
  @Post('yellowcard')
  async handleYellowCardWebhook(
    @Body() payload: any,
    @Headers('x-yellowcard-signature') signature: string,
    @Headers('x-yellowcard-event') eventType: string,
    @Req() req: Request,
  ) {
    // 1. Verify webhook signature (prevent spoofing)
    const rawBody = JSON.stringify(payload);
    if (!this.yellowcard.verifyWebhookSignature(rawBody, signature)) {
      this.logger.error('Invalid webhook signature', {
        ip: req.ip,
        eventType,
      });
      throw new UnauthorizedException('Invalid signature');
    }

    // 2. Check idempotency (prevent replay attacks)
    const existing = await this.prisma.processedWebhook.findUnique({
      where: { providerTxId: payload.transactionId },
    });

    if (existing) {
      this.logger.warn('Duplicate webhook received', {
        providerTxId: payload.transactionId,
      });
      return { status: 'already_processed' };
    }

    // 3. Log webhook immediately (audit trail)
    await this.prisma.processedWebhook.create({
      data: {
        provider: 'yellowcard',
        providerTxId: payload.transactionId,
        eventType: eventType || 'deposit.received',
        rawPayload: payload,
        signatureValid: true,
      },
    });

    // 4. Process based on event type
    if (eventType === 'deposit.received') {
      return this.handleDepositReceived(payload, req);
    }

    if (eventType === 'deposit.confirmed') {
      return this.handleDepositConfirmed(payload, req);
    }

    return { status: 'ignored', reason: 'unknown_event_type' };
  }

  /**
   * Handle initial deposit notification
   */
  private async handleDepositReceived(payload: any, req: Request) {
    const { transactionId, userId, asset, network, amount, address } = payload;

    // Find user's deposit address
    const deposit = await this.prisma.cryptoDeposit.findFirst({
      where: { address, asset, network, status: 'active' },
      include: { user: true },
    });

    if (!deposit) {
      this.logger.error('Deposit address not found', { address, asset, network });
      throw new BadRequestException('Invalid deposit address');
    }

    // Create pending deposit transaction
    await this.prisma.cryptoDepositTransaction.create({
      data: {
        depositId: deposit.id,
        userId: deposit.userId,
        providerTxId: transactionId,
        asset,
        network,
        cryptoAmount: new Decimal(amount),
        cryptoCurrency: asset,
        exchangeRate: 0, // Will be set on confirmation
        ngnAmount: 0,
        confirmations: 0,
        minConfirmations: (MIN_CONFIRMATIONS as any)[asset]?.[network] || 12,

        status: 'pending',
        metadata: {
          blockHash: payload.blockHash,
          txHash: payload.txHash,
          fromAddress: payload.fromAddress,
        },
      },
    });

    this.logger.log(`Deposit received: ${amount} ${asset} on ${network}`, {
      userId: deposit.userId,
      transactionId,
    });

    return { status: 'pending', message: 'Awaiting confirmations' };
  }

  /**
   * Handle confirmed deposit (credit NGN balance)
   * Security: Atomic transaction + SERIALIZABLE isolation + EWS checks
   */
  private async handleDepositConfirmed(payload: any, req: Request) {
    const { transactionId, confirmations, blockHash } = payload;

    // Find the deposit transaction
    const depositTx = await this.prisma.cryptoDepositTransaction.findUnique({
      where: { providerTxId: transactionId },
      include: { user: true },
    });

    if (!depositTx) {
      throw new BadRequestException('Deposit transaction not found');
    }

    if (depositTx.status === 'confirmed') {
      return { status: 'already_confirmed' };
    }

    // Check minimum confirmations
    if (confirmations < depositTx.minConfirmations) {
      // Update confirmation count but don't credit yet
      await this.prisma.cryptoDepositTransaction.update({
        where: { id: depositTx.id },
        data: { confirmations },
      });
      return { status: 'confirming', confirmations, required: depositTx.minConfirmations };
    }

    // Run EWS checks before crediting
    const ewsCheck = await this.runEWSChecks(depositTx);
    
    if (ewsCheck.action === 'block') {
      await this.prisma.cryptoDepositTransaction.update({
        where: { id: depositTx.id },
        data: {
          status: 'flagged',
          ewsScore: ewsCheck.score,
          ewsFlags: ewsCheck.flags,
        },
      });
      
      // Alert admin
      this.logger.error('Deposit blocked by EWS', {
        transactionId,
        flags: ewsCheck.flags,
      });
      
      return { status: 'flagged', reason: 'ews_block' };
    }

    // Calculate NGN amount
    const { ngnAmount, rate } = await this.yellowcard.calculateNgnAmount(
      depositTx.cryptoAmount,
      depositTx.asset,
    );

    // Check KYC tier limits
    const tierLimit = (TIER_LIMITS as any)[depositTx.user.kycTier];

    const currentBalance = await this.getCurrentBalance(depositTx.userId);
    
    if (currentBalance.add(ngnAmount).greaterThan(tierLimit.maxBalance)) {
      await this.prisma.cryptoDepositTransaction.update({
        where: { id: depositTx.id },
        data: {
          status: 'flagged',
          ewsFlags: ['tier_limit_exceeded'],
        },
      });
      
      throw new BadRequestException('Deposit would exceed KYC tier limit');
    }

    // ATOMIC TRANSACTION: Credit NGN balance
    // SERIALIZABLE isolation prevents race conditions
    const result = await this.prisma.$transaction(async (tx) => {
      // 1. Get current balance with lock
      const balance = await tx.balance.findUnique({
        where: {
          userId_currency: {
            userId: depositTx.userId,
            currency: 'NGN',
          },
        },
      });

      const beforeBalance = balance ? new Decimal(balance.amount.toString()) : new Decimal(0);
      const afterBalance = beforeBalance.add(ngnAmount);

      // 2. Update or create balance
      await tx.balance.upsert({
        where: {
          userId_currency: {
            userId: depositTx.userId,
            currency: 'NGN',
          },
        },
        create: {
          userId: depositTx.userId,
          currency: 'NGN',
          amount: ngnAmount.toNumber(),
          lastUpdatedBy: 'crypto_deposit',
        },
        update: {
          amount: afterBalance.toNumber(),
          lastUpdatedBy: 'crypto_deposit',
        },
      });

      // 3. Update deposit transaction
      const updated = await tx.cryptoDepositTransaction.update({
        where: { id: depositTx.id },
        data: {
          status: ewsCheck.action === 'delay' ? 'flagged' : 'confirmed',
          confirmations,
          exchangeRate: rate.toNumber(),
          ngnAmount: ngnAmount.toNumber(),
          creditedAt: new Date(),
          ewsScore: ewsCheck.score,
          ewsFlags: ewsCheck.flags,
          holdUntil: ewsCheck.holdUntil,
          metadata: {
            ...depositTx.metadata as object,
            creditedBlockHash: blockHash,
            ewsAction: ewsCheck.action,
          },
        },
      });

      // 4. Create main transaction record
      await tx.transaction.create({
        data: {
          receiverId: depositTx.userId,
          amount: ngnAmount.toNumber(),
          currency: 'NGN',
          type: 'crypto_deposit',
          status: 'SUCCESS',
          idempotencyKey: `crypto_${transactionId}`,
          providerTxId: transactionId,
          beforeBalance: beforeBalance.toNumber(),
          afterBalance: afterBalance.toNumber(),
          reference: `CRYPTO-${transactionId}`,
          externalReference: depositTx.asset,
          metadata: {
            cryptoAmount: depositTx.cryptoAmount.toString(),
            cryptoCurrency: depositTx.asset,
            network: depositTx.network,
            exchangeRate: rate.toString(),
            confirmations,
          },
        },
      });

      // 5. Create audit log
      await tx.auditLog.create({
        data: {
          action: 'CRYPTO_DEPOSIT_CREDITED',
          userId: depositTx.userId,
          actorType: 'system',
          metadata: {
            transactionId,
            cryptoAmount: depositTx.cryptoAmount.toString(),
            ngnAmount: ngnAmount.toString(),
            asset: depositTx.asset,
            network: depositTx.network,
            ewsScore: ewsCheck.score,
            ewsFlags: ewsCheck.flags,
          },
          ipAddress: req.ip,
        },
      });

      return updated;
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });

    this.logger.log(`Credited ${ngnAmount.toString()} NGN for ${depositTx.cryptoAmount.toString()} ${depositTx.asset}`, {
      userId: depositTx.userId,
      transactionId,
      ewsAction: ewsCheck.action,
    });

    return {
      status: ewsCheck.action === 'delay' ? 'held' : 'confirmed',
      ngnAmount: ngnAmount.toString(),
      holdUntil: ewsCheck.holdUntil,
    };
  }

  /**
   * Early Warning System checks
   * Returns: action ('allow', 'delay', 'block'), score, flags, holdUntil
   */
  private async runEWSChecks(depositTx: any): Promise<{
    action: 'allow' | 'delay' | 'block';
    score: number;
    flags: string[];
    holdUntil?: Date;
  }> {
    const flags: string[] = [];
    let score = 0;

    // 1. First-time crypto deposit (delay 1 hour)
    const previousDeposits = await this.prisma.cryptoDepositTransaction.count({
      where: { userId: depositTx.userId, status: 'confirmed' },
    });

    if (previousDeposits === 0) {
      score += 30;
      flags.push('first_time_crypto_deposit');
    }

    // 2. Large amount check (>₦100k)
    const estimatedNgn = depositTx.cryptoAmount.mul(1500); // Rough estimate
    if (estimatedNgn.greaterThan(100000)) {
      score += 40;
      flags.push('large_deposit');
    }

    // 3. Velocity check (max 3 deposits per hour)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentDeposits = await this.prisma.cryptoDepositTransaction.count({
      where: {
        userId: depositTx.userId,
        createdAt: { gte: oneHourAgo },
      },
    });

    if (recentDeposits >= 3) {
      score += 50;
      flags.push('velocity_exceeded');
    }

    // 4. Device fingerprint mismatch
    // (Would check against user's last device fingerprint)

    // Determine action based on score
    if (score >= 80) {
      return { action: 'block', score, flags };
    }

    if (score >= 40) {
      // Hold for 16 days (CBN requirement for flagged transactions)
      const holdUntil = new Date(Date.now() + 16 * 24 * 60 * 60 * 1000);
      return { action: 'delay', score, flags, holdUntil };
    }

    return { action: 'allow', score, flags };
  }

  /**
   * Get current NGN balance for a user
   */
  private async getCurrentBalance(userId: string): Promise<Decimal> {
    const balance = await this.prisma.balance.findUnique({
      where: {
        userId_currency: {
          userId,
          currency: 'NGN',
        },
      },
    });

    return balance ? new Decimal(balance.amount.toString()) : new Decimal(0);
  }
}
