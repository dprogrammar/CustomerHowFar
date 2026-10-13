-- CreateEnum
CREATE TYPE "waitlist_role" AS ENUM ('CUSTOMER', 'BUSINESS');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "audit_action" ADD VALUE 'STATE_ACTIVATED';
ALTER TYPE "audit_action" ADD VALUE 'STATE_DEACTIVATED';
ALTER TYPE "audit_action" ADD VALUE 'WAITLIST_NOTIFIED';

-- AlterTable
ALTER TABLE "states" ADD COLUMN     "is_active" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "launched_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "waitlist_entries" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "state_id" INTEGER NOT NULL,
    "name" TEXT,
    "role" "waitlist_role" NOT NULL,
    "user_id" UUID,
    "consent_at" TIMESTAMP(3) NOT NULL,
    "unsubscribe_token" TEXT NOT NULL,
    "notified_at" TIMESTAMP(3),
    "unsubscribed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "waitlist_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "waitlist_entries_unsubscribe_token_key" ON "waitlist_entries"("unsubscribe_token");

-- CreateIndex
CREATE INDEX "waitlist_entries_state_id_notified_at_unsubscribed_at_idx" ON "waitlist_entries"("state_id", "notified_at", "unsubscribed_at");

-- CreateIndex
CREATE INDEX "waitlist_entries_user_id_idx" ON "waitlist_entries"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "waitlist_entries_email_state_id_key" ON "waitlist_entries"("email", "state_id");

-- AddForeignKey
ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_state_id_fkey" FOREIGN KEY ("state_id") REFERENCES "states"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Launch: Lagos only. Existing listings elsewhere (none at the time of writing) are untouched.
UPDATE "states" SET "is_active" = true, "launched_at" = now() WHERE "slug" = 'lagos';

-- At least one state must always be active.
CREATE OR REPLACE FUNCTION states_require_one_active() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "states" WHERE "is_active") THEN
    RAISE EXCEPTION 'At least one state must stay active' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER states_require_one_active
AFTER UPDATE OF "is_active" OR DELETE ON "states"
FOR EACH STATEMENT EXECUTE FUNCTION states_require_one_active();

-- Integrity rules
ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_email_lowercase"
  CHECK ("email" = lower("email") AND char_length("email") BETWEEN 3 AND 254);
ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_name_length"
  CHECK ("name" IS NULL OR char_length("name") BETWEEN 1 AND 80);

-- Row Level Security: block the Supabase Data API; the app uses Prisma (postgres role).
ALTER TABLE "waitlist_entries" ENABLE ROW LEVEL SECURITY;
