import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

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

  private getHeaders() {
    return {
      Authorization: `Bearer ${this.secretKey}`,
      'Content-Type': 'application/json',
    };
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
    } catch (error: any) {
      if (error.response?.data?.message) {
        throw new BadRequestException(error.response.data.message);
      }
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
      // First, create a recipient
      const recipientResponse = await axios.post(
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

      // Then initiate the transfer
      const transferResponse = await axios.post<TransferResponse>(
        `${this.baseUrl}/transfer`,
        {
          source: 'balance',
          amount: Math.round(amount * 100), // Paystack expects amount in kobo
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
    } catch (error: any) {
      if (error.response?.data?.message) {
        throw new BadRequestException(error.response.data.message);
      }
      throw new BadRequestException('Transfer failed');
    }
  }
}
