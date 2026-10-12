-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "moderation_action" ADD VALUE 'RECHECKED';
ALTER TYPE "moderation_action" ADD VALUE 'VERIFIED';
ALTER TYPE "moderation_action" ADD VALUE 'UNVERIFIED';
ALTER TYPE "moderation_action" ADD VALUE 'FEATURED';
ALTER TYPE "moderation_action" ADD VALUE 'UNFEATURED';

-- AlterTable
ALTER TABLE "businesses" ADD COLUMN     "fee_required_at_submit" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "setting_changes" (
    "id" UUID NOT NULL,
    "admin_id" UUID,
    "field" TEXT NOT NULL,
    "old_value" TEXT NOT NULL,
    "new_value" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "setting_changes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "setting_changes_created_at_idx" ON "setting_changes"("created_at" DESC);

-- CreateIndex
CREATE INDEX "setting_changes_admin_id_idx" ON "setting_changes"("admin_id");

-- AddForeignKey
ALTER TABLE "setting_changes" ADD CONSTRAINT "setting_changes_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Row Level Security: block the Supabase Data API; the app uses Prisma (postgres role).
ALTER TABLE "setting_changes" ENABLE ROW LEVEL SECURITY;