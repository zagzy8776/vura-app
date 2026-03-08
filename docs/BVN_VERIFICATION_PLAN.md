# BVN Verification – Plan & Behaviour

This doc describes how BVN verification works end-to-end and how to extend or debug it.

---

## 1. Why BVN?

- **Compliance:** Links the wallet to a real identity (CBN/NDIC expectations).
- **Tiers:** Tier 1 (no BVN) → limited send; **Tier 2 (BVN verified)** → higher limits; Tier 3 (BVN + NIN, future) → highest limits.
- **Virtual account:** After BVN we try to create a Paystack Dedicated Virtual Account (DVA) so the user can receive bank transfers into their wallet.

---

## 2. Current flow (step by step)

### 2.1 User entry (frontend)

- **Where:** Settings → “BVN Verification”.
- **Inputs:** First name, last name, 11-digit BVN (all required).
- **Validation:** BVN exactly 11 digits; names non-empty. Frontend blocks submit until valid.

### 2.2 Backend: `POST /kyc/verify-bvn`

1. **Auth:** User must be logged in (JWT). `userId` from token.
2. **Validate:** BVN format `^\d{11}$`; reject otherwise.
3. **Uniqueness:** BVN is hashed and stored. If the same BVN (hash) exists on **another** user → `409 Conflict` “BVN already registered to another account”. Same user re-submitting is idempotent (we update same user).
4. **Provider:** If **PREMBLY_API_KEY** (and optionally **PREMBLY_APP_ID**) is set → call **Prembly** (`/v1/verify` then optionally `/verification/bvn_validation`). If Prembly is not configured → `400` with message to set PREMBLY_API_KEY.
5. **Success from provider:** We get at least one of first name / last name (from API or user input). If we still have no name after success → `400` “Could not verify your name from BVN. Please enter your first and last name…”.
6. **Persistence:**
   - Store hashed BVN (for uniqueness).
   - Store encrypted BVN (for display/ops if ever needed under strict controls).
   - Set `legalFirstName`, `legalLastName`, `bvnVerified = true`, `bvnVerifiedAt`, `kycTier = 2`, `bvnConsentStatus = 'COMPLETED'`.
   - Audit log: `BVN_VERIFIED` with provider and last 4 of BVN.
7. **Virtual account:** We call `VirtualAccountsService.createOrGet(userId)`. If it fails (e.g. Paystack error), we **do not** fail the BVN response; user stays Tier 2 and can retry “Generate account” from Receive later.
8. **Response:** `200` with `{ success: true, data: { success, firstName, lastName, kycTier: 2 } }`.

### 2.3 Frontend after success

- No redirect URL is returned (instant verification only).
- Toast “BVN verified” / “Your account is now Tier 2”.
- Refetch BVN status (`GET /kyc/bvn-status`), close dialog, UI shows “Verified” and Tier 2.

### 2.4 Legacy redirect flow (currently disabled)

- **Backend:** `POST /kyc/complete-bvn` with `reference` always throws `400`: “BVN verification now uses instant verification. Please go to Settings → BVN Verification…”.
- **Frontend:** Still checks for `data.consentUrl` / `data.url`; backend never returns it, so no redirect happens.
- **Route:** `/kyc/bvn-callback` and `BvnCallback.tsx` exist for the day we re-enable a provider that uses redirect + callback (e.g. Prembly widget with webhook). For now they only handle the case where someone lands there with a reference and get the “use instant verification” error.

---

## 3. Environment variables (backend)

| Variable | Required | Purpose |
|----------|----------|--------|
| **PREMBLY_API_KEY** | Yes (for BVN) | Prembly API key (x-api-key). |
| **PREMBLY_APP_ID** | Recommended | Prembly App ID for fallback path `/verification/bvn_validation` when v1 returns no name. |

PREMBLY_API_KEY (and PREMBLY_APP_ID for best results) must be set for BVN verification.

---

## 4. Error cases and user messages

| Scenario | HTTP | User-facing message (concept) |
|----------|------|--------------------------------|
| BVN not 11 digits | 400 | Invalid BVN format. Must be 11 digits. |
| BVN already on another account | 409 | BVN already registered to another account. |
| No provider configured | 400 | Set PREMBLY_API_KEY (and PREMBLY_APP_ID)… |
| Prembly failed | 400 | [Prembly’s error or] Set PREMBLY_API_KEY and PREMBLY_APP_ID… |
| Verification succeeded but no name at all | 400 | Could not verify your name from BVN. Please enter your first and last name as they appear on your BVN… |
| Success | 200 | BVN verified; Tier 2; higher limits active. |

---

## 5. Data we store

- **bvnHash:** One-way hash of BVN (for uniqueness and lookup).
- **bvnEncrypted / bvnIv:** Encrypted BVN (if you need to show last 4 or pass to a provider later under policy).
- **legalFirstName / legalLastName:** From provider or user input at verification time.
- **bvnVerified / bvnVerifiedAt / kycTier / bvnConsentStatus:** Status and audit.

We do **not** store raw BVN in plain text.

---

## 6. Consent and compliance

- User explicitly enters BVN and name and clicks “Verify” in Settings.
- We record `bvnConsentStatus: 'COMPLETED'` and an audit log entry. For stricter compliance you can add a checkbox “I consent to BVN verification” and store timestamp in audit.

---

## 7. Manual Tier 2 (when BVN API fails)

So users can still get to Tier 2 and receive money when Prembly is failing:

- **Backend:** `POST /admin/users/:id/set-tier-2`  
  - **Auth:** `Authorization: Bearer <ADMIN_SECRET>`  
  - **Body:** `{ "firstName": "...", "lastName": "...", "reason": "optional" }`  
  - Sets `kycTier=2`, `bvnVerified=true`, `bvnVerifiedAt`, `legalFirstName`, `legalLastName`, `bvnConsentStatus=COMPLETED`. Does not set BVN hash (no real BVN stored).  
  - User can then use **Receive → Generate account** to create a Paystack virtual account.

- **Admin dashboard:** When viewing a user who is Tier 1 or not BVN verified, a **“Set Tier 2 manually”** section is shown. Enter first name, last name, optional reason, and **Admin secret** (your `ADMIN_SECRET` from Render), then click **Set Tier 2**. The user is upgraded and can receive money.

Use this when the BVN API is down or not enabled on your Prembly account; fix Prembly for self-serve later.

---

## 8. Possible extensions (future)

- **Strict name match:** You could require validation match and reject if API says no match.
- **Redirect flow:** If a provider (e.g. Prembly widget) returns a `consentUrl`, frontend can redirect; after return, `BvnCallback` calls `POST /kyc/complete-bvn` with `reference`. Backend would need a path that accepts that reference and completes verification (e.g. from webhook or server-side lookup).
- **NIN / Tier 3:** Separate flow (NIN verification + link to existing BVN) to move user to Tier 3; limits and rules documented elsewhere.
- **Admin:** Admin can see `bvnVerified`, `bvnVerifiedAt`, and tier; no need to expose full BVN. Decrypt only under strict policy if ever required.

---

## 9. Where limits are enforced

- Send money / transfer limits by tier are enforced in the backend when debiting balance (e.g. in send-to-bank or P2P). Tier is read from `user.kycTier` (set to 2 after BVN verification).

---

## 10. Quick checklist for “BVN not working”

1. Backend env: `PREMBLY_API_KEY` set (and `PREMBLY_APP_ID` for best results)?
2. Prembly “set key” message? → Add `PREMBLY_APP_ID` for fallback path; ensure key is correct and account has BVN enabled.
3. Frontend: Correct API base (e.g. `https://vura-app.onrender.com/api`) so requests hit the backend that has these env vars.
