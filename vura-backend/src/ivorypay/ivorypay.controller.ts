import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  BadRequestException,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CoinGeckoService } from '../crypto/coingecko.service';
import { FlutterwaveService } from '../services/flutterwave.service';
import { PrismaService } from '../prisma.service';
import Decimal from 'decimal.js';

@Controller('ivorypay')
@UseGuards(AuthGuard)
export class IvoryPayController {
  constructor(
    private coinGecko: CoinGeckoService,
    private flutterwave: FlutterwaveService,
    private prisma: PrismaService,
  ) {}

  /**
   * Preview how much NGN the user will receive for a given crypto amount.
   * Uses CoinGecko for rates (free, no API key needed)
   * GET /ivorypay/rates?amount=50&crypto=USDT&fiat=NGN
   */
  @Get('rates')
  async previewRate(
    @Query('amount') amount: string,
    @Query('crypto') crypto: string,
    @Query('fiat') fiat: string,
  ) {
    if (!amount || parseFloat(amount) <= 0) {
      throw new BadRequestException('amount must be a positive number');
    }

    const cryptoAsset = (crypto || 'USDT').toUpperCase();
    
    // Get rate from CoinGecko
    const rate = await this.coinGecko.getRate(cryptoAsset, fiat || 'NGN');
    const cryptoAmount = new Decimal(amount);
    
    // Apply 1% platform spread (you keep this as revenue)
    const adjustedRate = rate.mul(0.99);
    const ngnAmount = cryptoAmount.mul(adjustedRate);

    const rateData = {
      crypto: cryptoAsset,
      fiatEquivalent: ngnAmount.toFixed(2),
      rate: adjustedRate.toFixed(2),
      amount: amount,
    };

    return { success: true, data: rateData };
  }

  /**
   * Get or create a deposit address for the user.
   * Uses static business wallet addresses
   * POST /ivorypay/deposit-address
   */
  @Post('deposit-address')
  async getDepositAddress(
    @Body('crypto') crypto: string,
    @Body('network') network: string,
    @Request() req: any,
  ) {
    const userId: string = req.user.userId;
    const asset = (crypto || 'USDT').toUpperCase();
    
    // Map network names to standardized format
    const networkMap: Record<string, string> = {
      'tron': 'TRC20',
      'trc20': 'TRC20',
      'bsc': 'BEP20',
      'bep20': 'BEP20',
      'ethereum': 'ERC20',
      'erc20': 'ERC20',
      'bitcoin': 'BTC',
      'btc': 'BTC',
    };
    
    const normalizedNetwork = networkMap[(network || 'tron').toLowerCase()] || 'TRC20';

    // Check if user already has an address for this asset/network
    const existing = await this.prisma.cryptoDeposit.findUnique({
      where: {
        userId_asset_network: { userId, asset, network: normalizedNetwork },
      },
    });

    if (existing?.address && existing.status === 'active') {
      return {
        success: true,
        data: {
          id: existing.id,
          address: existing.address,
          crypto: asset,
          network: network || 'tron',
          reference: existing.providerRef,
          status: 'active',
          createdAt: existing.createdAt.toISOString(),
        },
      };
    }

    // Get the business wallet address
    const wallet = this.coinGecko.getDepositAddress(asset, normalizedNetwork);

    // If no business wallet configured, we need to inform the user
    if (wallet.address === 'WALLET_NOT_CONFIGURED') {
      throw new BadRequestException(
        'Crypto deposits are currently unavailable. Please contact support to enable crypto deposits.'
      );
    }

    // Create deposit record
    const deposit = await this.prisma.cryptoDeposit.upsert({
      where: {
        userId_asset_network: { userId, asset, network: normalizedNetwork },
      },
      update: {
        address: wallet.address,
        status: 'active',
      },
      create: {
        userId,
        asset,
        network: normalizedNetwork,
        address: wallet.address,
        providerRef: `static_${asset}_${normalizedNetwork}`,
        status: 'active',
      },
    });

    const response = {
      id: deposit.id,
      address: deposit.address,
      crypto: asset,
      network: network || 'tron',
      reference: deposit.providerRef,
      status: 'active',
      createdAt: deposit.createdAt.toISOString(),
    };

    return { success: true, data: response };
  }

  /**
   * Resolve a bank account (verify name before payout).
   * POST /ivorypay/resolve-account
   */
  @Post('resolve-account')
  async resolveAccount(
    @Body('bankCode') bankCode: string,
    @Body('accountNumber') accountNumber: string,
  ) {
    if (!bankCode || !accountNumber) {
      throw new BadRequestException('bankCode and accountNumber are required');
    }

    // Use Flutterwave for account resolution
    const result = await this.flutterwave.verifyAccount(accountNumber, bankCode);

    if (!result.success) {
      throw new BadRequestException(result.error || 'Account resolution failed');
    }

    return { 
      success: true, 
      data: {
        accountName: result.accountName,
        accountNumber: accountNumber,
        bankName: result.bankName,
      } 
    };
  }

  /**
   * Manually trigger a fiat payout (crypto withdrawal).
   * Converts user's crypto balance to Naira and sends to bank account via Flutterwave
   * POST /ivorypay/payout
   */
  @Post('payout')
  async manualPayout(
    @Body('amount') amount: string,
    @Body('crypto') crypto: string,
    @Request() req: any,
  ) {
    const userId: string = req.user.userId;
    const cryptoAsset = (crypto || 'USDT').toUpperCase();

    if (!amount || parseFloat(amount) <= 0) {
      throw new BadRequestException('amount must be positive');
    }

    // Get user's crypto balance
    const balance = await this.prisma.balance.findUnique({
      where: {
        userId_currency: { userId, currency: cryptoAsset },
      },
    });

    const currentBalance = balance 
      ? new Decimal(balance.amount.toString())
      : new Decimal(0);
    const payoutAmount = new Decimal(amount);

    if (currentBalance.lessThan(payoutAmount)) {
      throw new BadRequestException('Insufficient crypto balance');
    }

    // Get user's primary bank account
    const bank = await this.prisma.bankAccount.findFirst({
      where: { userId, isPrimary: true, status: 'active' },
    });

    if (!bank) {
      throw new BadRequestException(
        'No primary bank account. Add one in Settings first.',
      );
    }

    // Calculate NGN amount from crypto using current rate
    const { ngnAmount, rate } = await this.coinGecko.calculateNgnAmount(
      payoutAmount,
      cryptoAsset,
    );

    // Calculate fees (Flutterwave fee + stamp duty)
    const feeInfo = this.flutterwave.calculateTransferFee(ngnAmount.toNumber());
    const netAmount = ngnAmount.sub(feeInfo.total);

    if (netAmount.lessThanOrEqualTo(0)) {
      throw new BadRequestException('Amount too small to cover transfer fees');
    }

    // Create transaction record
    const reference = `CRYPTO-PAYOUT-${userId.slice(0, 8)}-${Date.now()}`;
    
    // Initiate Flutterwave transfer
    const transferResult = await this.flutterwave.initiateTransfer(
      bank.accountNumber,
      bank.bankCode,
      bank.accountName,
      netAmount.toNumber(),
      reference,
      `Crypto withdrawal: ${payoutAmount} ${cryptoAsset}`,
    );

    if (!transferResult.success) {
      throw new BadRequestException(transferResult.error || 'Transfer failed');
    }

    // Deduct crypto balance
    const newBalance = currentBalance.sub(payoutAmount);
    await this.prisma.balance.update({
      where: {
        userId_currency: { userId, currency: cryptoAsset },
      },
      data: {
        amount: newBalance.toNumber(),
        lastUpdatedBy: 'crypto_payout',
      },
    });

    // Create transaction record
    await this.prisma.transaction.create({
      data: {
        senderId: userId,
        amount: netAmount.toNumber(),
        currency: 'NGN',
        type: 'crypto_withdrawal',
        status: 'PENDING',
        idempotencyKey: reference,
        providerTxId: transferResult.reference,
        reference: reference,
        metadata: {
          cryptoAmount: payoutAmount.toString(),
          cryptoCurrency: cryptoAsset,
          exchangeRate: rate.toString(),
          ngnAmount: ngnAmount.toString(),
          fee: feeInfo.fee.toString(),
          stampDuty: feeInfo.stampDuty.toString(),
          bankAccount: bank.accountNumber.slice(-4),
        },
      },
    });

    return { 
      success: true, 
      data: {
        id: reference,
        amount: netAmount.toFixed(2),
        currency: 'NGN',
        status: transferResult.status,
        reference: transferResult.reference,
        fee: feeInfo.fee,
        stampDuty: feeInfo.stampDuty,
        cryptoAmount: payoutAmount.toString(),
        cryptoCurrency: cryptoAsset,
        exchangeRate: rate.toFixed(2),
        bankName: bank.bankName,
        accountNumber: bank.accountNumber.slice(-4),
      }
    };
  }

  /**
   * Verify a transaction by reference.
   * GET /ivorypay/verify/:reference
   */
  @Get('verify/:reference')
  async verify(@Param('reference') reference: string) {
    const tx = await this.prisma.transaction.findFirst({
      where: { 
        OR: [
          { providerTxId: reference },
          { idempotencyKey: reference },
        ]
      },
    });

    if (!tx) {
      return { 
        success: false, 
        data: {
          status: 'not_found',
          reference: reference,
        }
      };
    }

    return { 
      success: true, 
      data: {
        status: tx.status.toLowerCase(),
        reference: reference,
        amount: tx.amount,
        currency: tx.currency,
      }
    };
  }
}

