-- CreateEnum
CREATE TYPE "user_status" AS ENUM ('ACTIVE', 'SUSPENDED', 'DELETED');

-- CreateEnum
CREATE TYPE "audit_action" AS ENUM ('USER_SUSPENDED', 'USER_UNSUSPENDED', 'USER_DELETED', 'USER_SELF_DELETED', 'USER_ROLE_CHANGED', 'BUSINESS_DELETED', 'BUSINESS_SELF_DELETED');

-- AlterEnum
ALTER TYPE "business_status" ADD VALUE 'DELETED';

-- AlterTable
ALTER TABLE "businesses" ADD COLUMN     "deleted_at" TIMESTAMP(3),
ADD COLUMN     "status_before_user_suspension" "business_status";

-- AlterTable
ALTER TABLE "profiles" ADD COLUMN     "deleted_at" TIMESTAMP(3),
ADD COLUMN     "status" "user_status" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "suspended_at" TIMESTAMP(3),
ADD COLUMN     "suspension_reason" TEXT;

-- CreateTable
CREATE TABLE "admin_audit_log" (
    "id" UUID NOT NULL,
    "actor_id" UUID,
    "action" "audit_action" NOT NULL,
    "target_user_id" UUID,
    "target_business_id" UUID,
    "summary" TEXT,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pending_file_deletions" (
    "id" UUID NOT NULL,
    "public_id" TEXT NOT NULL,
    "delivery_type" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_attempt_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pending_file_deletions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "admin_audit_log_target_user_id_created_at_idx" ON "admin_audit_log"("target_user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "admin_audit_log_target_business_id_idx" ON "admin_audit_log"("target_business_id");

-- CreateIndex
CREATE INDEX "admin_audit_log_actor_id_idx" ON "admin_audit_log"("actor_id");

-- CreateIndex
CREATE INDEX "admin_audit_log_created_at_idx" ON "admin_audit_log"("created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "pending_file_deletions_public_id_key" ON "pending_file_deletions"("public_id");

-- CreateIndex
CREATE INDEX "profiles_status_created_at_idx" ON "profiles"("status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "profiles_role_idx" ON "profiles"("role");

-- AddForeignKey
ALTER TABLE "admin_audit_log" ADD CONSTRAINT "admin_audit_log_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Integrity rules
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_suspension_has_reason"
  CHECK ("status" <> 'SUSPENDED' OR ("suspension_reason" IS NOT NULL AND "suspended_at" IS NOT NULL));
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_deleted_has_time"
  CHECK ("status" <> 'DELETED' OR "deleted_at" IS NOT NULL);

-- Row Level Security: block the Supabase Data API; the app uses Prisma (postgres role).
ALTER TABLE "admin_audit_log" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "pending_file_deletions" ENABLE ROW LEVEL SECURITY;