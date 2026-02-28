import { Bank, TransferLimits, TransferResult } from '../types/transfer';
import { supabase } from '../../integrations/supabase/client';

const API_URL = import.meta.env.VITE_API_URL || 'https://vura-backend-production.up.railway.app';

// Fee constants - should come from backend in production
const TAG_TRANSFER_FEE = 0.005; // 0.5%
const BANK_TRANSFER_FEE = 0.015; // 1.5%
const MIN_BANK_FEE = 10; // Minimum ₦10

export class TransferService {
  /**
   * Fetch bank list from backend API
   */
  static async getBanks(): Promise<Bank[]> {
    try {
      const response = await fetch(`${API_URL}/bank-codes`);
      if (!response.ok) throw new Error('Failed to fetch banks');
      return await response.json();
    } catch (error) {
      console.error('Error fetching banks:', error);
      // Return fallback banks if API fails
      return this.getFallbackBanks();
    }
  }

  /**
   * Fallback bank list (should rarely be used)
   */
  static getFallbackBanks(): Bank[] {
    return [
      { code: '044', name: 'Access Bank' },
      { code: '023', name: 'Citibank' },
      { code: '063', name: 'Diamond Bank' },
      { code: '050', name: 'Ecobank' },
      { code: '011', name: 'First Bank of Nigeria' },
      { code: '214', name: 'First City Monument Bank' },
      { code: '058', name: 'Guaranty Trust Bank' },
      { code: '030', name: 'Heritage Bank' },
      { code: '082', name: 'Keystone Bank' },
      { code: '076', name: 'Skye Bank' },
      { code: '039', name: 'Sterling Bank' },
      { code: '232', name: 'Union Bank of Nigeria' },
      { code: '032', name: 'United Bank for Africa' },
      { code: '215', name: 'Unity Bank' },
      { code: '035', name: 'Wema Bank' },
      { code: '057', name: 'Zenith Bank' },
    ];
  }

  /**
   * Calculate transfer fee
   */
  static calculateFee(amount: number, transferType: 'tag' | 'bank'): number {
    if (transferType === 'tag') {
      return amount * TAG_TRANSFER_FEE;
    }
    return Math.max(MIN_BANK_FEE, amount * BANK_TRANSFER_FEE);
  }

  /**
   * Verify bank account using backend API
   */
  static async verifyBankAccount(
    accountNumber: string,
    bankCode: string,
    provider: 'paystack' | 'monnify' = 'monnify'
  ): Promise<{ accountName: string; verified: boolean }> {
    const params = new URLSearchParams({
      accountNumber,
      bankCode,
      provider,
    });

    const response = await fetch(`${API_URL}/transactions/verify-account?${params}`);
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Verification failed' }));
      throw new Error(error.message || 'Account verification failed');
    }

    const data = await response.json();
    return {
      accountName: data.accountName,
      verified: data.success,
    };
  }

  /**
   * Lookup Vura tag
   */
  static async lookupTag(tag: string): Promise<{ found: boolean; name?: string; tag?: string }> {
    try {
      const params = new URLSearchParams({ tag: tag.replace('@', '') });
      const response = await fetch(`${API_URL}/transactions/lookup?${params}`);
      
      if (!response.ok) return { found: false };
      
      const data = await response.json();
      return {
        found: !!data.user,
        name: data.user?.fullName,
        tag: data.user?.vuraTag,
      };
    } catch {
      return { found: false };
    }
  }

  /**
   * Send money to Vura tag
   */
  static async sendToTag(
    recipientTag: string,
    amount: number,
    description?: string,
    pin?: string
  ): Promise<TransferResult> {
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session) throw new Error('Not authenticated');

    const response = await fetch(`${API_URL}/transactions/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        recipientTag: recipientTag.replace('@', ''),
        amount,
        description,
        pin,
      }),
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.message || 'Transfer failed');
    }

    return {
      success: true,
      reference: data.reference || data.id,
      amount: data.amount || amount,
      fee: data.fee || this.calculateFee(amount, 'tag'),
      message: data.message,
    };
  }

  /**
   * Send money to bank account
   */
  static async sendToBank(
    accountNumber: string,
    bankCode: string,
    accountName: string,
    amount: number,
    description?: string,
    pin?: string,
    paymentProvider: 'paystack' | 'monnify' = 'monnify'
  ): Promise<TransferResult> {
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session) throw new Error('Not authenticated');

    const response = await fetch(`${API_URL}/transactions/send-to-bank`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        accountNumber,
        bankCode,
        accountName,
        amount,
        description,
        pin,
        paymentProvider,
      }),
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.message || 'Bank transfer failed');
    }

    return {
      success: true,
      reference: data.reference,
      amount: data.amount,
      fee: data.fee || this.calculateFee(amount, 'bank'),
      message: data.message,
    };
  }

  /**
   * Get user's transfer limits
   */
  static async getLimits(): Promise<TransferLimits> {
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session) {
      return { dailyLimit: 0, used: 0, remaining: 0 };
    }

    try {
      const response = await fetch(`${API_URL}/limits`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      });

      if (!response.ok) {
        // Return default limits if API fails
        return this.getDefaultLimits();
      }

      const data = await response.json();
      return {
        dailyLimit: data.dailyLimit || 1000000,
        used: data.used || 0,
        remaining: data.remaining || 1000000,
      };
    } catch {
      return this.getDefaultLimits();
    }
  }

  /**
   * Get default limits
   */
  static getDefaultLimits(): TransferLimits {
    return {
      dailyLimit: 1000000, // ₦1,000,000
      used: 0,
      remaining: 1000000,
    };
  }
}
