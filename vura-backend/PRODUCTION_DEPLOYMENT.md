# VURA Backend - Production Deployment Guide

This guide covers deploying the VURA backend to production using Railway with Neon PostgreSQL.

## 🚀 Quick Start

### Prerequisites

- Railway account (https://railway.app)
- Neon PostgreSQL account (https://neon.tech)
- GitHub repository with the VURA backend code
- API keys for all external services (Prembly, Paystack, Monnify, Cloudinary)

### 1. Database Setup (Neon)

1. **Create Neon Project:**
   - Sign up at https://neon.tech
   - Create a new project
   - Note your connection string

2. **Configure Database:**
   ```bash
   # Copy your Neon connection string
   # It should look like: postgresql://user:password@ep-xxx.us-east-1.aws.neon.tech/dbname
   ```

3. **Run Migrations:**
   ```bash
   # Locally or in Railway console
   npm run db:generate
   npm run db:migrate
   ```

### 2. Railway Setup

1. **Connect GitHub Repository:**
   - Go to Railway.app
   - Click "Deploy from GitHub repo"
   - Select your VURA backend repository

2. **Configure Environment Variables:**
   Add these secrets in Railway:

   ```bash
   # Database
   DATABASE_URL="your-neon-connection-string"
   
   # Security
   JWT_SECRET="your-jwt-secret-32-characters-min"
   ENCRYPTION_KEY="your-encryption-key-32-characters"
   
   # KYC (BVN via Prembly)
   PREMBLY_API_KEY="your-prembly-api-key"
   
   # Payment Gateways
   PAYSTACK_SECRET_KEY="your-paystack-secret-key"
   PAYSTACK_WEBHOOK_SECRET="your-paystack-webhook-secret"
   MONNIFY_API_KEY="your-monnify-api-key"
   MONNIFY_SECRET_KEY="your-monnify-secret-key"
   
   # Crypto Integration
   BUSHA_SECRET_KEY="your-busha-secret-key"
   
   # Storage
   CLOUDINARY_URL="your-cloudinary-url"
   
   # Application
   FRONTEND_URL="https://your-frontend-domain.com"
   NODE_ENV="production"
   LOG_LEVEL="info"
   ENFORCE_HTTPS="true"
   ```

3. **Configure Services:**
   - Railway will automatically detect `railway.toml`
   - The app will deploy with all configured environment variables

### 3. External Service Configuration

#### Paystack Webhook Setup
1. Go to Paystack Dashboard → Settings → Webhooks
2. Add webhook URL: `https://your-app.up.railway.app/api/webhooks/paystack`
3. Copy the webhook secret to `PAYSTACK_WEBHOOK_SECRET`

#### Paystack Dedicated Virtual Accounts (DVA) – “Generate my Vura bank account”
If users see “Bank account generation is temporarily unavailable” or Paystack returns “Dedicated NUBAN is not available for this business”, your Paystack business does not have **Dedicated Virtual Accounts** enabled. Contact Paystack support or check Paystack Dashboard → Settings / Product to request DVA for your business. Once enabled, users can generate their unique NUBAN on the Receive page.

#### Prembly (BVN) API Setup
1. Get your API key from Prembly
2. Set `PREMBLY_API_KEY` in environment variables
3. BVN verification uses `POST https://api.prembly.com/v1/verify` with `x-api-key` header

#### Busha API Setup
1. Go to Busha Dashboard → API Keys
2. Copy API key to `BUSHA_SECRET_KEY`
3. Test connection: `GET /api/health/busha`

### 4. Domain & SSL

1. **Custom Domain (Optional):**
   - In Railway, go to Settings → Domains
   - Add your custom domain
   - Configure DNS CNAME to `up.railway.app`

2. **SSL Certificate:**
   - Railway provides automatic SSL
   - HTTPS is enforced when `ENFORCE_HTTPS=true`

## 🔧 Environment Configuration

### Required Environment Variables

```bash
# Database
DATABASE_URL="postgresql://user:pass@host:port/db"

# Security
JWT_SECRET="32+ character secret key"
ENCRYPTION_KEY="32+ character encryption key"

# Application
NODE_ENV="production"
PORT="3000"
LOG_LEVEL="info"
FRONTEND_URL="https://your-frontend.com"
ENFORCE_HTTPS="true"

# Rate Limiting
RATE_LIMIT_WINDOW_MS="900000"  # 15 minutes
RATE_LIMIT_MAX_REQUESTS="100"

# Session Management
SESSION_TIMEOUT_MINUTES="15"

# EWS Compliance
EWS_VELOCITY_THRESHOLD_AMOUNT="500000"
EWS_VELOCITY_THRESHOLD_TIME_MINUTES="60"
EWS_HIGH_VALUE_THRESHOLD="5000000"
EWS_FIRST_TIME_BENEFICIARY_HOLD_HOURS="24"

# Crypto Settings
CRYPTO_HOLD_HOURS="48"
CRYPTO_CONFIRMATIONS_REQUIRED="3"
```

### External Service Keys

```bash
# KYC (BVN via Prembly)
PREMBLY_API_KEY="your-prembly-api-key"

# Payment Processing
PAYSTACK_SECRET_KEY="sk_live_your_key"
PAYSTACK_PUBLIC_KEY="pk_live_your_key"
PAYSTACK_WEBHOOK_SECRET="whsec_your_secret"
PAYSTACK_ENV="live"

MONNIFY_API_KEY="MK_LIVE_your_key"
MONNIFY_SECRET_KEY="your_secret"
MONNIFY_CONTRACT_CODE="your_contract_code"
MONNIFY_BASE_URL="https://api.monnify.com"
MONNIFY_ENV="production"

# Crypto Integration
BUSHA_SECRET_KEY="your_busha_secret"
BUSHA_BASE_URL="https://api.busha.co/v1"
BUSHA_ENV="production"

# Storage & Media
CLOUDINARY_URL="cloudinary://api_key:api_secret@cloud_name"
```

## 🧪 Testing in Production

### Health Checks
```bash
# Application health
curl https://your-app.up.railway.app/api/health

# Database connection
curl https://your-app.up.railway.app/api/health/db

# External services
curl https://your-app.up.railway.app/api/health/paystack
curl https://your-app.up.railway.app/api/health/busha
```

### Manual Testing

1. **KYC Verification:**
   ```bash
   POST /api/kyc/bvn/verify
   {
     "bvn": "12345678901"
   }
   ```

2. **Payment Webhooks:**
   - Send test webhook from Paystack dashboard
   - Verify transaction status updates

3. **Crypto Deposits:**
   ```bash
   GET /api/crypto/address?asset=USDT&network=TRC20
   ```

4. **EWS Compliance:**
   ```bash
   GET /api/ews/assess/{transactionId}
   GET /api/ews/holds
   ```

## 📊 Monitoring & Observability

### Railway Dashboard
- **Metrics:** CPU, Memory, Response Time
- **Logs:** Real-time application logs
- **Alerts:** Configure uptime monitoring
- **Backups:** Database backup management

### Application Logs
```bash
# View logs in Railway
railway logs

# Filter logs
railway logs --filter="ERROR"
```

### Health Monitoring
- Set up uptime monitoring with UptimeRobot
- Monitor database performance in Neon dashboard
- Track API response times and error rates

## 🔒 Security Best Practices

### 1. Environment Variables
- Never commit secrets to git
- Use Railway's secret management
- Rotate keys regularly

### 2. Database Security
- Use Neon's built-in encryption
- Enable connection pooling
- Monitor for suspicious queries

### 3. API Security
- Enforce HTTPS (`ENFORCE_HTTPS=true`)
- Rate limiting enabled
- CORS configured for your domain
- JWT token expiration (24h)

### 4. Compliance
- EWS fraud detection active
- Transaction monitoring enabled
- Audit logging for all actions
- Data encryption at rest and in transit

## 🚨 Troubleshooting

### Common Issues

1. **Database Connection Failed:**
   - Check Neon connection string
   - Verify SSL settings
   - Check Railway environment variables

2. **API Keys Not Working:**
   - Verify all external service keys
   - Check service status (Prembly, Paystack, Monnify, etc.)
   - Test connections individually

3. **Deployment Failures:**
   - Check Railway build logs
   - Verify Node.js version compatibility
   - Ensure all dependencies are in package.json

4. **Performance Issues:**
   - Monitor database performance
   - Check for memory leaks
   - Optimize queries and indexes

### Getting Help

1. **Railway Support:**
   - Railway Discord: https://discord.gg/railway
   - Documentation: https://docs.railway.app

2. **VURA Support:**
   - Check logs for error details
   - Verify environment configuration
   - Test individual services

## 📈 Scaling

### Horizontal Scaling
- Railway auto-scaling based on traffic
- Database connection pooling
- Load balancing across instances

### Performance Optimization
- Enable caching for frequently accessed data
- Optimize database queries
- Use CDN for static assets

### Cost Management
- Monitor resource usage
- Scale down during low-traffic periods
- Use Railway's cost tracking

## 🔄 Maintenance

### Regular Tasks
1. **Update Dependencies:** Monthly security updates
2. **Rotate Secrets:** Quarterly key rotation
3. **Database Maintenance:** Weekly backups verification
4. **Monitor Logs:** Daily error review

### Backup Strategy
- Neon automated backups
- Railway deployment history
- Git repository as source of truth

---

## 📞 Support

For deployment issues:
1. Check Railway logs
2. Verify environment variables
3. Test individual services
4. Contact support with specific error details

**Production deployment complete! 🎉**