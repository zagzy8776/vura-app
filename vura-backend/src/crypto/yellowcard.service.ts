import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma.service';
import Decimal from 'decimal.js';
import * as crypto from 'crypto';

// Network configuration with confirmation requirements
const NETWORK_CONFIG = {
  USDT: {
    TRC20: { minConfirmations: 19, avgBlockTime: 3 }, // Tron
    BEP20: { minConfirmations: 15, avgBlockTime: 3 }, // BSC
    ERC20: { minConfirmations: 12, avgBlockTime: 12 }, // Ethereum
  },
  BTC: {
    BTC: { minConfirmations: 3, avgBlockTime: 600 }, // Bitcoin
  },
  ETH: {
    ETH: { minConfirmations: 12, avgBlockTime: 12 }, // Ethereum
  },
};

@Injectable()
export class YellowCardService {
  private readonly logger = new Logger(YellowCardService.name);
  private readonly apiKey: string;
  private readonly apiSecret: string;
  private readonly baseUrl: string;
  private readonly webhookSecret: string;

  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
  ) {
    this.apiKey = this.config.get('YELLOWCARD_API_KEY') || '';
    this.apiSecret = this.config.get('YELLOWCARD_API_SECRET') || '';
    this.baseUrl = this.config.get('YELLOWCARD_BASE_URL') || 'https://api.yellowcard.io';
    this.webhookSecret = this.config.get('YELLOWCARD_WEBHOOK_SECRET') || '';
  }

  /**
   * Generate a new deposit address for a user
   * Security: One address per user per network to prevent confusion
   */
  async generateDepositAddress(
    userId: string,
    asset: 'USDT' | 'BTC' | 'ETH',
    network: string,
  ) {
    // Validate network is supported for asset
    const config = (NETWORK_CONFIG as any)[asset]?.[network];

    if (!config) {
      throw new BadRequestException(`Network ${network} not supported for ${asset}`);
    }

    // Check if address already exists
    const existing = await this.prisma.cryptoDeposit.findUnique({
      where: {
        userId_asset_network: {
          userId,
          asset,
          network,
        },
      },
    });

    if (existing && existing.status === 'active') {
      return {
        address: existing.address,
        memo: existing.memo,
        network,
        asset,
        minConfirmations: config.minConfirmations,
        warnings: this.getNetworkWarnings(network),
      };
    }

    // Call Yellow Card API to generate address
    // In production, this would be a real API call
    // For now, simulating the response structure
    const mockAddress = this.generateMockAddress(asset, network);
    
    const deposit = await this.prisma.cryptoDeposit.create({
      data: {
        userId,
        asset,
        network,
        address: mockAddress.address,
        memo: mockAddress.memo,
        providerRef: `yc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        status: 'active',
      },
    });

    this.logger.log(`Generated ${asset} ${network} address for user ${userId}`);

    return {
      address: deposit.address,
      memo: deposit.memo,
      network,
      asset,
      minConfirmations: config.minConfirmations,
      warnings: this.getNetworkWarnings(network),
    };
  }

  /**
   * Verify webhook signature to prevent spoofing
   * Security: HMAC-SHA256 of raw body with webhook secret
   */
  verifyWebhookSignature(payload: string, signature: string): boolean {
    if (!this.webhookSecret) {
      this.logger.error('YELLOWCARD_WEBHOOK_SECRET not configured!');
      return false;
    }

    const expected = crypto
      .createHmac('sha256', this.webhookSecret)
      .update(payload, 'utf8')
      .digest('hex');

    // Constant-time comparison to prevent timing attacks
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expected, 'hex'),
    );
  }

  /**
   * Get current exchange rate with 15-minute cache
   */
  async getExchangeRate(pair: string): Promise<Decimal> {
    // Check cache first
    const cached = await this.prisma.exchangeRate.findUnique({
      where: { pair_provider: { pair, provider: 'yellowcard' } },
    });

    if (cached && cached.expiresAt > new Date()) {
      return new Decimal(cached.rate.toString());
    }

    // Fetch from Yellow Card API (mock for now)
    const rate = await this.fetchRateFromAPI(pair);
    
    // Cache for 15 minutes
    await this.prisma.exchangeRate.upsert({
      where: { pair_provider: { pair, provider: 'yellowcard' } },
      create: {
        pair,
        rate,
        provider: 'yellowcard',
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      },
      update: {
        rate,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      },
    });

    return new Decimal(rate.toString());
  }

  /**
   * Calculate NGN amount from crypto amount
   * Security: Use Decimal.js for exact precision, no floating point errors
   */
  async calculateNgnAmount(
    cryptoAmount: Decimal,
    asset: string,
  ): Promise<{ ngnAmount: Decimal; rate: Decimal }> {
    const pair = `${asset}_NGN`;
    const rate = await this.getExchangeRate(pair);
    
    // Apply 0.5% spread (you keep this as revenue)
    const adjustedRate = rate.mul(0.995);
    
    const ngnAmount = cryptoAmount.mul(adjustedRate);
    
    return { ngnAmount, rate: adjustedRate };
  }

  /**
   * Get network-specific warnings for UI
   */
  private getNetworkWarnings(network: string): string[] {
    const warnings: Record<string, string[]> = {
      TRC20: [
        'Send only USDT on Tron network (TRC20)',
        'Sending other assets or networks will result in permanent loss',
        'Minimum deposit: 10 USDT',
      ],
      BEP20: [
        'Send only USDT on BSC network (BEP20)',
        'Do not send USDC or other BEP20 tokens',
        'Minimum deposit: 10 USDT',
      ],
      ERC20: [
        'Send only USDT on Ethereum network (ERC20)',
        'High gas fees - only recommended for large deposits',
        'Minimum deposit: 100 USDT',
      ],
      BTC: [
        'Send only Bitcoin (BTC)',
        'Minimum deposit: 0.001 BTC',
      ],
      ETH: [
        'Send only Ethereum (ETH)',
        'High gas fees - only recommended for large deposits',
        'Minimum deposit: 0.05 ETH',
      ],
    };

    return warnings[network] || ['Verify network before sending'];
  }

  /**
   * Mock address generation (replace with real Yellow Card API)
   */
  private generateMockAddress(asset: string, network: string): { address: string; memo?: string } {
    const prefix = asset.toLowerCase();
    const random = crypto.randomBytes(20).toString('hex');
    
    if (asset === 'USDT') {
      if (network === 'TRC20') {
        return { address: `T${random.substr(0, 33)}` }; // Tron address
      }
      return { address: `0x${random}` }; // EVM address
    }
    
    if (asset === 'BTC') {
      return { address: `bc1q${random.substr(0, 38)}` }; // Bech32
    }
    
    return { address: `0x${random}` };
  }

  /**
   * Mock rate fetch (replace with real Yellow Card API)
   */
  private async fetchRateFromAPI(pair: string): Promise<number> {
    // Mock rates - in production, call Yellow Card
    const rates: Record<string, number> = {
      'USDT_NGN': 1530.50,
      'BTC_NGN': 95000000.00,
      'ETH_NGN': 5200000.00,
    };
    
    // Simulate API delay
    await new Promise(r => setTimeout(r, 100));
    
    return rates[pair] || 1500;
  }
}
