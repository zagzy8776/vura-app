import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosError } from 'axios';

/**
 * VPay Africa API – send-to-bank only (bank list, nuban lookup, outbound transfer).
 * Docs: https://docs.vpay.africa
 * Base URL: https://services2.vpay.africa (production). accessToken from merchant login.
 */
@Injectable()
export class VpayService {
  private readonly baseUrl: string;
  private readonly publicKey: string;
  private readonly username: string;
  private readonly password: string;

  private tokenCache: { token: string; expiresAt: number } | null = null;
  private static readonly TOKEN_TTL_MS = 4 * 60 * 1000; // 4 min (login throttle 270s)
  /** Bank list: static per VPay docs, throttle 1 per 60s – cache 10 min */
  private bankListCache: { banks: { code: string; name: string }[]; expiresAt: number } | null = null;
  private static readonly BANK_LIST_CACHE_MS = 10 * 60 * 1000;

  constructor(private configService: ConfigService) {
    this.baseUrl = this.configService.get<string>(
      'VPAY_BASE_URL',
      'https://services2.vpay.africa',
    );
    this.publicKey = this.configService.get<string>('VPAY_PUBLIC_KEY', '');
    this.username = this.configService.get<string>('VPAY_USERNAME', '');
    this.password = this.configService.get<string>('VPAY_PASSWORD', '');
  }

  isConfigured(): boolean {
    return Boolean(
      this.publicKey?.trim() && this.username?.trim() && this.password?.trim(),
    );
  }

  private getErrorMessage(error: unknown): string | null {
    if (!axios.isAxiosError(error)) return null;
    const err = error as AxiosError<{ message?: string; error?: string }>;
    const data = err.response?.data;
    if (data?.message) return String(data.message);
    if (data?.error) return String(data.error);
    if (err.message) return err.message;
    return null;
  }

  /**
   * Merchant login – get JWT access token.
   * POST /api/service/v1/query/merchant/login
   * Header: Content-Type, publicKey. Body: username, password.
   */
  async getAccessToken(): Promise<string> {
    if (this.tokenCache && Date.now() < this.tokenCache.expiresAt) {
      return this.tokenCache.token;
    }

    const url = `${this.baseUrl}/api/service/v1/query/merchant/login`;
    try {
      const res = await axios.post<{ status?: boolean; token?: string; message?: string }>(
        url,
        { username: this.username, password: this.password },
        {
          headers: {
            'Content-Type': 'application/json',
            publicKey: this.publicKey,
          },
          timeout: 15000,
        },
      );

      const token = res.data?.token;
      if (!token || typeof token !== 'string') {
        throw new BadRequestException(
          res.data?.message || 'VPay login did not return a token',
        );
      }

      this.tokenCache = {
        token,
        expiresAt: Date.now() + VpayService.TOKEN_TTL_MS,
      };
      return token;
    } catch (error: unknown) {
      const msg = this.getErrorMessage(error);
      if (msg) throw new BadRequestException(`VPay login failed: ${msg}`);
      throw new BadRequestException('VPay login failed');
    }
  }

  /**
   * Get list of banks for send-to-bank.
   * VPay: GET /api/service/v1/query/bank/list/show, throttle 1 per 60s. Cached 10 min.
   * Headers: Content-Type, publicKey, b-access-token.
   */
  async getBankList(): Promise<{ code: string; name: string }[]> {
    if (this.bankListCache && Date.now() < this.bankListCache.expiresAt) {
      return this.bankListCache.banks;
    }

    const token = await this.getAccessToken();
    const url = `${this.baseUrl}/api/service/v1/query/bank/list/show`;
    try {
      const res = await axios.get(url, {
        headers: {
          'Content-Type': 'application/json',
          publicKey: this.publicKey,
          'b-access-token': token,
        },
        timeout: 15000,
      });

      const data = res.data;
      if (!data || typeof data !== 'object') {
        throw new BadRequestException('VPay bank list: invalid response');
      }

      // VPay may return { status, data: [...] } or { banks: [...] } or array at top level
      let rawList: unknown[] = [];
      if (Array.isArray(data)) {
        rawList = data;
      } else if (Array.isArray(data.data)) {
        rawList = data.data;
      } else if (Array.isArray(data.banks)) {
        rawList = data.banks;
      } else if (data.status === false || data.success === false) {
        throw new BadRequestException(
          (data.message || data.error || 'Failed to fetch bank list') as string,
        );
      }

      const banks = rawList
        .map((b: unknown) => {
          const o = b as Record<string, unknown>;
          const code = String(o?.code ?? o?.bank_code ?? '').trim();
          const name = String(o?.name ?? o?.bank_name ?? '').trim();
          return { code, name };
        })
        .filter((b) => b.code && b.name);

      this.bankListCache = {
        banks,
        expiresAt: Date.now() + VpayService.BANK_LIST_CACHE_MS,
      };
      return banks;
    } catch (error: unknown) {
      const msg = this.getErrorMessage(error);
      if (msg) throw new BadRequestException(`VPay bank list failed: ${msg}`);
      throw new BadRequestException('VPay bank list failed');
    }
  }

  /**
   * Nuban lookup – get account name for a bank account.
   * POST /api/service/v1/query/lookup/nuban
   * Body: nuban, bank_code.
   */
  async nubanLookup(nuban: string, bank_code: string): Promise<{ accountName: string }> {
    const token = await this.getAccessToken();
    const url = `${this.baseUrl}/api/service/v1/query/lookup/nuban`;
    try {
      const res = await axios.post<{
        status?: boolean;
        data?: { account_name?: string; accountName?: string; name?: string };
        message?: string;
      }>(
        url,
        { nuban: nuban.replace(/\D/g, ''), bank_code },
        {
          headers: {
            'Content-Type': 'application/json',
            publicKey: this.publicKey,
            'b-access-token': token,
          },
          timeout: 15000,
        },
      );

      if (!res.data?.status) {
        throw new BadRequestException(res.data?.message || 'Account lookup failed');
      }

      const data = res.data?.data;
      const accountName =
        data?.account_name ?? data?.accountName ?? data?.name;
      if (!accountName || typeof accountName !== 'string') {
        throw new BadRequestException('VPay did not return account name');
      }

      return { accountName: String(accountName).trim() };
    } catch (error: unknown) {
      const msg = this.getErrorMessage(error);
      if (msg) throw new BadRequestException(`VPay lookup failed: ${msg}`);
      throw new BadRequestException('VPay lookup failed');
    }
  }

  /**
   * Outbound transfer to a Nigerian bank account.
   * POST /api/service/v1/query/transfer/outbound
   * Amount: in Naira (NGN). Confirm with VPay docs if they expect kobo and convert here.
   */
  async outboundTransfer(params: {
    nuban: string;
    bank_code: string;
    amount: number;
    remark?: string;
    transaction_ref: string;
  }): Promise<{ success: boolean; reference?: string; message?: string }> {
    const token = await this.getAccessToken();
    const url = `${this.baseUrl}/api/service/v1/query/transfer/outbound`;

    const body = {
      nuban: params.nuban,
      bank_code: params.bank_code,
      amount: params.amount, // Naira
      remark: params.remark ?? '',
      transaction_ref: params.transaction_ref,
    };

    try {
      const res = await axios.post<{
        status?: boolean;
        data?: { transaction_ref?: string; reference?: string };
        message?: string;
      }>(url, body, {
        headers: {
          'Content-Type': 'application/json',
          publicKey: this.publicKey,
          'b-access-token': token,
        },
        timeout: 30000,
      });

      if (res.data?.status === true) {
        const ref =
          res.data?.data?.reference ??
          res.data?.data?.transaction_ref ??
          params.transaction_ref;
        return { success: true, reference: ref };
      }

      throw new BadRequestException(
        res.data?.message || 'VPay transfer failed',
      );
    } catch (error: unknown) {
      const msg = this.getErrorMessage(error);
      if (msg) throw new BadRequestException(`VPay transfer failed: ${msg}`);
      throw new BadRequestException('VPay transfer failed');
    }
  }
}
