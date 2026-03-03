import {
  Controller,
  Post,
  Headers,
  Body,
  UnauthorizedException,
  Logger,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { PrismaService } from '../prisma.service';
import { IvoryPayService } from './ivorypay.service';
import Decimal from 'decimal.js';
import { Prisma } from '@prisma/client';
import type { IvoryPayWebhookPayload } from './ivorypay.interfaces';

@Controller('webhooks')
export class IvoryPayWebhookController {
  private readonly logger = new Logger(IvoryPayWebhookController.name);

  constructor(
    private prisma: PrismaService,
    private ivorypay: IvoryPayService,
  ) {}

  // ─────────────────────────────────────────────────────────────────
  //  POST /webhooks/ivorypay
  // ─────────────────────────────────────────────────────────────────

  @Post('ivorypay')
  async handleIvoryPayWebhook(
    @Body() payload: IvoryPayWebhookPayload,
    @Headers('x-ivorypay-signature') signature: string,
    @Req() req: Request,
  ) {
    // 1. HMAC-SHA512 signature verification
    const rawBody = JSON.stringify(payload);
    if (!this.ivorypay.verifyWebhookSignature(rawBody, signature)) {
      this.logger.error('Invalid IvoryPay webhook signature', { ip: req.ip });
      throw new UnauthorizedException('Invalid webhook signature');
    }

    const event = payload.event;
    const txRef = payload.data?.reference ?? payload.data?.id;

    // 2. Idempotency check
    const existing = await this.prisma.processedWebhook.findUnique({
      where: { providerTxId: txRef },
    });
    if (existing) {
      return { status: 'already_processed' };
    }

    // 3. Persist raw webhook for audit
    await this.prisma.processedWebhook.create({
      data: {
        provider: 'ivorypay',
        providerTxId: txRef,
        eventType: event,
        rawPayload: payload as any,
        signatureValid: true,
      },
    });

    this.logger.log(`IvoryPay webhook received: ${event} (ref: ${txRef})`);

    // 4. Route by event type
    switch (event) {
      case 'permanentWalletDeposit.success':
      case 'cryptoCollection.success':
        return this.onDepositSuccess(payload, req);

      case 'permanentWalletDeposit.failed':
      case 'cryptoCollection.failed':
        return this.onDepositFailed(payload);

      case 'fiatTransfer.success':
        return this.onPayoutSuccess(payload);

      case 'fiatTransfer.failed':
        return this.onPayoutFailed(payload);

      default:
        this.logger.warn(`Unhandled IvoryPay event: ${event}`);
        return { status: 'ignored', event };
    }
  }

  // ─────────────────────────────────────────────────────────────────
  //  permanentWalletDeposit.success / cryptoCollection.success
  //  → Credit NGN balance → Auto-sweep to bank if enabled
  // ─────────────────────────────────────────────────────────────────

  private async onDepositSuccess(
    payload: IvoryPayWebhookPayload,
    req: Request,
  ) {
    const { address, amount, fiatEquivalent, rate, crypto: cryptoAsset, network, txHash } =
      payload.data;

    // Find deposit address owner
    const deposit = await this.prisma.cryptoDeposit.findFirst({
      where: { address, status: 'active' },
      include: { user: true },
    });

    if (!deposit) {
      this.logger.error(`No user for IvoryPay address: ${address}`);
      return { status: 'address_not_found' };
    }

    const userId = deposit.userId;
    const ngnAmount = new Decimal(fiatEquivalent || '0');
    const cryptoAmount = new Decimal(amount || '0');
    const exchangeRate = new Decimal(rate || '0');

    if (ngnAmount.lessThanOrEqualTo(0)) {
      this.logger.error(`Zero/negative fiatEquivalent in webhook for ${address}`);
      return { status: 'invalid_amount' };
    }

    // ATOMIC: credit balance + create transaction records
    await this.prisma.$transaction(
      async (tx) => {
        const balance = await tx.balance.findUnique({
          where: { userId_currency: { userId, currency: 'NGN' } },
        });

        const before = balance
          ? new Decimal(balance.amount.toString())
          : new Decimal(0);
        const after = before.add(ngnAmount);

        // Credit NGN balance
        await tx.balance.upsert({
          where: { userId_currency: { userId, currency: 'NGN' } },
          create: {
            userId,
            currency: 'NGN',
            amount: ngnAmount.toNumber(),
            lastUpdatedBy: 'ivorypay_deposit',
          },
          update: {
            amount: after.toNumber(),
            lastUpdatedBy: 'ivorypay_deposit',
          },
        });

        // Create crypto deposit transaction record
        await tx.cryptoDepositTransaction.create({
          data: {
            depositId: deposit.id,
            userId,
            providerTxId: payload.data.reference || payload.data.id,
            asset: cryptoAsset,
            network: (network || 'TRON').toUpperCase(),
            cryptoAmount: cryptoAmount.toNumber(),
            cryptoCurrency: cryptoAsset,
            exchangeRate: exchangeRate.toNumber(),
            ngnAmount: ngnAmount.toNumber(),
            confirmations: 1,
            minConfirmations: 1,
            status: 'confirmed',
            creditedAt: new Date(),
            metadata: {
              provider: 'ivorypay',
              txHash,
              event: payload.event,
            },
          },
        });

        // Main transaction record
        await tx.transaction.create({
          data: {
            receiverId: userId,
            amount: ngnAmount.toNumber(),
            currency: 'NGN',
            type: 'crypto_deposit',
            status: 'SUCCESS',
            idempotencyKey: `ivory_${payload.data.reference || payload.data.id}`,
            providerTxId: payload.data.reference,
            beforeBalance: before.toNumber(),
            afterBalance: after.toNumber(),
            reference: `IVORY-${payload.data.reference || payload.data.id}`,
            externalReference: cryptoAsset,
            metadata: {
              provider: 'ivorypay',
              cryptoAmount: cryptoAmount.toString(),
              cryptoCurrency: cryptoAsset,
              exchangeRate: exchangeRate.toString(),
              txHash,
            },
          },
        });

        // Audit log
        await tx.auditLog.create({
          data: {
            action: 'IVORYPAY_DEPOSIT_CREDITED',
            userId,
            actorType: 'system',
            metadata: {
              cryptoAmount: cryptoAmount.toString(),
              ngnAmount: ngnAmount.toString(),
              exchangeRate: exchangeRate.toString(),
              provider: 'ivorypay',
              txHash,
            },
            ipAddress: req.ip,
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    this.logger.log(
      `Credited ₦${ngnAmount.toFixed(2)} from ${cryptoAmount.toString()} ${cryptoAsset} via IvoryPay for user ${userId}`,
    );

    // ── AUTO-SWEEP: if user enabled, send NGN to their primary bank ──
    if (
      (deposit.user as any).cryptoAutoWithdraw &&
      ngnAmount.greaterThan(50)
    ) {
      try {
        const bank = await this.prisma.bankAccount.findFirst({
          where: { userId, isPrimary: true, status: 'active' },
        });

        if (bank) {
          const ref = `AUTOSWEEP-${payload.data.reference || Date.now()}`;

          const payout = await this.ivorypay.initiateFiatPayout({
            amount: ngnAmount.toFixed(2),
            currency: 'NGN',
            bankCode: bank.bankCode,
            accountNumber: bank.accountNumber,
            accountName: bank.accountName,
            reference: ref,
            narration: `Vura auto-sweep ${ref}`,
            crypto: cryptoAsset,
          });

          // Debit NGN balance after payout initiation
          await this.prisma.balance.update({
            where: { userId_currency: { userId, currency: 'NGN' } },
            data: {
              amount: { decrement: ngnAmount.toNumber() },
              lastUpdatedBy: 'ivorypay_autosweep',
            },
          });

          await this.prisma.auditLog.create({
            data: {
              action: 'IVORYPAY_AUTO_SWEEP',
              userId,
              actorType: 'system',
              metadata: {
                payoutRef: payout.reference,
                amount: ngnAmount.toString(),
                bankName: bank.bankName,
                accountNumber: bank.accountNumber,
              },
            },
          });

          this.logger.log(
            `Auto-sweep ₦${ngnAmount.toFixed(2)} → ${bank.bankName} ****${bank.accountNumber.slice(-4)} (ref ${ref})`,
          );

          return {
            status: 'credited_and_swept',
            ngnAmount: ngnAmount.toString(),
            payout: {
              reference: payout.reference,
              bank: payout.bankName,
              amount: payout.amount,
            },
          };
        }

        this.logger.warn(
          `Auto-sweep enabled but no primary bank for user ${userId}`,
        );
      } catch (sweepErr) {
        this.logger.error(
          `Auto-sweep failed for user ${userId}: ${(sweepErr as Error).message}`,
          (sweepErr as Error).stack,
        );
        // Deposit still credited – user can withdraw manually
      }
    }

    return {
      status: 'credited',
      ngnAmount: ngnAmount.toString(),
    };
  }

  // ─────────────────────────────────────────────────────────────────
  //  Deposit failed – log only (nothing to credit)
  // ─────────────────────────────────────────────────────────────────

  private async onDepositFailed(payload: IvoryPayWebhookPayload) {
    this.logger.warn(
      `IvoryPay deposit failed: ref=${payload.data.reference}, address=${payload.data.address}`,
    );

    await this.prisma.auditLog.create({
      data: {
        action: 'IVORYPAY_DEPOSIT_FAILED',
        actorType: 'system',
        metadata: {
          reference: payload.data.reference,
          address: payload.data.address,
          event: payload.event,
        },
      },
    });

    return { status: 'logged' };
  }

  // ─────────────────────────────────────────────────────────────────
  //  Fiat payout succeeded – update audit
  // ─────────────────────────────────────────────────────────────────

  private async onPayoutSuccess(payload: IvoryPayWebhookPayload) {
    this.logger.log(
      `IvoryPay payout succeeded: ref=${payload.data.reference}, amount=${payload.data.amount}`,
    );

    await this.prisma.auditLog.create({
      data: {
        action: 'IVORYPAY_PAYOUT_SUCCESS',
        actorType: 'system',
        metadata: {
          reference: payload.data.reference,
          amount: payload.data.amount,
          event: payload.event,
        },
      },
    });

    return { status: 'payout_confirmed' };
  }

  // ─────────────────────────────────────────────────────────────────
  //  Fiat payout failed – refund the NGN back to the user
  // ─────────────────────────────────────────────────────────────────

  private async onPayoutFailed(payload: IvoryPayWebhookPayload) {
    this.logger.error(
      `IvoryPay payout FAILED: ref=${payload.data.reference}`,
    );

    // Find the matching audit log to get the userId
    const auditEntry = await this.prisma.auditLog.findFirst({
      where: {
        action: 'IVORYPAY_AUTO_SWEEP',
        metadata: { path: ['payoutRef'], equals: payload.data.reference },
      },
    });

    if (auditEntry?.userId) {
      const refundAmount = new Decimal(payload.data.fiatEquivalent || payload.data.amount || '0');

      if (refundAmount.greaterThan(0)) {
        await this.prisma.balance.update({
          where: {
            userId_currency: { userId: auditEntry.userId, currency: 'NGN' },
          },
          data: {
            amount: { increment: refundAmount.toNumber() },
            lastUpdatedBy: 'ivorypay_payout_refund',
          },
        });

        this.logger.log(
          `Refunded ₦${refundAmount.toFixed(2)} to user ${auditEntry.userId} after failed payout`,
        );
      }
    }

    await this.prisma.auditLog.create({
      data: {
        action: 'IVORYPAY_PAYOUT_FAILED',
        userId: auditEntry?.userId,
        actorType: 'system',
        metadata: {
          reference: payload.data.reference,
          event: payload.event,
          refunded: !!auditEntry?.userId,
        },
      },
    });

    return { status: 'payout_failed_logged' };
  }
}
