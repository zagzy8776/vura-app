import { Injectable } from '@nestjs/common';

export interface BankInfo {
  code: string;
  name: string;
  provider: 'paystack' | 'monnify' | 'both';
}

@Injectable()
export class BankCodesService {
  // Complete list of Nigerian bank codes with their supported providers
  private readonly banks: Record<string, BankInfo> = {
    // Major Banks
    '044': { code: '044', name: 'Access Bank', provider: 'both' },
    '011': { code: '011', name: 'First Bank of Nigeria', provider: 'both' },
    '058': { code: '058', name: 'Guaranty Trust Bank (GTBank)', provider: 'both' },
    '057': { code: '057', name: 'Zenith Bank', provider: 'both' },
    '033': { code: '033', name: 'United Bank for Africa (UBA)', provider: 'both' },
    '032': { code: '032', name: 'Union Bank of Nigeria', provider: 'both' },
    '035': { code: '035', name: 'Wema Bank', provider: 'both' },
    '232': { code: '232', name: 'Sterling Bank', provider: 'both' },

    // Other Commercial Banks
    '023': { code: '023', name: 'Citibank Nigeria', provider: 'both' },
    '050': { code: '050', name: 'Ecobank Nigeria', provider: 'both' },
    '214': { code: '214', name: 'First City Monument Bank (FCMB)', provider: 'both' },
    '070': { code: '070', name: 'Fidelity Bank', provider: 'both' },
    '030': { code: '030', name: 'Heritage Bank', provider: 'both' },
    '301': { code: '301', name: 'Jaiz Bank', provider: 'both' },
    '082': { code: '082', name: 'Keystone Bank', provider: 'both' },
    '076': { code: '076', name: 'Polaris Bank', provider: 'both' },
    '221': { code: '221', name: 'Stanbic IBTC Bank', provider: 'both' },
    '068': { code: '068', name: 'Standard Chartered Bank', provider: 'both' },
    '215': { code: '215', name: 'Unity Bank', provider: 'both' },
    '100': { code: '100', name: 'SunTrust Bank', provider: 'both' },

    // Digital Banks & Fintechs - ALL NOW USING PAYSTACK
    '999': { code: '999', name: 'Kuda Bank', provider: 'paystack' },
    '502': { code: '502', name: 'PalmPay', provider: 'paystack' },
    '503': { code: '503', name: 'OPay', provider: 'paystack' },
    '505': { code: '505', name: 'Moniepoint', provider: 'paystack' },
    '512': { code: '512', name: 'Carbon (Paylater)', provider: 'paystack' },
    '513': { code: '513', name: 'Interswitch', provider: 'paystack' },
    '514': { code: '514', name: 'Flutterwave', provider: 'paystack' },
    '526': { code: '526', name: 'Paga', provider: 'paystack' },
    '560': { code: '560', name: 'Branch', provider: 'paystack' },
    '602': { code: '602', name: 'FSDH', provider: 'paystack' },
    '610': { code: '610', name: 'Covenant', provider: 'paystack' },
    '612': { code: '612', name: 'Zinternet', provider: 'paystack' },
    '613': { code: '613', name: 'Daylight', provider: 'paystack' },
    '614': { code: '614', name: 'Titan Trust', provider: 'paystack' },
    '615': { code: '615', name: 'Nigerian Navy', provider: 'paystack' },
    '616': { code: '616', name: 'NIBSS', provider: 'paystack' },
    '617': { code: '617', name: 'eTranzact', provider: 'paystack' },
    '618': { code: '618', name: 'Providus Bank', provider: 'paystack' },
    '619': { code: '619', name: 'Sterling Alternative Bank', provider: 'paystack' },
    '620': { code: '620', name: 'Parallex Bank', provider: 'paystack' },
    '621': { code: '621', name: 'Repo', provider: 'paystack' },
    '622': { code: '622', name: 'Gozem', provider: 'paystack' },
    '623': { code: '623', name: 'Migo', provider: 'paystack' },
    '624': { code: '624', name: 'Teasy', provider: 'paystack' },
    '625': { code: '625', name: 'Gomoney', provider: 'paystack' },
    '626': { code: '626', name: 'BancABC', provider: 'paystack' },
    '627': { code: '627', name: 'UBN', provider: 'paystack' },
    '628': { code: '628', name: 'Globus Bank', provider: 'paystack' },
    '629': { code: '629', name: 'EcoBank', provider: 'paystack' },
    '630': { code: '630', name: 'Fortress', provider: 'paystack' },
    '631': { code: '631', name: 'Premium Trust', provider: 'paystack' },
    '632': { code: '632', name: 'VFD', provider: 'paystack' },
    '633': { code: '633', name: 'Mkudi', provider: 'paystack' },
    '634': { code: '634', name: 'Rhomax', provider: 'paystack' },
    '635': { code: '635', name: 'Kredi Bank', provider: 'paystack' },
  };

  getBankInfo(bankCode: string): BankInfo | null {
    return this.banks[bankCode] || null;
  }

  isValidBankCode(bankCode: string): boolean {
    return bankCode in this.banks;
  }

  getAllBanks(): BankInfo[] {
    return Object.values(this.banks);
  }

  getRecommendedProvider(bankCode: string): 'paystack' | 'monnify' {
    const bankInfo = this.banks[bankCode];
    if (!bankInfo) {
      // Default to Paystack for unknown banks
      return 'paystack';
    }
    if (bankInfo.provider === 'both') {
      // Default to Paystack for banks supported by both
      return 'paystack';
    }
    return bankInfo.provider;
  }
}
