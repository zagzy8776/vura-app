import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class FlutterwaveService {
  private readonly logger = new Logger(FlutterwaveService.name);
  private readonly publicKey: string;
  private readonly secretKey: string;
  private readonly baseUrl: string;

  constructor(private configService: ConfigService) {
    this.publicKey =
      this.configService.get<string>('FLUTTERWAVE_PUBLIC_KEY') || '';
    this.secretKey = this.configService.get<string>('FLUTTERWAVE_SECRET') || '';
    this.baseUrl =
      this.configService.get<string>('FLUTTERWAVE_BASE_URL') ||
      'https://api.flutterwave.com/v4';
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
  }

  /**
   * Get virtual account details
   */
  async getVirtualAccount(orderRef: string) {
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
  }

  /**
   * Verify account number with bank
   */
  async verifyAccount(accountNumber: string, bankCode: string) {
    try {
      const response = await axios.get(`${this.baseUrl}/accounts/resolve`, {
        params: { account_number: accountNumber, bank_code: bankCode },
        headers: { Authorization: `Bearer ${this.secretKey}` },
      });

      const responseData = response.data;
      const accountData = responseData.data;
      return {
        success: true,
        accountName: accountData.account_name,
        accountNumber: accountData.account_number,
        bankName: accountData.bank_name,
      };
    } catch (error: any) {
      this.logger.error(`Account verification failed: ${error.message}`);
      return {
        success: false,
        error: error.response?.data?.message || error.message,
      };
    }
  }

  /**
   * Get list of banks
   */
  async getBanks(country: string = 'NG') {
    try {
      const response = await axios.get(`${this.baseUrl}/banks/${country}`, {
        headers: { Authorization: `Bearer ${this.secretKey}` },
      });

      return { success: true, banks: response.data.data };
    } catch (error: any) {
      this.logger.error(`Failed to get banks: ${error.message}`);
      return { success: false, error: error.message };
    }
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
    const crypto = require('crypto');
    const hash = crypto
      .createHmac('sha256', this.secretKey)
      .update(payload)
      .digest('hex');
    return hash === signature;
  }
}
