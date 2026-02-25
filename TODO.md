# 🏦 VURA BANK - PRODUCTION READINESS TODO
**Target: Full CBN-Compliant Banking System**

## 📊 PROGRESS TRACKER
- [x] Phase 1: Critical Security (5 items) ✅ COMPLETE
- [ ] Phase 2: CBN Compliance (4 items) ⏳ IN PROGRESS
- [ ] Phase 3: Missing Features (5 items)
- [ ] Phase 4: UI Fixes (5 items)


---

## 🔴 PHASE 1: CRITICAL SECURITY (Days 1-2)

### 1. Phone Encryption (AES-256) 🔐
**Status:** ✅ COMPLETE


**Files to modify:**
- `vura-backend/src/auth/auth.service.ts` - Encrypt on register, decrypt on login
- `vura-backend/src/utils/encryption.ts` - NEW: AES-256 encryption utility
- `vura-backend/prisma/schema.prisma` - Update phone field if needed
- `.env` - Add ENCRYPTION_KEY

**Tasks:**
- [x] Create encryption utility with AES-256-GCM
- [x] Generate 32-byte encryption key for .env
- [x] Update register flow to encrypt phone before saving
- [x] Update login flow to decrypt phone for comparison
- [x] Add encryption key validation on startup


### 2. JWT Secret Environment Variable 🔑
**Status:** ✅ COMPLETE

**Files to modify:**
- `vura-backend/src/auth/auth.service.ts` - Use env secret
- `vura-backend/src/auth/auth.guard.ts` - Use env secret
- `vura-backend/.env` - Add JWT_SECRET, JWT_EXPIRES_IN
- `vura-backend/src/auth/auth.module.ts` - NEW: Config module

**Tasks:**
- [x] Move hardcoded secret to environment variable
- [x] Add JWT_EXPIRES_IN configuration (default 24h)
- [x] Add secret validation on startup (min 32 chars)
- [ ] Implement token refresh mechanism (Phase 3)


### 3. Rate Limiting & Account Lockout 🚫
**Status:** ✅ COMPLETE

**Files to modify:**
- `vura-backend/src/app.module.ts` - Configure ThrottlerModule per endpoint
- `vura-backend/src/auth/auth.controller.ts` - Add lockout logic
- `vura-backend/prisma/schema.prisma` - Add failedLoginAttempts, lockedUntil fields

**Tasks:**
- [x] Configure ThrottlerModule: 5 attempts per 15 minutes on login
- [x] Add account lockout after 3 failed attempts
- [x] Add 15-minute lockout duration
- [x] Add "Account locked" error message
- [x] Reset counter on successful login


### 4. Device Fingerprint Validation 📱
**Status:** ✅ COMPLETE

**Files to modify:**
- `vura-backend/src/auth/auth.service.ts` - Store fingerprint on register
- `vura-backend/src/auth/auth.guard.ts` - Validate fingerprint on each request
- `vura-backend/prisma/schema.prisma` - Add deviceFingerprints relation

**Tasks:**
- [x] Store device fingerprint on registration
- [x] Validate fingerprint on login (warn if different)
- [ ] Add "New device detected" email notification (Phase 3)
- [ ] Allow "Trust this device" option (Phase 3)
- [x] Flag suspicious device changes for review


### 5. Session Management & Token Revocation 🔄
**Status:** ✅ COMPLETE

**Files to modify:**
- `vura-backend/prisma/schema.prisma` - Add Session table
- `vura-backend/src/auth/auth.service.ts` - Track sessions
- `vura-backend/src/auth/auth.controller.ts` - Add logout endpoints
- `src/hooks/useAuth.tsx` - Handle session expiry

**Tasks:**
- [x] Create Session table (token, device, ip, createdAt, expiresAt)
- [x] Store session on login
- [ ] Implement "Logout" (revoke single token) - Frontend pending
- [ ] Implement "Logout all devices" (revoke all user tokens) - Frontend pending
- [x] Check token revocation in auth guard
- [ ] Add session list in Settings page (Phase 4)


---

## 🟡 PHASE 2: CBN COMPLIANCE (Days 3-5)

### 11. Transaction Limits by Tier 📊
**Status:** ✅ COMPLETE

**Files to modify:**
- `vura-backend/src/transactions/transactions.service.ts` - Enforce limits
- `vura-backend/prisma/schema.prisma` - Add daily limits tracking

**Tasks:**
- [x] Tier 1: ₦50k daily / ₦300k max balance
- [x] Tier 2: ₦200k daily / ₦500k max balance
- [x] Tier 3: ₦5m+ daily (requires biometric)
- [x] Check limits before transaction
- [x] Return clear error messages for limit exceeded


### 12. 16-Day Hold for Flagged Transactions ⏸️
**Status:** ✅ COMPLETE


**Files to modify:**
- `vura-backend/src/transactions/transactions.service.ts` - Add hold logic
- `vura-backend/prisma/schema.prisma` - Add heldUntil field

**Tasks:**
- [x] Auto-flag transactions >₦100k from new users
- [x] Add heldUntil field (16 days from transaction)
- [x] Prevent spending held funds
- [x] Admin review queue for flagged transactions
- [x] Manual release capability for admin


### 13. Fraud Detection (EWS) 🚨
**Status:** ✅ COMPLETE


**Files to modify:**
- `vura-backend/src/ews/ews.service.ts` - NEW: Early Warning System
- `vura-backend/src/transactions/transactions.service.ts` - Call EWS

**Tasks:**
- [x] Velocity check: Max 5 transactions per hour
- [x] Amount anomaly: Flag if >3x average transaction
- [x] Device deviation: Flag new device + large amount
- [x] Location check: Flag if IP country changes
- [x] Auto-freeze account if score >80
- [ ] Admin alert forfrozen accounts (Phase 3 - email service)


### 14. CBN Reporting 📋
**Status:** ✅ COMPLETE

**Files to modify:**
- `vura-backend/src/reports/reports.service.ts` - NEW: Report generation
- `vura-backend/src/reports/reports.controller.ts` - NEW: Admin endpoints

**Tasks:**
- [x] Daily transaction report (CSV)
- [x] Weekly KYC compliance report
- [x] Suspicious Activity Report (SAR) for flagged
- [x] Large transaction report (>₦1m)
- [x] Admin dashboard to download reports


---

## 🟠 PHASE 3: MISSING FEATURES (Days 6-10)

### 6. BVN Verification 🆔
**Status:** ✅ COMPLETE

**Files to modify:**
- `vura-backend/src/kyc/bvn.service.ts` - NEW: BVN verification
- `vura-backend/src/kyc/kyc.controller.ts` - NEW: KYC endpoints
- `src/pages/Settings.tsx` - Add BVN input

**Tasks:**
- [x] Integrate BVN verification API (e.g., VerifyMe, YouVerify)
- [x] Auto-populate name from BVN
- [x] Store BVN hash (not plaintext)
- [x] Update KYC tier on verification
- [x] Reject duplicate BVN registrations


### 7. Forgot PIN Flow 🔄
**Status:** ✅ COMPLETE

**Files to modify:**
- `vura-backend/src/auth/auth.controller.ts` - Add forgot/reset endpoints
- `vura-backend/src/otp/otp.service.ts` - NEW: OTP service
- `src/pages/ForgotPin.tsx` - NEW: Forgot PIN page

**Tasks:**
- [x] Request PIN reset (phone OTP)
- [x] Verify OTP (6-digit, 5-min expiry)
- [x] Set new PIN
- [x] Log PIN change in audit
- [x] Invalidate all sessions on PIN change


### 8. Transaction Receipts 🧾
**Status:** ✅ COMPLETE

**Files to modify:**
- `vura-backend/src/receipts/receipts.service.ts` - NEW: PDF generation
- `vura-backend/src/receipts/receipts.controller.ts` - NEW: Download endpoint
- `src/pages/TransactionDetail.tsx` - Add download button

**Tasks:**
- [x] Generate PDF receipt with transaction details
- [x] Include QR code for verification
- [x] Add Vura logo and branding
- [x] Email receipt option
- [x] Store receipt URL in transaction


### 9. Beneficiary List 👥
**Status:** ✅ COMPLETE

**Files to modify:**
- `vura-backend/prisma/schema.prisma` - Add Beneficiary table
- `vura-backend/src/beneficiaries/beneficiaries.controller.ts` - NEW
- `src/pages/Beneficiaries.tsx` - NEW: Manage beneficiaries
- `src/pages/SendMoney.tsx` - Add beneficiary selector

**Tasks:**
- [x] Save beneficiary (vuraTag, nickname, accountNumber)
- [x] List beneficiaries
- [x] Quick select in Send Money
- [x] Delete beneficiary
- [x] Show recent recipients


### 10. Real Quick Actions (Airtime, Bills) ⚡
**Status:** ✅ COMPLETE

**Files to modify:**
- `vura-backend/src/bills/bills.service.ts` - NEW: Bills payment
- `vura-backend/src/bills/bills.controller.ts` - NEW: Endpoints
- `src/pages/Airtime.tsx` - NEW: Airtime purchase
- `src/pages/Bills.tsx` - NEW: Bills payment

**Tasks:**
- [x] Airtime API integration (MTN, Glo, Airtel, 9mobile)
- [x] Electricity bill (Ikeja Electric, Eko Disco, etc.)
- [x] Internet data bundles
- [x] Cable TV (DSTV, GOTV, Startimes)
- [x] Transaction history for bills


---

## 🟢 PHASE 4: UI FIXES (Days 11-13)

### 15. Cards Page - Real Backend 💳
**Status:** ⏳ PENDING
**Files to modify:**
- `vura-backend/prisma/schema.prisma` - Add Card table
- `vura-backend/src/cards/cards.controller.ts` - NEW: Card endpoints
- `src/pages/Cards.tsx` - Connect to real data

**Tasks:**
- [ ] Create Card table (number, expiry, cvv, status)
- [ ] Generate virtual card on request
- [ ] Show card details (masked)
- [ ] Freeze/unfreeze card
- [ ] Card transaction history

### 16. Receive Page - Real QR Code 📱
**Status:** ⏳ PENDING
**Files to modify:**
- `src/pages/Receive.tsx` - Generate real QR code
- `vura-backend/src/payments/payment-links.service.ts` - NEW

**Tasks:**
- [ ] Generate QR code with payment URL
- [ ] QR code contains vuraTag + amount (optional)
- [ ] Scan to pay functionality
- [ ] Share QR code as image
- [ ] Print QR code option

### 17. Payment Links - Generate & Share 🔗
**Status:** ⏳ PENDING
**Files to modify:**
- `vura-backend/src/payments/payment-links.service.ts` - NEW
- `vura-backend/src/payments/payments.controller.ts` - NEW
- `src/pages/PaymentLinks.tsx` - NEW: Create/manage links

**Tasks:**
- [ ] Generate payment link (amount + description)
- [ ] Custom URL slug support
- [ ] Share link (WhatsApp, SMS, Copy)
- [ ] Payment page for link recipients
- [ ] Track link clicks and payments

### 18. Account Limits - Real Progress Bars 📊
**Status:** ⏳ PENDING
**Files to modify:**
- `src/components/StatsCards.tsx` - Real data
- `vura-backend/src/users/users.service.ts` - Add limits endpoint

**Tasks:**
- [ ] Calculate daily spent vs limit
- [ ] Show percentage in progress bar
- [ ] Color coding (green <50%, yellow <80%, red >80%)
- [ ] Reset daily at midnight
- [ ] Show remaining limit

### 19. Spending Chart - Connect to Transactions 📈
**Status:** ⏳ PENDING
**Files to modify:**
- `src/components/SpendingChart.tsx` - Real data
- `vura-backend/src/analytics/analytics.service.ts` - NEW

**Tasks:**
- [ ] Aggregate spending by category
- [ ] 7-day, 30-day, 90-day views
- [ ] Category breakdown (food, transport, bills, etc.)
- [ ] Monthly comparison
- [ ] Export chart data

---

## 📝 COMPLETED ITEMS

### ✅ CORS Fix (Previous)
- Fixed CORS to allow frontend communication

### ✅ Crypto Deposit System (Previous)
- Yellow Card integration
- Webhook handling with HMAC
- EWS fraud detection
- CBN-compliant holds

---

## 🚀 IMPLEMENTATION ORDER

**Week 1 (Days 1-5):**
1. Phone Encryption
2. JWT Secret
3. Rate Limiting
4. Device Fingerprint
5. Session Management
6. Transaction Limits
7. 16-Day Hold
8. Fraud Detection (EWS)

**Week 2 (Days 6-10):**
9. BVN Verification
10. Forgot PIN
11. Transaction Receipts
12. Beneficiary List
13. Real Quick Actions

**Week 3 (Days 11-13):**
14. Cards Page
15. Receive QR Code
16. Payment Links
17. Account Limits
18. Spending Chart
19. CBN Reporting

---

## ⚠️ CRITICAL REMINDERS

- [ ] All new tables need Prisma migration
- [ ] All API keys go in .env (never commit)
- [ ] Test each feature before moving to next
- [ ] Add error handling for all edge cases
- [ ] Log all security events (login, pin change, etc.)
- [ ] Never store passwords/PINs in plaintext
- [ ] Use transactions for financial operations
- [ ] Add rate limiting to all public endpoints

---

**Started:** [Date]
**Target Completion:** [Date + 13 days]
**Current Phase:** Phase 4 - UI Fixes
