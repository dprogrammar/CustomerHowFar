-- AlterTable
ALTER TABLE "app_settings" ADD COLUMN     "homepage_free_promo" BOOLEAN NOT NULL DEFAULT true;



-- The promotion says listing is free, so it can never be on while the listing fee is on:
-- switching the fee on (from the app or anywhere else) switches the promotion off.
CREATE OR REPLACE FUNCTION app_settings_free_promo_follows_fee() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."payment_required" THEN
    NEW."homepage_free_promo" := false;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER app_settings_free_promo_follows_fee
BEFORE INSERT OR UPDATE ON "app_settings"
FOR EACH ROW EXECUTE FUNCTION app_settings_free_promo_follows_fee();
