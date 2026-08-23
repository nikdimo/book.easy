-- Structured house rules on Listing, an accepted-rules snapshot on Booking, and the
-- migration of the "Pets allowed" amenity into a real policy column.
--
-- Every new Listing column is nullable on purpose: NULL means "the host has not
-- answered", which must stay distinguishable from an explicit NOT_ALLOWED. Defaulting
-- to a refusal would publish a rule no host ever chose.

-- CreateEnum
CREATE TYPE "ListingPetPolicy" AS ENUM ('ALLOWED', 'NOT_ALLOWED', 'ASK_HOST');

-- CreateEnum
CREATE TYPE "ListingSmokingPolicy" AS ENUM ('NOT_ALLOWED', 'OUTDOORS_ONLY', 'ALLOWED');

-- CreateEnum
CREATE TYPE "ListingEventPolicy" AS ENUM ('ALLOWED', 'NOT_ALLOWED');

-- CreateEnum
CREATE TYPE "ListingQuietHoursPolicy" AS ENUM ('NONE', 'SET');

-- AlterTable
ALTER TABLE "Listing"
  ADD COLUMN "petPolicy" "ListingPetPolicy",
  ADD COLUMN "smokingPolicy" "ListingSmokingPolicy",
  ADD COLUMN "eventPolicy" "ListingEventPolicy",
  ADD COLUMN "quietHoursPolicy" "ListingQuietHoursPolicy",
  ADD COLUMN "quietHoursStart" TEXT,
  ADD COLUMN "quietHoursEnd" TEXT,
  ADD COLUMN "additionalRules" TEXT,
  ADD COLUMN "houseRulesReviewedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Booking"
  ADD COLUMN "houseRulesSnapshot" JSONB,
  ADD COLUMN "houseRulesAcceptedAt" TIMESTAMP(3);

-- Backfill the pet policy from the amenity that used to carry it, before anything
-- stops reading that amenity. A listing that offered "Pets allowed" said pets are
-- allowed; a listing that did not offer it said nothing at all, and stays NULL rather
-- than becoming an explicit refusal.
UPDATE "Listing" AS l
SET "petPolicy" = 'ALLOWED'
WHERE EXISTS (
  SELECT 1
  FROM "ListingAmenity" la
  JOIN "Amenity" a ON a."id" = la."amenityId"
  WHERE la."listingId" = l."id" AND a."key" = 'pets_allowed'
);

-- Only now is the amenity redundant. The join rows go, so the listing's pet answer has
-- exactly one home, and the catalog row is deactivated rather than deleted: its id is
-- referenced by amenity aliases and translations, and search still names it as the
-- guest-facing "Pets allowed" filter, which now reads the policy column.
DELETE FROM "ListingAmenity"
WHERE "amenityId" IN (SELECT "id" FROM "Amenity" WHERE "key" = 'pets_allowed');

UPDATE "Amenity" SET "isActive" = false WHERE "key" = 'pets_allowed';

-- The policy is what search filters on now, so it needs an index of its own: the
-- amenity join table it used to reach was already indexed by its primary key.
CREATE INDEX "Listing_petPolicy_idx" ON "Listing"("petPolicy");
