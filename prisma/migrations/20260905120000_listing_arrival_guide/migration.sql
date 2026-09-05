-- Arrival guide: what a listing tells its guest about getting in, and the credentials
-- that go with it.
--
-- Strictly additive and inert. Nothing is dropped, rewritten or backfilled:
--   * `Listing.checkInEndTime` is nullable with no default, so every listing keeps the
--     open-ended arrival window it has today ("flexible") until its host narrows it.
--   * `ListingArrivalGuide` is a new, empty table. A listing without a row has an
--     unanswered arrival guide, which is what the editor and the guest page both render
--     today, so no guest-facing surface changes until a host saves the section.
--
-- The separate table is a containment decision, not a normalisation one. Three of these
-- columns are secrets that open a real door — the keypad code, the lockbox combination,
-- the Wi-Fi password — and keeping them off `Listing` keeps them out of every public
-- query that already selects it. Reading them takes a deliberate join, which happens in
-- exactly one module.

-- CreateEnum
CREATE TYPE "ListingCheckInMethod" AS ENUM ('SMART_LOCK', 'KEYPAD', 'LOCKBOX', 'BUILDING_STAFF', 'IN_PERSON', 'OTHER');

-- CreateEnum
CREATE TYPE "ListingInteractionPreference" AS ENUM ('APP_ONLY', 'SAY_HELLO', 'SOCIABLE', 'NO_PREFERENCE');

-- AlterTable
--
-- Beside `checkInTime` and `checkOutTime` rather than on the new table: all three are the
-- same kind of fact, House rules is their single writer, and splitting one of them onto
-- another row is how the three drift apart.
ALTER TABLE "Listing" ADD COLUMN     "checkInEndTime" TEXT;

-- CreateTable
CREATE TABLE "ListingArrivalGuide" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "directions" TEXT,
    "checkInMethod" "ListingCheckInMethod",
    "checkInMethodInstructions" TEXT,
    "wifiNetwork" TEXT,
    "wifiPassword" TEXT,
    "houseManual" TEXT,
    "checkoutInstructions" JSONB,
    "interactionPreference" "ListingInteractionPreference",
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ListingArrivalGuide_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ListingArrivalGuide_listingId_key" ON "ListingArrivalGuide"("listingId");

-- AddForeignKey
ALTER TABLE "ListingArrivalGuide" ADD CONSTRAINT "ListingArrivalGuide_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;
