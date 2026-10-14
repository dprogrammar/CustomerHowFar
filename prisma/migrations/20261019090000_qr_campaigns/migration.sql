-- CreateTable
CREATE TABLE "qr_campaigns" (
    "id" UUID NOT NULL,
    "name" VARCHAR(40) NOT NULL,
    "created_by_id" UUID,
    "visits" INTEGER NOT NULL DEFAULT 0,
    "signups" INTEGER NOT NULL DEFAULT 0,
    "listings" INTEGER NOT NULL DEFAULT 0,
    "last_visit_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "qr_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "qr_campaigns_name_key" ON "qr_campaigns"("name");

-- CreateIndex
CREATE INDEX "qr_campaigns_created_at_idx" ON "qr_campaigns"("created_at" DESC);

-- AddForeignKey
ALTER TABLE "qr_campaigns" ADD CONSTRAINT "qr_campaigns_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;



ALTER TABLE "qr_campaigns" ADD CONSTRAINT "qr_campaigns_name_format"
  CHECK ("name" ~ '^[a-z0-9][a-z0-9-]{0,39}$');
ALTER TABLE "qr_campaigns" ADD CONSTRAINT "qr_campaigns_counts_non_negative"
  CHECK ("visits" >= 0 AND "signups" >= 0 AND "listings" >= 0);

-- Row Level Security: block the Supabase Data API; the app uses Prisma (postgres role).
ALTER TABLE "qr_campaigns" ENABLE ROW LEVEL SECURITY;
