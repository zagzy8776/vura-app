import {
  Controller,
  Post,
  Headers,
  Body,
  BadRequestException,
  UnauthorizedException,
  Logger,
  Req,
  RawBodyRequest,
  HttpCode,
} from '@nestjs/common';
import type { Request } from 'express';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma.service';
import { YellowCardService } from '../crypto/yellowcard.service';
import Decimal from 'decimal.js';

// Minimum confirmation requirements
const MIN_CONFIRMATIONS: Record<string, Record<string, number>> = {
  USDT: { TRC20: 19, BEP20: 15, ERC20: 12 },
  BTC: { BTC: 3 },
  ETH: { ETH: 12 },
};

// KYC Tier limits (NGN)
const TIER_LIMITS: Record<number, { daily: number; maxBalance: number }> = {
  1: { daily: 50000, maxBalance: 300000 },
  2: { daily: 200000, maxBalance: 500000 },
  3: { daily: 5000000, maxBalance: 10000000 },
};

@Controller('webhooks')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);
  private readonly monnifySecret: string;
  private readonly paystackSecret: string;

  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
    private yellowcard: YellowCardService,
  ) {
    this.monnifySecret = this.config.get('MONNIFY_WEBHOOK_SECRET') || '';
    this.paystackSecret = this.config.get('PAYSTACK_WEBHOOK_SECRET') || '';
  }

  // ============================================
  // YELLOW CARD WEBHOOK
  // ============================================

  /**
   * Handle Yellow Card crypto webhooks
   * Yellow Card handles crypto-to-fiat deposits
   */
  @Post('yellowcard')
  @HttpCode(200)
  async handleYellowCardWebhook(
    @Body() payload: any,
    @Headers('x-yellowcard-signature') signature: string,
    @Headers('x-yellowcard-event') eventType: string,
    @Req() req: Request,
  ) {
    // 1. Verify webhook signature
    const rawBody = JSON.stringify(payload);
    if (!this.yellowcard.verifyWebhookSignature(rawBody, signature)) {
      this.logger.error('Invalid Yellow Card webhook signature', {
        ip: req.ip,
        eventType,
      });
      throw new UnauthorizedException('Invalid signature');
    }

    // 2. Check idempotency
    const providerTxId = payload.transactionId;
    const existing = await this.prisma.processedWebhook.findUnique({
      where: { providerTxId },
    });

    if (existing) {
      this.logger.warn('Duplicate Yellow Card webhook received', {
        providerTxId,
      });
      return { status: 'already_processed' };
    }

    // 3. Log webhook
    await this.prisma.processedWebhook.create({
      data: {
        provider: 'yellowcard',
        providerTxId,
        eventType: eventType || 'deposit.received',
        rawPayload: payload,
        signatureValid: true,
      },
    });

    // 4. Process based on event type
    if (eventType === 'deposit.received') {
      return this.handleYellowCardDepositReceived(payload, req);
    }

    if (eventType === 'deposit.confirmed') {
      return this.handleYellowCardDepositConfirmed(payload, req);
    }

    return { status: 'ignored', reason: 'unknown_event_type' };
  }

  private async handleYellowCardDepositReceived(payload: any, req: Request) {
    const { transactionId, userId, asset, network, amount, address } = payload;

    // Find user's deposit address
    const deposit = await this.prisma.cryptoDeposit.findFirst({
      where: {
        address,
        asset,
        network,
        status: 'active',
      },
      include: { user: true },
    });

    if (!deposit) {
      this.logger.error('Yellow Card deposit address not found', {
        address,
        asset,
        network,
      });
      throw new BadRequestException('Invalid deposit address');
    }

    const minConfs = MIN_CONFIRMATIONS[asset]?.[network] || 12;

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
        exchangeRate: 0,
        ngnAmount: 0,
        confirmations: 0,
        minConfirmations: minConfs,
        status: 'pending',
        metadata: {
          blockHash: payload.blockHash || null,
          txHash: payload.txHash || null,
          fromAddress: payload.fromAddress || null,
        } as any,
      },
    });

    this.logger.log(
      `Yellow Card deposit received: ${amount} ${asset} on ${network}`,
      {
        userId: deposit.userId,
        transactionId,
      },
    );

    return { status: 'pending', message: 'Awaiting confirmations' };
  }

  private async handleYellowCardDepositConfirmed(payload: any, req: Request) {
    const { transactionId, confirmations, blockHash } = payload;

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

    // Run EWS checks
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

      return { status: 'flagged', reason: 'ews_block' };
    }

    // Calculate NGN amount
    const { ngnAmount, rate } = await this.yellowcard.calculateNgnAmount(
      depositTx.cryptoAmount,
      depositTx.asset,
    );

    // Check KYC tier limits
    const tierLimit = TIER_LIMITS[depositTx.user.kycTier] || TIER_LIMITS[1];
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

    // Atomic transaction
    await this.prisma.$transaction(async (tx) => {
      const balance = await tx.balance.findUnique({
        where: {
          userId_currency: {
            userId: depositTx.userId,
            currency: 'NGN',
          },
        },
      });

      const beforeBalance = balance
        ? new Decimal(balance.amount.toString())
        : new Decimal(0);
      const afterBalance = beforeBalance.add(ngnAmount);

      // Credit NGN balance
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

      // Update deposit transaction
      await tx.cryptoDepositTransaction.update({
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
        },
      });

      // Create main transaction record
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
          metadata: {
            cryptoAmount: depositTx.cryptoAmount.toString(),
            cryptoCurrency: depositTx.asset,
            network: depositTx.network,
            exchangeRate: rate.toString(),
          } as any,
        },
      });

      // Create audit log
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
          } as any,
          ipAddress: req.ip || undefined,
        },
      });
    });

    this.logger.log(
      `Yellow Card: Credited ${ngnAmount.toString()} NGN for ${depositTx.cryptoAmount.toString()} ${depositTx.asset}`,
    );

    return { status: 'confirmed', ngnAmount: ngnAmount.toString() };
  }

  // ============================================
  // MONNIFY WEBHOOK
  // ============================================

  /**
   * Handle Monnify virtual account webhooks
   * Monnify handles fiat deposits via virtual accounts
   */
  @Post('monnify')
  @HttpCode(200)
  async handleMonnifyWebhook(
    @Body() payload: any,
    @Headers('x-monnify-signature') signature: string,
    @Req() req: Request,
  ) {
    // 1. Verify webhook signature
    const rawBody = JSON.stringify(payload);
    if (!this.verifyMonnifySignature(rawBody, signature)) {
      this.logger.error('Invalid Monnify webhook signature', { ip: req.ip });
      throw new UnauthorizedException('Invalid signature');
    }

    // 2. Extract event data
    const eventType = payload.eventType || payload.event;
    const reference = payload.reference || payload.paymentReference;
    const amount = payload.amount;

    if (!reference || !amount) {
      throw new BadRequestException('Missing reference or amount');
    }

    // 3. Check idempotency
    const existing = await this.prisma.processedWebhook.findUnique({
      where: { providerTxId: reference },
    });

    if (existing) {
      return { status: 'already_processed' };
    }

    // 4. Log webhook
    await this.prisma.processedWebhook.create({
      data: {
        provider: 'monnify',
        providerTxId: reference,
        eventType,
        rawPayload: payload,
        signatureValid: true,
      },
    });

    // 5. Process based on event type
    if (eventType === 'SUCCESS' || eventType === 'successful') {
      return this.handleMonnifySuccessfulPayment(payload, req);
    }

    if (eventType === 'FAILED' || eventType === 'failed') {
      return this.handleMonnifyFailedPayment(payload);
    }

    return { status: 'ignored', reason: 'unknown_event_type' };
  }

  private async handleMonnifySuccessfulPayment(payload: any, req: Request) {
    const reference = payload.reference;
    const amount = new Decimal(payload.amount);
    const customerName = payload.customerName;
    const accountNumber = payload.accountNumber;

    // Find user by virtual account
    const user = await this.prisma.user.findFirst({
      where: {
        beneficiaries: {
          some: {
            accountNumber,
            type: 'bank',
          },
        },
      },
    });

    if (!user) {
      this.logger.warn('Monnify: User not found for account', {
        accountNumber,
        reference,
      });
      return { status: 'user_not_found' };
    }

    // Check for duplicate transaction
    const existingTx = await this.prisma.transaction.findUnique({
      where: { idempotencyKey: reference },
    });

    if (existingTx) {
      return { status: 'already_processed' };
    }

    // Atomic credit transaction
    await this.prisma.$transaction(async (tx) => {
      const balance = await tx.balance.findUnique({
        where: {
          userId_currency: {
            userId: user.id,
            currency: 'NGN',
          },
        },
      });

      const beforeBalance = balance
        ? new Decimal(balance.amount.toString())
        : new Decimal(0);
      const afterBalance = beforeBalance.add(amount);

      // Credit balance
      await tx.balance.upsert({
        where: {
          userId_currency: {
            userId: user.id,
            currency: 'NGN',
          },
        },
        create: {
          userId: user.id,
          currency: 'NGN',
          amount: afterBalance.toNumber(),
          lastUpdatedBy: 'monnify_deposit',
        },
        update: {
          amount: afterBalance.toNumber(),
          lastUpdatedBy: 'monnify_deposit',
        },
      });

      // Create transaction record
      await tx.transaction.create({
        data: {
          receiverId: user.id,
          amount: amount.toNumber(),
          currency: 'NGN',
          type: 'deposit',
          status: 'SUCCESS',
          idempotencyKey: reference,
          providerTxId: reference,
          beforeBalance: beforeBalance.toNumber(),
          afterBalance: afterBalance.toNumber(),
          reference: `MONNIFY-${reference}`,
          metadata: {
            provider: 'monnify',
            customerName,
            accountNumber,
          } as any,
        },
      });

      // Create audit log
      await tx.auditLog.create({
        data: {
          action: 'MONNIFY_DEPOSIT_RECEIVED',
          userId: user.id,
          actorType: 'system',
          metadata: {
            reference,
            amount: amount.toString(),
            customerName,
            accountNumber,
          } as any,
          ipAddress: req.ip || undefined,
        },
      });
    });

    this.logger.log(
      `Monnify: Credited ${amount.toString()} NGN to user ${user.id}`,
      { reference },
    );

    return { status: 'success', amount: amount.toString() };
  }

  private async handleMonnifyFailedPayment(payload: any) {
    const reference = payload.reference;

    this.logger.warn('Monnify payment failed', { reference });

    return { status: 'failed', reference };
  }

  // ============================================
  // PAYSTACK WEBHOOK
  // ============================================

  /**
   * Handle Paystack webhook for payouts
   * Paystack handles fiat withdrawals
   */
  @Post('paystack')
  @HttpCode(200)
  async handlePaystackWebhook(
    @Body() payload: any,
    @Headers('x-paystack-signature') signature: string,
    @Req() req: Request,
  ) {
    // 1. Verify webhook signature
    const rawBody = JSON.stringify(payload);
    if (!this.verifyPaystackSignature(rawBody, signature)) {
      this.logger.error('Invalid Paystack webhook signature', { ip: req.ip });
      throw new UnauthorizedException('Invalid signature');
    }

    // 2. Extract event data
    const event = payload.event;
    const data = payload.data || {};
    const reference = data.reference;

    if (!reference) {
      throw new BadRequestException('Missing reference');
    }

    // 3. Check idempotency
    const existing = await this.prisma.processedWebhook.findUnique({
      where: { providerTxId: reference },
    });

    if (existing) {
      return { status: 'already_processed' };
    }

    // 4. Log webhook
    await this.prisma.processedWebhook.create({
      data: {
        provider: 'paystack',
        providerTxId: reference,
        eventType: event,
        rawPayload: payload,
        signatureValid: true,
      },
    });

    // 5. Process based on event type
    if (event === 'transfer.success') {
      return this.handlePaystackTransferSuccess(data, req);
    }

    if (event === 'transfer.failed') {
      return this.handlePaystackTransferFailed(data);
    }

    if (event === 'transfer.reversed') {
      return this.handlePaystackTransferReversed(data);
    }

    return { status: 'ignored', reason: 'unknown_event_type' };
  }

  private async handlePaystackTransferSuccess(data: any, req: Request) {
    const reference = data.reference;
    const amount = new Decimal(data.amount);

    // Find the transaction
    const transaction = await this.prisma.transaction.findUnique({
      where: { idempotencyKey: reference },
    });

    if (!transaction) {
      this.logger.warn('Paystack: Transaction not found', { reference });
      return { status: 'transaction_not_found' };
    }

    if (transaction.status === 'SUCCESS') {
      return { status: 'already_processed' };
    }

    // Update transaction status
    await this.prisma.transaction.update({
      where: { id: transaction.id },
      data: { status: 'SUCCESS' },
    });

    // Create audit log
    await this.prisma.auditLog.create({
      data: {
        action: 'PAYSTACK_TRANSFER_SUCCESS',
        userId: transaction.senderId || undefined,
        actorType: 'system',
        metadata: {
          reference,
          amount: amount.toString(),
        } as any,
        ipAddress: req.ip || undefined,
      },
    });

    this.logger.log(`Paystack: Transfer successful`, { reference });

    return { status: 'success' };
  }

  private async handlePaystackTransferFailed(data: any) {
    const reference = data.reference;
    const reason = data.reason;

    // Find the transaction
    const transaction = await this.prisma.transaction.findUnique({
      where: { idempotencyKey: reference },
    });

    if (transaction) {
      // Refund the amount back to user
      await this.prisma.$transaction(async (tx) => {
        const balance = await tx.balance.findUnique({
          where: {
            userId_currency: {
              userId: transaction.senderId!,
              currency: 'NGN',
            },
          },
        });

        const beforeBalance = balance
          ? new Decimal(balance.amount.toString())
          : new Decimal(0);
        const transAmount = new Decimal(transaction.amount);
        const afterBalance = beforeBalance.add(transAmount);

        await tx.balance.update({
          where: {
            userId_currency: {
              userId: transaction.senderId!,
              currency: 'NGN',
            },
          },
          data: {
            amount: afterBalance.toNumber(),
            lastUpdatedBy: 'paystack_refund',
          },
        });

        await tx.transaction.update({
          where: { id: transaction.id },
          data: { status: 'FAILED' },
        });
      });

      this.logger.warn(`Paystack: Transfer failed and refunded`, {
        reference,
        reason,
      });
    }

    return { status: 'failed', reason };
  }

  private async handlePaystackTransferReversed(data: any) {
    const reference = data.reference;
    const amount = data.amount;

    // Find and refund transaction
    const transaction = await this.prisma.transaction.findUnique({
      where: { idempotencyKey: reference },
    });

    if (transaction && transaction.status === 'SUCCESS') {
      await this.prisma.$transaction(async (tx) => {
        const balance = await tx.balance.findUnique({
          where: {
            userId_currency: {
              userId: transaction.senderId!,
              currency: 'NGN',
            },
          },
        });

        const beforeBalance = balance
          ? new Decimal(balance.amount.toString())
          : new Decimal(0);
        const refundAmount = new Decimal(amount);
        const afterBalance = beforeBalance.add(refundAmount);

        await tx.balance.update({
          where: {
            userId_currency: {
              userId: transaction.senderId!,
              currency: 'NGN',
            },
          },
          data: {
            amount: afterBalance.toNumber(),
            lastUpdatedBy: 'paystack_reversal',
          },
        });

        await tx.transaction.update({
          where: { id: transaction.id },
          data: { status: 'REVERSED' },
        });

        await tx.auditLog.create({
          data: {
            action: 'PAYSTACK_TRANSFER_REVERSED',
            userId: transaction.senderId!,
            actorType: 'system',
            metadata: {
              reference,
              amount: refundAmount.toString(),
            } as any,
          },
        });
      });

      this.logger.log(`Paystack: Transfer reversed and refunded`, {
        reference,
      });
    }

    return { status: 'reversed' };
  }

  // ============================================
  // SIGNATURE VERIFICATION HELPERS
  // ============================================

  /**
   * Verify Monnify webhook signature
   */
  private verifyMonnifySignature(payload: string, signature: string): boolean {
    if (!this.monnifySecret) {
      this.logger.error('MONNIFY_WEBHOOK_SECRET not configured!');
      return false;
    }

    const expected = crypto
      .createHmac('sha512', this.monnifySecret)
      .update(payload, 'utf8')
      .digest('hex');

    return crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expected, 'hex'),
    );
  }

  /**
   * Verify Paystack webhook signature
   */
  private verifyPaystackSignature(payload: string, signature: string): boolean {
    if (!this.paystackSecret) {
      this.logger.error('PAYSTACK_WEBHOOK_SECRET not configured!');
      return false;
    }

    const expected = crypto
      .createHmac('sha512', this.paystackSecret)
      .update(payload, 'utf8')
      .digest('hex');

    return signature === expected;
  }

  // ============================================
  // EWS (EARLY WARNING SYSTEM)
  // ============================================

  private async runEWSChecks(depositTx: any): Promise<{
    action: 'allow' | 'delay' | 'block';
    score: number;
    flags: string[];
    holdUntil?: Date;
  }> {
    const flags: string[] = [];
    let score = 0;

    const previousDeposits = await this.prisma.cryptoDepositTransaction.count({
      where: { userId: depositTx.userId, status: 'confirmed' },
    });

    if (previousDeposits === 0) {
      score += 30;
      flags.push('first_time_crypto_deposit');
    }

    const estimatedNgn = depositTx.cryptoAmount.mul(1500);
    if (estimatedNgn.greaterThan(100000)) {
      score += 40;
      flags.push('large_deposit');
    }

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

    if (score >= 80) {
      return { action: 'block', score, flags };
    }

    if (score >= 40) {
      const holdUntil = new Date(Date.now() + 16 * 24 * 60 * 60 * 1000);
      return { action: 'delay', score, flags, holdUntil };
    }

    return { action: 'allow', score, flags };
  }

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
