import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import Decimal from 'decimal.js';

const ASSET_MAP: Record<string, string> = {
  USDT: 'tether',
  BTC: 'bitcoin',
  ETH: 'ethereum',
};

@Injectable()
export class CoinGeckoService {
  private readonly logger = new Logger(CoinGeckoService.name);
  private readonly baseUrl = 'https://api.coingecko.com/api/v3';
  private readonly apiKey: string;

  private readonly businessWallets: Record<string, { address: string; network: string }>;

  private rateCache: Map<string, { rate: Decimal; expiresAt: Date }> = new Map();
  private readonly CACHE_TTL = 5 * 60 * 1000;

  constructor(private config: ConfigService) {
    this.apiKey = this.config.get('COINGECKO_API_KEY') || '';

    // Static business wallet addresses — set these in your environment variables.
    // Use your own wallet addresses (e.g. Trust Wallet, MetaMask).
    // If not configured, the endpoint will return an error instead of a fake address.
    this.businessWallets = {
      USDT_TRC20: {
        address: this.config.get('BUSINESS_USDT_TRC20_ADDRESS') || '',
        network: 'TRC20',
      },
      USDT_BEP20: {
        address: this.config.get('BUSINESS_USDT_BEP20_ADDRESS') || '',
        network: 'BEP20',
      },
      USDT_ERC20: {
        address: this.config.get('BUSINESS_USDT_ERC20_ADDRESS') || '',
        network: 'ERC20',
      },
      BTC_BTC: {
        address: this.config.get('BUSINESS_BTC_ADDRESS') || '',
        network: 'BTC',
      },
      ETH_ETH: {
        address: this.config.get('BUSINESS_ETH_ADDRESS') || '',
        network: 'ETH',
      },
    };

    const configured = Object.entries(this.businessWallets).filter(([, v]) => v.address);
    this.logger.log(`Business wallets configured: ${configured.map(([k]) => k).join(', ') || 'NONE'}`);

    if (configured.length === 0) {
      this.logger.warn(
        'No business wallet addresses configured! Set BUSINESS_USDT_TRC20_ADDRESS etc. in env.',
      );
    }
  }

  /**
   * Get current exchange rate for crypto → fiat via CoinGecko (free API).
   */
  async getRate(cryptoAsset: string, fiat = 'NGN'): Promise<Decimal> {
    const cacheKey = `${cryptoAsset}_${fiat}`;
    const cached = this.rateCache.get(cacheKey);

    if (cached && cached.expiresAt > new Date()) {
      return cached.rate;
    }

    try {
      const coingeckoId = ASSET_MAP[cryptoAsset.toUpperCase()];
      if (!coingeckoId) {
        throw new BadRequestException(`Unsupported crypto asset: ${cryptoAsset}`);
      }

      const currency = fiat.toLowerCase();

      const requestOptions: any = { timeout: 10000 };
      if (this.apiKey) {
        requestOptions.headers = { 'x-cg-demo-api-key': this.apiKey };
      }

      const response = await axios.get(
        `${this.baseUrl}/simple/price?ids=${coingeckoId}&vs_currencies=${currency}`,
        requestOptions,
      );

      const price = response.data?.[coingeckoId]?.[currency];
      if (!price) {
        throw new BadRequestException(`Could not fetch rate for ${cryptoAsset}`);
      }

      const rate = new Decimal(price);
      this.rateCache.set(cacheKey, {
        rate,
        expiresAt: new Date(Date.now() + this.CACHE_TTL),
      });

      this.logger.log(`Rate: 1 ${cryptoAsset} = ₦${rate.toFixed(2)}`);
      return rate;
    } catch (error) {
      if (error instanceof BadRequestException) throw error;

      this.logger.error(`Failed to fetch rate: ${(error as Error).message}`);

      if (cached) return cached.rate;

      throw new BadRequestException('Unable to fetch exchange rate. Please try again.');
    }
  }

  /**
   * Get all supported rates.
   */
  async getAllRates(): Promise<Record<string, string>> {
    const assets = ['USDT', 'BTC', 'ETH'];
    const out: Record<string, string> = {};

    for (const asset of assets) {
      try {
        const rate = await this.getRate(asset);
        out[`${asset}_NGN`] = rate.toFixed(2);
      } catch {
        out[`${asset}_NGN`] = '0';
      }
    }

    return out;
  }

  /**
   * Calculate NGN amount for a given crypto amount (with 1% platform spread).
   */
  async calculateNgnAmount(
    cryptoAmount: Decimal,
    cryptoAsset: string,
  ): Promise<{ ngnAmount: Decimal; rate: Decimal }> {
    const rate = await this.getRate(cryptoAsset);
    const adjustedRate = rate.mul(0.99);
    const ngnAmount = cryptoAmount.mul(adjustedRate);
    return { ngnAmount, rate: adjustedRate };
  }

  /**
   * Get the static business wallet address for a given asset + network.
   * Returns empty address if not configured (controller will throw).
   */
  getDepositAddress(asset: string, network: string): { address: string; network: string } {
    const key = `${asset.toUpperCase()}_${network.toUpperCase()}`;
    const wallet = this.businessWallets[key];

    if (!wallet?.address) {
      this.logger.warn(`No business wallet configured for ${key}`);
      return { address: '', network };
    }

    return wallet;
  }

  async testConnection(): Promise<boolean> {
    try {
      await axios.get(`${this.baseUrl}/ping`, { timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }
}
