export interface Bank {
  code: string;
  name: string;
}

export interface RecentRecipient {
  id: string;
  type: 'tag' | 'bank';
  name: string;
  identifier: string;
  bankCode?: string;
  bankName?: string;
  lastUsed: string;
  isFavorite: boolean;
}

export interface TransferLimits {
  dailyLimit: number;
  used: number;
  remaining: number;
}

export interface TransferFormData {
  recipient: string;
  amount: number;
  description?: string;
  pin?: string;
  bankCode?: string;
  accountNumber?: string;
}

export interface TransferConfirmation {
  transferType: 'tag' | 'bank';
  recipient: string;
  recipientDisplay: string;
  amount: number;
  fee: number;
  total: number;
  scheduleType: 'now' | 'later' | 'recurring';
  scheduleDate?: string;
  recurringFrequency?: 'daily' | 'weekly' | 'monthly';
}

export type TransferStatus = 'form' | 'confirm' | 'success';

export interface TransferResult {
  success: boolean;
  reference: string;
  amount: number;
  fee: number;
  message?: string;
}
