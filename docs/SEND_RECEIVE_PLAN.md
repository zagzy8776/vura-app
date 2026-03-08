# Send & Receive – Plan (No Payout Provider Yet)

## How it should work for users

- **Send**
  - **To Vura users:** By @tag (works today).
  - **To any Nigerian bank:** Choose bank → enter account number → verify name → enter amount & PIN → send. This requires a **payout/transfer provider** (see below).
- **Receive**
  - **From Vura users:** Payment link, Request from @tag, QR/tag (works today).
  - **From anyone (bank):** Virtual account (bank transfer in), card funding (works today where configured).

So **receiving** is already covered. **Sending to every bank in Nigeria** depends on having one of the options below.

---

## Why you can’t “just” send to every bank

To debit a user’s balance and credit **any** Nigerian bank account, you need a licensed **payout/transfer** product. Providers (Paystack, Flutterwave, Kora, etc.) expose this as a separate product (e.g. “Transfer” or “Payouts”) and usually require:

- Business verification (CAC, address, sometimes compliance docs).
- Explicit approval for the transfer/payout product (separate from collections/card pay-in).

So “I don’t have the documents” usually means either:

- You haven’t completed business verification with a provider, or  
- You don’t have **transfer/payout** access yet (only pay-in).

Until that’s in place, the only way to “send” from Vura is **@tag (P2P)**, which already works.

---

## What we did in the app (without a provider)

So that the product is ready when you get access:

1. **Bank list**
   - Backend exposes **all Nigerian banks** (static list in `bank-codes.service.ts`) on `GET /bank-codes/for-send-to-bank`.
   - Response includes `transferAvailable: false` when no payout provider is configured.

2. **Send screen**
   - If the API returns a non‑empty bank list, the **Bank** tab is shown so users can:
     - Choose any Nigerian bank,
     - Enter account number,
     - (When provider is on) verify account name and send.
   - If `transferAvailable === false`, the UI shows that **bank transfer is coming soon** and does not allow submitting the bank transfer (users can still use @tag).

3. **When you get a provider**
   - Turn on the provider (e.g. Paystack Transfer) in config.
   - Backend already has:
     - `PaystackService.verifyAccount(accountNumber, bankCode)` for account name resolution.
     - `PaystackService.initiateTransfer(...)` for the actual transfer.
   - You only need to:
     - Set `transferAvailable: true` when the provider is configured (e.g. env flag).
     - Wire `POST /transactions/send-to-bank` to: verify PIN → resolve account → debit balance → call `initiateTransfer` → record transaction.
     - Wire `GET /transactions/verify-account` to `PaystackService.verifyAccount`.

So: **no documents = no real bank payout yet**, but the flow (bank list, form, verify, send) is in place; once you have transfer access and config, we only flip the flag and connect the endpoints.

---

## Provider options (when you have docs/approval)

| Option | Use case | Notes |
|--------|----------|--------|
| **Paystack Transfer** | Same stack as your card pay-in | Apply for “Transfer” in Paystack dashboard; use existing `PaystackService` methods. |
| **Flutterwave Payouts** | Alternative to Paystack | Separate product; NGN bank payouts. |
| **Kora / others** | If you have a relationship | You previously tried Kora; use only if you get payout access. |

Recommendation: **Paystack Transfer** first (you already use Paystack; bank codes and flows align).

---

## Steps when you get transfer access (e.g. Paystack)

1. **Config**
   - Ensure `PAYSTACK_SECRET_KEY` is the key that has **Transfer** enabled.
   - Add something like `SEND_TO_BANK_ENABLED=true` (or derive from “does Paystack Transfer work?”).

2. **Backend**
   - `GET /bank-codes/for-send-to-bank`: when Transfer is enabled, return same bank list and `transferAvailable: true` (and optionally `provider: 'paystack'`).
   - `GET /transactions/verify-account`: call `PaystackService.verifyAccount(accountNumber, bankCode)` and return `{ accountName }`.
   - `POST /transactions/send-to-bank`: validate user, PIN, limits → resolve account → debit balance → `PaystackService.initiateTransfer(...)` → create transaction record.

3. **Frontend**
   - No change if you already show the Bank tab when the bank list exists and only enable “Send” when `transferAvailable === true`. Users can then send to every bank in the list.

4. **Compliance / limits**
   - Keep KYC tiers and daily limits; apply them to send-to-bank the same way as @tag sends.

---

## Summary

- **Receive:** Already works (VA, card, @tag, payment link, request money).
- **Send to banks:** Requires a payout/transfer product and docs/approval. The app is prepared with a full Nigerian bank list and a clear “coming soon” state; when you get access, enable the provider and wire the two endpoints above.
