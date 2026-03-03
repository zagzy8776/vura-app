-- Add crypto_auto_withdraw column to users table
ALTER TABLE "users" ADD COLUMN "crypto_auto_withdraw" BOOLEAN NOT NULL DEFAULT false;

