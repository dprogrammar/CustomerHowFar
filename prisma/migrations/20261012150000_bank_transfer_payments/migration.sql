-- AlterEnum
ALTER TYPE "payment_provider" ADD VALUE 'MANUAL_TRANSFER';
-- AlterEnum
ALTER TYPE "payment_status" ADD VALUE 'AWAITING_CONFIRMATION';

-- AlterTable
ALTER TABLE "app_settings" ADD COLUMN     "bank_account_name" TEXT,
ADD COLUMN     "bank_account_number" VARCHAR(10),
ADD COLUMN     "bank_name" TEXT,
ADD COLUMN     "manual_transfer_enabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "amount_sent_kobo" INTEGER,
ADD COLUMN     "proof_format" TEXT,
ADD COLUMN     "proof_public_id" TEXT,
ADD COLUMN     "proof_submitted_at" TIMESTAMP(3),
ADD COLUMN     "rejection_reason" TEXT,
ADD COLUMN     "reviewed_at" TIMESTAMP(3),
ADD COLUMN     "reviewed_by_id" UUID,
ADD COLUMN     "sender_bank" TEXT,
ADD COLUMN     "sender_name" TEXT,
ADD COLUMN     "transfer_date" DATE;

-- CreateIndex
CREATE UNIQUE INDEX "payments_proof_public_id_key" ON "payments"("proof_public_id");

-- CreateIndex
CREATE INDEX "payments_status_proof_submitted_at_idx" ON "payments"("status", "proof_submitted_at");

-- CreateIndex
CREATE INDEX "payments_reviewed_by_id_idx" ON "payments"("reviewed_by_id");

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Data integrity
ALTER TABLE "app_settings" ADD CONSTRAINT "app_settings_bank_account_number_digits"
  CHECK ("bank_account_number" IS NULL OR "bank_account_number" ~ '^[0-9]{10}$');
ALTER TABLE "payments" ADD CONSTRAINT "payments_amount_sent_positive"
  CHECK ("amount_sent_kobo" IS NULL OR "amount_sent_kobo" > 0);