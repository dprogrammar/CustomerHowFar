-- CreateEnum
CREATE TYPE "business_status" AS ENUM ('DRAFT', 'PENDING_PAYMENT', 'PENDING_REVIEW', 'APPROVED', 'REJECTED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "payment_status" AS ENUM ('PENDING', 'SUCCESS', 'FAILED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "payment_provider" AS ENUM ('PAYSTACK');

-- CreateEnum
CREATE TYPE "currency" AS ENUM ('NGN');

-- CreateEnum
CREATE TYPE "review_status" AS ENUM ('PUBLISHED', 'HIDDEN');

-- CreateEnum
CREATE TYPE "contact_type" AS ENUM ('WHATSAPP', 'CALL', 'EMAIL');

-- CreateTable
CREATE TABLE "categories" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "icon" TEXT NOT NULL,
    "description" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "parent_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "states" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "states_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lgas" (
    "id" SERIAL NOT NULL,
    "state_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lgas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "businesses" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "category_id" UUID NOT NULL,
    "tagline" VARCHAR(120),
    "description" TEXT,
    "years_of_experience" SMALLINT,
    "phone" TEXT NOT NULL,
    "whatsapp_number" TEXT NOT NULL,
    "email" TEXT,
    "address" TEXT NOT NULL,
    "area" TEXT,
    "state_id" INTEGER NOT NULL,
    "lga_id" INTEGER NOT NULL,
    "services" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "opening_hours" JSONB,
    "instagram_url" TEXT,
    "facebook_url" TEXT,
    "tiktok_url" TEXT,
    "website_url" TEXT,
    "logo_public_id" TEXT,
    "cover_public_id" TEXT,
    "status" "business_status" NOT NULL DEFAULT 'DRAFT',
    "rejection_reason" TEXT,
    "is_verified" BOOLEAN NOT NULL DEFAULT false,
    "is_featured" BOOLEAN NOT NULL DEFAULT false,
    "view_count" INTEGER NOT NULL DEFAULT 0,
    "contact_click_count" INTEGER NOT NULL DEFAULT 0,
    "rating_average" DECIMAL(3,2) NOT NULL DEFAULT 0,
    "review_count" INTEGER NOT NULL DEFAULT 0,
    "published_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "businesses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_photos" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "public_id" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "caption" VARCHAR(200),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "business_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "amount_kobo" INTEGER NOT NULL,
    "currency" "currency" NOT NULL DEFAULT 'NGN',
    "provider" "payment_provider" NOT NULL DEFAULT 'PAYSTACK',
    "reference" TEXT NOT NULL,
    "status" "payment_status" NOT NULL DEFAULT 'PENDING',
    "paid_at" TIMESTAMP(3),
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reviews" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "rating" SMALLINT NOT NULL,
    "comment" TEXT,
    "status" "review_status" NOT NULL DEFAULT 'PUBLISHED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saved_businesses" (
    "user_id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saved_businesses_pkey" PRIMARY KEY ("user_id","business_id")
);

-- CreateTable
CREATE TABLE "contact_events" (
    "id" BIGSERIAL NOT NULL,
    "business_id" UUID NOT NULL,
    "type" "contact_type" NOT NULL,
    "user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contact_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "categories_slug_key" ON "categories"("slug");

-- CreateIndex
CREATE INDEX "categories_parent_id_idx" ON "categories"("parent_id");

-- CreateIndex
CREATE INDEX "categories_is_active_sort_order_idx" ON "categories"("is_active", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "states_name_key" ON "states"("name");

-- CreateIndex
CREATE UNIQUE INDEX "states_slug_key" ON "states"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "lgas_state_id_slug_key" ON "lgas"("state_id", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "lgas_id_state_id_key" ON "lgas"("id", "state_id");

-- CreateIndex
CREATE UNIQUE INDEX "businesses_slug_key" ON "businesses"("slug");

-- CreateIndex
CREATE INDEX "businesses_status_created_at_idx" ON "businesses"("status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "businesses_status_is_featured_idx" ON "businesses"("status", "is_featured");

-- CreateIndex
CREATE INDEX "businesses_category_id_status_idx" ON "businesses"("category_id", "status");

-- CreateIndex
CREATE INDEX "businesses_state_id_status_idx" ON "businesses"("state_id", "status");

-- CreateIndex
CREATE INDEX "businesses_lga_id_state_id_status_idx" ON "businesses"("lga_id", "state_id", "status");

-- CreateIndex
CREATE INDEX "businesses_owner_id_idx" ON "businesses"("owner_id");

-- CreateIndex
CREATE INDEX "businesses_created_at_idx" ON "businesses"("created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "business_photos_public_id_key" ON "business_photos"("public_id");

-- CreateIndex
CREATE INDEX "business_photos_business_id_sort_order_idx" ON "business_photos"("business_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "payments_reference_key" ON "payments"("reference");

-- CreateIndex
CREATE INDEX "payments_business_id_created_at_idx" ON "payments"("business_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "payments_user_id_created_at_idx" ON "payments"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "payments_status_created_at_idx" ON "payments"("status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "reviews_business_id_status_created_at_idx" ON "reviews"("business_id", "status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "reviews_user_id_idx" ON "reviews"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "reviews_business_id_user_id_key" ON "reviews"("business_id", "user_id");

-- CreateIndex
CREATE INDEX "saved_businesses_business_id_idx" ON "saved_businesses"("business_id");

-- CreateIndex
CREATE INDEX "contact_events_business_id_created_at_idx" ON "contact_events"("business_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "contact_events_user_id_idx" ON "contact_events"("user_id");

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lgas" ADD CONSTRAINT "lgas_state_id_fkey" FOREIGN KEY ("state_id") REFERENCES "states"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "businesses" ADD CONSTRAINT "businesses_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "businesses" ADD CONSTRAINT "businesses_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "businesses" ADD CONSTRAINT "businesses_state_id_fkey" FOREIGN KEY ("state_id") REFERENCES "states"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "businesses" ADD CONSTRAINT "businesses_lga_id_state_id_fkey" FOREIGN KEY ("lga_id", "state_id") REFERENCES "lgas"("id", "state_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_photos" ADD CONSTRAINT "business_photos_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_businesses" ADD CONSTRAINT "saved_businesses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_businesses" ADD CONSTRAINT "saved_businesses_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_events" ADD CONSTRAINT "contact_events_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_events" ADD CONSTRAINT "contact_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Data integrity (CHECK constraints are not expressible in the Prisma schema)
-- ---------------------------------------------------------------------------
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_rating_range" CHECK ("rating" BETWEEN 1 AND 5);
ALTER TABLE "payments" ADD CONSTRAINT "payments_amount_positive" CHECK ("amount_kobo" > 0);
ALTER TABLE "businesses" ADD CONSTRAINT "businesses_counters_non_negative"
  CHECK ("view_count" >= 0 AND "contact_click_count" >= 0 AND "review_count" >= 0);
ALTER TABLE "businesses" ADD CONSTRAINT "businesses_rating_range"
  CHECK ("rating_average" >= 0 AND "rating_average" <= 5);
ALTER TABLE "businesses" ADD CONSTRAINT "businesses_years_non_negative"
  CHECK ("years_of_experience" IS NULL OR "years_of_experience" BETWEEN 0 AND 100);
ALTER TABLE "business_photos" ADD CONSTRAINT "business_photos_dimensions_positive"
  CHECK ("width" > 0 AND "height" > 0);
ALTER TABLE "categories" ADD CONSTRAINT "categories_not_own_parent"
  CHECK ("parent_id" IS NULL OR "parent_id" <> "id");

-- ---------------------------------------------------------------------------
-- Row Level Security: block the Supabase Data API (anon/authenticated roles).
-- The app accesses these tables only through Prisma as the postgres role, which bypasses RLS.
-- ---------------------------------------------------------------------------
ALTER TABLE "categories" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "states" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "lgas" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "businesses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "business_photos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "reviews" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "saved_businesses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "contact_events" ENABLE ROW LEVEL SECURITY;