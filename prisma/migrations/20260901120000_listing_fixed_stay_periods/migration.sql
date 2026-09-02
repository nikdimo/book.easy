-- Fixed stays: a listing may sell whole stays instead of arbitrary date ranges.
--
-- Strictly additive and inert. Nothing existing is dropped, rewritten or backfilled:
--   * `Listing.bookingMode` defaults to FLEXIBLE, so every listing that exists keeps the
--     calendar it has and no guest-facing behaviour changes until a host switches.
--   * `ListingFixedStayPeriod` is a new, empty table. A FLEXIBLE listing never reads it.
--   * `Booking.fixedStayPeriodId` / `fixedStaySnapshot` are nullable with no default, so
--     every existing booking stays valid exactly as written.
-- Availability windows, minimum-stay settings and every pricing column are untouched:
-- fixed stays reuse the existing nightly rate, date overrides, cleaning fee, promotions
-- and quote engine, and carry no price of their own.

-- CreateEnum
CREATE TYPE "ListingBookingMode" AS ENUM ('FLEXIBLE', 'FIXED_STAYS');

-- AlterTable
ALTER TABLE "Listing" ADD COLUMN     "bookingMode" "ListingBookingMode" NOT NULL DEFAULT 'FLEXIBLE';

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "fixedStayPeriodId" TEXT,
ADD COLUMN     "fixedStaySnapshot" JSONB;

-- CreateTable
--
-- Dates only. No price, currency, state, availability or nights column: the length is
-- `checkOut - checkIn`, the price comes from the listing's existing pricing, and whether
-- the nights are free is answered by "AvailabilityBlock" like every other stay.
CREATE TABLE "ListingFixedStayPeriod" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "checkIn" DATE NOT NULL,
    "checkOut" DATE NOT NULL,
    "disabledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ListingFixedStayPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
--
-- The host and guest lists are both "this listing's periods, minus the switched-off
-- ones", so the switch belongs in the index rather than in a filter over the result.
CREATE INDEX "ListingFixedStayPeriod_listingId_disabledAt_idx" ON "ListingFixedStayPeriod"("listingId", "disabledAt");

-- CreateIndex
--
-- Overlapping alternatives are legal — a week and a fortnight from the same Saturday are
-- two real options. Only the exact same pair of dates is refused, because that is the one
-- pair a guest could not tell apart, and it is what makes re-running Quick setup safe.
CREATE UNIQUE INDEX "ListingFixedStayPeriod_listingId_checkIn_checkOut_key" ON "ListingFixedStayPeriod"("listingId", "checkIn", "checkOut");

-- CreateIndex
CREATE INDEX "Booking_fixedStayPeriodId_idx" ON "Booking"("fixedStayPeriodId");

-- AddForeignKey
ALTER TABLE "ListingFixedStayPeriod" ADD CONSTRAINT "ListingFixedStayPeriod_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
--
-- SET NULL, like the promotion link beside it: deleting a period must never delete or
-- block a booking that was sold as one. What the guest actually booked survives in
-- "fixedStaySnapshot", which is why the link may go null without losing the record.
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_fixedStayPeriodId_fkey" FOREIGN KEY ("fixedStayPeriodId") REFERENCES "ListingFixedStayPeriod"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- The half-open `[checkIn, checkOut)` rule the whole schema uses, enforced in the
-- database so no write path can store a stay that does not run forwards.
ALTER TABLE "ListingFixedStayPeriod"
ADD CONSTRAINT "ListingFixedStayPeriod_valid_range"
CHECK ("checkIn" < "checkOut");
