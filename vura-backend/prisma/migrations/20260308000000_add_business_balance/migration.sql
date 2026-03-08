-- CreateTable
CREATE TABLE "business_balances" (
    "id" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "last_updated_by" TEXT NOT NULL DEFAULT 'system',
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "business_balances_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "business_balances_currency_key" ON "business_balances"("currency");

-- Insert default NGN row so we have one record to upsert
INSERT INTO "business_balances" ("id", "currency", "amount", "last_updated_by", "updated_at")
VALUES (gen_random_uuid(), 'NGN', 0, 'system', NOW());
