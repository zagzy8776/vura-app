# Vura Backend Complete Setup Guide

## What You Have Now ✅
- Secure JWT_SECRET generated
- Secure ENCRYPTION_KEY generated
- .env file created
- .gitignore updated

---

## Step 1: DATABASE - PostgreSQL Setup

### Option A: Local PostgreSQL (Free)
1. Download PostgreSQL: https://www.postgresql.org/download/windows/
2. Install with default settings
3. Set password: `postgres` (or your choice)
4. Create database named: `vura`
5. Update `.env`:
   
```
   DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@localhost:5432/vura"
   
```

### Option B: Cloud PostgreSQL (Easier)
**Recommended: Neon (Free tier)**
1. Go to: https://neon.tech
2. Sign up with GitHub
3. Create new project: "vura"
4. Copy connection string (looks like: `postgresql://user:pass@host.neon.tech/vura?sslmode=require`)
5. Update `.env` with that string

**Alternative: Railway ($5/month)**
1. Go to: https://railway.app
2. Sign up
3. Create new project > Add PostgreSQL
4. Copy connection string

---

## Step 2: PAYSTACK (Start Here - Easiest)

1. Go to: https://paystack.com
2. Sign up (Nigeria)
3. Verify email and phone
4. Go to Settings > API Keys
5. Copy your **Test** keys first:
   - `sk_test_xxx` → PAYSTACK_SECRET_KEY
   - `pk_test_xxx` → PAYSTACK_PUBLIC_KEY
6. When ready for production, switch to Live keys

**Update .env:**
```
PAYSTACK_SECRET_KEY=sk_test_YOUR_KEY
PAYSTACK_PUBLIC_KEY=pk_test_YOUR_KEY
PAYSTACK_WEBHOOK_SECRET=whsec_YOUR_WEBHOOK_SECRET
```

---

## Step 3: MONNIFY (For Bank Transfers)

1. Go to: https://monnify.com
2. Sign up as a business
3. Complete business verification
4. Go to Settings > API Keys
5. Copy:
   - API Key → MONNIFY_API_KEY
   - Contract Code → MONNIFY_CONTRACT_CODE (looks like MKPY_XXXXXXXXXX)

**Update .env:**
```
MONNIFY_API_KEY=YOUR_API_KEY
MONNIFY_CONTRACT_CODE=MKPY_XXXXXXXXXX
MONNIFY_BASE_URL=https://api.monnify.com
```

---

## Step 4: YELLOW CARD (Crypto - Optional)

1. Go to: https://yellowcard.io
2. Sign up
3. Complete KYC
4. Get API keys from developer section

---

## Step 5: Run the Backend

```
bash
cd vura-backend

# Install dependencies
npm install

# Generate Prisma client
npx prisma generate

# Run database migrations
npx prisma migrate dev

# Start development server
npm run start:dev
```

If successful, you'll see:
```
🚀 Vura API running on port 3000
📦 Environment: DEVELOPMENT
```

---

## Quick Checklist

| Task | Status |
|------|--------|
| Generate secrets | ✅ Done |
| Set up PostgreSQL | ⬜ Do this |
| Get Paystack keys | ⬜ Do this |
| Get Monnify keys | ⬜ Do this (optional for now) |
| Run npm install | ⬜ Do this |
| Run prisma migrate | ⬜ Do this |
| Test API | ⬜ Do this |

---

## Need Help?

Once you've set up PostgreSQL and got at least Paystack keys, I can help you test the backend to make sure everything works!
