-- CreateEnum
CREATE TYPE "report_status" AS ENUM ('OPEN', 'DISMISSED', 'ACTIONED');

-- CreateEnum
CREATE TYPE "review_report_reason" AS ENUM ('FAKE', 'OFFENSIVE', 'SPAM', 'NOT_A_CUSTOMER');

-- CreateEnum
CREATE TYPE "listing_report_reason" AS ENUM ('SCAM', 'FAKE_PHOTOS', 'WRONG_CONTACT', 'OFFENSIVE', 'CLOSED', 'OTHER');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.

ALTER TYPE "audit_action" ADD VALUE 'REVIEW_HIDDEN';
ALTER TYPE "audit_action" ADD VALUE 'REVIEW_RESTORED';
ALTER TYPE "audit_action" ADD VALUE 'REVIEW_REPORTS_DISMISSED';
ALTER TYPE "audit_action" ADD VALUE 'LISTING_REPORTS_DISMISSED';
ALTER TYPE "audit_action" ADD VALUE 'LISTING_REPORTS_ACTIONED';

-- AlterTable
ALTER TABLE "admin_audit_log" ADD COLUMN     "target_review_id" UUID;

-- AlterTable
ALTER TABLE "reviews" ADD COLUMN     "owner_reply" TEXT,
ADD COLUMN     "owner_reply_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "review_reports" (
    "id" UUID NOT NULL,
    "review_id" UUID NOT NULL,
    "reporter_id" UUID NOT NULL,
    "reason" "review_report_reason" NOT NULL,
    "status" "report_status" NOT NULL DEFAULT 'OPEN',
    "resolved_by_id" UUID,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "review_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_reports" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "reporter_id" UUID NOT NULL,
    "reason" "listing_report_reason" NOT NULL,
    "details" TEXT,
    "status" "report_status" NOT NULL DEFAULT 'OPEN',
    "resolved_by_id" UUID,
    "resolved_at" TIMESTAMP(3),
    "resolution" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "business_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_limit_hits" (
    "id" BIGSERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rate_limit_hits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "review_reports_status_created_at_idx" ON "review_reports"("status", "created_at");

-- CreateIndex
CREATE INDEX "review_reports_review_id_status_idx" ON "review_reports"("review_id", "status");

-- CreateIndex
CREATE INDEX "review_reports_reporter_id_idx" ON "review_reports"("reporter_id");

-- CreateIndex
CREATE INDEX "review_reports_resolved_by_id_idx" ON "review_reports"("resolved_by_id");

-- CreateIndex
CREATE INDEX "business_reports_status_created_at_idx" ON "business_reports"("status", "created_at");

-- CreateIndex
CREATE INDEX "business_reports_business_id_status_idx" ON "business_reports"("business_id", "status");

-- CreateIndex
CREATE INDEX "business_reports_reporter_id_idx" ON "business_reports"("reporter_id");

-- CreateIndex
CREATE INDEX "business_reports_resolved_by_id_idx" ON "business_reports"("resolved_by_id");

-- CreateIndex
CREATE INDEX "rate_limit_hits_key_created_at_idx" ON "rate_limit_hits"("key", "created_at");

-- CreateIndex
CREATE INDEX "rate_limit_hits_created_at_idx" ON "rate_limit_hits"("created_at");

-- AddForeignKey
ALTER TABLE "review_reports" ADD CONSTRAINT "review_reports_review_id_fkey" FOREIGN KEY ("review_id") REFERENCES "reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_reports" ADD CONSTRAINT "review_reports_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_reports" ADD CONSTRAINT "review_reports_resolved_by_id_fkey" FOREIGN KEY ("resolved_by_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_reports" ADD CONSTRAINT "business_reports_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_reports" ADD CONSTRAINT "business_reports_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_reports" ADD CONSTRAINT "business_reports_resolved_by_id_fkey" FOREIGN KEY ("resolved_by_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- One open report per user per review / per business.
CREATE UNIQUE INDEX "review_reports_one_open_per_user" ON "review_reports" ("review_id", "reporter_id") WHERE "status" = 'OPEN';
CREATE UNIQUE INDEX "business_reports_one_open_per_user" ON "business_reports" ("business_id", "reporter_id") WHERE "status" = 'OPEN';

-- Integrity rules
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_comment_length"
  CHECK ("comment" IS NULL OR char_length("comment") BETWEEN 1 AND 1000);
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_owner_reply_length"
  CHECK ("owner_reply" IS NULL OR char_length("owner_reply") BETWEEN 1 AND 1000);
ALTER TABLE "business_reports" ADD CONSTRAINT "business_reports_details"
  CHECK (("details" IS NULL OR char_length("details") <= 1000) AND ("reason" <> 'OTHER' OR "details" IS NOT NULL));
ALTER TABLE "review_reports" ADD CONSTRAINT "review_reports_resolved"
  CHECK ("status" = 'OPEN' OR "resolved_at" IS NOT NULL);
ALTER TABLE "business_reports" ADD CONSTRAINT "business_reports_resolved"
  CHECK ("status" = 'OPEN' OR "resolved_at" IS NOT NULL);

-- Row Level Security: block the Supabase Data API; the app uses Prisma (postgres role).
ALTER TABLE "review_reports" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "business_reports" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "rate_limit_hits" ENABLE ROW LEVEL SECURITY;
