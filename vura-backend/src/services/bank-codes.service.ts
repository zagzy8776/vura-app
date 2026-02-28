import { Injectable } from '@nestjs/common';

export interface BankInfo {
  code: string;
  name: string;
  provider: 'flutterwave' | 'paystack' | 'monnify' | 'both';
}

@Injectable()
export class BankCodesService {
  // Complete list of Nigerian bank codes with their supported providers
  private readonly banks: Record<string, BankInfo> = {
    // Major Banks - All now support Flutterwave
    '044': { code: '044', name: 'Access Bank', provider: 'flutterwave' },
    '011': {
      code: '011',
      name: 'First Bank of Nigeria',
      provider: 'flutterwave',
    },
    '058': {
      code: '058',
      name: 'Guaranty Trust Bank (GTBank)',
      provider: 'flutterwave',
    },
    '057': { code: '057', name: 'Zenith Bank', provider: 'flutterwave' },
    '033': {
      code: '033',
      name: 'United Bank for Africa (UBA)',
      provider: 'flutterwave',
    },
    '032': {
      code: '032',
      name: 'Union Bank of Nigeria',
      provider: 'flutterwave',
    },
    '035': { code: '035', name: 'Wema Bank', provider: 'flutterwave' },
    '232': { code: '232', name: 'Sterling Bank', provider: 'flutterwave' },

    // Other Commercial Banks - All now support Flutterwave
    '023': { code: '023', name: 'Citibank Nigeria', provider: 'flutterwave' },
    '050': { code: '050', name: 'Ecobank Nigeria', provider: 'flutterwave' },
    '214': {
      code: '214',
      name: 'First City Monument Bank (FCMB)',
      provider: 'flutterwave',
    },
    '070': { code: '070', name: 'Fidelity Bank', provider: 'flutterwave' },
    '030': { code: '030', name: 'Heritage Bank', provider: 'flutterwave' },
    '301': { code: '301', name: 'Jaiz Bank', provider: 'flutterwave' },
    '082': { code: '082', name: 'Keystone Bank', provider: 'flutterwave' },
    '076': { code: '076', name: 'Polaris Bank', provider: 'flutterwave' },
    '221': { code: '221', name: 'Stanbic IBTC Bank', provider: 'flutterwave' },
    '068': {
      code: '068',
      name: 'Standard Chartered Bank',
      provider: 'flutterwave',
    },
    '215': { code: '215', name: 'Unity Bank', provider: 'flutterwave' },
    '100': { code: '100', name: 'SunTrust Bank', provider: 'flutterwave' },

    // Digital Banks & Fintechs - All now support Flutterwave
    '999': { code: '999', name: 'Kuda Bank', provider: 'flutterwave' },
    '502': { code: '502', name: 'PalmPay', provider: 'flutterwave' },
    '503': { code: '503', name: 'OPay', provider: 'flutterwave' },
    '505': { code: '505', name: 'Moniepoint', provider: 'flutterwave' },
    '512': { code: '512', name: 'Carbon (Paylater)', provider: 'flutterwave' },
    '513': { code: '513', name: 'Interswitch', provider: 'flutterwave' },
    '514': { code: '514', name: 'Flutterwave', provider: 'flutterwave' },
    '526': { code: '526', name: 'Paga', provider: 'flutterwave' },
    '560': { code: '560', name: 'Branch', provider: 'flutterwave' },
    '602': { code: '602', name: 'FSDH', provider: 'flutterwave' },
    '610': { code: '610', name: 'Covenant', provider: 'flutterwave' },
    '612': { code: '612', name: 'Zinternet', provider: 'flutterwave' },
    '613': { code: '613', name: 'Daylight', provider: 'flutterwave' },
    '614': { code: '614', name: 'Titan Trust', provider: 'flutterwave' },
    '615': { code: '615', name: 'Nigerian Navy', provider: 'flutterwave' },
    '616': { code: '616', name: 'NIBSS', provider: 'flutterwave' },
    '617': { code: '617', name: 'eTranzact', provider: 'flutterwave' },
    '618': { code: '618', name: 'Providus Bank', provider: 'flutterwave' },
    '619': {
      code: '619',
      name: 'Sterling Alternative Bank',
      provider: 'flutterwave',
    },
    '620': { code: '620', name: 'Parallex Bank', provider: 'flutterwave' },
    '621': { code: '621', name: 'Repo', provider: 'flutterwave' },
    '622': { code: '622', name: 'Gozem', provider: 'flutterwave' },
    '623': { code: '623', name: 'Migo', provider: 'flutterwave' },
    '624': { code: '624', name: 'Teasy', provider: 'flutterwave' },
    '625': { code: '625', name: 'Gomoney', provider: 'flutterwave' },
    '626': { code: '626', name: 'BancABC', provider: 'flutterwave' },
    '627': { code: '627', name: 'UBN', provider: 'flutterwave' },
    '628': { code: '628', name: 'Globus Bank', provider: 'flutterwave' },
    '629': { code: '629', name: 'EcoBank', provider: 'flutterwave' },
    '630': { code: '630', name: 'Fortress', provider: 'flutterwave' },
    '631': { code: '631', name: 'Premium Trust', provider: 'flutterwave' },
    '632': { code: '632', name: 'VFD', provider: 'flutterwave' },
    '633': { code: '633', name: 'Mkudi', provider: 'flutterwave' },
    '634': { code: '634', name: 'Rhomax', provider: 'flutterwave' },
    '635': { code: '635', name: 'Kredi Bank', provider: 'flutterwave' },
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

  getRecommendedProvider(
    bankCode: string,
  ): 'flutterwave' | 'paystack' | 'monnify' {
    const bankInfo = this.banks[bankCode];
    if (!bankInfo) {
      // Default to Flutterwave for unknown banks
      return 'flutterwave';
    }
    if (bankInfo.provider === 'both') {
      // Default to Flutterwave for banks supported by both
      return 'flutterwave';
    }
    return bankInfo.provider;
  }
}
