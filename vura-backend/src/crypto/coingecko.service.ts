import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import Decimal from 'decimal.js';

// Supported assets and their CoinGecko IDs
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
  private readonly ngnCurrencyId = 'nigerian-naira';

  // Business wallet addresses from environment variables
  private readonly businessWallets: Record<string, { address: string; network: string }>;

  // Cache for rates (5 minutes)
  private rateCache: Map<string, { rate: Decimal; expiresAt: Date }> = new Map();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  constructor(private config: ConfigService) {
    this.apiKey = this.config.get('COINGECKO_API_KEY') || '';
    
    // Read business wallet addresses from environment variables
    this.businessWallets = {
      USDT_TRC20: { 
        address: this.config.get('BUSINESS_USDT_TRC20_ADDRESS') || '', 
        network: 'TRC20' 
      },
      USDT_BEP20: { 
        address: this.config.get('BUSINESS_USDT_BEP20_ADDRESS') || '', 
        network: 'BEP20' 
      },
      USDT_ERC20: { 
        address: this.config.get('BUSINESS_USDT_ERC20_ADDRESS') || '', 
        network: 'ERC20' 
      },
      BTC: { 
        address: this.config.get('BUSINESS_BTC_ADDRESS') || '', 
        network: 'BTC' 
      },
      ETH: { 
        address: this.config.get('BUSINESS_ETH_ADDRESS') || '', 
        network: 'ETH' 
      },
    };
    
    if (this.apiKey) {
      this.logger.log('CoinGecko API key configured - using paid tier');
    } else {
      this.logger.warn('No CoinGecko API key - using free tier (rate limited)');
    }
  }

  /**
   * Get current exchange rate for crypto to NGN
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

      // CoinGecko uses "ngn" for Nigerian Naira
      const currency = fiat.toLowerCase();
      
      // Build request options with API key if available
      const requestOptions: any = { timeout: 10000 };
      if (this.apiKey) {
        requestOptions.headers = { 'x-cg-demo-api-key': this.apiKey };
      }
      
      const response = await axios.get(
        `${this.baseUrl}/simple/price?ids=${coingeckoId}&vs_currencies=${currency}`,
        requestOptions
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
      if (error instanceof BadRequestException) {
        throw error;
      }
      this.logger.error(`Failed to fetch rate: ${(error as Error).message}`);
      
      // Return cached rate if available, even if expired
      if (cached) {
        return cached.rate;
      }
      throw new BadRequestException('Unable to fetch exchange rate. Please try again.');
    }
  }

  /**
   * Get all supported rates
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
   * Calculate NGN amount for a given crypto amount
   */
  async calculateNgnAmount(
    cryptoAmount: Decimal,
    cryptoAsset: string,
  ): Promise<{ ngnAmount: Decimal; rate: Decimal }> {
    const rate = await this.getRate(cryptoAsset);
    
    // Apply 1% platform spread
    const adjustedRate = rate.mul(0.99);
    const ngnAmount = cryptoAmount.mul(adjustedRate);

    return { ngnAmount, rate: adjustedRate };
  }

  /**
   * Get deposit address for a specific asset and network
   * Returns the business wallet address (users send to this)
   */
  getDepositAddress(asset: string, network: string): { address: string; network: string } {
    const key = `${asset.toUpperCase()}_${network.toUpperCase()}`;
    const wallet = this.businessWallets[key];

    if (!wallet?.address) {
      // If no business wallet configured, return a placeholder with instructions
      this.logger.warn(`No business wallet configured for ${key}. Users must provide their own address.`);
      return {
        address: 'WALLET_NOT_CONFIGURED',
        network: network,
      };
    }

    return wallet;
  }

  /**
   * Check if a crypto address is valid (basic validation)
   */
  validateAddress(address: string, network: string): boolean {
    if (!address) return false;

    // Basic validation for common crypto addresses
    switch (network.toUpperCase()) {
      case 'TRC20':
        // Tron addresses start with T and are 34 chars
        return /^T[a-zA-Z0-9]{33}$/.test(address);
      case 'BEP20':
      case 'ERC20':
        // Ethereum-style addresses start with 0x and are 42 chars
        return /^0x[a-fA-F0-9]{40}$/.test(address);
      case 'BTC':
        // Bitcoin addresses: 1, 3 (P2PKH/P2SH) or bc1 (Bech32)
        return /^(1|3|bc1)[a-zA-HJ-NP-Z0-9]{25,39}$/.test(address);
      default:
        return address.length > 10;
    }
  }

  /**
   * Test connection to CoinGecko API
   */
  async testConnection(): Promise<boolean> {
    try {
      await axios.get(`${this.baseUrl}/ping`, { timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }
}

