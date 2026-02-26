# Vura Cards Implementation Plan

## Phase 1: Backend Security & Improvements

### 1.1 Encrypt Card PIN
- [x] Update cards.service.ts to use encryption for PIN storage
- [x] Modify card creation to encrypt PIN before storing
- [x] Update getCardPin to decrypt before returning

### 1.2 Fix Card Number Generation  
- [x] Implement Luhn algorithm for valid card numbers
- [x] Generate proper 16-digit card numbers (not masked)
- [x] Add card number validation

### 1.3 Add Yellow Card Integration
- [ ] Create yellowcard-card.service.ts for card-specific API calls
- [ ] Add methods: createVirtualCard, fundCard, getCardBalance, freezeCard
- [ ] Update cards.module.ts to include Yellow Card service

## Phase 2: Frontend Integration

### 2.1 Connect Cards Page to API
- [x] Replace localStorage with API calls in Cards.tsx
- [x] Add useEffect to fetch cards from backend
- [x] Update createCard to call POST /cards endpoint
- [x] Update freeze/unfreeze to call PUT /cards/:id/status
- [x] Update delete to call DELETE /cards/:id
- [x] Update PIN retrieval to call GET /cards/:id/pin

### 2.2 Add Error Handling
- [x] Handle KYC verification errors
- [x] Handle card limit errors
- [x] Add loading states for all actions

## Phase 3: Production Configuration

### 3.1 Environment Variables
- [ ] Document required YELLOWCARD_API_KEY
- [ ] Document required YELLOWCARD_API_SECRET  
- [ ] Document required YELLOWCARD_WEBHOOK_SECRET
- [ ] Configure production API URLs

### 3.2 Testing
- [ ] Test all card endpoints with real data
- [ ] Test frontend card management features
- [ ] Test security implementations
