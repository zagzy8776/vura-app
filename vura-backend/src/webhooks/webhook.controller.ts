import {
  Controller,
  Post,
  Headers,
  Body,
  BadRequestException,
  UnauthorizedException,
  Logger,
  Req,
  HttpCode,
} from '@nestjs/common';
import type { Request } from 'express';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma.service';
import Decimal from 'decimal.js';

@Controller('webhooks')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);
  private readonly monnifySecret: string;
  private readonly paystackSecret: string;

  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
  ) {
    this.monnifySecret = this.config.get('MONNIFY_WEBHOOK_SECRET') || '';
    // Paystack signs webhooks with the secret key; no separate webhook secret is issued
    this.paystackSecret =
      this.config.get('PAYSTACK_WEBHOOK_SECRET') ||
      this.config.get('PAYSTACK_SECRET_KEY') ||
      '';
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
    if (event === 'charge.success') {
      return this.handlePaystackChargeSuccess(data);
    }

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

  private async handlePaystackChargeSuccess(data: any) {
    const reference = data.reference;
    const amountKobo = data.amount;
    const amount = new Decimal(amountKobo).div(100);

    const transaction = await this.prisma.transaction.findUnique({
      where: { reference },
    });

    if (!transaction) {
      this.logger.warn('Paystack charge: Transaction not found', { reference });
      return { status: 'transaction_not_found' };
    }

    if (transaction.status === 'SUCCESS') {
      return { status: 'already_processed' };
    }

    const userId = transaction.senderId ?? transaction.receiverId;
    if (!userId) {
      this.logger.error('Paystack charge: No userId on transaction', { reference });
      return { status: 'no_user' };
    }

    await this.prisma.$transaction(async (tx) => {
      const balance = await tx.balance.findUnique({
        where: { userId_currency: { userId, currency: 'NGN' } },
      });

      const before = new Decimal(balance?.amount?.toString() ?? '0');
      const after = before.add(amount);

      await tx.balance.upsert({
        where: { userId_currency: { userId, currency: 'NGN' } },
        create: { userId, currency: 'NGN', amount: after.toNumber(), lastUpdatedBy: 'paystack_charge' },
        update: { amount: after.toNumber(), lastUpdatedBy: 'paystack_charge' },
      });

      await tx.transaction.update({
        where: { id: transaction.id },
        data: {
          status: 'SUCCESS',
          beforeBalance: before.toNumber(),
          afterBalance: after.toNumber(),
        },
      });
    });

    await this.prisma.auditLog.create({
      data: {
        action: 'PAYSTACK_CHARGE_SUCCESS',
        userId,
        actorType: 'system',
        metadata: { reference, amount: amount.toString() },
      },
    });

    this.logger.log(`Paystack charge: Credited ₦${amount} to ${userId}`, { reference });
    return { status: 'success' };
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
      this.logger.error('PAYSTACK_SECRET_KEY (or PAYSTACK_WEBHOOK_SECRET) not configured!');
      return false;
    }

    const expected = crypto
      .createHmac('sha512', this.paystackSecret)
      .update(payload, 'utf8')
      .digest('hex');

    return signature === expected;
  }

}
