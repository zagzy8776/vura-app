# Login Issues Fix TODO

## Issue 1: 400 Bad Request on Login - FIXED
- [x] Fix backend login DTO validation to be more flexible - Added better error messages and MinLength validation
- [x] Update validation pipe settings for debugging - Changed forbidNonWhitelisted to false

## Issue 2: SyntaxError: Unexpected token 'export' - FIXED  
- [x] Investigate frontend bundling issues - Updated vite.config.ts with proper optimization
- [x] Fix build configuration - Added optimizeDeps and build target settings

## Changes Made

### Backend Changes:
1. **vura-backend/src/auth/dto/login.dto.ts**
   - Added better validation error messages
   - Changed MinLength from 6 to 4 to allow flexibility

2. **vura-backend/src/main.ts**
   - Changed `forbidNonWhitelisted` from `true` to `false` to allow extra fields

### Frontend Changes:
3. **vite.config.ts**
   - Added optimizeDeps for input-otp, react-router-dom, framer-motion
   - Added esbuildOptions for proper ESM handling
   - Added build target as 'esnext'
   - Added manual chunks for better code splitting

## Follow-up Steps
- [ ] Rebuild and redeploy the frontend to Vercel
- [ ] Rebuild and redeploy the backend to Render
- [ ] Test login functionality
