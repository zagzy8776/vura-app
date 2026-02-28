import React, { createContext, useContext, useReducer, ReactNode } from 'react';
import { 
  TransferStatus, 
  TransferFormData, 
  TransferResult,
  Bank 
} from '../types/transfer';
import { TransferService } from '../services/transfer.service';

// State type
interface TransferState {
  formData: TransferFormData;
  status: TransferStatus;
  transferMode: 'tag' | 'bank';
  recipientVerified: boolean;
  recipientName: string;
  accountVerified: boolean;
  accountName: string;
  banks: Bank[];
  isVerifyingRecipient: boolean;
  isVerifyingAccount: boolean;
  isSending: boolean;
  error: string | null;
  result: TransferResult | null;
}

// Action types
type TransferAction =
  | { type: 'SET_TRANSFER_MODE'; payload: 'tag' | 'bank' }
  | { type: 'SET_FORM_DATA'; payload: Partial<TransferFormData> }
  | { type: 'SET_STATUS'; payload: TransferStatus }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'SET_RECIPIENT_VERIFIED'; payload: { verified: boolean; name: string } }
  | { type: 'SET_ACCOUNT_VERIFIED'; payload: { verified: boolean; name: string } }
  | { type: 'SET_BANKS'; payload: Bank[] }
  | { type: 'SET_VERIFYING_RECIPIENT'; payload: boolean }
  | { type: 'SET_VERIFYING_ACCOUNT'; payload: boolean }
  | { type: 'SET_SENDING'; payload: boolean }
  | { type: 'SET_RESULT'; payload: TransferResult | null }
  | { type: 'RESET' };

// Initial state
const initialFormData: TransferFormData = {
  recipient: '',
  amount: 0,
  description: '',
  pin: '',
  bankCode: '',
  accountNumber: '',
};

const initialState: TransferState = {
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
};

// Reducer
function transferReducer(state: TransferState, action: TransferAction): TransferState {
  switch (action.type) {
    case 'SET_TRANSFER_MODE':
      return {
        ...state,
        transferMode: action.payload,
        formData: { ...initialFormData },
        recipientVerified: false,
        recipientName: '',
        accountVerified: false,
        accountName: '',
        error: null,
      };
    case 'SET_FORM_DATA':
      return {
        ...state,
        formData: { ...state.formData, ...action.payload },
      };
    case 'SET_STATUS':
      return { ...state, status: action.payload };
    case 'SET_ERROR':
      return { ...state, error: action.payload };
    case 'SET_RECIPIENT_VERIFIED':
      return {
        ...state,
        recipientVerified: action.payload.verified,
        recipientName: action.payload.name,
        isVerifyingRecipient: false,
      };
    case 'SET_ACCOUNT_VERIFIED':
      return {
        ...state,
        accountVerified: action.payload.verified,
        accountName: action.payload.name,
        isVerifyingAccount: false,
      };
    case 'SET_BANKS':
      return { ...state, banks: action.payload };
    case 'SET_VERIFYING_RECIPIENT':
      return { ...state, isVerifyingRecipient: action.payload };
    case 'SET_VERIFYING_ACCOUNT':
      return { ...state, isVerifyingAccount: action.payload };
    case 'SET_SENDING':
      return { ...state, isSending: action.payload };
    case 'SET_RESULT':
      return { ...state, result: action.payload, status: action.payload ? 'success' : state.status };
    case 'RESET':
      return {
        ...initialState,
        banks: state.banks,
      };
    default:
      return state;
  }
}

// Context
interface TransferContextType {
  state: TransferState;
  dispatch: React.Dispatch<TransferAction>;
  verifyRecipient: () => Promise<void>;
  verifyBankAccount: () => Promise<void>;
  loadBanks: () => Promise<void>;
  sendTransfer: () => Promise<TransferResult>;
  reset: () => void;
}

const TransferContext = createContext<TransferContextType | undefined>(undefined);

// Provider
export function TransferProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(transferReducer, initialState);

  const verifyRecipient = async () => {
    if (state.transferMode !== 'tag' || !state.formData.recipient) return;
    
    dispatch({ type: 'SET_VERIFYING_RECIPIENT', payload: true });
    dispatch({ type: 'SET_ERROR', payload: null });

    try {
      const result = await TransferService.lookupTag(state.formData.recipient);
      dispatch({
        type: 'SET_RECIPIENT_VERIFIED',
        payload: {
          verified: result.found,
          name: result.name || result.tag || state.formData.recipient,
        },
      });
      if (!result.found) {
        dispatch({ type: 'SET_ERROR', payload: 'Recipient not found' });
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to verify recipient';
      dispatch({ type: 'SET_ERROR', payload: message });
      dispatch({ type: 'SET_RECIPIENT_VERIFIED', payload: { verified: false, name: '' } });
    }
  };

  const verifyBankAccount = async () => {
    if (state.transferMode !== 'bank' || !state.formData.accountNumber || !state.formData.bankCode) return;
    
    dispatch({ type: 'SET_VERIFYING_ACCOUNT', payload: true });
    dispatch({ type: 'SET_ERROR', payload: null });

    try {
      const result = await TransferService.verifyBankAccount(
        state.formData.accountNumber,
        state.formData.bankCode
      );
      dispatch({
        type: 'SET_ACCOUNT_VERIFIED',
        payload: { verified: result.verified, name: result.accountName },
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to verify account';
      dispatch({ type: 'SET_ERROR', payload: message });
      dispatch({ type: 'SET_ACCOUNT_VERIFIED', payload: { verified: false, name: '' } });
    }
  };

  const loadBanks = async () => {
    try {
      const banks = await TransferService.getBanks();
      dispatch({ type: 'SET_BANKS', payload: banks });
    } catch (error) {
      console.error('Failed to load banks:', error);
    }
  };

  const sendTransfer = async (): Promise<TransferResult> => {
    dispatch({ type: 'SET_SENDING', payload: true });
    dispatch({ type: 'SET_ERROR', payload: null });

    try {
      let result: TransferResult;
      
      if (state.transferMode === 'tag') {
        result = await TransferService.sendToTag(
          state.formData.recipient,
          state.formData.amount,
          state.formData.description,
          state.formData.pin
        );
      } else {
        result = await TransferService.sendToBank(
          state.formData.accountNumber!,
          state.formData.bankCode!,
          state.accountName,
          state.formData.amount,
          state.formData.description,
          state.formData.pin
        );
      }
      
      dispatch({ type: 'SET_RESULT', payload: result });
      return result;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Transfer failed';
      dispatch({ type: 'SET_ERROR', payload: message });
      throw error;
    } finally {
      dispatch({ type: 'SET_SENDING', payload: false });
    }
  };

  const reset = () => {
    dispatch({ type: 'RESET' });
  };

  return (
    <TransferContext.Provider value={{
      state,
      dispatch,
      verifyRecipient,
      verifyBankAccount,
      loadBanks,
      sendTransfer,
      reset,
    }}>
      {children}
    </TransferContext.Provider>
  );
}

// Hook
export function useTransfer() {
  const context = useContext(TransferContext);
  if (!context) {
    throw new Error('useTransfer must be used within a TransferProvider');
  }
  return context;
}
