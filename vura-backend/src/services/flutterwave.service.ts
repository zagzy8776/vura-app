import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import crypto from 'crypto';

type UnknownRecord = Record<string, unknown>;

const asRecord = (value: unknown): UnknownRecord | null => {
  if (!value || typeof value !== 'object') return null;
  return value as UnknownRecord;
};

const asString = (value: unknown): string | undefined => {
  return typeof value === 'string' ? value : undefined;
};

@Injectable()
export class FlutterwaveService {
  private readonly logger = new Logger(FlutterwaveService.name);
  private readonly publicKey: string;
  private readonly secretKey: string;
  private readonly baseUrl: string;
  private readonly v3BaseUrl: string;

  constructor(private configService: ConfigService) {
    this.publicKey =
      this.configService.get<string>('FLUTTERWAVE_PUBLIC_KEY') || '';
    this.secretKey = this.configService.get<string>('FLUTTERWAVE_SECRET') || '';
    this.baseUrl =
      this.configService.get<string>('FLUTTERWAVE_BASE_URL') ||
      'https://api.flutterwave.com/v4';

    // Some endpoints (like account resolution) are still exposed on v3.
    this.v3BaseUrl = 'https://api.flutterwave.com/v3';
  }

  /**
   * Create a virtual account for a user
   * This gives users a permanent account number to receive money
   */
  async createVirtualAccount(
    userId: string,
    email: string,
    firstName: string,
    lastName: string,
  ) {
    /* eslint-disable @typescript-eslint/no-unsafe-assignment */
    /* eslint-disable @typescript-eslint/no-unsafe-member-access */
    try {
      const response = await axios.post(
        `${this.baseUrl}/virtual-account-numbers`,
        {
          email,
          first_name: firstName,
          last_name: lastName,
          phone: '', // Will be updated from user data
          country: 'NG',
          currency: 'NGN',
          amount: 0,
          frequency: 10,
          duration: 0, // 0 = indefinite (permanent)
          is_permanent: true,
          tx_ref: `VURA-${userId}-${Date.now()}`,
        },
        {
          headers: {
            Authorization: `Bearer ${this.secretKey}`,
            'Content-Type': 'application/json',
          },
        },
      );

      const responseData = response.data;
      const accountData = responseData.data;
      this.logger.log(
        `Created virtual account for user ${userId}: ${accountData.account_number}`,
      );

      return {
        success: true,
        accountNumber: accountData.account_number,
        accountStatus: accountData.account_status,
        bankName: accountData.bank_name,
        orderRef: accountData.order_ref,
        flutterwaveRef: accountData.flw_ref,
      };
    } catch (error: any) {
      this.logger.error(`Failed to create virtual account: ${error.message}`);
      return {
        success: false,
        error: error.response?.data?.message || error.message,
      };
    }
    /* eslint-enable @typescript-eslint/no-unsafe-assignment */
    /* eslint-enable @typescript-eslint/no-unsafe-member-access */
  }

  /**
   * Create a permanent virtual account using Flutterwave v4 endpoint.
   * We pass BVN + legal names to satisfy NIBSS name-matching checks.
   */
  async createVirtualAccountV4(input: {
    userId: string;
    email: string;
    bvn: string;
    firstName: string;
    lastName: string;
  }): Promise<
    | {
        success: true;
        accountNumber: string;
        bankName: string;
        orderRef: string;
        flutterwaveRef?: string;
      }
    | { success: false; error: string }
  > {
    /* eslint-disable @typescript-eslint/no-unsafe-assignment */
    /* eslint-disable @typescript-eslint/no-unsafe-member-access */
    try {
      const response = await axios.post(
        `${this.baseUrl}/virtual-account-numbers`,
        {
          email: input.email,
          bvn: input.bvn,
          first_name: input.firstName,
          last_name: input.lastName,
          country: 'NG',
          currency: 'NGN',
          // permanent account
          is_permanent: true,
          // our internal ref
          tx_ref: `VURA-VA-${input.userId}-${Date.now()}`,
        },
        {
          headers: {
            Authorization: `Bearer ${this.secretKey}`,
            'Content-Type': 'application/json',
          },
        },
      );

      const accountData = response.data?.data;
      if (!accountData?.account_number || !accountData?.bank_name) {
        return {
          success: false,
          error: 'Flutterwave returned an unexpected virtual account response',
        };
      }

      return {
        success: true,
        accountNumber: accountData.account_number,
        bankName: accountData.bank_name,
        orderRef: accountData.order_ref,
        flutterwaveRef: accountData.flw_ref,
      };
    } catch (error: any) {
      this.logger.error(
        `Failed to create virtual account (v4): ${error.message}`,
      );
      return {
        success: false,
        error: error.response?.data?.message || error.message,
      };
    }
    /* eslint-enable @typescript-eslint/no-unsafe-assignment */
    /* eslint-enable @typescript-eslint/no-unsafe-member-access */
  }

  /**
   * Get virtual account details
   */
  async getVirtualAccount(orderRef: string) {
    /* eslint-disable @typescript-eslint/no-unsafe-assignment */
    /* eslint-disable @typescript-eslint/no-unsafe-member-access */
    try {
      const response = await axios.get(
        `${this.baseUrl}/virtual-account-numbers/${orderRef}`,
        {
          headers: { Authorization: `Bearer ${this.secretKey}` },
        },
      );

      return { success: true, data: response.data.data };
    } catch (error: any) {
      this.logger.error(`Failed to get virtual account: ${error.message}`);
      return { success: false, error: error.message };
    }
    /* eslint-enable @typescript-eslint/no-unsafe-assignment */
    /* eslint-enable @typescript-eslint/no-unsafe-member-access */
  }

  /**
   * Initiate transfer to a bank account
   * Fee: ₦10 for <₦10k, ₦25 for ≥₦10k + ₦50 stamp duty
   */
  async initiateTransfer(
    accountNumber: string,
    bankCode: string,
    accountName: string,
    amount: number,
    reference: string,
    description?: string,
  ) {
    /* eslint-disable @typescript-eslint/no-unsafe-assignment */
    /* eslint-disable @typescript-eslint/no-unsafe-member-access */
    try {
      // Calculate fee based on amount (2026 rules)
      const isLargeTransfer = amount >= 10000;
      const transferFee = isLargeTransfer ? 25 : 10; // Flutterwave fee
      const stampDuty = isLargeTransfer ? 50 : 0; // Government tax

      // Total amount we'll deduct from user's account
      const totalDeduction = amount + transferFee + stampDuty;

      const response = await axios.post(
        `${this.baseUrl}/transfers`,
        {
          account_number: accountNumber,
          account_bank: bankCode,
          amount: amount, // Amount sent to recipient
          currency: 'NGN',
          reference: reference,
          narration: description || 'Vura Transfer',
          callback_url: `${this.configService.get<string>('APP_URL')}/webhooks/flutterwave`,
          debit_currency: 'NGN',
        },
        {
          headers: {
            Authorization: `Bearer ${this.secretKey}`,
            'Content-Type': 'application/json',
          },
        },
      );

      this.logger.log(`Transfer initiated: ${reference}, Amount: ${amount}`);

      return {
        success: true,
        reference: response.data.data.reference,
        status: response.data.data.status,
        flutterwaveRef: response.data.data.flw_ref,
        fee: transferFee,
        stampDuty: stampDuty,
        totalDeduction: totalDeduction,
      };
    } catch (error: any) {
      this.logger.error(`Transfer failed: ${error.message}`);
      return {
        success: false,
        error: error.response?.data?.message || error.message,
      };
    }
    /* eslint-enable @typescript-eslint/no-unsafe-assignment */
    /* eslint-enable @typescript-eslint/no-unsafe-member-access */
  }

  /**
   * Verify account number with bank
   */
  async verifyAccount(accountNumber: string, bankCode: string) {
    /* eslint-disable @typescript-eslint/no-unsafe-assignment */
    /* eslint-disable @typescript-eslint/no-unsafe-member-access */
    try {
      // Account resolution is exposed on Flutterwave v3.
      // Primary: POST /v3/accounts/resolve
      let response;
      try {
        response = await axios.post(
          `${this.v3BaseUrl}/accounts/resolve`,
          {
            account_number: accountNumber,
            account_bank: bankCode,
          },
          {
            headers: {
              Authorization: `Bearer ${this.secretKey}`,
              'Content-Type': 'application/json',
            },
          },
        );
      } catch (primaryError: any) {
        const status = primaryError.response?.status;
        // Fallback: GET /v3/bank/resolve
        if (status === 404) {
          response = await axios.get(`${this.v3BaseUrl}/bank/resolve`, {
            params: {
              account_number: accountNumber,
              bank_code: bankCode,
            },
            headers: { Authorization: `Bearer ${this.secretKey}` },
          });
        } else {
          throw primaryError;
        }
      }

      const responseData = response.data;
      const accountData = responseData.data;
      return {
        success: true,
        accountName: accountData.account_name,
        accountNumber: accountData.account_number,
        bankName: accountData.bank_name,
      };
    } catch (error: any) {
      // Log more detail to debug provider integration issues (e.g., 404, 401, 400)
      const status = error.response?.status;
      const data = error.response?.data;
      this.logger.error(`Account verification failed: ${error.message}`, {
        status,
        data,
        baseUrl: this.baseUrl,
        v3BaseUrl: this.v3BaseUrl,
      });
      return {
        success: false,
        error: error.response?.data?.message || error.message,
      };
    }
    /* eslint-enable @typescript-eslint/no-unsafe-assignment */
    /* eslint-enable @typescript-eslint/no-unsafe-member-access */
  }

  /**
   * Get list of banks
   */
  async getBanks(country: string = 'NG') {
    /* eslint-disable @typescript-eslint/no-unsafe-assignment */
    /* eslint-disable @typescript-eslint/no-unsafe-member-access */
    try {
      // Banks list endpoint is available on v3.
      const url = `${this.v3BaseUrl}/banks/${country}`;
      const response = await axios.get(url, {
        headers: { Authorization: `Bearer ${this.secretKey}` },
      });

      return { success: true, banks: response.data.data };
    } catch (error: any) {
      const status = error.response?.status;
      const data = error.response?.data;
      this.logger.error(`Failed to get banks: ${error.message}`, {
        status,
        data,
        v3BaseUrl: this.v3BaseUrl,
      });
      return { success: false, error: error.message };
    }
    /* eslint-enable @typescript-eslint/no-unsafe-assignment */
    /* eslint-enable @typescript-eslint/no-unsafe-member-access */
  }

  /**
   * Calculate transfer fee (for display to user)
   * 2026 Nigerian fee structure
   */
  calculateTransferFee(amount: number): {
    fee: number;
    stampDuty: number;
    total: number;
  } {
    const isLargeTransfer = amount >= 10000;
    const fee = isLargeTransfer ? 25 : 10;
    const stampDuty = isLargeTransfer ? 50 : 0;

    return {
      fee,
      stampDuty,
      total: fee + stampDuty,
    };
  }

  /**
   * Verify webhook signature
   */
  verifyWebhookSignature(payload: string, signature: string): boolean {
    const hash = crypto
      .createHmac('sha256', this.secretKey)
      .update(payload)
      .digest('hex');
    return hash === signature;
  }

  /**
   * Flutterwave BVN consent initiation (iGree / NIBSS).
   * POST /v3/bvn/verifications -> returns consent url + reference.
   */
  async initiateBvnConsent(input: {
    bvn: string;
    firstName: string;
    lastName: string;
    redirectUrl?: string;
  }): Promise<
    | {
        success: true;
        url: string;
        reference: string;
      }
    | { success: false; error: string }
  > {
    /* eslint-disable @typescript-eslint/no-unsafe-assignment */
    /* eslint-disable @typescript-eslint/no-unsafe-member-access */
    try {
      const response = await axios.post(
        `${this.v3BaseUrl}/bvn/verifications`,
        {
          bvn: input.bvn,
          firstname: input.firstName,
          lastname: input.lastName,
          redirect_url: input.redirectUrl,
        },
        {
          headers: {
            Authorization: `Bearer ${this.secretKey}`,
            'Content-Type': 'application/json',
          },
        },
      );

      const responseObj = asRecord(response.data);
      const data = asRecord(responseObj?.data);
      const url = asString(data?.url);
      const reference = asString(data?.reference);
      if (!url || !reference) {
        return {
          success: false,
          error: 'Flutterwave BVN consent initiation returned unexpected data',
        };
      }

      return {
        success: true,
        url,
        reference,
      };
    } catch (error: any) {
      const status = error.response?.status;
      const data = error.response?.data;
      this.logger.error(
        `Flutterwave BVN consent initiation failed: ${error.message}`,
        {
          status,
          data,
          v3BaseUrl: this.v3BaseUrl,
        },
      );
      return {
        success: false,
        error: data?.message || error.message,
      };
    }
    /* eslint-enable @typescript-eslint/no-unsafe-assignment */
    /* eslint-enable @typescript-eslint/no-unsafe-member-access */
  }

  /**
   * Retrieve BVN info after consent has been completed.
   * GET /v3/bvn/verifications/{reference}
   */
  async retrieveBvnInformation(input: { reference: string }): Promise<
    | {
        success: true;
        status: string;
        firstName?: string;
        lastName?: string;
        bvn?: string;
      }
    | { success: false; error: string }
  > {
    /* eslint-disable @typescript-eslint/no-unsafe-assignment */
    /* eslint-disable @typescript-eslint/no-unsafe-member-access */
    try {
      const response = await axios.get(
        `${this.v3BaseUrl}/bvn/verifications/${encodeURIComponent(input.reference)}`,
        {
          params: { include_complete_message: '1' },
          headers: {
            Authorization: `Bearer ${this.secretKey}`,
            'Content-Type': 'application/json',
          },
        },
      );

      const responseObj = asRecord(response.data);
      const obj = asRecord(responseObj?.data);
      if (!obj) {
        return {
          success: false,
          error: 'Flutterwave returned an unexpected BVN info response',
        };
      }

      const status = asString(obj.status) || 'UNKNOWN';
      const firstName = asString(obj.first_name);
      const lastName = asString(obj.last_name);
      const bvnData =
        obj.bvn_data && typeof obj.bvn_data === 'object'
          ? (obj.bvn_data as UnknownRecord)
          : null;
      const bvn = asString(bvnData?.bvn);

      return {
        success: true,
        status,
        firstName,
        lastName,
        bvn,
      };
    } catch (error: any) {
      const status = error.response?.status;
      const data = error.response?.data;
      this.logger.error(
        `Flutterwave BVN info retrieval failed: ${error.message}`,
        {
          status,
          data,
          v3BaseUrl: this.v3BaseUrl,
        },
      );
      return {
        success: false,
        error: data?.message || error.message,
      };
    }
    /* eslint-enable @typescript-eslint/no-unsafe-assignment */
    /* eslint-enable @typescript-eslint/no-unsafe-member-access */
  }

  // ── Bills Payment (v3) ─────────────────────────────────────────────────

  private billCategoriesCache: { data: any[]; expiresAt: number } | null =
    null;
  private readonly BILL_CACHE_TTL = 60 * 60 * 1000; // 1 hour

  async getBillCategories(): Promise<any[]> {
    if (
      this.billCategoriesCache &&
      this.billCategoriesCache.expiresAt > Date.now()
    ) {
      return this.billCategoriesCache.data;
    }

    try {
      const res = await axios.get(`${this.v3BaseUrl}/bill-categories`, {
        headers: { Authorization: `Bearer ${this.secretKey}` },
        timeout: 15000,
      });
      const data: any[] = res.data?.data ?? [];
      this.billCategoriesCache = {
        data,
        expiresAt: Date.now() + this.BILL_CACHE_TTL,
      };
      return data;
    } catch (error: any) {
      this.logger.error(`getBillCategories failed: ${error.message}`);
      throw error;
    }
  }

  async getDataPlansByBiller(billerCode: string): Promise<any[]> {
    const all = await this.getBillCategories();
    return all.filter(
      (item: any) =>
        item.biller_code === billerCode && item.is_airtime === false,
    );
  }

  async createBillPayment(input: {
    country: string;
    customer: string;
    amount: number;
    type: string;
    reference: string;
    callbackUrl?: string;
  }): Promise<{ success: boolean; data?: any; message?: string }> {
    /* eslint-disable @typescript-eslint/no-unsafe-assignment */
    /* eslint-disable @typescript-eslint/no-unsafe-member-access */
    try {
      const res = await axios.post(
        `${this.v3BaseUrl}/bills`,
        {
          country: input.country,
          customer: input.customer,
          amount: input.amount,
          recurrence: 'ONCE',
          type: input.type,
          reference: input.reference,
          ...(input.callbackUrl
            ? { callback_url: input.callbackUrl }
            : {}),
        },
        {
          headers: {
            Authorization: `Bearer ${this.secretKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 30000,
        },
      );

      this.logger.log(
        `Bill payment created: ${input.type} ₦${input.amount} → ${input.customer}`,
      );
      return {
        success: true,
        data: res.data?.data,
        message: res.data?.message ?? 'Bill payment successful',
      };
    } catch (error: any) {
      const msg =
        error.response?.data?.message ?? error.message ?? 'Bill payment failed';
      this.logger.error(`createBillPayment failed: ${msg}`);
      return { success: false, message: msg, data: error.response?.data };
    }
    /* eslint-enable @typescript-eslint/no-unsafe-assignment */
    /* eslint-enable @typescript-eslint/no-unsafe-member-access */
  }

  async getBillStatus(
    reference: string,
  ): Promise<{ success: boolean; data?: any }> {
    /* eslint-disable @typescript-eslint/no-unsafe-assignment */
    /* eslint-disable @typescript-eslint/no-unsafe-member-access */
    try {
      const res = await axios.get(`${this.v3BaseUrl}/bills/${reference}`, {
        headers: { Authorization: `Bearer ${this.secretKey}` },
        timeout: 15000,
      });
      return { success: true, data: res.data?.data };
    } catch (error: any) {
      this.logger.error(`getBillStatus failed: ${error.message}`);
      return { success: false };
    }
    /* eslint-enable @typescript-eslint/no-unsafe-assignment */
    /* eslint-enable @typescript-eslint/no-unsafe-member-access */
  }

  /**
   * Identity verification placeholder (SmileID via Flutterwave Identity).
   * We keep this method in place so BVN+ID flows can share one provider client.
   * You may need to adjust endpoint/payload depending on the exact Flutterwave product enabled.
   */
  async verifyIdentityWithSmileId(input: {
    idType: string;
    idNumber?: string;
    idImageUrl: string;
    selfieImageUrl: string;
  }): Promise<
    | { success: true; matchScore?: number; reference?: string }
    | { success: false; error: string }
  > {
    // TODO: Wire real Flutterwave Identity endpoint once confirmed in your Flutterwave dashboard.
    void input;
    await Promise.resolve();
    return {
      success: false,
      error:
        'Identity verification endpoint not wired yet. Provide Flutterwave Identity endpoint details to enable.',
    };
  }
}
