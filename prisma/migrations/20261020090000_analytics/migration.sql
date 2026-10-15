-- CreateEnum
CREATE TYPE "analytics_event_kind" AS ENUM ('PAGE_VIEW', 'SEARCH', 'CONTACT');

-- AlterEnum
ALTER TYPE "notification_category" ADD VALUE 'WEEKLY_STATS';

-- CreateTable
CREATE TABLE "analytics_events" (
    "id" BIGSERIAL NOT NULL,
    "day" DATE NOT NULL,
    "kind" "analytics_event_kind" NOT NULL,
    "visitor" VARCHAR(32) NOT NULL,
    "path_type" VARCHAR(16),
    "device" VARCHAR(8) NOT NULL,
    "source" VARCHAR(16),
    "campaign" VARCHAR(40),
    "business_id" UUID,
    "repeat" BOOLEAN NOT NULL DEFAULT false,
    "contact_type" "contact_type",
    "query" VARCHAR(100),
    "category" VARCHAR(80),
    "state" VARCHAR(80),
    "result_count" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analytics_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analytics_daily" (
    "day" DATE NOT NULL,
    "metric" VARCHAR(32) NOT NULL,
    "key" VARCHAR(300) NOT NULL DEFAULT '',
    "value" INTEGER NOT NULL,

    CONSTRAINT "analytics_daily_pkey" PRIMARY KEY ("day","metric","key")
);

-- CreateTable
CREATE TABLE "business_stats_daily" (
    "day" DATE NOT NULL,
    "business_id" UUID NOT NULL,
    "views" INTEGER NOT NULL DEFAULT 0,
    "whatsapp" INTEGER NOT NULL DEFAULT 0,
    "calls" INTEGER NOT NULL DEFAULT 0,
    "emails" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "business_stats_daily_pkey" PRIMARY KEY ("business_id","day")
);

-- CreateTable
CREATE TABLE "analytics_salts" (
    "day" DATE NOT NULL,
    "salt" VARCHAR(64) NOT NULL,

    CONSTRAINT "analytics_salts_pkey" PRIMARY KEY ("day")
);

-- CreateIndex
CREATE INDEX "analytics_events_day_kind_idx" ON "analytics_events"("day", "kind");

-- CreateIndex
CREATE INDEX "analytics_events_business_id_day_idx" ON "analytics_events"("business_id", "day");

-- CreateIndex
CREATE INDEX "analytics_daily_metric_day_idx" ON "analytics_daily"("metric", "day");

-- CreateIndex
CREATE INDEX "business_stats_daily_day_idx" ON "business_stats_daily"("day");

-- AddForeignKey
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_stats_daily" ADD CONSTRAINT "business_stats_daily_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Only known values are stored (never URLs, user agents or referrers).
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_path_type_check"
  CHECK ("path_type" IS NULL OR "path_type" IN ('home', 'search', 'category', 'business', 'help', 'start', 'other'));
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_device_check"
  CHECK ("device" IN ('phone', 'tablet', 'desktop'));
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_source_check"
  CHECK ("source" IS NULL OR "source" IN ('direct', 'google', 'whatsapp', 'facebook', 'instagram', 'qr', 'other'));
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_campaign_format"
  CHECK ("campaign" IS NULL OR "campaign" ~ '^[a-z0-9][a-z0-9-]{0,39}$');
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_visitor_format"
  CHECK ("visitor" ~ '^[0-9a-f]{32}$');

-- Row Level Security: block the Supabase Data API; the app uses Prisma (postgres role).
ALTER TABLE "analytics_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "analytics_daily" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "business_stats_daily" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "analytics_salts" ENABLE ROW LEVEL SECURITY;
