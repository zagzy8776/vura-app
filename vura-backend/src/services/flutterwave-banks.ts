/**
 * Flutterwave Bank Codes for Nigeria
 * These codes are used for transfers and account verification
 * Updated: 2026
 */
export const FLUTTERWAVE_BANKS: Record<string, { name: string; code: string }> =
  {
    // Major Banks
    '044': { name: 'Access Bank', code: '044' },
    '023': { name: 'Citibank', code: '023' },
    '063': { name: 'Diamond Bank', code: '063' },
    '050': { name: 'Ecobank', code: '050' },
    '040': { name: 'Fidelity Bank', code: '040' },
    '011': { name: 'First Bank of Nigeria', code: '011' },
    '214': { name: 'First City Monument Bank', code: '214' },
    '058': { name: 'Guaranty Trust Bank', code: '058' },
    '030': { name: 'Heritage Bank', code: '030' },
    '082': { name: 'Keystone Bank', code: '082' },
    '076': { name: 'Skye Bank', code: '076' },
    '221': { name: 'Stanbic IBTC Bank', code: '221' },
    '068': { name: 'Standard Chartered Bank', code: '068' },
    '032': { name: 'Union Bank of Nigeria', code: '032' },
    '033': { name: 'United Bank for Africa', code: '033' },
    '035': { name: 'Wema Bank', code: '035' },
    '057': { name: 'Zenith Bank', code: '057' },

    // Fintech / Digital Banks
    '999992': { name: 'OPay', code: '999992' },
    '999991': { name: 'PalmPay', code: '999991' },
    '999993': { name: 'Kuda Bank', code: '999993' },
    '999994': { name: 'Moniepoint', code: '999994' },
    '999995': { name: 'Sterling Bank', code: '999995' },
    '50515': { name: 'Vfd Microfinance Bank', code: '50515' },
    '51269': { name: 'Mkudi', code: '51269' },
    '51310': { name: 'Stepwell Microfinance', code: '51310' },
    '51312': { name: 'Wema Bank (Digital)', code: '51312' },
    '51211': { name: 'Carbon', code: '51211' },

    // Microfinance Banks
    '305': { name: '帝国泛非', code: '305' },
    '501': { name: 'Fortress Microfinance Bank', code: '501' },
    '502': { name: 'Addosser Microfinance Bank', code: '502' },
    '503': { name: 'Apex Microfinance Bank', code: '503' },
    '504': { name: 'Bayelsa Microfinance Bank', code: '504' },
    '506': { name: 'Benson Microfinance Bank', code: '506' },
    '507': { name: 'Borrowers Microfinance Bank', code: '507' },
    '508': { name: 'Crown Microfinance Bank', code: '508' },
    '509': { name: 'Diamond Microfinance Bank', code: '509' },
    '510': { name: 'Eagle Multi-purpose Bank', code: '510' },
    '511': { name: 'eBank', code: '511' },
    '513': { name: 'First Generation Microfinance Bank', code: '513' },
    '514': { name: 'Giwa Microfinance Bank', code: '514' },
    '515': { name: 'Hasal Microfinance Bank', code: '515' },
    '516': { name: 'Highstreet Microfinance Bank', code: '516' },
    '517': { name: 'Ilaro Microfinance Bank', code: '517' },
    '518': { name: 'Infinity Microfinance Bank', code: '518' },
    '519': { name: 'Jubilee Microfinance Bank', code: '519' },
    '520': { name: 'KCM Microfinance Bank', code: '520' },
    '521': { name: 'Kitmont Microfinance Bank', code: '521' },
    '522': { name: 'Leadway Microfinance Bank', code: '522' },
    '523': { name: 'Lydia Microfinance Bank', code: '523' },
    '524': { name: 'MoneyBase Microfinance Bank', code: '524' },
    '525': { name: 'Mutual Trust Microfinance Bank', code: '525' },
    '526': { name: 'Nigerian Microfinance Bank', code: '526' },
    '527': { name: 'Nnewi Microfinance Bank', code: '527' },
    '528': { name: 'Paycom', code: '528' },
    '529': { name: 'PiggyVest', code: '529' },
    '530': { name: 'Protom Microfinance Bank', code: '530' },
    '531': { name: 'Renmoney', code: '531' },
    '532': { name: 'Seedvest Microfinance Bank', code: '532' },
    '533': { name: 'Skye Microfinance Bank', code: '533' },
    '534': { name: 'Solid Rock Microfinance Bank', code: '534' },
    '535': { name: 'Sparre Microfinance Bank', code: '535' },
    '536': { name: 'Trust Microfinance Bank', code: '536' },
    '537': { name: 'Wow Microfinance Bank', code: '537' },
  };

/**
 * Get bank name from Flutterwave code
 */
export function getBankName(code: string): string {
  return FLUTTERWAVE_BANKS[code]?.name || 'Unknown Bank';
}

/**
 * Get bank code from name
 */
export function getBankCode(name: string): string | null {
  const bank = Object.values(FLUTTERWAVE_BANKS).find(
    (b) => b.name.toLowerCase() === name.toLowerCase(),
  );
  return bank?.code || null;
}

/**
 * Check if bank code is valid
 */
export function isValidBankCode(code: string): boolean {
  return code in FLUTTERWAVE_BANKS;
}

/**
 * Get all bank codes for dropdown
 */
export function getAllBanks(): { code: string; name: string }[] {
  return Object.values(FLUTTERWAVE_BANKS);
}
