-- CreateEnum
CREATE TYPE "moderation_action" AS ENUM ('APPROVED', 'REJECTED', 'SUSPENDED', 'REINSTATED');

-- AlterTable
ALTER TABLE "businesses" ADD COLUMN     "needs_recheck" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "submitted_at" TIMESTAMP(3),
ALTER COLUMN "address" DROP NOT NULL,
ALTER COLUMN "state_id" DROP NOT NULL,
ALTER COLUMN "lga_id" DROP NOT NULL;

-- CreateTable
CREATE TABLE "moderation_decisions" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "admin_id" UUID,
    "action" "moderation_action" NOT NULL,
    "comment" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "moderation_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "moderation_decisions_business_id_created_at_idx" ON "moderation_decisions"("business_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "moderation_decisions_admin_id_idx" ON "moderation_decisions"("admin_id");

-- CreateIndex
CREATE INDEX "businesses_status_submitted_at_idx" ON "businesses"("status", "submitted_at");

-- CreateIndex
CREATE INDEX "businesses_needs_recheck_status_idx" ON "businesses"("needs_recheck", "status");

-- AddForeignKey
ALTER TABLE "moderation_decisions" ADD CONSTRAINT "moderation_decisions_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moderation_decisions" ADD CONSTRAINT "moderation_decisions_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Integrity for nullable location (drafts fill it in at wizard step 2)
-- ---------------------------------------------------------------------------
-- The composite (lga_id, state_id) foreign key is skipped when either column is NULL,
-- so an LGA must never be set without its state.
ALTER TABLE "businesses" ADD CONSTRAINT "businesses_lga_requires_state"
  CHECK ("lga_id" IS NULL OR "state_id" IS NOT NULL);
-- Anything past DRAFT has been submitted, so it must have a complete location.
ALTER TABLE "businesses" ADD CONSTRAINT "businesses_location_required_after_draft"
  CHECK ("status" = 'DRAFT' OR ("address" IS NOT NULL AND "state_id" IS NOT NULL AND "lga_id" IS NOT NULL));

-- Row Level Security: block the Supabase Data API; the app uses Prisma (postgres role).
ALTER TABLE "moderation_decisions" ENABLE ROW LEVEL SECURITY;