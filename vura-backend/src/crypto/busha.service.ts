import {
  Injectable,
  Logger,
  InternalServerErrorException,
} from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import { PrismaService } from '../prisma.service';

export interface BushaWallet {
  id: string;
  address: string;
  balance: number;
  currency: string;
  network: string;
}

export interface BushaDepositAddress {
  id: string;
  address: string;
  network: string;
  currency: string;
  memo?: string;
}

export interface BushaExchangeRate {
  pair: string;
  rate: number;
  timestamp: string;
}

@Injectable()
export class BushaService {
  private client: AxiosInstance;
  private readonly logger = new Logger(BushaService.name);
  private readonly secretKey = process.env.BUSHA_SECRET_KEY || '';
  private readonly baseUrl =
    process.env.BUSHA_BASE_URL || 'https://api.busha.co/v1';

  constructor(private prisma: PrismaService) {
    if (!this.secretKey) {
      this.logger.warn(
        'BUSHA_SECRET_KEY not configured. Crypto operations will fail.',
      );
    }

    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000,
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Get or create a crypto deposit address for a user
   */
  async getOrCreateDepositAddress(
    userId: string,
    asset: 'USDT' | 'BTC' | 'ETH',
    network: string,
  ): Promise<BushaDepositAddress> {
    try {
      this.logger.log(
        `Getting deposit address for user ${userId}: ${asset} on ${network}`,
      );

      // Check if address already exists in database
      const existingDeposit = await this.prisma.cryptoDeposit.findUnique({
        where: {
          userId_asset_network: { userId, asset, network },
        },
      });

      if (existingDeposit && existingDeposit.address) {
        this.logger.log(
          `Using existing deposit address for ${userId}: ${existingDeposit.address}`,
        );
        return {
          id: existingDeposit.id,
          address: existingDeposit.address,
          network,
          currency: asset,
          memo: existingDeposit.memo || undefined,
        };
      }

      // Request new address from Busha
      const response = await this.client.post('/wallets/address', {
        asset,
        network,
      });

      const newAddress = (response.data?.data || {}) as BushaDepositAddress;

      // Store in database
      await this.prisma.cryptoDeposit.upsert({
        where: {
          userId_asset_network: { userId, asset, network },
        },
        update: {
          address: newAddress.address,
          memo: newAddress.memo,
          status: 'active',
        },
        create: {
          userId,
          asset,
          network,
          address: newAddress.address,
          memo: newAddress.memo,
          providerRef: newAddress.id,
          status: 'active',
        },
      });

      this.logger.log(
        `Created new deposit address for ${userId}: ${newAddress.address}`,
      );

      return newAddress;
    } catch (error) {
      this.logger.error(
        `Error getting deposit address: ${(error as Error).message}`,
        (error as Error).stack,
      );
      throw new InternalServerErrorException(
        'Failed to generate crypto deposit address. Please try again.',
      );
    }
  }

  /**
   * Get current exchange rates
   */
  async getExchangeRates(pairs: string[]): Promise<BushaExchangeRate[]> {
    try {
      this.logger.log(`Fetching exchange rates for: ${pairs.join(', ')}`);

      const rates: BushaExchangeRate[] = [];

      for (const pair of pairs) {
        try {
          const response = await this.client.get(`/prices/${pair}`);
          const rateValue = parseFloat(response.data?.data?.rate || '0');
          rates.push({
            pair,
            rate: rateValue,
            timestamp: new Date().toISOString(),
          });

          // Cache rate in database
          await this.prisma.exchangeRate.upsert({
            where: {
              pair_provider: { pair, provider: 'busha' },
            },
            update: {
              rate: rateValue,
              expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 minute cache
            },
            create: {
              pair,
              rate: rateValue,
              provider: 'busha',
              expiresAt: new Date(Date.now() + 5 * 60 * 1000),
            },
          });
        } catch (pairError) {
          this.logger.warn(`Failed to fetch rate for ${pair}:`, pairError);
          // Try cached rate
          const cached = await this.prisma.exchangeRate.findFirst({
            where: {
              pair,
              expiresAt: { gt: new Date() },
            },
          });
          if (cached) {
            rates.push({
              pair,
              rate: cached.rate.toNumber(),
              timestamp: cached.createdAt.toISOString(),
            });
          }
        }
      }

      return rates;
    } catch (error) {
      this.logger.error(
        `Error fetching exchange rates: ${(error as Error).message}`,
      );
      throw new InternalServerErrorException('Failed to fetch exchange rates');
    }
  }

  /**
   * Get user's crypto balances
   */
  async getUserBalances(userId: string): Promise<BushaWallet[]> {
    try {
      this.logger.log(`Fetching balances for user ${userId}`);

      const response = await this.client.get('/wallets');
      const wallets = (response.data?.data || []) as BushaWallet[];

      return wallets;
    } catch (error) {
      this.logger.error(
        `Error fetching user balances: ${(error as Error).message}`,
      );
      throw new InternalServerErrorException('Failed to fetch crypto balances');
    }
  }

  /**
   * Get deposit transaction details
   */
  async getDepositTransaction(transactionId: string): Promise<{
    id: string;
    status: string;
    amount: number;
    currency: string;
    confirmations: number;
    minConfirmations: number;
    txHash: string;
  }> {
    try {
      this.logger.log(`Fetching deposit transaction: ${transactionId}`);

      const response = await this.client.get(`/deposits/${transactionId}`);
      const tx = response.data?.data || {};

      return {
        id: String(tx.id || ''),
        status: String(tx.status || 'unknown'),
        amount: Number(tx.amount || 0),
        currency: String(tx.currency || ''),
        confirmations: Number(tx.confirmations || 0),
        minConfirmations: Number(tx.minConfirmations || 0),
        txHash: String(tx.txHash || ''),
      };
    } catch (error) {
      this.logger.error(
        `Error fetching transaction: ${(error as Error).message}`,
      );
      throw new InternalServerErrorException(
        'Failed to fetch transaction details',
      );
    }
  }

  /**
   * Process incoming crypto deposit
   */
  async processDeposit(
    userId: string,
    depositId: string,
    cryptoAmount: number,
    asset: string,
  ): Promise<void> {
    try {
      this.logger.log(
        `Processing crypto deposit for user ${userId}: ${cryptoAmount} ${asset}`,
      );

      // Get current exchange rate
      const pair = `${asset}_NGN`;
      const rates = await this.getExchangeRates([pair]);
      const rate = rates[0]?.rate || 0;

      if (rate <= 0) {
        throw new InternalServerErrorException('Invalid exchange rate');
      }

      const ngnAmount = cryptoAmount * rate;

      // Create crypto deposit transaction record
      const deposit = await this.prisma.cryptoDeposit.findUnique({
        where: { id: depositId },
      });

      if (!deposit) {
        throw new InternalServerErrorException('Crypto deposit not found');
      }

      // Record crypto deposit transaction
      await this.prisma.cryptoDepositTransaction.create({
        data: {
          depositId,
          userId,
          providerTxId: `busha_${Date.now()}`,
          asset,
          network: deposit.network,
          cryptoAmount: cryptoAmount,
          cryptoCurrency: asset,
          exchangeRate: rate,
          ngnAmount: ngnAmount,
          minConfirmations: 1,
          status: 'confirming',
          metadata: {
            processedAt: new Date().toISOString(),
          },
        },
      });

      // Update user NGN balance
      await this.prisma.balance.upsert({
        where: {
          userId_currency: { userId, currency: 'NGN' },
        },
        update: {
          amount: {
            increment: ngnAmount,
          },
          lastUpdatedBy: 'busha_deposit',
          updatedAt: new Date(),
        },
        create: {
          userId,
          currency: 'NGN',
          amount: ngnAmount,
          lastUpdatedBy: 'busha_deposit',
        },
      });

      // Log audit
      await this.prisma.auditLog.create({
        data: {
          action: 'CRYPTO_DEPOSIT_PROCESSED',
          userId,
          actorType: 'system',
          metadata: {
            cryptoAmount,
            asset,
            exchangeRate: rate,
            ngnAmount,
            network: deposit.network,
          },
        },
      });

      this.logger.log(
        `Successfully processed deposit: ${cryptoAmount} ${asset} = ₦${ngnAmount}`,
      );
    } catch (error) {
      this.logger.error(
        `Error processing deposit: ${(error as Error).message}`,
        (error as Error).stack,
      );
      throw error;
    }
  }

  /**
   * Test connection to Busha
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.client.get('/health');
      return true;
    } catch (error) {
      this.logger.error(`Busha connection failed: ${(error as Error).message}`);
      return false;
    }
  }
}
