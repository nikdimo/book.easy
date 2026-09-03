-- Weekly stays: one changeover day per listing, in place of host-authored stay periods.
--
-- Strictly additive. Nothing is dropped and nothing existing is rewritten:
--   * "ListingFixedStayPeriod" and "Booking"."fixedStayPeriodId" stay exactly as they
--     are. Bookings already sold as a period keep pointing at the row they were sold as,
--     and their frozen "fixedStaySnapshot" keeps reading back the way it always did.
--     Nothing new is written to either from this release onward.
--   * "Listing"."bookingMode" keeps its stored FIXED_STAYS value. Renaming an enum
--     member would rewrite every listing row and every check that reads it for a change
--     nobody can see: every user-facing surface now says "Weekly stays" regardless.
--
-- The new column is nullable on purpose, and null fails closed: a weekly listing with no
-- changeover day offers no dates at all until its host picks one.

-- CreateEnum
CREATE TYPE "ListingChangeoverWeekday" AS ENUM (
    'MONDAY',
    'TUESDAY',
    'WEDNESDAY',
    'THURSDAY',
    'FRIDAY',
    'SATURDAY',
    'SUNDAY'
);

-- AlterTable
ALTER TABLE "Listing" ADD COLUMN     "changeoverWeekday" "ListingChangeoverWeekday";

-- Existing fixed-period listings intentionally remain null.
--
-- A common arrival weekday is not permission to turn a finite set of authored periods
-- into every future week on that weekday. Backfilling from the old rows would silently
-- offer dates the host never put on sale. Null therefore acts as the explicit transition
-- state: the listing fails closed, the editor flags Availability, and the host chooses a
-- changeover day when they are ready to adopt the new recurring weekly rule.
--
-- No UPDATE follows by design.
