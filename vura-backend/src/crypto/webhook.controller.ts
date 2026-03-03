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
import { BushaService } from './busha.service';
import Decimal from 'decimal.js';
import { Prisma } from '@prisma/client';

// Minimum on-chain confirmations before crediting
const MIN_CONFIRMATIONS: Record<string, Record<string, number>> = {
  USDT: { TRC20: 19, BEP20: 15, ERC20: 12 },
  BTC: { BTC: 3 },
  ETH: { ETH: 12 },
};

// KYC tier limits (NGN)
const TIER_LIMITS: Record<number, { daily: number; maxBalance: number }> = {
  1: { daily: 50_000, maxBalance: 300_000 },
  2: { daily: 200_000, maxBalance: 500_000 },
  3: { daily: 5_000_000, maxBalance: 10_000_000 },
};

@Controller('webhooks')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  constructor(
    private prisma: PrismaService,
    private busha: BushaService,
  ) {}

  // ─────────────────────────────────────────────────────────────────────
  //  BUSHA WEBHOOK ENTRY POINT
  // ─────────────────────────────────────────────────────────────────────

  @Post('busha')
  async handleBushaWebhook(
    @Body() payload: any,
    @Headers('x-busha-signature') signature: string,
    @Headers('x-busha-event') eventType: string,
    @Req() req: Request,
  ) {
    // 1. Verify HMAC signature
    const rawBody = JSON.stringify(payload);
    if (!this.busha.verifyWebhookSignature(rawBody, signature)) {
      this.logger.error('Invalid Busha webhook signature', { ip: req.ip });
      throw new UnauthorizedException('Invalid signature');
    }

    // 2. Idempotency – skip replays
    const txId: string = payload.transactionId ?? payload.id;
    const existing = await this.prisma.processedWebhook.findUnique({
      where: { providerTxId: txId },
    });
    if (existing) {
      return { status: 'already_processed' };
    }

    // 3. Persist raw webhook for audit
    await this.prisma.processedWebhook.create({
      data: {
        provider: 'busha',
        providerTxId: txId,
        eventType: eventType || 'unknown',
        rawPayload: payload,
        signatureValid: true,
      },
    });

    // 4. Route by event type
    switch (eventType) {
      case 'deposit.received':
        return this.onDepositReceived(payload);
      case 'deposit.confirmed':
        return this.onDepositConfirmed(payload, req);
      default:
        return { status: 'ignored', reason: `unhandled event: ${eventType}` };
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  //  deposit.received  → create pending tx record
  // ─────────────────────────────────────────────────────────────────────

  private async onDepositReceived(payload: any) {
    const { transactionId, asset, network, amount, address } = payload;

    const deposit = await this.prisma.cryptoDeposit.findFirst({
      where: { address, asset, network, status: 'active' },
    });

    if (!deposit) {
      this.logger.error('Unknown deposit address', { address, asset, network });
      throw new BadRequestException('Unknown deposit address');
    }

    const minConf = MIN_CONFIRMATIONS[asset]?.[network] ?? 12;

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
        minConfirmations: minConf,
        status: 'pending',
        metadata: {
          txHash: payload.txHash,
          fromAddress: payload.fromAddress,
          blockHash: payload.blockHash,
        },
      },
    });

    this.logger.log(
      `Deposit received: ${amount} ${asset}/${network} for user ${deposit.userId}`,
    );
    return { status: 'pending' };
  }

  // ─────────────────────────────────────────────────────────────────────
  //  deposit.confirmed  → convert to fiat → optional auto-withdraw
  // ─────────────────────────────────────────────────────────────────────

  private async onDepositConfirmed(payload: any, req: Request) {
    const { transactionId, confirmations, blockHash } = payload;

    const depositTx = await this.prisma.cryptoDepositTransaction.findUnique({
      where: { providerTxId: transactionId },
      include: { user: true },
    });

    if (!depositTx) throw new BadRequestException('Deposit tx not found');
    if (depositTx.status === 'confirmed') return { status: 'already_confirmed' };

    // Not enough confirmations yet → update count only
    if (confirmations < depositTx.minConfirmations) {
      await this.prisma.cryptoDepositTransaction.update({
        where: { id: depositTx.id },
        data: { confirmations },
      });
      return {
        status: 'confirming',
        confirmations,
        required: depositTx.minConfirmations,
      };
    }

    // ── EWS checks ───────────────────────────────────────────────────
    const ews = await this.runEWSChecks(depositTx);
    if (ews.action === 'block') {
      await this.prisma.cryptoDepositTransaction.update({
        where: { id: depositTx.id },
        data: { status: 'flagged', ewsScore: ews.score, ewsFlags: ews.flags },
      });
      this.logger.error('Deposit blocked by EWS', { transactionId, flags: ews.flags });
      return { status: 'flagged', reason: 'ews_block' };
    }

    // ── Convert to fiat via Busha (with slippage guard) ──────────────
    const quotedRate = await this.busha.getRate(`${depositTx.asset}_NGN`);
    const cryptoAmount = new Decimal(depositTx.cryptoAmount.toString());

    const { executedRate, ngnAmount, slippageBps } =
      await this.busha.convertToFiat(depositTx.asset, cryptoAmount, quotedRate);

    // ── KYC tier balance cap ─────────────────────────────────────────
    const tierLimit = TIER_LIMITS[depositTx.user.kycTier] ?? TIER_LIMITS[1];
    const currentBal = await this.getCurrentBalance(depositTx.userId);

    if (currentBal.add(ngnAmount).greaterThan(tierLimit.maxBalance)) {
      await this.prisma.cryptoDepositTransaction.update({
        where: { id: depositTx.id },
        data: { status: 'flagged', ewsFlags: ['tier_limit_exceeded'] },
      });
      throw new BadRequestException('Deposit would exceed KYC tier limit');
    }

    // ── ATOMIC: credit NGN balance + update records ──────────────────
    await this.prisma.$transaction(
      async (tx) => {
        const balance = await tx.balance.findUnique({
          where: {
            userId_currency: { userId: depositTx.userId, currency: 'NGN' },
          },
        });

        const before = balance
          ? new Decimal(balance.amount.toString())
          : new Decimal(0);
        const after = before.add(ngnAmount);

        await tx.balance.upsert({
          where: {
            userId_currency: { userId: depositTx.userId, currency: 'NGN' },
          },
          create: {
            userId: depositTx.userId,
            currency: 'NGN',
            amount: ngnAmount.toNumber(),
            lastUpdatedBy: 'busha_deposit',
          },
          update: {
            amount: after.toNumber(),
            lastUpdatedBy: 'busha_deposit',
          },
        });

        const updatedTx = await tx.cryptoDepositTransaction.update({
          where: { id: depositTx.id },
          data: {
            status: ews.action === 'delay' ? 'flagged' : 'confirmed',
            confirmations,
            exchangeRate: executedRate.toNumber(),
            ngnAmount: ngnAmount.toNumber(),
            creditedAt: new Date(),
            ewsScore: ews.score,
            ewsFlags: ews.flags,
            holdUntil: ews.holdUntil,
            metadata: {
              ...(depositTx.metadata as object),
              creditedBlockHash: blockHash,
              ewsAction: ews.action,
              slippageBps,
            },
          },
        });

        await tx.transaction.create({
          data: {
            receiverId: depositTx.userId,
            amount: ngnAmount.toNumber(),
            currency: 'NGN',
            type: 'crypto_deposit',
            status: 'SUCCESS',
            idempotencyKey: `crypto_${transactionId}`,
            providerTxId: transactionId,
            beforeBalance: before.toNumber(),
            afterBalance: after.toNumber(),
            reference: `CRYPTO-${transactionId}`,
            externalReference: depositTx.asset,
            metadata: {
              cryptoAmount: cryptoAmount.toString(),
              cryptoCurrency: depositTx.asset,
              network: depositTx.network,
              exchangeRate: executedRate.toString(),
              slippageBps,
              confirmations,
            },
          },
        });

        await tx.auditLog.create({
          data: {
            action: 'CRYPTO_DEPOSIT_CREDITED',
            userId: depositTx.userId,
            actorType: 'system',
            metadata: {
              transactionId,
              cryptoAmount: cryptoAmount.toString(),
              ngnAmount: ngnAmount.toString(),
              exchangeRate: executedRate.toString(),
              slippageBps,
              ewsScore: ews.score,
            },
            ipAddress: req.ip,
          },
        });

        return updatedTx;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    this.logger.log(
      `Credited ₦${ngnAmount.toFixed(2)} for ${cryptoAmount.toString()} ${depositTx.asset} ` +
        `(rate ${executedRate.toString()}, slip ${slippageBps} bps)`,
    );

    // ── AUTO-WITHDRAW if user enabled it ─────────────────────────────
    if (
      (depositTx.user as any).cryptoAutoWithdraw &&
      ews.action === 'allow' &&
      ngnAmount.greaterThan(50)
    ) {
      try {
        const ref = `AW-${transactionId}`;
        const payout = await this.busha.payoutToBank(
          depositTx.userId,
          ngnAmount,
          ref,
        );

        await this.prisma.auditLog.create({
          data: {
            action: 'CRYPTO_AUTO_WITHDRAW',
            userId: depositTx.userId,
            actorType: 'system',
            metadata: {
              payoutId: payout.id,
              amount: payout.amount,
              bankName: payout.bankName,
              reference: ref,
            },
          },
        });

        this.logger.log(
          `Auto-withdraw ₦${payout.amount} → ${payout.bankName} (ref ${ref})`,
        );

        return {
          status: 'confirmed_and_withdrawn',
          ngnAmount: ngnAmount.toString(),
          payout: {
            amount: payout.amount,
            bank: payout.bankName,
            reference: ref,
          },
        };
      } catch (withdrawErr) {
        this.logger.error(
          `Auto-withdraw failed: ${(withdrawErr as Error).message}`,
          (withdrawErr as Error).stack,
        );
        // Deposit is still credited – withdrawal can be retried manually
      }
    }

    return {
      status: ews.action === 'delay' ? 'held' : 'confirmed',
      ngnAmount: ngnAmount.toString(),
      holdUntil: ews.holdUntil,
    };
  }

  // ─────────────────────────────────────────────────────────────────────
  //  EWS – Early Warning System
  // ─────────────────────────────────────────────────────────────────────

  private async runEWSChecks(depositTx: any): Promise<{
    action: 'allow' | 'delay' | 'block';
    score: number;
    flags: string[];
    holdUntil?: Date;
  }> {
    const flags: string[] = [];
    let score = 0;

    // First-time crypto user
    const pastConfirmed = await this.prisma.cryptoDepositTransaction.count({
      where: { userId: depositTx.userId, status: 'confirmed' },
    });
    if (pastConfirmed === 0) {
      score += 30;
      flags.push('first_time_crypto_deposit');
    }

    // Large deposit (rough estimate > ₦100 k)
    const rough = new Decimal(depositTx.cryptoAmount.toString()).mul(1_500);
    if (rough.greaterThan(100_000)) {
      score += 40;
      flags.push('large_deposit');
    }

    // Velocity: > 3 deposits in last hour
    const oneHourAgo = new Date(Date.now() - 3_600_000);
    const recent = await this.prisma.cryptoDepositTransaction.count({
      where: { userId: depositTx.userId, createdAt: { gte: oneHourAgo } },
    });
    if (recent >= 3) {
      score += 50;
      flags.push('velocity_exceeded');
    }

    if (score >= 80) return { action: 'block', score, flags };
    if (score >= 40) {
      const holdUntil = new Date(Date.now() + 16 * 86_400_000);
      return { action: 'delay', score, flags, holdUntil };
    }
    return { action: 'allow', score, flags };
  }

  private async getCurrentBalance(userId: string): Promise<Decimal> {
    const bal = await this.prisma.balance.findUnique({
      where: { userId_currency: { userId, currency: 'NGN' } },
    });
    return bal ? new Decimal(bal.amount.toString()) : new Decimal(0);
  }
}
