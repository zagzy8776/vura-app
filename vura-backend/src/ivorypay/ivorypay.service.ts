import {
  Injectable,
  Logger,
  InternalServerErrorException,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance, AxiosError } from 'axios';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma.service';
import Decimal from 'decimal.js';
import type {
  IvoryPayRateResponse,
  IvoryPayCreateAddressRequest,
  IvoryPayCreateAddressResponse,
  IvoryPayResolveAccountRequest,
  IvoryPayResolveAccountResponse,
  IvoryPayFiatPayoutRequest,
  IvoryPayFiatPayoutResponse,
  IvoryPayVerifyResponse,
} from './ivorypay.interfaces';

@Injectable()
export class IvoryPayService {
  private readonly client: AxiosInstance;
  private readonly logger = new Logger(IvoryPayService.name);
  private readonly secretKey: string;

  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
  ) {
    this.secretKey = this.config.get<string>('IVORYPAY_SECRET_KEY') ?? '';

    if (!this.secretKey) {
      this.logger.warn(
        'IVORYPAY_SECRET_KEY not set – IvoryPay operations will fail.',
      );
    } else {
      // Debug: log key length and first 4 chars to detect whitespace issues (do not log full key)
      console.log(
        `IVORYPAY_SECRET_KEY loaded (len=${this.secretKey.length}): ${this.secretKey.substring(0, 4)}...`,
      );
    }

    this.client = axios.create({
      baseURL: 'https://api.ivorypay.io/api/v1',
      timeout: 30_000,
      headers: {
        // IvoryPay docs: Authorization: <secret-key> (no Bearer prefix)
        Authorization: this.secretKey,
        'Content-Type': 'application/json',
      },
    });
  }

  // ───────────────────────────────────────────────────────────────────
  //  1. GET RATES – Preview NGN payout for a given crypto amount
  //     GET /v1/rates/fiat-transfer?amount=50&crypto=USDT&fiat=NGN
  // ───────────────────────────────────────────────────────────────────

  async getRates(
    amount: string,
    cryptoToken = 'USDT',
    fiat = 'NGN',
  ): Promise<IvoryPayRateResponse['data']> {
    try {
      const res = await this.client.get<IvoryPayRateResponse>(
        '/rates/fiat-transfer',
        { params: { amount, crypto: cryptoToken, fiat } },
      );

      if (!res.data?.status) {
        throw new BadRequestException(
          res.data?.message || 'Rate lookup failed',
        );
      }

      const rateData = res.data.data;

      // Cache rate in DB for 5 minutes
      const pair = `${cryptoToken}_${fiat}`;
      await this.prisma.exchangeRate.upsert({
        where: { pair_provider: { pair, provider: 'ivorypay' } },
        update: {
          rate: parseFloat(rateData.rate),
          expiresAt: new Date(Date.now() + 5 * 60_000),
        },
        create: {
          pair,
          rate: parseFloat(rateData.rate),
          provider: 'ivorypay',
          expiresAt: new Date(Date.now() + 5 * 60_000),
        },
      });

      this.logger.log(
        `Rate: ${amount} ${cryptoToken} = ₦${rateData.fiatEquivalent} (rate ${rateData.rate})`,
      );
      return rateData;
    } catch (error) {
      this.handleApiError(error, 'getRates');
      throw error;
    }
  }

  // ───────────────────────────────────────────────────────────────────
  //  2. CREATE PERMANENT ADDRESS – One per user, persistent
  //     POST /v1/blockchain-accounts/create
  // ───────────────────────────────────────────────────────────────────

  async createPermanentAddress(
    userId: string,
    email: string,
    name: string,
    cryptoToken = 'USDT',
    network = 'tron',
  ): Promise<IvoryPayCreateAddressResponse['data']> {
    // Check for existing active address in DB
    const existing = await this.prisma.cryptoDeposit.findUnique({
      where: {
        userId_asset_network: {
          userId,
          asset: cryptoToken,
          network: network.toUpperCase(),
        },
      },
    });

    if (existing?.address && existing.status === 'active') {
      this.logger.log(
        `Returning existing ${cryptoToken} address for user ${userId}`,
      );
      return {
        id: existing.providerRef,
        address: existing.address,
        crypto: cryptoToken,
        network,
        reference: existing.providerRef,
        status: 'active',
        createdAt: existing.createdAt.toISOString(),
      };
    }

    try {
      const reference = `vura_${userId}_${Date.now()}`;
      const body: IvoryPayCreateAddressRequest = {
        crypto: cryptoToken,
        network,
        email,
        name,
        reference,
      };

      const res = await this.client.post<IvoryPayCreateAddressResponse>(
        '/blockchain-accounts/create',
        body,
      );

      if (!res.data?.status) {
        throw new BadRequestException(
          res.data?.message || 'Address creation failed',
        );
      }

      const addr = res.data.data;

      // Persist in CryptoDeposit table
      await this.prisma.cryptoDeposit.upsert({
        where: {
          userId_asset_network: {
            userId,
            asset: cryptoToken,
            network: network.toUpperCase(),
          },
        },
        update: {
          address: addr.address,
          providerRef: addr.id,
          status: 'active',
        },
        create: {
          userId,
          asset: cryptoToken,
          network: network.toUpperCase(),
          address: addr.address,
          providerRef: addr.id,
          status: 'active',
        },
      });

      this.logger.log(
        `IvoryPay address created for ${userId}: ${addr.address} (${cryptoToken}/${network})`,
      );
      return addr;
    } catch (error) {
      this.handleApiError(error, 'createPermanentAddress');
      throw error;
    }
  }

  // ───────────────────────────────────────────────────────────────────
  //  3. RESOLVE BANK ACCOUNT – Verify account name before payout
  //     POST /v1/fiat-transfer/account-resolution
  // ───────────────────────────────────────────────────────────────────

  async resolveBankAccount(
    details: IvoryPayResolveAccountRequest,
  ): Promise<IvoryPayResolveAccountResponse['data']> {
    try {
      const res = await this.client.post<IvoryPayResolveAccountResponse>(
        '/fiat-transfer/account-resolution',
        details,
      );

      if (!res.data?.status) {
        throw new BadRequestException(
          res.data?.message || 'Account resolution failed',
        );
      }

      this.logger.log(
        `Resolved: ${details.accountNumber} → ${res.data.data.accountName} (${res.data.data.bankName})`,
      );
      return res.data.data;
    } catch (error) {
      this.handleApiError(error, 'resolveBankAccount');
      throw error;
    }
  }

  // ───────────────────────────────────────────────────────────────────
  //  4. INITIATE FIAT PAYOUT – Send NGN to resolved bank account
  //     POST /v1/fiat-transfer
  // ───────────────────────────────────────────────────────────────────

  async initiateFiatPayout(
    data: IvoryPayFiatPayoutRequest,
  ): Promise<IvoryPayFiatPayoutResponse['data']> {
    try {
      const res = await this.client.post<IvoryPayFiatPayoutResponse>(
        '/fiat-transfer',
        data,
      );

      if (!res.data?.status) {
        throw new BadRequestException(
          res.data?.message || 'Fiat payout failed',
        );
      }

      this.logger.log(
        `Payout initiated: ₦${data.amount} → ${data.accountNumber} (ref ${data.reference})`,
      );
      return res.data.data;
    } catch (error) {
      this.handleApiError(error, 'initiateFiatPayout');
      throw error;
    }
  }

  // ───────────────────────────────────────────────────────────────────
  //  5. VERIFY TRANSACTION – Fallback polling
  //     GET /v1/business/transactions/:reference/verify
  // ───────────────────────────────────────────────────────────────────

  async verifyTransaction(
    reference: string,
  ): Promise<IvoryPayVerifyResponse['data']> {
    try {
      const res = await this.client.get<IvoryPayVerifyResponse>(
        `/business/transactions/${reference}/verify`,
      );

      if (!res.data?.status) {
        throw new BadRequestException(
          res.data?.message || 'Transaction verification failed',
        );
      }

      this.logger.log(
        `Verified tx ${reference}: status=${res.data.data.status}`,
      );
      return res.data.data;
    } catch (error) {
      this.handleApiError(error, 'verifyTransaction');
      throw error;
    }
  }

  // ───────────────────────────────────────────────────────────────────
  //  6. WEBHOOK SIGNATURE VERIFICATION  (HMAC-SHA512 timing-safe)
  // ───────────────────────────────────────────────────────────────────

  verifyWebhookSignature(rawBody: string, signature: string): boolean {
    const expected = crypto
      // IvoryPay docs: signature is HMAC-SHA512 of raw body, signed with the API secret key
      .createHmac('sha512', this.secretKey)
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

  // ───────────────────────────────────────────────────────────────────
  //  7. CACHED RATE LOOKUP (DB fallback)
  // ───────────────────────────────────────────────────────────────────

  async getCachedRate(
    crypto = 'USDT',
    fiat = 'NGN',
  ): Promise<Decimal> {
    const pair = `${crypto}_${fiat}`;
    const cached = await this.prisma.exchangeRate.findUnique({
      where: { pair_provider: { pair, provider: 'ivorypay' } },
    });

    if (cached && cached.expiresAt > new Date()) {
      return new Decimal(cached.rate.toString());
    }

    // Fetch fresh rate (for 1 unit)
    const fresh = await this.getRates('1', crypto, fiat);
    return new Decimal(fresh.rate);
  }

  // ───────────────────────────────────────────────────────────────────
  //  PRIVATE: Structured error handling from IvoryPay status codes
  // ───────────────────────────────────────────────────────────────────

  private handleApiError(error: unknown, method: string): void {
    if (!axios.isAxiosError(error)) {
      this.logger.error(
        `[${method}] Non-HTTP error: ${(error as Error).message}`,
        (error as Error).stack,
      );
      return;
    }

    const axErr = error as AxiosError<{ message?: string; error?: string }>;
    const status = axErr.response?.status;
    const msg =
      axErr.response?.data?.message ??
      axErr.response?.data?.error ??
      axErr.message;

    switch (status) {
      case 400:
        this.logger.error(`[${method}] 400 Bad Request / Invalid Key: ${msg}`);
        throw new BadRequestException(
          `IvoryPay: ${msg}. Check IVORYPAY_SECRET_KEY (no 'Bearer ' prefix) and request params.`,
        );
      case 401:
        this.logger.error(
          `[${method}] 401 Unauthorized – check IVORYPAY_SECRET_KEY`,
        );
        throw new UnauthorizedException(
          'IvoryPay authentication failed. Verify IVORYPAY_SECRET_KEY value (no Bearer prefix).',
        );
      case 404:
        this.logger.warn(`[${method}] 404 Not Found: ${msg}`);
        throw new BadRequestException(`IvoryPay resource not found: ${msg}`);
      case 429:
        this.logger.warn(`[${method}] 429 Rate limited by IvoryPay`);
        throw new InternalServerErrorException(
          'IvoryPay rate limit exceeded. Please try again shortly.',
        );
      default:
        this.logger.error(
          `[${method}] HTTP ${status ?? 'unknown'}: ${msg}`,
          axErr.stack,
        );
        throw new InternalServerErrorException(
          `IvoryPay request failed: ${msg}`,
        );
    }
  }
}
