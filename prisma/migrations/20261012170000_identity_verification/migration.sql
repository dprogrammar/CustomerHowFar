-- CreateEnum
CREATE TYPE "id_type" AS ENUM ('NIN_SLIP', 'VOTERS_CARD', 'DRIVERS_LICENCE', 'INTERNATIONAL_PASSPORT');

-- CreateEnum
CREATE TYPE "identity_status" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN', 'SUPERSEDED');

-- CreateTable
CREATE TABLE "identity_verifications" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "id_type" "id_type" NOT NULL,
    "full_name_on_id" TEXT NOT NULL,
    "id_front_public_id" TEXT,
    "id_front_format" TEXT,
    "id_back_public_id" TEXT,
    "id_back_format" TEXT,
    "selfie_public_id" TEXT,
    "selfie_format" TEXT,
    "consent_given_at" TIMESTAMP(3) NOT NULL,
    "status" "identity_status" NOT NULL DEFAULT 'PENDING',
    "name_read_by_admin" TEXT,
    "rejection_reason" TEXT,
    "reviewed_by_id" UUID,
    "reviewed_at" TIMESTAMP(3),
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "images_deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "identity_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "identity_verifications_id_front_public_id_key" ON "identity_verifications"("id_front_public_id");

-- CreateIndex
CREATE UNIQUE INDEX "identity_verifications_id_back_public_id_key" ON "identity_verifications"("id_back_public_id");

-- CreateIndex
CREATE UNIQUE INDEX "identity_verifications_selfie_public_id_key" ON "identity_verifications"("selfie_public_id");

-- CreateIndex
CREATE INDEX "identity_verifications_user_id_submitted_at_idx" ON "identity_verifications"("user_id", "submitted_at" DESC);

-- CreateIndex
CREATE INDEX "identity_verifications_status_submitted_at_idx" ON "identity_verifications"("status", "submitted_at");

-- CreateIndex
CREATE INDEX "identity_verifications_images_deleted_at_reviewed_at_idx" ON "identity_verifications"("images_deleted_at", "reviewed_at");

-- CreateIndex
CREATE INDEX "identity_verifications_reviewed_by_id_idx" ON "identity_verifications"("reviewed_by_id");

-- AddForeignKey
ALTER TABLE "identity_verifications" ADD CONSTRAINT "identity_verifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "identity_verifications" ADD CONSTRAINT "identity_verifications_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- At most one active (PENDING or APPROVED) identity check per user.
CREATE UNIQUE INDEX "identity_verifications_one_active_per_user"
  ON "identity_verifications" ("user_id")
  WHERE "status" IN ('PENDING', 'APPROVED');

-- Integrity
ALTER TABLE "identity_verifications" ADD CONSTRAINT "identity_verifications_name_length"
  CHECK (char_length("full_name_on_id") BETWEEN 2 AND 120);
ALTER TABLE "identity_verifications" ADD CONSTRAINT "identity_verifications_decision_recorded"
  CHECK ("status" NOT IN ('APPROVED', 'REJECTED') OR ("reviewed_at" IS NOT NULL));
ALTER TABLE "identity_verifications" ADD CONSTRAINT "identity_verifications_rejection_reason"
  CHECK ("status" <> 'REJECTED' OR "rejection_reason" IS NOT NULL);

-- Row Level Security: block the Supabase Data API; the app uses Prisma (postgres role).
ALTER TABLE "identity_verifications" ENABLE ROW LEVEL SECURITY;