import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosError } from 'axios';

/** Fallback Nigerian banks + fintechs when VPay API fails – so users always see a full list. */
const FALLBACK_BANKS: { code: string; name: string }[] = [
  { code: '044', name: 'Access Bank' },
  { code: '063', name: 'Access Bank (Diamond)' },
  { code: '050', name: 'Ecobank Nigeria' },
  { code: '084', name: 'Enterprise Bank' },
  { code: '070', name: 'Fidelity Bank' },
  { code: '011', name: 'First Bank of Nigeria' },
  { code: '214', name: 'First City Monument Bank' },
  { code: '058', name: 'Guaranty Trust Bank' },
  { code: '030', name: 'Heritage Bank' },
  { code: '301', name: 'Jaiz Bank' },
  { code: '082', name: 'Keystone Bank' },
  { code: '090267', name: 'Kuda Microfinance Bank' },
  { code: '090405', name: 'Moniepoint Microfinance Bank' },
  { code: '100004', name: 'OPay' },
  { code: '100033', name: 'PalmPay' },
  { code: '526', name: 'Parallex Bank' },
  { code: '076', name: 'Polaris Bank' },
  { code: '101', name: 'Providus Bank' },
  { code: '221', name: 'Stanbic IBTC Bank' },
  { code: '068', name: 'Standard Chartered Bank' },
  { code: '232', name: 'Sterling Bank' },
  { code: '100', name: 'Suntrust Bank' },
  { code: '032', name: 'Union Bank of Nigeria' },
  { code: '033', name: 'United Bank for Africa' },
  { code: '215', name: 'Unity Bank' },
  { code: '035', name: 'Wema Bank' },
  { code: '057', name: 'Zenith Bank' },
];

/**
 * VPay Africa API – send-to-bank only (bank list, nuban lookup, outbound transfer).
 * Docs: https://docs.vpay.africa | Base URL: https://services2.vpay.africa
 */
@Injectable()
export class VpayService {
  private readonly logger = new Logger(VpayService.name);
  private readonly baseUrl: string;
  private readonly publicKey: string;
  private readonly username: string;
  private readonly password: string;

  private tokenCache: { token: string; expiresAt: number } | null = null;
  /** VPay login throttle: 1 request per 270s. Cache token 4 min to stay under limit. */
  private static readonly TOKEN_TTL_MS = 4 * 60 * 1000;
  /** After login throttle error, don't retry login for 5 min. */
  private loginThrottleUntil = 0;
  private static readonly LOGIN_THROTTLE_BACKOFF_MS = 5 * 60 * 1000;
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
    const err = error as AxiosError<Record<string, unknown> & { message?: string; error?: string }>;
    const data = err.response?.data;
    if (data && typeof data === 'object') {
      if (typeof data.message === 'string') return data.message;
      if (typeof data.error === 'string') return data.error;
      if (typeof data.msg === 'string') return data.msg;
    }
    if (err.response?.status === 401) return 'Invalid Authentication';
    if (err.response?.status === 403) return 'Forbidden';
    return err.message || null;
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
    if (Date.now() < this.loginThrottleUntil) {
      throw new BadRequestException(
        'Service is busy. Please try again in a minute.',
      );
    }

    const url = `${this.baseUrl}/api/service/v1/query/merchant/login`;
    const loginBody: Record<string, string> = {
      username: this.username,
      password: this.password,
    };
    if (this.username.includes('@')) {
      loginBody.email = this.username;
    }
    try {
      const res = await axios.post(
        url,
        loginBody,
        {
          headers: {
            'Content-Type': 'application/json',
            publicKey: this.publicKey,
          },
          timeout: 15000,
        },
      );

      const data = res.data as Record<string, unknown> | undefined;
      // VPay returns accessToken (confirmed from API); fallback to token / data.accessToken
      const token =
        (data?.accessToken as string) ??
        (data?.token as string) ??
        ((data?.data as Record<string, unknown>)?.accessToken as string) ??
        ((data?.data as Record<string, unknown>)?.token as string);
      if (!token || typeof token !== 'string') {
        throw new BadRequestException(
          (data?.message as string) || 'VPay login did not return a token',
        );
      }

      this.tokenCache = {
        token,
        expiresAt: Date.now() + VpayService.TOKEN_TTL_MS,
      };
      return token;
    } catch (error: unknown) {
      const msg = this.getErrorMessage(error);
      const isThrottle =
        msg?.toLowerCase().includes('wait') ||
        msg?.toLowerCase().includes('little while') ||
        msg?.toLowerCase().includes('try again');
      if (isThrottle) {
        this.loginThrottleUntil = Date.now() + VpayService.LOGIN_THROTTLE_BACKOFF_MS;
        // Keep existing token – don't clear it. Other users can keep using it until it expires.
        throw new BadRequestException(
          'Service is busy. Please try again in a minute.',
        );
      }
      if (msg) throw new BadRequestException(`VPay login failed: ${msg}`);
      throw new BadRequestException('VPay login failed');
    }
  }

  /** Headers for authenticated VPay requests. Docs: publicKey + b-access-token (token from login). */
  private authHeaders(token: string): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      publicKey: this.publicKey,
      'b-access-token': token,
    };
  }

  /**
   * Get list of banks for send-to-bank.
   * VPay: GET /api/service/v1/query/bank/list/show. On failure returns fallback list so users always see banks.
   */
  async getBankList(): Promise<{ code: string; name: string }[]> {
    if (this.bankListCache && Date.now() < this.bankListCache.expiresAt) {
      return this.bankListCache.banks;
    }

    let token: string;
    try {
      token = await this.getAccessToken();
    } catch (e) {
      this.bankListCache = null;
      this.logger.warn('VPay bank list: login failed, using fallback list');
      return FALLBACK_BANKS;
    }

    const url = `${this.baseUrl}/api/service/v1/query/bank/list/show`;
    try {
      const res = await axios.get(url, {
        headers: this.authHeaders(token),
        timeout: 15000,
      });

      const data = res.data;
      if (!data || typeof data !== 'object') {
        this.logger.warn('VPay bank list: invalid response shape, using fallback');
        return this.setBankListCache(FALLBACK_BANKS);
      }

      let rawList: unknown[] = [];
      if (Array.isArray(data)) {
        rawList = data;
      } else if (Array.isArray(data.data)) {
        rawList = data.data;
      } else if (Array.isArray(data.banks)) {
        rawList = data.banks;
      } else if (data.status === false || data.success === false) {
        const msg = (data.message || data.error) as string;
        this.logger.warn(`VPay bank list: API returned error "${msg}", using fallback`);
        return this.setBankListCache(FALLBACK_BANKS);
      }

      const banks = rawList
        .map((b: unknown) => {
          const o = b as Record<string, unknown>;
          const code = String(o?.code ?? o?.bank_code ?? '').trim();
          const name = String(o?.name ?? o?.bank_name ?? '').trim();
          return { code, name };
        })
        .filter((b) => b.code && b.name);

      if (banks.length === 0) {
        this.logger.warn('VPay bank list: empty list, using fallback');
        return this.setBankListCache(FALLBACK_BANKS);
      }

      this.logger.log(`VPay bank list: OK, ${banks.length} banks`);
      return this.setBankListCache(banks);
    } catch (error: unknown) {
      const msg = this.getErrorMessage(error);
      if (msg?.toLowerCase().includes('invalid authentication') || msg?.toLowerCase().includes('unauthorized')) {
        this.tokenCache = null;
        this.bankListCache = null;
      }
      if (axios.isAxiosError(error) && error.response) {
        this.logger.warn(
          `VPay bank list failed: ${error.response.status} ${JSON.stringify(error.response.data)}`,
        );
      } else {
        this.logger.warn(`VPay bank list failed: ${msg}`);
      }
      return this.setBankListCache(FALLBACK_BANKS);
    }
  }

  private setBankListCache(banks: { code: string; name: string }[]): { code: string; name: string }[] {
    this.bankListCache = {
      banks,
      expiresAt: Date.now() + VpayService.BANK_LIST_CACHE_MS,
    };
    return banks;
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
          headers: this.authHeaders(token),
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
      if (msg?.toLowerCase().includes('invalid authentication') || msg?.toLowerCase().includes('unauthorized')) {
        this.tokenCache = null;
      }
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
        headers: this.authHeaders(token),
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
