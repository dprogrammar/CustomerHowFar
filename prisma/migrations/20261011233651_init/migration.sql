-- CreateTable
CREATE TABLE "app_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "payment_required" BOOLEAN NOT NULL DEFAULT false,
    "listing_fee_naira" INTEGER NOT NULL DEFAULT 5000,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_settings_pkey" PRIMARY KEY ("id")
);
