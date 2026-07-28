-- CreateEnum
CREATE TYPE "PromotionType" AS ENUM ('PERCENT_DISCOUNT', 'FREE_CLEANING');

-- CreateTable
CREATE TABLE "ListingPromotion" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "type" "PromotionType" NOT NULL,
    "discountPercent" INTEGER,
    "minimumNights" INTEGER,
    "disabledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ListingPromotion_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ListingPromotion_percent_check" CHECK (
      ("type" = 'PERCENT_DISCOUNT' AND "discountPercent" BETWEEN 5 AND 50)
      OR
      ("type" = 'FREE_CLEANING' AND "discountPercent" IS NULL)
    ),
    CONSTRAINT "ListingPromotion_minimum_nights_check" CHECK (
      "minimumNights" IS NULL OR "minimumNights" BETWEEN 1 AND 365
    )
);

-- AlterTable
ALTER TABLE "Booking"
ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'EUR',
ADD COLUMN "originalTotal" DECIMAL(10,2),
ADD COLUMN "discountAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN "promotionId" TEXT,
ADD COLUMN "promotionType" "PromotionType",
ADD COLUMN "priceBreakdown" JSONB,
ADD COLUMN "priceBreakdownVersion" INTEGER;

-- CreateIndex
CREATE INDEX "ListingPromotion_listingId_disabledAt_idx"
ON "ListingPromotion"("listingId", "disabledAt");

-- Only one current promotion can exist for a listing. Disabled rows remain as history.
CREATE UNIQUE INDEX "ListingPromotion_one_current_per_listing"
ON "ListingPromotion"("listingId")
WHERE "disabledAt" IS NULL;

-- CreateIndex
CREATE INDEX "Booking_promotionId_idx" ON "Booking"("promotionId");

-- AddForeignKey
ALTER TABLE "ListingPromotion"
ADD CONSTRAINT "ListingPromotion_listingId_fkey"
FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking"
ADD CONSTRAINT "Booking_promotionId_fkey"
FOREIGN KEY ("promotionId") REFERENCES "ListingPromotion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
