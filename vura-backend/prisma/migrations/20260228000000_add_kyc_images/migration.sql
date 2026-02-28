-- Add KYC image fields and Flutterwave references
ALTER TABLE "users" ADD COLUMN "flutterwave_order_ref" VARCHAR(255);
ALTER TABLE "users" ADD COLUMN "id_card_url" TEXT;
ALTER TABLE "users" ADD COLUMN "selfie_url" TEXT;
ALTER TABLE "users" ADD COLUMN "id_type" VARCHAR(50);
