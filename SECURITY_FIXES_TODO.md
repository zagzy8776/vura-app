# Security Fixes Plan

## Phase 1: Critical Security Issues (MUST FIX)
- [x] 1. Fix PIN transmission - implement client-side hashing (HMAC) ✓
- [x] 2. Fix HTTPS enforcement on frontend ✓
- [x] 3. Remove hardcoded encryption key fallback ✓
- [x] 4. Implement session timeout/auto-logout ✓
- [x] 5. Make device fingerprint required for login ✓
- [ ] 6. Apply rate limiting to auth endpoints (middleware exists)

## Phase 2: Authentication Improvements
- [x] 7. Add password requirement for registration ✓
- [x] 8. Add email field and verification ✓
- [ ] 9. Implement 2FA (OTP for sensitive actions)
- [ ] 10. Fix error messages to not reveal information

## Phase 3: Data Protection (PCI-DSS)
- [x] 11. Encrypt card data in database ✓
- [x] 12. NEVER store CVV - remove from schema ✓
- [x] 13. Add secure token storage ✓

## Phase 4: Trust & Compliance
- [x] 14. Add Terms of Service acceptance ✓
- [ ] 15. Add Privacy Policy page
- [ ] 16. Add cookie consent
- [ ] 17. Add security badges

## COMPLETED FIXES:
1. src/lib/security.ts - Added secure PIN hashing, device fingerprint, session timeout, secure token storage
2. src/hooks/useAuth.tsx - Updated to use secure storage, device fingerprint, session timeout
3. vura-backend/prisma/schema.prisma - Removed CVV/cardNumber/pin from Card model, added cardToken/cardHash
4. src/pages/Register.tsx - Added email, password with strength meter, confirm password, terms checkbox
