import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma.service';
import Decimal from 'decimal.js';

export interface WalletOperation {
  userId: string;
  amount: Decimal;
  currency: string;
  type: 'receive' | 'send' | 'swap';
  provider: 'monnify' | 'paystack' | 'yellowcard';
  reference: string;
  metadata?: Record<string, unknown>;
}

export interface WalletBalance {
  ngn: Decimal;
  usdt: Decimal;
  btc?: Decimal;
  eth?: Decimal;
}

@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);

  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
  ) {}

  /**
   * Get user's complete wallet balance across all currencies
   */
  async getWalletBalance(userId: string): Promise<WalletBalance> {
    const balances = await this.prisma.balance.findMany({
      where: { userId },
    });

    const result: WalletBalance = {
      ngn: new Decimal(0),
      usdt: new Decimal(0),
    };

    for (const balance of balances) {
      const amount = new Decimal(balance.amount.toString());
      
      switch (balance.currency) {
        case 'NGN':
          result.ngn = amount;
          break;
        case 'USDT':
          result.usdt = amount;
          break;
        case 'BTC':
          result.btc = amount;
          break;
        case 'ETH':
          result.eth = amount;
          break;
      }
    }

    return result;
  }

  /**
   * Receive money via Monnify (Virtual Account)
   * Credits the NGN wallet when money is received
   */
  async receiveViaMonnify(
    userId: string,
    amount: number | string | Decimal,
    reference: string,
    metadata?: {
      accountNumber?: string;
      bankName?: string;
      senderName?: string;
    },
  ): Promise<{ success: boolean; newBalance: Decimal; transactionId: string }> {
    const ngnAmount = new Decimal(amount);
    
    if (ngnAmount.lessThanOrEqualTo(0)) {
      throw new BadRequestException('Amount must be greater than 0');
    }

    // Check for idempotency
    const existingTx = await this.prisma.transaction.findUnique({
      where: { idempotencyKey: reference },
    });

    if (existingTx) {
      this.logger.warn('Duplicate Monnify transaction received', { reference });
      return {
        success: true,
        newBalance: new Decimal(existingTx.afterBalance?.toString() || '0'),
        transactionId: existingTx.id,
      };
    }

    // Atomic transaction
    const result = await this.prisma.$transaction(async (tx) => {
      // Get current balance
      const currentBalance = await tx.balance.findUnique({
        where: {
          userId_currency: {
            userId,
            currency: 'NGN',
          },
        },
      });

      const beforeBalance = currentBalance 
        ? new Decimal(currentBalance.amount.toString())
        : new Decimal(0);
      const afterBalance = beforeBalance.add(ngnAmount);

      // Update balance
      await tx.balance.upsert({
        where: {
          userId_currency: {
            userId,
            currency: 'NGN',
          },
        },
        create: {
          userId,
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
      const transaction = await tx.transaction.create({
        data: {
          receiverId: userId,
          amount: ngnAmount.toNumber(),
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
            ...metadata,
          },
        },
      });

      // Create audit log
      await tx.auditLog.create({
        data: {
          action: 'MONNIFY_DEPOSIT_RECEIVED',
          userId,
          actorType: 'system',
          metadata: {
            reference,
            amount: ngnAmount.toString(),
            ...metadata,
          },
        },
      });

      return { transaction, afterBalance };
    });

    this.logger.log(`Monnify deposit: ${ngnAmount.toString()} NGN credited to user ${userId}`, {
      reference,
    });

    return {
      success: true,
      newBalance: result.afterBalance,
      transactionId: result.transaction.id,
    };
  }

  /**
   * Send money via Paystack (Payouts)
   * Debits the NGN wallet when money is sent
   */
  async sendViaPaystack(
    userId: string,
    amount: number | string | Decimal,
    reference: string,
    metadata?: {
      recipientName?: string;
      recipientAccount?: string;
      bankCode?: string;
    },
  ): Promise<{ success: boolean; newBalance: Decimal; transactionId: string }> {
    const ngnAmount = new Decimal(amount);

    if (ngnAmount.lessThanOrEqualTo(0)) {
      throw new BadRequestException('Amount must be greater than 0');
    }

    // Check user has sufficient balance
    const currentBalance = await this.prisma.balance.findUnique({
      where: {
        userId_currency: {
          userId,
          currency: 'NGN',
        },
      },
    });

    const availableBalance = currentBalance 
      ? new Decimal(currentBalance.amount.toString())
      : new Decimal(0);

    if (availableBalance.lessThan(ngnAmount)) {
      throw new BadRequestException('Insufficient balance');
    }

    // Check for idempotency
    const existingTx = await this.prisma.transaction.findUnique({
      where: { idempotencyKey: reference },
    });

    if (existingTx) {
      this.logger.warn('Duplicate Paystack transaction received', { reference });
      return {
        success: true,
        newBalance: new Decimal(existingTx.afterBalance?.toString() || '0'),
        transactionId: existingTx.id,
      };
    }

    // Atomic transaction
    const result = await this.prisma.$transaction(async (tx) => {
      const beforeBalance = availableBalance;
      const afterBalance = beforeBalance.sub(ngnAmount);

      // Update balance
      await tx.balance.update({
        where: {
          userId_currency: {
            userId,
            currency: 'NGN',
          },
        },
        data: {
          amount: afterBalance.toNumber(),
          lastUpdatedBy: 'paystack_payout',
        },
      });

      // Create transaction record
      const transaction = await tx.transaction.create({
        data: {
          senderId: userId,
          amount: ngnAmount.toNumber(),
          currency: 'NGN',
          type: 'withdrawal',
          status: 'PENDING', // Will be updated via webhook
          idempotencyKey: reference,
          providerTxId: reference,
          beforeBalance: beforeBalance.toNumber(),
          afterBalance: afterBalance.toNumber(),
          reference: `PAYSTACK-${reference}`,
          metadata: {
            provider: 'paystack',
            ...metadata,
          },
        },
      });

      // Create audit log
      await tx.auditLog.create({
        data: {
          action: 'PAYSTACK_PAYOUT_INITIATED',
          userId,
          actorType: 'user',
          metadata: {
            reference,
            amount: ngnAmount.toString(),
            ...metadata,
          },
        },
      });

      return { transaction, afterBalance };
    });

    this.logger.log(`Paystack payout: ${ngnAmount.toString()} NGN debited from user ${userId}`, {
      reference,
    });

    return {
      success: true,
      newBalance: result.afterBalance,
      transactionId: result.transaction.id,
    };
  }

  /**
   * Swap to crypto via Yellow Card
   * Debits NGN wallet and creates crypto order
   */
  async swapToCrypto(
    userId: string,
    ngnAmount: number | string | Decimal,
    cryptoAsset: 'USDT' | 'BTC' | 'ETH' = 'USDT',
    network = 'TRC20',
  ): Promise<{
    success: boolean;
    cryptoAmount: Decimal;
    exchangeRate: Decimal;
    fee: Decimal;
    transactionId: string;
  }> {
    const amount = new Decimal(ngnAmount);

    if (amount.lessThanOrEqualTo(0)) {
      throw new BadRequestException('Amount must be greater than 0');
    }

    // Check user has sufficient NGN balance
    const currentBalance = await this.prisma.balance.findUnique({
      where: {
        userId_currency: {
          userId,
          currency: 'NGN',
        },
      },
    });

    const availableBalance = currentBalance 
      ? new Decimal(currentBalance.amount.toString())
      : new Decimal(0);

    if (availableBalance.lessThan(amount)) {
      throw new BadRequestException('Insufficient NGN balance');
    }

    // Calculate crypto amount (this would call YellowCardService in production)
    const { cryptoAmount, exchangeRate, fee } = await this.calculateCryptoFromNgn(amount, cryptoAsset);

    const transactionId = `swap_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Atomic transaction
    await this.prisma.$transaction(async (tx) => {
      const beforeBalance = availableBalance;
      const afterBalance = beforeBalance.sub(amount);

      // Debit NGN balance
      await tx.balance.update({
        where: {
          userId_currency: {
            userId,
            currency: 'NGN',
          },
        },
        data: {
          amount: afterBalance.toNumber(),
          lastUpdatedBy: 'crypto_swap',
        },
      });

      // Create transaction record
      await tx.transaction.create({
        data: {
          senderId: userId,
          amount: amount.toNumber(),
          currency: 'NGN',
          type: 'crypto_swap',
          status: 'PENDING',
          idempotencyKey: transactionId,
          providerTxId: transactionId,
          beforeBalance: beforeBalance.toNumber(),
          afterBalance: afterBalance.toNumber(),
          reference: `SWAP-${transactionId}`,
          metadata: {
            provider: 'yellowcard',
            cryptoAmount: cryptoAmount.toString(),
            cryptoCurrency: cryptoAsset,
            network,
            exchangeRate: exchangeRate.toString(),
            fee: fee.toString(),
          },
        },
      });

      // Create audit log
      await tx.auditLog.create({
        data: {
          action: 'CRYPTO_SWAP_INITIATED',
          userId,
          actorType: 'user',
          metadata: {
            transactionId,
            ngnAmount: amount.toString(),
            cryptoAmount: cryptoAmount.toString(),
            cryptoCurrency: cryptoAsset,
            network,
            exchangeRate: exchangeRate.toString(),
            fee: fee.toString(),
          },
        },
      });
    });

    this.logger.log(`Crypto swap initiated: ${amount.toString()} NGN -> ${cryptoAmount.toString()} ${cryptoAsset}`, {
      userId,
      transactionId,
    });

    return {
      success: true,
      cryptoAmount,
      exchangeRate,
      fee,
      transactionId,
    };
  }

  /**
   * Calculate crypto amount from NGN (mock - would use YellowCard API)
   */
  private async calculateCryptoFromNgn(
    ngnAmount: Decimal,
    asset: string,
  ): Promise<{
    cryptoAmount: Decimal;
    exchangeRate: Decimal;
    fee: Decimal;
  }> {
    // Mock rates - in production, call Yellow Card API
    const rates: Record<string, number> = {
      USDT: 1530.50,
      BTC: 95000000.00,
      ETH: 5200000.00,
    };

    const rate = new Decimal(rates[asset] || 1500);
    const fee = ngnAmount.mul(0.01); // 1% fee
    const amountAfterFee = ngnAmount.sub(fee);
    const cryptoAmount = amountAfterFee.div(rate);

    return {
      cryptoAmount,
      exchangeRate: rate,
      fee,
    };
  }

  /**
   * Get transaction history
   */
  async getTransactionHistory(
    userId: string,
    options?: {
      type?: string;
      currency?: string;
      limit?: number;
      offset?: number;
    },
  ) {
    const { type, currency, limit = 20, offset = 0 } = options || {};

    const where: Record<string, unknown> = {
      OR: [
        { senderId: userId },
        { receiverId: userId },
      ],
    };

    if (type) {
      where.type = type;
    }

    if (currency) {
      where.currency = currency;
    }

    const transactions = await this.prisma.transaction.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    });

    const total = await this.prisma.transaction.count({ where });

    return {
      transactions,
      total,
      limit,
      offset,
    };
  }

  /**
   * Handle webhook confirmations
   */
  async confirmTransaction(
    reference: string,
    status: 'SUCCESS' | 'FAILED',
  ): Promise<void> {
    await this.prisma.transaction.update({
      where: { idempotencyKey: reference },
      data: { status },
    });

    this.logger.log(`Transaction ${reference} status updated to ${status}`);
  }
}
