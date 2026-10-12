-- Typo-tolerant search needs pg_trgm. Supabase keeps extensions in the "extensions" schema,
-- which is on the default search_path. (The schema is created if missing, e.g. in Prisma's
-- shadow database.)
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

-- AlterTable
ALTER TABLE "businesses" ADD COLUMN     "search_text" TEXT,
ADD COLUMN     "search_vector" tsvector;

-- ---------------------------------------------------------------------------
-- Keep the search columns up to date in the database, so they can never drift from the data.
-- search_text: short fields for fuzzy matching (name, category, tagline, services).
-- search_vector: weighted full-text vector (description included at the lowest weight).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION businesses_search_refresh() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  category_name text;
BEGIN
  SELECT c.name INTO category_name FROM categories c WHERE c.id = NEW.category_id;
  NEW.search_text := lower(concat_ws(' ', NEW.name, category_name, NEW.tagline, array_to_string(NEW.services, ' ')));
  NEW.search_vector :=
    setweight(to_tsvector('english', coalesce(NEW.name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(category_name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(array_to_string(NEW.services, ' '), '')), 'B') ||
    setweight(to_tsvector('english', coalesce(NEW.tagline, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(NEW.description, '')), 'C');
  RETURN NEW;
END;
$$;

CREATE TRIGGER businesses_search_refresh
BEFORE INSERT OR UPDATE OF name, tagline, description, services, category_id ON businesses
FOR EACH ROW EXECUTE FUNCTION businesses_search_refresh();

-- Renaming a category re-indexes its businesses.
CREATE OR REPLACE FUNCTION categories_search_refresh() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.name IS DISTINCT FROM OLD.name THEN
    UPDATE businesses SET category_id = category_id WHERE category_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER categories_search_refresh
AFTER UPDATE OF name ON categories
FOR EACH ROW EXECUTE FUNCTION categories_search_refresh();

-- Backfill existing rows (fires the trigger; updated_at is untouched).
UPDATE businesses SET name = name;

-- CreateIndex
CREATE INDEX "businesses_search_vector_idx" ON "businesses" USING GIN ("search_vector");

-- CreateIndex
CREATE INDEX "businesses_search_text_trgm_idx" ON "businesses" USING GIN ("search_text" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "businesses_status_view_count_idx" ON "businesses"("status", "view_count" DESC);

-- CreateIndex
CREATE INDEX "businesses_status_published_at_idx" ON "businesses"("status", "published_at" DESC);