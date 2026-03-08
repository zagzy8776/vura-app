import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

interface PaystackApiResponse<T> {
  status: boolean;
  message: string;
  data: T;
}

interface AccountVerificationResponse {
  status: boolean;
  message: string;
  data: {
    account_number: string;
    account_name: string;
    bank_id: string;
  };
}

interface TransferResponse {
  status: boolean;
  message: string;
  data: {
    reference: string;
    amount: number;
    recipient: {
      account_number: string;
      bank_code: string;
      account_name: string;
    };
    status: string;
  };
}

interface PaystackBank {
  name: string;
  code: string;
}

interface PaystackCustomerData {
  id: number;
  customer_code: string;
}

interface PaystackDvaProvider {
  provider_slug?: string;
  slug?: string;
  bank_name?: string;
  name?: string;
}

interface PaystackDedicatedAccountData {
  account_number: string;
  bank?: { name?: string };
  bank_name?: string;
}

interface PaystackInitializeTxData {
  authorization_url: string;
  access_code: string;
  reference: string;
}

interface PaystackVerifyTxData {
  status: string;
  amount: number;
  metadata?: unknown;
}

interface PaystackTransferRecipientData {
  recipient_code: string;
}

@Injectable()
export class PaystackService {
  private readonly baseUrl: string;
  private readonly secretKey: string;

  constructor(private configService: ConfigService) {
    this.baseUrl = this.configService.get<string>(
      'PAYSTACK_BASE_URL',
      'https://api.paystack.co',
    );
    this.secretKey = this.configService.get<string>('PAYSTACK_SECRET_KEY', '');
  }

  /**
   * Whether Paystack Transfer (payout) is enabled for this app.
   * Set PAYSTACK_TRANSFER_ENABLED=true when Transfer is enabled in Paystack dashboard.
   */
  isTransferEnabled(): boolean {
    if (!this.secretKey?.trim()) return false;
    return this.configService.get<string>('PAYSTACK_TRANSFER_ENABLED', '') === 'true';
  }

  /** True when Paystack secret key is set (used to enable send-to-bank and test Transfer). */
  isConfigured(): boolean {
    return Boolean(this.secretKey?.trim());
  }

  private getHeaders() {
    return {
      Authorization: `Bearer ${this.secretKey}`,
      'Content-Type': 'application/json',
    };
  }

  private getErrorMessage(error: unknown): string | null {
    if (!axios.isAxiosError(error)) return null;
    const data = error.response?.data as unknown;
    if (data && typeof data === 'object' && 'message' in data) {
      const msg = (data as { message?: unknown }).message;
      if (typeof msg === 'string' && msg.trim()) return msg;
    }
    if (typeof error.message === 'string' && error.message.trim()) {
      return error.message;
    }
    return null;
  }

  async verifyAccount(
    accountNumber: string,
    bankCode: string,
  ): Promise<{ accountName: string }> {
    try {
      const response = await axios.get<AccountVerificationResponse>(
        `${this.baseUrl}/bank/resolve`,
        {
          headers: this.getHeaders(),
          params: {
            account_number: accountNumber,
            bank_code: bankCode,
          },
        },
      );

      if (!response.data.status) {
        throw new BadRequestException(
          response.data.message || 'Account verification failed',
        );
      }

      return {
        accountName: response.data.data.account_name,
      };
    } catch (error: unknown) {
      const message = this.getErrorMessage(error);
      if (message) throw new BadRequestException(message);
      throw new BadRequestException('Could not verify account');
    }
  }

  async initiateTransfer(
    accountNumber: string,
    bankCode: string,
    accountName: string,
    amount: number,
    reference: string,
    reason?: string,
  ): Promise<{ reference: string; status: string }> {
    try {
      const recipientResponse = await axios.post<
        PaystackApiResponse<PaystackTransferRecipientData>
      >(
        `${this.baseUrl}/transferrecipient`,
        {
          type: 'nuban',
          name: accountName,
          account_number: accountNumber,
          bank_code: bankCode,
          currency: 'NGN',
        },
        { headers: this.getHeaders() },
      );

      const recipientCode = recipientResponse.data.data.recipient_code;

      const transferResponse = await axios.post<TransferResponse>(
        `${this.baseUrl}/transfer`,
        {
          source: 'balance',
          amount: Math.round(amount * 100),
          recipient: recipientCode,
          reason: reason || 'Vura Transfer',
          reference: reference,
        },
        { headers: this.getHeaders() },
      );

      if (!transferResponse.data.status) {
        throw new BadRequestException(
          transferResponse.data.message || 'Transfer failed',
        );
      }

      return {
        reference: transferResponse.data.data.reference,
        status: transferResponse.data.data.status,
      };
    } catch (error: unknown) {
      const message = this.getErrorMessage(error);
      if (message) throw new BadRequestException(message);
      throw new BadRequestException('Transfer failed');
    }
  }

  async initializeTransaction(input: {
    email: string;
    amount: number;
    reference: string;
    callbackUrl?: string;
    metadata?: Record<string, unknown>;
  }): Promise<{
    authorizationUrl: string;
    accessCode: string;
    reference: string;
  }> {
    try {
      const res = await axios.post<
        PaystackApiResponse<PaystackInitializeTxData>
      >(
        `${this.baseUrl}/transaction/initialize`,
        {
          email: input.email,
          amount: Math.round(input.amount * 100),
          reference: input.reference,
          callback_url: input.callbackUrl,
          metadata: input.metadata,
        },
        { headers: this.getHeaders() },
      );

      if (!res.data.status) {
        throw new BadRequestException(
          res.data.message || 'Could not initialize payment',
        );
      }

      return {
        authorizationUrl: res.data.data.authorization_url,
        accessCode: res.data.data.access_code,
        reference: res.data.data.reference,
      };
    } catch (error: unknown) {
      const message = this.getErrorMessage(error);
      if (message) throw new BadRequestException(message);
      throw new BadRequestException('Payment initialization failed');
    }
  }

  async verifyTransaction(reference: string): Promise<{
    success: boolean;
    amount: number;
    status: string;
    metadata?: unknown;
  }> {
    try {
      const res = await axios.get<PaystackApiResponse<PaystackVerifyTxData>>(
        `${this.baseUrl}/transaction/verify/${encodeURIComponent(reference)}`,
        { headers: this.getHeaders() },
      );

      const data = res.data.data;
      return {
        success: data.status === 'success',
        amount: data.amount / 100,
        status: data.status,
        metadata: data.metadata,
      };
    } catch (error: unknown) {
      const message = this.getErrorMessage(error);
      if (message) throw new BadRequestException(message);
      throw new BadRequestException('Could not verify payment');
    }
  }

  async listBanks(): Promise<{ code: string; name: string }[]> {
    try {
      const res = await axios.get<PaystackApiResponse<PaystackBank[]>>(
        `${this.baseUrl}/bank`,
        {
          headers: this.getHeaders(),
          params: { country: 'nigeria', perPage: 100 },
        },
      );
      return (res.data.data ?? []).map((b) => ({
        code: String(b.code),
        name: String(b.name),
      }));
    } catch {
      return [];
    }
  }

  /**
   * Create or fetch Paystack customer (for Dedicated Virtual Account).
   */
  async createCustomer(input: {
    email: string;
    firstName: string;
    lastName: string;
    phone?: string;
  }): Promise<{ customerCode: string; customerId: number } | null> {
    try {
      const res = await axios.post<PaystackApiResponse<PaystackCustomerData>>(
        `${this.baseUrl}/customer`,
        {
          email: input.email,
          first_name: input.firstName,
          last_name: input.lastName,
          phone: input.phone || '',
        },
        { headers: this.getHeaders() },
      );
      const d = res.data.data;
      if (!res.data.status || !d?.customer_code) return null;
      return { customerCode: d.customer_code, customerId: d.id };
    } catch {
      return null;
    }
  }

  /**
   * Get available bank slugs for Dedicated Virtual Account (e.g. wema-bank).
   */
  async getDvaAvailableBanks(): Promise<
    { provider_slug: string; bank_name: string }[]
  > {
    try {
      const res = await axios.get<PaystackApiResponse<PaystackDvaProvider[]>>(
        `${this.baseUrl}/dedicated_account/available_providers`,
        { headers: this.getHeaders() },
      );
      const data = res.data.data ?? [];
      return data
        .map((p) => ({
          provider_slug: String(p.provider_slug || p.slug || ''),
          bank_name: String(p.bank_name || p.name || ''),
        }))
        .filter((p) => p.provider_slug && p.bank_name);
    } catch {
      return [];
    }
  }

  /**
   * Create a Dedicated Virtual Account for a Paystack customer.
   */
  async createDedicatedAccount(input: {
    customerCode: string;
    preferredBank?: string;
  }): Promise<
    | { success: true; accountNumber: string; bankName: string }
    | { success: false; error: string }
  > {
    try {
      let preferredBank = input.preferredBank;
      if (!preferredBank) {
        const banks = await this.getDvaAvailableBanks();
        preferredBank = banks[0]?.provider_slug || 'wema-bank';
      }
      const res = await axios.post<
        PaystackApiResponse<PaystackDedicatedAccountData>
      >(
        `${this.baseUrl}/dedicated_account`,
        {
          customer: input.customerCode,
          preferred_bank: preferredBank,
        },
        { headers: this.getHeaders() },
      );
      const d = res.data.data;
      if (!res.data.status || !d?.account_number) {
        return {
          success: false,
          error: res.data.message || 'Failed to create virtual account',
        };
      }
      const bankName = d.bank?.name || d.bank_name || 'Bank';
      return {
        success: true,
        accountNumber: String(d.account_number),
        bankName: String(bankName),
      };
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        const msg = this.getErrorMessage(error);
        return {
          success: false,
          error: String(msg || 'Failed to create virtual account'),
        };
      }
      return { success: false, error: 'Failed to create virtual account' };
    }
  }
}
