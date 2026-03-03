// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  IvoryPay API – TypeScript Interfaces
//  Docs: https://docs.ivorypay.io
//  Base URL: https://api.ivorypay.io/api/v1
//  Auth header: Authorization: <IVORYPAY_SECRET_KEY> (no Bearer prefix)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// ─── GET /v1/rates/fiat-transfer ─────────────────────────────────────
export interface IvoryPayRateRequest {
  amount: string;
  crypto: string; // e.g. 'USDT'
  fiat: string;   // e.g. 'NGN'
}

export interface IvoryPayRateResponse {
  status: boolean;
  message: string;
  data: {
    crypto: string;
    fiat: string;
    amount: string;
    rate: string;
    fiatEquivalent: string;
    fee: string;
    totalPayable: string;
  };
}

// ─── POST /v1/blockchain-accounts/create ─────────────────────────────
export interface IvoryPayCreateAddressRequest {
  crypto: string;  // 'USDT'
  network: string; // 'tron'
  email: string;
  name: string;
  reference: string;
}

export interface IvoryPayCreateAddressResponse {
  status: boolean;
  message: string;
  data: {
    id: string;
    address: string;
    crypto: string;
    network: string;
    reference: string;
    status: string;
    createdAt: string;
  };
}

// ─── POST /v1/fiat-transfer/account-resolution ──────────────────────
export interface IvoryPayResolveAccountRequest {
  bankCode: string;
  accountNumber: string;
}

export interface IvoryPayResolveAccountResponse {
  status: boolean;
  message: string;
  data: {
    accountNumber: string;
    accountName: string;
    bankCode: string;
    bankName: string;
  };
}

// ─── POST /v1/fiat-transfer ─────────────────────────────────────────
export interface IvoryPayFiatPayoutRequest {
  amount: string;
  currency: string; // 'NGN'
  bankCode: string;
  accountNumber: string;
  accountName: string;
  reference: string;
  narration?: string;
  crypto: string; // Source crypto, e.g. 'USDT'
}

export interface IvoryPayFiatPayoutResponse {
  status: boolean;
  message: string;
  data: {
    id: string;
    reference: string;
    amount: string;
    currency: string;
    status: string;
    bankName: string;
    accountNumber: string;
    accountName: string;
    createdAt: string;
  };
}

// ─── GET /v1/business/transactions/:reference/verify ─────────────────
export interface IvoryPayVerifyResponse {
  status: boolean;
  message: string;
  data: {
    id: string;
    reference: string;
    amount: string;
    crypto: string;
    fiat: string;
    status: string; // 'success', 'pending', 'failed'
    type: string;
    createdAt: string;
    updatedAt: string;
  };
}

// ─── Webhook Payload ─────────────────────────────────────────────────
export interface IvoryPayWebhookPayload {
  event: string;
  data: {
    id: string;
    reference: string;
    crypto: string;
    network: string;
    amount: string;
    fiatEquivalent: string;
    fiat: string;
    rate: string;
    address: string;
    txHash: string;
    status: string;
    email: string;
    createdAt: string;
    metadata?: Record<string, unknown>;
  };
}

// ─── Standard API error shapes ───────────────────────────────────────
export interface IvoryPayErrorResponse {
  status: false;
  message: string;
  error?: string;
}
