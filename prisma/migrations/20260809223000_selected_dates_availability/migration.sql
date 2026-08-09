-- Existing listings stay open-by-default. Closed calendars are bookable only inside
-- explicit windows, allowing occasional hosts to publish without advertising dates
-- they have not opened.
CREATE TYPE "ListingAvailabilityMode" AS ENUM ('OPEN', 'CLOSED');

ALTER TABLE "Listing"
ADD COLUMN "availabilityMode" "ListingAvailabilityMode" NOT NULL DEFAULT 'OPEN';

CREATE TABLE "ListingAvailabilityWindow" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ListingAvailabilityWindow_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ListingAvailabilityWindow_listingId_startDate_endDate_idx"
ON "ListingAvailabilityWindow"("listingId", "startDate", "endDate");

ALTER TABLE "ListingAvailabilityWindow"
ADD CONSTRAINT "ListingAvailabilityWindow_listingId_fkey"
FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ListingAvailabilityWindow"
ADD CONSTRAINT "ListingAvailabilityWindow_valid_range"
CHECK ("startDate" < "endDate");
