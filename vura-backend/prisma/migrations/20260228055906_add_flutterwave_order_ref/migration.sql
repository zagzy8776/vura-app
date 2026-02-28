/*
  Warnings:

  - You are about to drop the column `business_address` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `business_name` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `email_verified` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `email_verified_at` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `is_merchant` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `pin_hash` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `two_factor_enabled` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `two_factor_secret` on the `users` table. All the data in the column will be lost.
  - Added the required column `hashed_pin` to the `users` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "KycStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED', 'EXPIRED');

-- AlterTable
ALTER TABLE "cards" RENAME CONSTRAINT "cards_new_pkey" TO "cards_pkey";

-- AlterTable
ALTER TABLE "users" DROP COLUMN "business_address",
DROP COLUMN "business_name",
DROP COLUMN "email_verified",
DROP COLUMN "email_verified_at",
DROP COLUMN "is_merchant",
DROP COLUMN "pin_hash",
DROP COLUMN "two_factor_enabled",
DROP COLUMN "two_factor_secret",
ADD COLUMN     "hashed_pin" TEXT NOT NULL,
ADD COLUMN     "korapay_reference" TEXT,
ADD COLUMN     "kyc_status" "KycStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "nin_hash" TEXT,
ADD COLUMN     "nin_verified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "nin_verified_at" TIMESTAMP(3),
ALTER COLUMN "reserved_account_number" SET DATA TYPE TEXT,
ALTER COLUMN "flutterwave_order_ref" SET DATA TYPE TEXT,
ALTER COLUMN "id_type" SET DATA TYPE TEXT;

-- CreateTable
CREATE TABLE "bank_accounts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "account_number" TEXT NOT NULL,
    "bank_code" TEXT NOT NULL,
    "bank_name" TEXT NOT NULL,
    "account_name" TEXT NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'active',
    "provider" TEXT NOT NULL DEFAULT 'paystack',
    "provider_account_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bank_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "bank_accounts_user_id_idx" ON "bank_accounts"("user_id");

-- CreateIndex
CREATE INDEX "bank_accounts_is_primary_idx" ON "bank_accounts"("is_primary");

-- CreateIndex
CREATE UNIQUE INDEX "bank_accounts_user_id_account_number_key" ON "bank_accounts"("user_id", "account_number");

-- CreateIndex
CREATE INDEX "cards_card_hash_idx" ON "cards"("card_hash");

-- AddForeignKey
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "cards_new_card_hash_key" RENAME TO "cards_card_hash_key";

-- RenameIndex
ALTER INDEX "cards_new_user_id_idx" RENAME TO "cards_user_id_idx";
