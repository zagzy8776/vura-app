# Send Flow – Deep Audit (Frontend + Backend)

**Scope:** Send Money page (SendMoney.tsx), transactions controller/service, VPay, limits, idempotency.

---

## 1. What’s fine (no change needed)

- **Auth & PIN:** Send and send-to-bank both require PIN; controller validates PIN before calling service. Tag send uses `sendMoney` → `initiatePayment` which also checks PIN.
- **VPay flow:** Bank list, nuban lookup, outbound transfer are VPay-only; no Paystack in send-to-bank. `isConfigured()` guards all VPay usage.
- **Idempotency:** Client sends one key per “Continue” (bank); backend returns cached success for same key and rolls back balance on failure. Key stored in ref and reused on retry.
- **Verify-account race:** Request-id pattern ensures only the latest verify response updates state; stale responses are ignored.
- **Bank dropdown:** Outside-click closes it; ref + mousedown listener is correct.
- **Banks load error:** Retry button and clear message when API returns `success: false` or request fails. “Send to bank not available” only when no load error and empty banks.
- **Fee consistency:** Backend flat fee (≤5k→10, ≤50k→25, else 50) matches frontend and transfer-fee endpoint. Provider is `vpay`.
- **Account name required:** Backend rejects send-to-bank when `accountName` is missing/blank; user must verify first.
- **Balance rollback:** On VPay failure, balance is restored and transaction marked FAILED in a transaction.
- **Tag validation:** `isFormValid()` for tag requires `recipientData?.found`; backend also resolves tag and returns 404 if not found.
- **Self-transfer:** Backend blocks sending to self in `handleInternalTransfer`.
- **Limits (backend):** Daily limit uses transaction `amount` (principal) only; `checkSendLimit(amount)` is consistent with how `getUserLimits` computes `remainingDaily`.

---

## 2. Bugs / mistakes

### 2.1 Frontend: daily limit check uses (amount + fee) vs principal-only

- **Where:** `SendMoney.tsx` – `isOverLimit = Number(amount) + fee > userLimits.remaining`.
- **Issue:** Backend `remainingDaily` = daily limit − sum of **principal** (transaction amount). So the limit is on **amount sent**, not on (amount + fee). Frontend is blocking when **total deduction** > remaining, which is stricter than the backend rule. So a user with remaining = ₦10,000 can send ₦10,000 (fee ₦25); backend allows it, but frontend could show “Amount exceeds remaining limit” if we ever treated remaining as “total” elsewhere. Actually re-checking: if remaining = 10000, amount = 10000, fee = 25, then isOverLimit = (10000 + 25) > 10000 = true. So we’re **blocking** a transfer the backend would **allow**. So the user can’t click Continue even though they’re within daily limit (principal 10000). So this is a **bug**: we’re too strict.
- **Fix:** Treat daily limit as principal-only: `isOverLimit = Number(amount) > userLimits.remaining`. Optionally add a separate “Insufficient balance” check when you have balance on the page (see suggestion 3.2).

### 2.2 Backend: send-to-bank `amount` type

- **Where:** `transactions.controller.ts` (body.amount), `transactions.service.ts` (sendToBank).
- **Issue:** JSON body can send `amount` as string (e.g. `"5000"`). Service uses `Number.isFinite(amount)` and then `amount <= 5000` etc.; for string `"5000"`, `Number.isFinite("5000")` is false, so we throw. So we don’t mis-debit, but we could be more robust by normalizing once.
- **Fix:** At service entry (or controller), coerce once: `const amountNum = Number(amount); if (!Number.isFinite(amountNum) || amountNum <= 0) throw new BadRequestException('Invalid amount.');` and use `amountNum` (and round to 2 dp or integer for Naira) everywhere in that method.

### 2.3 Backend: amount rounding for Naira

- **Where:** `transactions.service.ts` – `sendToBank`, and VPay `outboundTransfer`.
- **Issue:** We pass `amount` as-is. If client sends 1000.999, we store and send that. VPay may expect Naira (integer or 2 dp). Floating point can also cause tiny decimals.
- **Fix:** Normalize amount for send-to-bank: e.g. `const amountNaira = Math.round(Number(amount) * 100) / 100;` or `Math.floor(Number(amount))` if VPay expects whole Naira, and use that for fee, total, and VPay call.

### 2.4 Frontend: double verify when selecting bank beneficiary

- **Where:** `selectRecentRecipient` – when type is bank we call `setTimeout(() => verifyBankAccount(), 100)`.
- **Issue:** The `useEffect` on `[accountNumber, selectedBank]` already runs when we set those, clears verified state, and after 800 ms calls `verifyBankAccount()`. So we end up with two verify calls (100 ms and 800 ms). Redundant and can cause flicker or race.
- **Fix:** Remove the `setTimeout(() => verifyBankAccount(), 100)` from `selectRecentRecipient` for bank; rely on the existing effect to verify after 800 ms.

### 2.5 Controller: `req: any` and unsafe `req.user`

- **Where:** `transactions.controller.ts` – `getTransactions`, `getBalance` use `@Request() req: any` and `req.user.userId`.
- **Issue:** TypeScript and lint complain about `any` and unsafe member access. Small risk of typo (e.g. `req.user.userId` wrong) and no type safety.
- **Fix:** Use a typed request, e.g. `@Request() req: { user: { userId: string } }`, for those endpoints so `req.user.userId` is safe.

---

## 3. Suggestions for change (improvements, not bugs)

### 3.1 Align daily limit copy with principal-only

- **Where:** Send page – Daily Limit section and any “remaining to send” text.
- **Suggestion:** Make it explicit that the limit is on **send amount** (principal), not total deduction. e.g. “You can send up to ₦X more today (before fees).” So users understand that fees are on top of this.

### 3.2 Show balance on Send page

- **Where:** SendMoney.tsx – no balance fetch currently.
- **Issue:** User can pass form validation and hit “Insufficient balance” only at submit. No upfront “Available: ₦X”.
- **Suggestion:** Call `GET /transactions/balance` (or existing balance endpoint) on mount and show “Available: ₦X” near the amount field. Disable Continue or show a warning when `Number(amount) + fee > balance`. Reduces failed submissions and support confusion.

### 3.3 Optional server-side re-verify of account name

- **Where:** `transactions.service.ts` – `sendToBank(..., accountName, ...)`.
- **Issue:** We require non-empty `accountName` but don’t re-verify with VPay. A tampered client could send a wrong name; transfer still goes to correct nuban/bank, but audit trail would be wrong.
- **Suggestion:** Optionally call `vpayService.nubanLookup(nuban, bankCode)` once more in `sendToBank` and compare `accountName` (normalized). If mismatch, throw or overwrite with resolved name. Adds one VPay call per send; can be a feature flag or only for high amounts.

### 3.4 Backend: daily limit vs (amount + fee) for bank

- **Where:** `limits.service.ts` – `checkSendLimit` is called with `amount` only. `getUserLimits` uses sum of transaction `amount` (principal).
- **Current:** Limit is “principal sent per day”. So user can send up to ₦50k principal; total debits (e.g. 50k + 50 fee) can be 50,050.
- **Suggestion:** Either keep as-is and document (“Daily limit is on send amount, not including fees”), or change to “total debit” limit: `checkSendLimit(amount + fee)` for send-to-bank and have `getUserLimits` include fee in “daily sent” for external_transfer. Latter is more complex (need to store or recompute fee per txn). Recommendation: **keep principal-only** and fix frontend (2.1) and copy (3.1).

### 3.5 Amount input: prevent negative and cap decimals

- **Where:** SendMoney.tsx – Amount input is `type="number"` with no min/step.
- **Suggestion:** `min={0}` and `step="1"` or `step="0.01"` to hint whole Naira or 2 dp. Optionally `onChange` clamp: reject negative and optionally round to 2 dp. Backend already rejects amount ≤ 0; this improves UX and avoids accidental input.

### 3.6 Prefill bank beneficiary name before verify

- **Where:** `selectRecentRecipient` – for bank we set accountNumber and selectedBank; accountName is set only after verify returns.
- **Suggestion:** When selecting a bank beneficiary, set `setAccountName(recipient.name)` so the UI shows the saved name immediately; the effect can still run verify and overwrite with live name (or keep saved name if verify fails). Smoother UX.

### 3.7 Clear idempotency key on reset

- **Where:** `resetForm` in SendMoney.tsx.
- **Current:** We don’t set `sendIdempotencyKeyRef.current = null`. Next flow we set a new key on “Continue”, so no functional bug.
- **Suggestion:** In `resetForm`, set `sendIdempotencyKeyRef.current = null` for clarity and so a new attempt is always a new key after “Send Another”.

---

## 4. Summary table

| Item | Severity | Type | Action |
|------|----------|------|--------|
| isOverLimit uses amount+fee | Bug | Frontend | Use `amount > remaining` (principal-only). |
| amount type/rounding send-to-bank | Bug | Backend | Coerce to number, round Naira, use everywhere. |
| Double verify on select bank beneficiary | Bug | Frontend | Remove `setTimeout(verifyBankAccount, 100)` in selectRecentRecipient. |
| req: any in controller | Code quality | Backend | Type `req` as `{ user: { userId: string } }`. |
| Daily limit copy | UX | Frontend | Clarify “send amount (before fees)”. |
| Show balance on Send | UX | Frontend | Fetch balance, show “Available”, warn if amount+fee > balance. |
| Optional server-side re-verify name | Security/audit | Backend | Optional nuban lookup and compare/overwrite accountName. |
| Amount input min/step | UX | Frontend | min=0, step=1 or 0.01; optional clamp in onChange. |
| Prefill bank name from beneficiary | UX | Frontend | setAccountName(recipient.name) in selectRecentRecipient. |
| Clear idempotency key in resetForm | Cleanliness | Frontend | Set sendIdempotencyKeyRef.current = null in resetForm. |

---

## 5. What will be fine after fixes

- **Limit behaviour:** After fixing 2.1, frontend and backend agree: daily limit is on principal; user can send up to `remaining` in amount; fee is on top; balance check (amount + fee) is separate.
- **Robustness:** After 2.2 and 2.3, send-to-bank safely handles string amount and consistent Naira rounding.
- **UX:** After 2.4 and 3.6, selecting a bank beneficiary doesn’t double-verify and shows name immediately. After 3.2, users see balance and avoid unnecessary “Insufficient balance” at submit.
- **Code quality:** After 2.5, controller is typed and lint-clean.

Implementing the **bugs (2.1–2.5)** is recommended first; the rest can be done in follow-up changes.
