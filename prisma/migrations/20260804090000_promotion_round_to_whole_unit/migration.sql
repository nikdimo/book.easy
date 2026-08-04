-- Promotional rounding is now "round to the nearest whole currency unit" rather
-- than "always round up to the nearest 5", so the column name no longer fits.
-- RENAME COLUMN keeps the existing values, the NOT NULL constraint and the
-- DEFAULT true in place; no row is rewritten and no host setting is reset.
ALTER TABLE "ListingPromotion" RENAME COLUMN "roundUpToNearestFive" TO "roundToWholeUnit";
