-- Allow several active offers and make cleaning an independent benefit.
DROP INDEX IF EXISTS "ListingPromotion_one_current_per_listing";

ALTER TABLE "ListingPromotion"
ADD COLUMN "freeCleaning" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "roundUpToNearestFive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "startDate" DATE,
ADD COLUMN "endDate" DATE;

-- Remove the legacy mutually-exclusive promotion checks before backfilling
-- free-cleaning offers into the new composable benefit model.
ALTER TABLE "ListingPromotion"
DROP CONSTRAINT IF EXISTS "ListingPromotion_percent_check",
DROP CONSTRAINT IF EXISTS "ListingPromotion_minimum_nights_check";

-- Preserve the meaning of existing free-cleaning promotions.
UPDATE "ListingPromotion"
SET
  "freeCleaning" = true,
  "discountPercent" = 0
WHERE "type" = 'FREE_CLEANING';

ALTER TABLE "ListingPromotion"
ALTER COLUMN "discountPercent" SET DEFAULT 0,
ALTER COLUMN "discountPercent" SET NOT NULL;

ALTER TABLE "ListingPromotion"
ADD CONSTRAINT "ListingPromotion_percent_check"
CHECK ("discountPercent" BETWEEN 0 AND 50),
ADD CONSTRAINT "ListingPromotion_benefit_check"
CHECK ("discountPercent" > 0 OR "freeCleaning" = true),
ADD CONSTRAINT "ListingPromotion_minimum_nights_check"
CHECK ("minimumNights" IS NULL OR "minimumNights" BETWEEN 1 AND 365),
ADD CONSTRAINT "ListingPromotion_date_scope_check"
CHECK (
  ("startDate" IS NULL AND "endDate" IS NULL)
  OR
  ("startDate" IS NOT NULL AND "endDate" IS NOT NULL AND "startDate" < "endDate")
);

CREATE INDEX "ListingPromotion_listingId_startDate_endDate_idx"
ON "ListingPromotion"("listingId", "startDate", "endDate");
