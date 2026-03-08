import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

const KORAPAY_BASE = 'https://api.korapay.com/merchant/api/v1';

export interface KorapayCreateVbaInput {
  account_name: string;
  account_reference: string;
  permanent: boolean;
  bank_code: string;
  customer: { name: string; email?: string };
  kyc: { bvn: string; nin?: string };
}

export interface KorapayCreateVbaResult {
  success: true;
  account_name: string;
  account_number: string;
  bank_code: string;
  bank_name: string;
  account_reference: string;
  unique_id: string;
  account_status: string;
  currency: string;
}

@Injectable()
export class KorapayService {
  private readonly secretKey: string;
  private bankListCache: { list: { code: string; name: string }[]; at: number } | null = null;
  private static readonly BANK_LIST_CACHE_MS = 5 * 60 * 1000;

  constructor(private config: ConfigService) {
    this.secretKey = this.config.get<string>('KORAPAY_SECRET_KEY') || '';
  }

  isConfigured(): boolean {
    return !!this.secretKey.trim();
  }

  private getHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.secretKey}`,
      'Content-Type': 'application/json',
    };
  }

  /**
   * List Nigerian banks for payouts (resolve/disburse). Use when Korapay is used for send-to-bank.
   * Korapay supports 250+ banks; result cached 5 min to avoid repeated API calls.
   */
  async listBanks(): Promise<{ code: string; name: string }[]> {
    if (!this.isConfigured()) return [];
    const now = Date.now();
    if (this.bankListCache && now - this.bankListCache.at < KorapayService.BANK_LIST_CACHE_MS) {
      return this.bankListCache.list;
    }
    try {
      const res = await axios.get<{
        status?: boolean;
        data?: unknown;
      }>(`${KORAPAY_BASE}/misc/banks`, {
        params: { countryCode: 'NG' },
        headers: this.getHeaders(),
        timeout: 15000,
      });
      if (!res.data?.status) return [];
      const data = res.data.data;
      let list: { code: string; name: string }[] = [];
      if (Array.isArray(data)) {
        list = data
          .filter((b: unknown) => b && typeof b === 'object' && 'code' in (b as object) && 'name' in (b as object))
          .map((b: unknown) => {
            const o = b as { code?: string; name?: string };
            return { code: String(o.code ?? '').trim(), name: String(o.name ?? '').trim() };
          })
          .filter((b) => b.code && b.name);
      } else if (data && typeof data === 'object' && !Array.isArray(data)) {
        const entries = Object.entries(data);
        list = entries
          .map(([code, val]) => {
            const name = typeof val === 'string' ? val : (val && typeof val === 'object' && 'name' in (val as object) ? String((val as { name?: string }).name ?? '') : '');
            return { code: code.trim(), name: name.trim() };
          })
          .filter((b) => b.code && b.name);
      }
      this.bankListCache = { list, at: now };
      return list;
    } catch {
      return [];
    }
  }

  /**
   * Create an NGN Virtual Bank Account (Korapay VBA).
   * Requires BVN in kyc. Bank code: 035 Wema, 070 Fidelity, 214 FCMB, 103 Globus, 107 Optimus, 104 Parallex. Sandbox: 000.
   */
  async createVirtualBankAccount(
    input: KorapayCreateVbaInput,
  ): Promise<
    | { success: true; data: KorapayCreateVbaResult }
    | { success: false; error: string }
  > {
    if (!this.isConfigured()) {
      return {
        success: false,
        error: 'Korapay is not configured. Set KORAPAY_SECRET_KEY.',
      };
    }
    try {
      const res = await axios.post<{
        status: boolean;
        message?: string;
        data?: KorapayCreateVbaResult;
      }>(`${KORAPAY_BASE}/virtual-bank-account`, input, {
        headers: this.getHeaders(),
        timeout: 20000,
      });
      if (!res.data.status || !res.data.data?.account_number) {
        return {
          success: false,
          error:
            res.data.message || 'Failed to create virtual bank account',
        };
      }
      return { success: true, data: res.data.data };
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        const msg =
          (err.response?.data as { message?: string })?.message ||
          err.message;
        return { success: false, error: String(msg) };
      }
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
      };
    }
  }

  /**
   * Initialize charge (Checkout Redirect) for Fund Wallet.
   * Amount in kobo (NGN). Returns checkout_url to redirect user.
   */
  async initializeCharge(params: {
    amount: number;
    currency?: string;
    reference: string;
    customer: { email: string; name?: string };
    redirect_url?: string;
    notification_url?: string;
    metadata?: Record<string, string>;
  }): Promise<
    | { success: true; checkoutUrl: string; reference: string }
    | { success: false; error: string }
  > {
    if (!this.isConfigured()) {
      return { success: false, error: 'Korapay is not configured.' };
    }
    try {
      const res = await axios.post<{
        status: boolean;
        message?: string;
        data?: { reference: string; checkout_url: string };
      }>(`${KORAPAY_BASE}/charges/initialize`, {
        amount: params.amount,
        currency: params.currency ?? 'NGN',
        reference: params.reference,
        customer: params.customer,
        redirect_url: params.redirect_url,
        notification_url: params.notification_url,
        metadata: params.metadata,
        channels: ['card', 'bank_transfer', 'pay_with_bank'],
        default_channel: 'card',
      }, {
        headers: this.getHeaders(),
        timeout: 15000,
      });
      if (!res.data.status || !res.data.data?.checkout_url) {
        return {
          success: false,
          error: res.data.message || 'Failed to initialize charge',
        };
      }
      return {
        success: true,
        checkoutUrl: res.data.data.checkout_url,
        reference: res.data.data.reference ?? params.reference,
      };
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        const msg =
          (err.response?.data as { message?: string })?.message ||
          err.message;
        return { success: false, error: String(msg) };
      }
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
      };
    }
  }

  /**
   * Verify charge by reference (for Fund Wallet verification).
   */
  async verifyCharge(
    reference: string,
  ): Promise<
    | { success: true; amount: number; status: string }
    | { success: false; error: string }
  > {
    if (!this.isConfigured()) {
      return { success: false, error: 'Korapay is not configured.' };
    }
    try {
      const res = await axios.get<{
        status: boolean;
        message?: string;
        data?: { amount: string; amount_paid?: number; status: string };
      }>(`${KORAPAY_BASE}/charges/${encodeURIComponent(reference)}`, {
        headers: this.getHeaders(),
        timeout: 10000,
      });
      if (!res.data.status || !res.data.data) {
        return {
          success: false,
          error: res.data.message || 'Charge not found',
        };
      }
      const d = res.data.data;
      const amount = Number(d.amount) || d.amount_paid || 0;
      const status = d.status || 'pending';
      return {
        success: true,
        amount,
        status,
      };
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        const msg =
          (err.response?.data as { message?: string })?.message ||
          err.message;
        return { success: false, error: String(msg) };
      }
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
      };
    }
  }

  /**
   * Resolve (verify) a Nigerian bank account and get account name. Use for send-to-bank.
   */
  async resolveBankAccount(
    accountNumber: string,
    bankCode: string,
  ): Promise<{ success: true; accountName: string } | { success: false; error: string }> {
    if (!this.isConfigured()) {
      return { success: false, error: 'Korapay is not configured.' };
    }
    try {
      const res = await axios.post<{
        status: boolean;
        message?: string;
        data?: { account_name?: string; bank_code?: string; account_number?: string };
      }>(
        `${KORAPAY_BASE}/misc/banks/resolve`,
        { bank: bankCode, account: accountNumber, currency: 'NG' },
        { headers: this.getHeaders(), timeout: 15000 },
      );
      if (!res.data.status || !res.data.data?.account_name) {
        return {
          success: false,
          error: res.data.message || 'Could not resolve account',
        };
      }
      return {
        success: true,
        accountName: String(res.data.data.account_name).trim(),
      };
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        const msg =
          (err.response?.data as { message?: string })?.message ||
          err.message;
        return { success: false, error: String(msg) };
      }
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
      };
    }
  }

  /**
   * Disburse (payout) to a Nigerian bank account. Amount in Naira (NGN).
   * Requires a funded Korapay merchant balance.
   */
  async disburse(params: {
    reference: string;
    accountNumber: string;
    bankCode: string;
    accountName: string;
    amount: number;
    narration?: string;
    customerEmail: string;
    customerName?: string;
  }): Promise<
    | { success: true; reference: string; status: string }
    | { success: false; error: string }
  > {
    if (!this.isConfigured()) {
      return { success: false, error: 'Korapay is not configured.' };
    }
    try {
      const res = await axios.post<{
        status: boolean;
        message?: string;
        data?: { reference: string; status: string };
      }>(
        `${KORAPAY_BASE}/transactions/disburse`,
        {
          reference: params.reference,
          destination: {
            type: 'bank_account',
            amount: params.amount,
            currency: 'NGN',
            narration: params.narration || 'Vura Transfer',
            bank_account: {
              bank: params.bankCode,
              account: params.accountNumber,
            },
            customer: {
              name: params.customerName || params.accountName,
              email: params.customerEmail,
            },
          },
        },
        { headers: this.getHeaders(), timeout: 20000 },
      );
      if (!res.data.status || !res.data.data?.reference) {
        return {
          success: false,
          error: res.data.message || 'Payout failed',
        };
      }
      return {
        success: true,
        reference: res.data.data.reference,
        status: res.data.data.status || 'processing',
      };
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        const msg =
          (err.response?.data as { message?: string })?.message ||
          err.message;
        return { success: false, error: String(msg) };
      }
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
      };
    }
  }

  /**
   * Get Virtual Bank Account by account_reference (e.g. userId).
   */
  async getVirtualBankAccount(
    accountReference: string,
  ): Promise<
    | { success: true; data: KorapayCreateVbaResult }
    | { success: false; error: string }
  > {
    if (!this.isConfigured()) {
      return { success: false, error: 'Korapay is not configured.' };
    }
    try {
      const res = await axios.get<{
        status: boolean;
        message?: string;
        data?: KorapayCreateVbaResult;
      }>(`${KORAPAY_BASE}/virtual-bank-account/${encodeURIComponent(accountReference)}`, {
        headers: this.getHeaders(),
        timeout: 10000,
      });
      if (!res.data.status || !res.data.data) {
        return {
          success: false,
          error: res.data.message || 'Virtual account not found',
        };
      }
      return { success: true, data: res.data.data };
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        const msg =
          (err.response?.data as { message?: string })?.message ||
          err.message;
        return { success: false, error: String(msg) };
      }
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
      };
    }
  }
}
