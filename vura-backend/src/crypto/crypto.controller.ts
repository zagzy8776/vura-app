import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  UseGuards,
  Request,
  BadRequestException,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CoinGeckoService } from './coingecko.service';
import { PrismaService } from '../prisma.service';
import Decimal from 'decimal.js';

@Controller('crypto')
@UseGuards(AuthGuard)
export class CryptoController {
  constructor(
    private coinGecko: CoinGeckoService,
    private prisma: PrismaService,
  ) {}

  /**
   * Current exchange rates for all supported pairs (CoinGecko — free).
   * GET /crypto/rates
   */
  @Get('rates')
  async getExchangeRates() {
    const rates = await this.coinGecko.getAllRates();
    return { success: true, data: rates };
  }

  /**
   * Preview: how much NGN a user would receive for a given crypto amount.
   * GET /crypto/preview?amount=50&asset=USDT
   */
  @Get('preview')
  async previewConversion(
    @Request() req: any,
  ) {
    const amount = req.query.amount;
    const asset = (req.query.asset || 'USDT').toUpperCase();

    if (!amount || parseFloat(amount) <= 0) {
      throw new BadRequestException('amount must be a positive number');
    }

    const { ngnAmount, rate } = await this.coinGecko.calculateNgnAmount(
      new Decimal(amount),
      asset,
    );

    return {
      success: true,
      data: {
        crypto: asset,
        cryptoAmount: amount,
        fiatEquivalent: ngnAmount.toFixed(2),
        rate: rate.toFixed(2),
      },
    };
  }

  /**
   * Return the static business wallet address for a given asset + network.
   * POST /crypto/deposit-address
   */
  @Post('deposit-address')
  async getDepositAddress(
    @Body('asset') asset: string,
    @Body('network') network: string,
    @Request() req: any,
  ) {
    const userId: string = req.user.userId;
    const normalizedAsset = (asset || 'USDT').toUpperCase();
    const normalizedNetwork = (network || 'TRC20').toUpperCase();

    const validNetworks: Record<string, string[]> = {
      USDT: ['TRC20', 'BEP20'],
      BTC: ['BTC'],
    };

    if (!validNetworks[normalizedAsset]?.includes(normalizedNetwork)) {
      throw new BadRequestException(
        `Invalid network ${normalizedNetwork} for ${normalizedAsset}. Valid: ${validNetworks[normalizedAsset]?.join(', ')}`,
      );
    }

    const wallet = this.coinGecko.getDepositAddress(normalizedAsset, normalizedNetwork);

    if (!wallet.address || wallet.address === 'WALLET_NOT_CONFIGURED') {
      throw new BadRequestException(
        'Crypto deposits are not yet configured. Please contact support.',
      );
    }

    // Persist a deposit record so we can track this user's address
    const deposit = await this.prisma.cryptoDeposit.upsert({
      where: {
        userId_asset_network: {
          userId,
          asset: normalizedAsset,
          network: normalizedNetwork,
        },
      },
      update: { address: wallet.address, status: 'active' },
      create: {
        userId,
        asset: normalizedAsset,
        network: normalizedNetwork,
        address: wallet.address,
        providerRef: `static_${normalizedAsset}_${normalizedNetwork}`,
        status: 'active',
      },
    });

    return {
      success: true,
      data: {
        id: deposit.id,
        address: wallet.address,
        asset: normalizedAsset,
        network: normalizedNetwork,
      },
    };
  }

  /**
   * User clicks "I've sent the money" — creates a pending deposit awaiting
   * admin confirmation.
   * POST /crypto/confirm-sent
   */
  @Post('confirm-sent')
  async confirmSent(
    @Body('asset') asset: string,
    @Body('network') network: string,
    @Body('amount') amount: string,
    @Body('txHash') txHash: string,
    @Request() req: any,
  ) {
    const userId: string = req.user.userId;
    const normalizedAsset = (asset || 'USDT').toUpperCase();
    const normalizedNetwork = (network || 'TRC20').toUpperCase();

    if (!amount || parseFloat(amount) <= 0) {
      throw new BadRequestException('amount must be a positive number');
    }

    const deposit = await this.prisma.cryptoDeposit.findUnique({
      where: {
        userId_asset_network: {
          userId,
          asset: normalizedAsset,
          network: normalizedNetwork,
        },
      },
    });

    if (!deposit) {
      throw new BadRequestException(
        'Generate a deposit address first before confirming.',
      );
    }

    const { rate } = await this.coinGecko.calculateNgnAmount(
      new Decimal(amount),
      normalizedAsset,
    );

    const ngnEstimate = new Decimal(amount).mul(rate);

    const tx = await this.prisma.cryptoDepositTransaction.create({
      data: {
        depositId: deposit.id,
        userId,
        providerTxId: txHash || `manual_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        asset: normalizedAsset,
        network: normalizedNetwork,
        cryptoAmount: parseFloat(amount),
        cryptoCurrency: normalizedAsset,
        exchangeRate: rate.toNumber(),
        ngnAmount: ngnEstimate.toNumber(),
        confirmations: 0,
        minConfirmations: 1,
        status: 'pending',
        metadata: {
          txHash: txHash || null,
          submittedByUser: true,
          submittedAt: new Date().toISOString(),
        },
      },
    });

    return {
      success: true,
      data: {
        id: tx.id,
        status: 'pending',
        cryptoAmount: amount,
        estimatedNgn: ngnEstimate.toFixed(2),
        message: 'Your deposit is pending admin review. You will be credited once confirmed.',
      },
    };
  }

  /**
   * List the user's recent crypto deposit transactions.
   * GET /crypto/deposits
   */
  @Get('deposits')
  async getDepositHistory(@Request() req: any) {
    const userId: string = req.user.userId;

    const deposits = await this.prisma.cryptoDeposit.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { deposits: { orderBy: { createdAt: 'desc' }, take: 5 } },
    });

    return {
      success: true,
      data: deposits.map((d: any) => ({
        id: d.id,
        asset: d.asset,
        network: d.network,
        address: d.address,
        status: d.status,
        createdAt: d.createdAt,
        transactions: (d.deposits ?? []).map((tx: any) => ({
          id: tx.id,
          cryptoAmount: tx.cryptoAmount?.toString() ?? '0',
          ngnAmount: tx.ngnAmount?.toString() ?? '0',
          exchangeRate: tx.exchangeRate?.toString() ?? '0',
          status: tx.status,
          createdAt: tx.createdAt,
          creditedAt: tx.creditedAt,
        })),
      })),
    };
  }

  /**
   * Get active deposit addresses for the user.
   * GET /crypto/addresses
   */
  @Get('addresses')
  async getActiveAddresses(@Request() req: any) {
    const userId: string = req.user.userId;

    const addresses = await this.prisma.cryptoDeposit.findMany({
      where: { userId, status: 'active' },
      select: {
        asset: true,
        network: true,
        address: true,
        memo: true,
        createdAt: true,
      },
    });

    return { success: true, data: addresses };
  }

  // ── Admin Endpoints ────────────────────────────────────────────────

  /**
   * Admin: list all pending crypto deposits.
   * GET /crypto/admin/pending
   */
  @Get('admin/pending')
  async listPendingDeposits() {
    // TODO: Add proper admin role guard in production
    const pending = await this.prisma.cryptoDepositTransaction.findMany({
      where: { status: 'pending' },
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            id: true,
            vuraTag: true,
            emailEncrypted: true,
            legalFirstName: true,
            legalLastName: true,
          },
        },
      },
    });

    return {
      success: true,
      data: pending.map((tx: any) => ({
        id: tx.id,
        userId: tx.userId,
        userTag: tx.user?.vuraTag,
        userName: [tx.user?.legalFirstName, tx.user?.legalLastName]
          .filter(Boolean)
          .join(' ') || tx.user?.vuraTag,
        asset: tx.asset,
        network: tx.network,
        cryptoAmount: tx.cryptoAmount?.toString(),
        estimatedNgn: tx.ngnAmount?.toString(),
        txHash: (tx.metadata as any)?.txHash,
        createdAt: tx.createdAt,
      })),
    };
  }

  /**
   * Admin: approve a pending deposit — credits NGN to the user's balance.
   * PATCH /crypto/admin/approve/:txId
   */
  @Patch('admin/approve/:txId')
  async approveDeposit(
    @Param('txId') txId: string,
    @Body('ngnAmount') ngnAmountOverride: string,
    @Request() req: any,
  ) {
    // TODO: Add proper admin role guard in production

    const depositTx = await this.prisma.cryptoDepositTransaction.findUnique({
      where: { id: txId },
    });

    if (!depositTx) throw new BadRequestException('Deposit not found');
    if (depositTx.status === 'confirmed') {
      return { success: true, data: { message: 'Already confirmed' } };
    }

    const ngnAmount = ngnAmountOverride
      ? new Decimal(ngnAmountOverride)
      : new Decimal(depositTx.ngnAmount.toString());

    if (ngnAmount.lessThanOrEqualTo(0)) {
      throw new BadRequestException('NGN amount must be positive');
    }

    // Atomic: credit balance + update tx status
    await this.prisma.$transaction(async (tx) => {
      const balance = await tx.balance.findUnique({
        where: { userId_currency: { userId: depositTx.userId, currency: 'NGN' } },
      });

      const before = balance ? new Decimal(balance.amount.toString()) : new Decimal(0);
      const after = before.add(ngnAmount);

      await tx.balance.upsert({
        where: { userId_currency: { userId: depositTx.userId, currency: 'NGN' } },
        create: {
          userId: depositTx.userId,
          currency: 'NGN',
          amount: ngnAmount.toNumber(),
          lastUpdatedBy: 'crypto_admin_approve',
        },
        update: {
          amount: after.toNumber(),
          lastUpdatedBy: 'crypto_admin_approve',
        },
      });

      await tx.cryptoDepositTransaction.update({
        where: { id: txId },
        data: {
          status: 'confirmed',
          ngnAmount: ngnAmount.toNumber(),
          creditedAt: new Date(),
          metadata: {
            ...(depositTx.metadata as object),
            approvedBy: req.user.userId,
            approvedAt: new Date().toISOString(),
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
          idempotencyKey: `crypto_${txId}`,
          providerTxId: depositTx.providerTxId,
          beforeBalance: before.toNumber(),
          afterBalance: after.toNumber(),
          reference: `CRYPTO-${txId.substring(0, 8)}`,
          externalReference: depositTx.asset,
          metadata: {
            cryptoAmount: depositTx.cryptoAmount.toString(),
            cryptoCurrency: depositTx.asset,
            network: depositTx.network,
            exchangeRate: depositTx.exchangeRate.toString(),
            approvedBy: req.user.userId,
          },
        },
      });

      await tx.auditLog.create({
        data: {
          action: 'CRYPTO_DEPOSIT_APPROVED',
          userId: depositTx.userId,
          actorType: 'admin',
          metadata: {
            txId,
            cryptoAmount: depositTx.cryptoAmount.toString(),
            ngnAmount: ngnAmount.toString(),
            approvedBy: req.user.userId,
          },
        },
      });
    });

    return {
      success: true,
      data: {
        txId,
        status: 'confirmed',
        ngnAmount: ngnAmount.toFixed(2),
        message: 'Deposit approved and NGN credited to user.',
      },
    };
  }

  /**
   * Admin: reject a pending deposit.
   * PATCH /crypto/admin/reject/:txId
   */
  @Patch('admin/reject/:txId')
  async rejectDeposit(
    @Param('txId') txId: string,
    @Body('reason') reason: string,
    @Request() req: any,
  ) {
    // TODO: Add proper admin role guard in production

    const depositTx = await this.prisma.cryptoDepositTransaction.findUnique({
      where: { id: txId },
    });

    if (!depositTx) throw new BadRequestException('Deposit not found');
    if (depositTx.status === 'confirmed') {
      throw new BadRequestException('Cannot reject an already confirmed deposit');
    }

    await this.prisma.cryptoDepositTransaction.update({
      where: { id: txId },
      data: {
        status: 'failed',
        metadata: {
          ...(depositTx.metadata as object),
          rejectedBy: req.user.userId,
          rejectedAt: new Date().toISOString(),
          rejectionReason: reason || 'Deposit not found on-chain',
        },
      },
    });

    await this.prisma.auditLog.create({
      data: {
        action: 'CRYPTO_DEPOSIT_REJECTED',
        userId: depositTx.userId,
        actorType: 'admin',
        metadata: {
          txId,
          reason: reason || 'Deposit not found on-chain',
          rejectedBy: req.user.userId,
        },
      },
    });

    return {
      success: true,
      data: { txId, status: 'rejected', reason },
    };
  }
}
