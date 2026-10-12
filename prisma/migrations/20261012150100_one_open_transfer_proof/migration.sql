-- At most one transfer proof awaiting confirmation per business (separate migration: a new
-- enum value can't be used in the transaction that added it).
CREATE UNIQUE INDEX "payments_one_awaiting_per_business"
  ON "payments" ("business_id")
  WHERE "status" = 'AWAITING_CONFIRMATION';