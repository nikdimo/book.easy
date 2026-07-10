-- Database-level guarantee against overlapping availability (manual blocks + booking
-- holds) for the same listing, on top of the advisory-lock serialization already done
-- in application code (see src/lib/services/booking.service.ts createBooking and
-- src/lib/actions/availability.actions.ts blockDates). The advisory lock prevents the
-- race under normal operation; this constraint is the backstop that makes it
-- impossible even if a future code path forgets to take the lock.
--
-- AvailabilityBlock stores date-only columns (@db.Date) as an exclusive [start, end)
-- range, matching the overlap queries already used everywhere in the codebase
-- (`startDate < :end AND endDate > :start`).

CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "AvailabilityBlock"
  ADD CONSTRAINT availability_block_no_overlap
  EXCLUDE USING gist (
    "listingId" WITH =,
    daterange("startDate", "endDate", '[)') WITH &&
  );
