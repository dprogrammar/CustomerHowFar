-- Uses the DELETED business status added in the previous migration (a new enum value can't be
-- used in the same transaction that adds it).

-- Soft-deleted businesses keep only their name (and payments), so they no longer need a location.
ALTER TABLE "businesses" DROP CONSTRAINT "businesses_location_required_after_draft";
ALTER TABLE "businesses" ADD CONSTRAINT "businesses_location_required_after_draft"
  CHECK ("status" IN ('DRAFT', 'DELETED') OR ("address" IS NOT NULL AND "state_id" IS NOT NULL AND "lga_id" IS NOT NULL));

ALTER TABLE "businesses" ADD CONSTRAINT "businesses_deleted_has_time"
  CHECK ("status" <> 'DELETED' OR "deleted_at" IS NOT NULL);

-- A remembered status exists only while the business is hidden because its owner is suspended.
ALTER TABLE "businesses" ADD CONSTRAINT "businesses_user_suspension_state"
  CHECK ("status_before_user_suspension" IS NULL OR "status" = 'SUSPENDED');