-- Two-way iCal channel sync: an export token per listing (Airbnb/Booking.com subscribe
-- to it) and a table of imported remote calendars whose events become availability
-- blocks. See src/lib/calendar-sync/.

ALTER TYPE "BlockType" ADD VALUE 'EXTERNAL_SYNC';

CREATE TYPE "CalendarFeedStatus" AS ENUM ('PENDING', 'OK', 'ERROR');

ALTER TABLE "Listing" ADD COLUMN "calendarFeedToken" TEXT;
CREATE UNIQUE INDEX "Listing_calendarFeedToken_key"
  ON "Listing"("calendarFeedToken");

CREATE TABLE "ListingCalendarFeed" (
  "id" TEXT NOT NULL,
  "listingId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "lastSyncedAt" TIMESTAMP(3),
  "lastStatus" "CalendarFeedStatus" NOT NULL DEFAULT 'PENDING',
  "lastError" TEXT,
  "lastEventCount" INTEGER NOT NULL DEFAULT 0,
  "lastBlockedNights" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ListingCalendarFeed_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ListingCalendarFeed_listingId_url_key"
  ON "ListingCalendarFeed"("listingId", "url");
CREATE INDEX "ListingCalendarFeed_listingId_idx" ON "ListingCalendarFeed"("listingId");
CREATE INDEX "ListingCalendarFeed_lastSyncedAt_idx" ON "ListingCalendarFeed"("lastSyncedAt");

ALTER TABLE "ListingCalendarFeed"
  ADD CONSTRAINT "ListingCalendarFeed_listingId_fkey"
  FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Blocks mirrored from a feed are owned by it: removing the feed frees its dates, and a
-- re-sync deletes only rows carrying its own id.
ALTER TABLE "AvailabilityBlock" ADD COLUMN "feedId" TEXT;
CREATE INDEX "AvailabilityBlock_feedId_idx" ON "AvailabilityBlock"("feedId");
ALTER TABLE "AvailabilityBlock"
  ADD CONSTRAINT "AvailabilityBlock_feedId_fkey"
  FOREIGN KEY ("feedId") REFERENCES "ListingCalendarFeed"("id") ON DELETE CASCADE ON UPDATE CASCADE;
