-- AlterTable
ALTER TABLE "users" ADD COLUMN     "bvn_consent_initiated_at" TIMESTAMP(3),
ADD COLUMN     "bvn_consent_reference" TEXT,
ADD COLUMN     "bvn_consent_status" TEXT,
ADD COLUMN     "bvn_consent_url" TEXT;
