import {
  Injectable,
  Logger,
  InternalServerErrorException,
  BadRequestException,
} from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import { PrismaService } from '../prisma.service';
import Decimal from 'decimal.js';
import * as crypto from 'crypto';

// ─── Busha API response shapes ─────────────────────────────────────────
export interface BushaDepositAddress {
  id: string;
  address: string;
  network: string;
  currency: string;
  memo?: string;
}

export interface BushaExchangeRate {
  pair: string;
  buy: number;
  sell: number;
  timestamp: string;
}

export interface BushaTradeResult {
  id: string;
  pair: string;
  side: 'buy' | 'sell';
  amount: string;
  price: string;
  total: string;
  status: string;
}

export interface BushaPayoutResult {
  id: string;
  amount: string;
  currency: string;
  status: string;
  bankName: string;
  accountNumber: string;
  reference: string;
}

// ─── Network confirmation requirements ─────────────────────────────────
const NETWORK_CONFIRMATIONS: Record<string, Record<string, number>> = {
  USDT: { TRC20: 19, BEP20: 15, ERC20: 12 },
  BTC: { BTC: 3 },
  ETH: { ETH: 12 },
};

const MAX_SLIPPAGE_BPS = 150; // 1.5 % maximum tolerated slippage

@Injectable()
export class BushaService {
  private client: AxiosInstance;
  private readonly logger = new Logger(BushaService.name);
  private readonly secretKey: string;
  private readonly webhookSecret: string;
  private readonly baseUrl: string;

  constructor(private prisma: PrismaService) {
    this.secretKey = process.env.BUSHA_SECRET_KEY || '';
    this.webhookSecret = process.env.BUSHA_WEBHOOK_SECRET || '';
    this.baseUrl = process.env.BUSHA_BASE_URL || 'https://api.busha.co/v1';

    if (!this.secretKey) {
      this.logger.warn(
        'BUSHA_SECRET_KEY not set – crypto operations will fail.',
      );
    }

    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 30_000,
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        'Content-Type': 'application/json',
      },
    });
  }

  // ───────────────────────────────────────────────────────────────────────
  //  1. DEPOSIT ADDRESS
  // ───────────────────────────────────────────────────────────────────────

  async getOrCreateDepositAddress(
    userId: string,
    asset: 'USDT' | 'BTC' | 'ETH',
    network: string,
  ): Promise<BushaDepositAddress> {
    const minConf = NETWORK_CONFIRMATIONS[asset]?.[network];
    if (minConf === undefined) {
      throw new BadRequestException(
        `Network ${network} is not supported for ${asset}`,
      );
    }

    try {
      const existing = await this.prisma.cryptoDeposit.findUnique({
        where: { userId_asset_network: { userId, asset, network } },
      });

      if (existing?.address && existing.status === 'active') {
        return {
          id: existing.id,
          address: existing.address,
          network,
          currency: asset,
          memo: existing.memo ?? undefined,
        };
      }

      const res = await this.client.post('/wallets/address', {
        asset,
        network,
      });

      const addr = (res.data?.data ?? {}) as BushaDepositAddress;

      await this.prisma.cryptoDeposit.upsert({
        where: { userId_asset_network: { userId, asset, network } },
        update: {
          address: addr.address,
          memo: addr.memo,
          status: 'active',
        },
        create: {
          userId,
          asset,
          network,
          address: addr.address,
          memo: addr.memo,
          providerRef: addr.id,
          status: 'active',
        },
      });

      this.logger.log(
        `Address created for user ${userId}: ${asset}/${network} → ${addr.address}`,
      );
      return addr;
    } catch (error) {
      this.logger.error(
        `getOrCreateDepositAddress failed: ${(error as Error).message}`,
        (error as Error).stack,
      );
      throw new InternalServerErrorException(
        'Could not generate deposit address – try again.',
      );
    }
  }

  // ───────────────────────────────────────────────────────────────────────
  //  2. EXCHANGE RATES  (with DB cache)
  // ───────────────────────────────────────────────────────────────────────

  async getRate(pair: string): Promise<Decimal> {
    const cached = await this.prisma.exchangeRate.findUnique({
      where: { pair_provider: { pair, provider: 'busha' } },
    });

    if (cached && cached.expiresAt > new Date()) {
      return new Decimal(cached.rate.toString());
    }

    const res = await this.client.get(`/prices/${pair}`);
    const rateValue = parseFloat(res.data?.data?.buy ?? '0');
    if (rateValue <= 0) {
      throw new InternalServerErrorException(`Invalid rate for ${pair}`);
    }

    await this.prisma.exchangeRate.upsert({
      where: { pair_provider: { pair, provider: 'busha' } },
      update: {
        rate: rateValue,
        expiresAt: new Date(Date.now() + 5 * 60_000),
      },
      create: {
        pair,
        rate: rateValue,
        provider: 'busha',
        expiresAt: new Date(Date.now() + 5 * 60_000),
      },
    });

    return new Decimal(rateValue);
  }

  async getAllRates(): Promise<Record<string, string>> {
    const pairs = ['USDT_NGN', 'BTC_NGN', 'ETH_NGN'];
    const out: Record<string, string> = {};

    for (const p of pairs) {
      try {
        out[p] = (await this.getRate(p)).toFixed(2);
      } catch {
        out[p] = '0';
      }
    }
    return out;
  }

  // ───────────────────────────────────────────────────────────────────────
  //  3. CONVERT TO FIAT  (sell crypto → NGN on Busha, with slippage guard)
  // ───────────────────────────────────────────────────────────────────────

  async convertToFiat(
    asset: string,
    cryptoAmount: Decimal,
    quotedRate: Decimal,
  ): Promise<{
    trade: BushaTradeResult;
    executedRate: Decimal;
    ngnAmount: Decimal;
    slippageBps: number;
  }> {
    const pair = `${asset}_NGN`;
    const currentRate = await this.getRate(pair);

    // Slippage guard: reject if market moved > MAX_SLIPPAGE_BPS from quoted rate
    const slippageBps = quotedRate
      .sub(currentRate)
      .abs()
      .div(quotedRate)
      .mul(10_000)
      .toNumber();

    if (slippageBps > MAX_SLIPPAGE_BPS) {
      this.logger.warn(
        `Slippage ${slippageBps} bps exceeds limit ${MAX_SLIPPAGE_BPS} bps for ${pair}`,
      );
      throw new BadRequestException(
        `Exchange rate moved too much (${(slippageBps / 100).toFixed(2)}%). ` +
          'Please refresh and try again.',
      );
    }

    // 0.5 % platform spread applied to the sell-side rate
    const executedRate = currentRate.mul(0.995);
    const ngnAmount = cryptoAmount.mul(executedRate);

    const res = await this.client.post('/trades', {
      pair,
      side: 'sell',
      amount: cryptoAmount.toFixed(8),
      type: 'market',
    });

    const trade = (res.data?.data ?? {}) as BushaTradeResult;

    this.logger.log(
      `Convert: ${cryptoAmount} ${asset} → ₦${ngnAmount.toFixed(2)} @ ${executedRate}`,
    );

    return { trade, executedRate, ngnAmount, slippageBps };
  }

  // ───────────────────────────────────────────────────────────────────────
  //  4. PAYOUT  (send NGN to user's resolved bank account)
  // ───────────────────────────────────────────────────────────────────────

  async payoutToBank(
    userId: string,
    ngnAmount: Decimal,
    reference: string,
  ): Promise<BushaPayoutResult> {
    const bankAccount = await this.prisma.bankAccount.findFirst({
      where: { userId, isPrimary: true, status: 'active' },
    });

    if (!bankAccount) {
      throw new BadRequestException(
        'No primary bank account found. Please add a bank account first.',
      );
    }

    // Payout fee: ₦10 under ₦10 k, else ₦25
    const fee = ngnAmount.lessThan(10_000) ? 10 : 25;
    const netAmount = ngnAmount.sub(fee);

    if (netAmount.lessThanOrEqualTo(0)) {
      throw new BadRequestException(
        'Amount after fee is zero or negative. Minimum payout is ₦50.',
      );
    }

    const res = await this.client.post('/payouts', {
      amount: netAmount.toFixed(2),
      currency: 'NGN',
      bank_code: bankAccount.bankCode,
      account_number: bankAccount.accountNumber,
      account_name: bankAccount.accountName,
      reference,
      narration: `Vura crypto auto-withdraw ${reference}`,
    });

    const payout = (res.data?.data ?? {}) as BushaPayoutResult;

    this.logger.log(
      `Payout ₦${netAmount} → ${bankAccount.bankName} ****${bankAccount.accountNumber.slice(-4)} (ref ${reference})`,
    );

    return {
      ...payout,
      amount: netAmount.toFixed(2),
      bankName: bankAccount.bankName,
      accountNumber: bankAccount.accountNumber,
      reference,
    };
  }

  // ───────────────────────────────────────────────────────────────────────
  //  5. WEBHOOK SIGNATURE VERIFICATION  (HMAC-SHA256 timing-safe)
  // ───────────────────────────────────────────────────────────────────────

  verifyWebhookSignature(rawBody: string, signature: string): boolean {
    if (!this.webhookSecret) {
      this.logger.error('BUSHA_WEBHOOK_SECRET is not configured');
      return false;
    }

    const expected = crypto
      .createHmac('sha256', this.webhookSecret)
      .update(rawBody, 'utf8')
      .digest('hex');

    try {
      return crypto.timingSafeEqual(
        Buffer.from(signature, 'hex'),
        Buffer.from(expected, 'hex'),
      );
    } catch {
      return false;
    }
  }

  // ───────────────────────────────────────────────────────────────────────
  //  6. HEALTH CHECK
  // ───────────────────────────────────────────────────────────────────────

  async testConnection(): Promise<boolean> {
    try {
      await this.client.get('/health');
      return true;
    } catch {
      this.logger.error('Busha health-check failed');
      return false;
    }
  }
}
