-- AlterTable
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "kyc_rejection_reason" TEXT;
