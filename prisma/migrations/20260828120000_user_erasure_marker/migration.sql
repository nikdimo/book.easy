-- Right-to-erasure marker on User.
--
-- Additive and nullable, so it applies to a live database without a table rewrite,
-- without a backfill, and without locking anything for longer than the catalog update:
-- adding a nullable column with no default is a metadata-only change in Postgres.
--
-- No foreign key is altered. Erasure anonymizes the User row in place rather than
-- deleting it, so the `ON DELETE RESTRICT` constraints on Booking.guestId,
-- Listing.hostId, Property.ownerId and Suggestion.hostId keep doing their job of
-- refusing to orphan booking and listing history.
--
-- Existing rows get NULL, which is correct: every account that exists today is a live
-- account, not an erased husk.
ALTER TABLE "User" ADD COLUMN "deletedAt" TIMESTAMP(3);

CREATE INDEX "User_deletedAt_idx" ON "User"("deletedAt");
