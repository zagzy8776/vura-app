import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

interface MonnifyAuthResponse {
  responseBody: {
    accessToken: string;
    expiresIn: number;
  };
}

interface AccountVerificationResponse {
  responseBody: {
    accountNumber: string;
    accountName: string;
    bankCode: string;
    bankName: string;
  };
}

interface TransferResponse {
  responseBody: {
    reference: string;
    amount: number;
    destinationAccountNumber: string;
    destinationBankCode: string;
    destinationAccountName: string;
    status: string;
    transactionReference: string;
  };
}

@Injectable()
export class MonnifyService {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly secretKey: string;
  private readonly contractCode: string;
  private accessToken: string;
  private tokenExpiry: number;

  constructor(private configService: ConfigService) {
    this.baseUrl = this.configService.get<string>('MONNIFY_BASE_URL', 'https://sandbox.monnify.com');
    this.apiKey = this.configService.get<string>('MONNIFY_API_KEY', '');
    this.secretKey = this.configService.get<string>('MONNIFY_SECRET_KEY', '');
    this.contractCode = this.configService.get<string>('MONNIFY_CONTRACT_CODE', '');
  }

  private async getAccessToken(): Promise<string> {
    if (this.accessToken && this.tokenExpiry > Date.now()) {
      return this.accessToken;
    }

    const authString = `${this.apiKey}:${this.secretKey}`;
    const authHeader = `Basic ${Buffer.from(authString).toString('base64')}`;

    try {
      const response = await axios.post<MonnifyAuthResponse>(
        `${this.baseUrl}/api/v1/auth/login`,
        {},
        {
          headers: {
            Authorization: authHeader,
            'Content-Type': 'application/json',
          },
        }
      );

      this.accessToken = response.data.responseBody.accessToken;
      this.tokenExpiry = Date.now() + response.data.responseBody.expiresIn * 1000;
      return this.accessToken;
    } catch (error: any) {
      throw new BadRequestException('Failed to authenticate with Monnify');
    }
  }

  private getHeaders() {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.accessToken}`,
    };
  }

  async verifyAccount(accountNumber: string, bankCode: string): Promise<{ accountName: string }> {
    try {
      await this.getAccessToken();

      const response = await axios.get<AccountVerificationResponse>(
        `${this.baseUrl}/api/v2/bank/resolve`,
        {
          headers: this.getHeaders(),
          params: {
            accountNumber,
            bankCode,
          },
        }
      );

      return {
        accountName: response.data.responseBody.accountName,
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
    reason?: string
  ): Promise<{ reference: string; status: string }> {
    try {
      await this.getAccessToken();

      const transferData = {
        sourceAccountNumber: this.contractCode, // Use contract code as source
        destinationAccountNumber: accountNumber,
        destinationBankCode: bankCode,
        amount: amount,
        reference: reference,
        narration: reason || 'Vura Transfer',
        destinationBankName: this.getBankName(bankCode),
      };

      const response = await axios.post<TransferResponse>(
        `${this.baseUrl}/api/v2/disbursements/single`,
        transferData,
        { headers: this.getHeaders() }
      );

      return {
        reference: response.data.responseBody.transactionReference,
        status: response.data.responseBody.status,
      };
    } catch (error: any) {
      if (error.response?.data?.message) {
        throw new BadRequestException(error.response.data.message);
      }
      throw new BadRequestException('Transfer failed');
    }
  }

  // New method to create reserved account for QR/request functionality
  async createReservedAccount(
    userId: string,
    vuraTag: string,
    phoneNumber: string,
  ): Promise<{ accountNumber: string; accountName: string }> {
    try {
      await this.getAccessToken();

      const accountName = `Vura-${vuraTag}-${phoneNumber.slice(-4)}`;

      const response = await axios.post(
        `${this.baseUrl}/api/v1/bank-transfer/reserved-accounts`,
        {
          accountReference: userId,
          accountName: accountName,
          currencyCode: 'NGN',
          contractCode: this.contractCode,
          clientEmail: `${vuraTag}@vura.com`,
          clientName: accountName,
        },
        { headers: this.getHeaders() }
      );

      return {
        accountNumber: response.data.responseBody.accountNumber,
        accountName: accountName,
      };
    } catch (error: any) {
      if (error.response?.data?.message) {
        throw new BadRequestException(error.response.data.message);
      }
      throw new BadRequestException('Failed to create reserved account');
    }
  }

  private getBankName(bankCode: string): string {
    const banks: Record<string, string> = {
      '044': 'Access Bank',
      '023': 'Citibank Nigeria',
      '050': 'Ecobank Nigeria',
      '011': 'First Bank of Nigeria',
      '214': 'First City Monument Bank (FCMB)',
      '070': 'Fidelity Bank',
      '058': 'Guaranty Trust Bank (GTB)',
      '030': 'Heritage Bank',
      '301': 'Jaiz Bank',
      '082': 'Keystone Bank',
      '076': 'Polaris Bank',
      '221': 'Stanbic IBTC Bank',
      '068': 'Standard Chartered Bank',
      '232': 'Sterling Bank',
      '100': 'SunTrust Bank',
      '032': 'Union Bank of Nigeria',
      '033': 'United Bank for Africa (UBA)',
      '215': 'Unity Bank',
      '035': 'Wema Bank',
      '057': 'Zenith Bank',
      '999': 'Kuda Bank',
      '502': 'PalmPay',
      '503': 'OPay',
      '505': 'Moniepoint',
    };
    return banks[bankCode] || 'Unknown Bank';
  }
}