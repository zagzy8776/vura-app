import { create } from 'zustand';
import { 
  TransferStatus, 
  TransferFormData, 
  TransferConfirmation, 
  TransferResult,
  Bank 
} from '../types/transfer';
import { TransferService } from '../services/transfer.service';

interface TransferState {
  // Form state
  formData: TransferFormData;
  
  // UI state
  status: TransferStatus;
  transferMode: 'tag' | 'bank';
  
  // Verification state
  recipientVerified: boolean;
  recipientName: string;
  accountVerified: boolean;
  accountName: string;
  
  // Bank list
  banks: Bank[];
  
  // Loading states
  isVerifyingRecipient: boolean;
  isVerifyingAccount: boolean;
  isSending: boolean;
  
  // Error state
  error: string | null;
  
  // Result
  result: TransferResult | null;
  
  // Limits
  dailyLimit: number;
  usedToday: number;
  
  // Actions
  setTransferMode: (mode: 'tag' | 'bank') => void;
  setFormData: (data: Partial<TransferFormData>) => void;
  setStatus: (status: TransferStatus) => void;
  setError: (error: string | null) => void;
  
  // Async actions
  verifyRecipient: () => Promise<void>;
  verifyBankAccount: () => Promise<void>;
  loadBanks: () => Promise<void>;
  sendTransfer: () => Promise<TransferResult>;
  reset: () => void;
}

const initialFormData: TransferFormData = {
  recipient: '',
  amount: 0,
  description: '',
  pin: '',
  bankCode: '',
  accountNumber: '',
};

export const useTransferStore = create<TransferState>((set, get) => ({
  // Initial state
  formData: { ...initialFormData },
  status: 'form',
  transferMode: 'tag',
  recipientVerified: false,
  recipientName: '',
  accountVerified: false,
  accountName: '',
  banks: [],
  isVerifyingRecipient: false,
  isVerifyingAccount: false,
  isSending: false,
  error: null,
  result: null,
  dailyLimit: 1000000,
  usedToday: 0,
  
  // Actions
  setTransferMode: (mode) => {
    set({ 
      transferMode: mode,
      formData: { ...initialFormData },
      recipientVerified: false,
      recipientName: '',
      accountVerified: false,
      accountName: '',
      error: null,
    });
  },
  
  setFormData: (data) => {
    set((state) => ({
      formData: { ...state.formData, ...data },
    }));
  },
  
  setStatus: (status) => set({ status }),
  setError: (error) => set({ error }),
  
  verifyRecipient: async () => {
    const { formData, transferMode } = get();
    
    if (transferMode !== 'tag' || !formData.recipient) {
      return;
    }
    
    set({ isVerifyingRecipient: true, error: null });
    
    try {
      const result = await TransferService.lookupTag(formData.recipient);
      
      if (result.found) {
        set({
          recipientVerified: true,
          recipientName: result.name || result.tag || formData.recipient,
          isVerifyingRecipient: false,
        });
      } else {
        set({
          recipientVerified: false,
          recipientName: '',
          error: 'Recipient not found',
          isVerifyingRecipient: false,
        });
      }
    } catch (error: any) {
      set({
        recipientVerified: false,
        recipientName: '',
        error: error.message || 'Failed to verify recipient',
        isVerifyingRecipient: false,
      });
    }
  },
  
  verifyBankAccount: async () => {
    const { formData, transferMode } = get();
    
    if (transferMode !== 'bank' || !formData.accountNumber || !formData.bankCode) {
      return;
    }
    
    set({ isVerifyingAccount: true, error: null });
    
    try {
      const result = await TransferService.verifyBankAccount(
        formData.accountNumber,
        formData.bankCode
      );
      
      set({
        accountVerified: result.verified,
        accountName: result.accountName,
        isVerifyingAccount: false,
      });
    } catch (error: any) {
      set({
        accountVerified: false,
        accountName: '',
        error: error.message || 'Failed to verify account',
        isVerifyingAccount: false,
      });
    }
  },
  
  loadBanks: async () => {
    try {
      const banks = await TransferService.getBanks();
      set({ banks });
    } catch (error) {
      console.error('Failed to load banks:', error);
    }
  },
  
  sendTransfer: async () => {
    const { formData, transferMode, accountName } = get();
    
    set({ isSending: true, error: null });
    
    try {
      let result: TransferResult;
      
      if (transferMode === 'tag') {
        result = await TransferService.sendToTag(
          formData.recipient,
          formData.amount,
          formData.description,
          formData.pin
        );
      } else {
        result = await TransferService.sendToBank(
          formData.accountNumber!,
          formData.bankCode!,
          accountName,
          formData.amount,
          formData.description,
          formData.pin
        );
      }
      
      set({ 
        result, 
        status: 'success', 
        isSending: false 
      });
      
      return result;
    } catch (error: any) {
      set({
        error: error.message || 'Transfer failed',
        isSending: false,
      });
      throw error;
    }
  },
  
  reset: () => {
    set({
      formData: { ...initialFormData },
      status: 'form',
      recipientVerified: false,
      recipientName: '',
      accountVerified: false,
      accountName: '',
      error: null,
      result: null,
    });
  },
}));
