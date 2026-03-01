/*
  Warnings:

  - A unique constraint covering the columns `[bvn_encrypted]` on the table `users` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "users" ADD COLUMN     "bvn_encrypted" TEXT,
ADD COLUMN     "bvn_iv" TEXT,
ADD COLUMN     "flutterwave_ref" TEXT,
ADD COLUMN     "legal_first_name" TEXT,
ADD COLUMN     "legal_last_name" TEXT,
ADD COLUMN     "reserved_account_bank_name" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "users_bvn_encrypted_key" ON "users"("bvn_encrypted");
