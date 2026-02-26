# Vura Backend Production Deployment Guide

This guide walks you through securing your NestJS backend for production deployment.

---

## Step 1: Environment Variables Setup

Create a `.env` file in `vura-backend/` with production values:

```
bash
# ===========================================
# REQUIRED - Generate secure random strings
# ===========================================

# Generate with: openssl rand -base64 32
JWT_SECRET=your-super-secure-jwt-secret-min-32-chars

# Generate with: openssl rand -base64 32  
ENCRYPTION_KEY=your-32-character-encryption-key

# ===========================================
# DATABASE - PostgreSQL
# ===========================================
DATABASE_URL="postgresql://user:password@host:5432/vura_prod"

# ===========================================
# PAYMENT PROVIDERS
# ===========================================
# Paystack (Nigeria)
PAYSTACK_SECRET_KEY=sk_live_xxxxxxxxxxxxx
PAYSTACK_PUBLIC_KEY=pk_live_xxxxxxxxxxxxx
PAYSTACK_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxx

# Monnify (Nigeria)
MONNIFY_API_KEY=your-monify-api-key
MONNIFY_CONTRACT_CODE=MKPY_XXXXXXXXXX
MONNIFY_BASE_URL=https://api.monnify.com

# Yellow Card Crypto (Africa)
YELLOWCARD_API_KEY=your-yellowcard-key
YELLOWCARD_WEBHOOK_SECRET=whsec_xxxxxxxx

# ===========================================
# APPLICATION CONFIG
# ===========================================
NODE_ENV=production
PORT=3000
FRONTEND_URL=https://yourdomain.com

# ===========================================
# RATE LIMITING
# ===========================================
RATE_LIMIT_WINDOW_MS=900000  # 15 minutes
RATE_LIMIT_MAX_REQUESTS=100

# ===========================================
# SESSION CONFIG
# ===========================================
JWT_EXPIRES_IN=24h
SESSION_TIMEOUT_MINUTES=15
```

---

## Step 2: Install Production Dependencies

```
bash
cd vura-backend
npm install --omit=dev
```

---

## Step 3: Generate Prisma Client

```
bash
npx prisma generate
```

---

## Step 4: Run Database Migrations

⚠️ **BACKUP YOUR DATABASE FIRST!**

```
bash
# In production, create a backup first
# Then run migrations
npx prisma migrate deploy
```

---

## Step 5: Build for Production

```
bash
npm run build
```

---

## Step 6: Security Checklist Before Launch

### 6.1 Update CORS (main.ts)

Edit `src/main.ts` to use your actual production domain:

```
typescript
// ❌ REMOVE localhost origins
// ✅ ADD your production domain

app.enableCors({
  origin: [
    'https://yourdomain.com',
    'https://www.yourdomain.com',
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
});
```

### 6.2 Enable HTTPS Redirect Middleware

The middleware exists at `src/middleware/https-redirect.middleware.ts`. Make sure it's applied:

```
bash
# Check app.module.ts includes the middleware
```

### 6.3 Verify Rate Limiting

Ensure rate limiting is applied to auth endpoints:

```
bash
# Check src/middleware/rate-limit.middleware.ts is applied to:
# - /auth/login
# - /auth/register
# - /transactions
```

---

## Step 7: Production Server Setup

### Option A: Using PM2 (Recommended)

```
bash
# Install PM2
npm install -g pm2

# Start the application
pm2 start dist/main.js --name vura-backend

# Set up auto-restart on crash
pm2 startup

# Save configuration
pm2 save
```

### Option B: Using Docker

Create `Dockerfile`:

```
dockerfile
FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies
RUN npm ci --only=production

# Copy built application
COPY dist ./dist
COPY prisma ./prisma

# Generate Prisma client
RUN npx prisma generate

# Expose port
EXPOSE 3000

# Start application
CMD ["node", "dist/main.js"]
```

Create `.dockerignore`:

```
node_modules
dist
.git
*.md
test
```

Build and run:

```
bash
docker build -t vura-backend .
docker run -d -p 3000:3000 --env-file .env vura-backend
```

---

## Step 8: Post-Deployment Security Checklist

- [ ] ✅ Environment variables set (no defaults!)
- [ ] ✅ CORS restricted to production domain
- [ ] ✅ JWT_SECRET is 32+ characters
- [ ] ✅ HTTPS enforced (SSL certificate)
- [ ] ✅ Rate limiting enabled
- [ ] ✅ Database backed up
- [ ] ✅ Logs monitoring set up
- [ ] ✅ Health check endpoint working

---

## Step 9: Verify Security Headers

Test your deployed API:

```
bash
# Check security headers
curl -I https://your-api-domain.com

# Expected headers:
# - Strict-Transport-Security: max-age=15552000; includeSubDomains
# - X-Content-Type-Options: nosniff
# - X-Frame-Options: DENY
# - X-XSS-Protection: 1; mode=block
# - Content-Security-Policy: (configured)
```

---

## Step 10: Monitoring & Alerts

Set up logging:

```
bash
# Install Winston for logging
npm install nest-winston winston
```

Configure in `app.module.ts`:

```
typescript
import { WinstonModule } from 'nest-winston';
import * as winston from 'winston';

@Module({
  imports: [
    WinstonModule.forRoot({
      transports: [
        new winston.transports.File({ filename: 'error.log', level: 'error' }),
        new winston.transports.File({ filename: 'combined.log' }),
      ],
    }),
  ],
})
export class AppModule {}
```

---

## Quick Reference: Environment Variables Needed

| Variable | Required | Description |
|----------|----------|-------------|
| `JWT_SECRET` | YES | 32+ char random string |
| `ENCRYPTION_KEY` | YES | 32 char encryption key |
| `DATABASE_URL` | YES | PostgreSQL connection |
| `PAYSTACK_SECRET_KEY` | YES (if using Paystack) | Live API key |
| `MONNIFY_API_KEY` | YES (if using Monnify) | Live API key |
| `NODE_ENV` | YES | Set to "production" |
| `FRONTEND_URL` | YES | Your frontend domain |

---

## Troubleshooting

### "JWT_SECRET environment variable must be at least 32 characters"
→ Generate a new secret: `openssl rand -base64 32`

### "Cannot connect to database"
→ Check DATABASE_URL format and ensure PostgreSQL is accessible

### "CORS error"
→ Verify FRONTEND_URL matches exactly (including https://)

### "Rate limit exceeded"
→ Adjust RATE_LIMIT_MAX_REQUESTS if needed

---

**Ready to deploy! 🚀**
