-- Drop the two ListingStatus values no transition can reach.
--
-- Moderation on this marketplace is post-publication: publishing and republishing both
-- write APPROVED with `needsReview = true`, an admin clears `needsReview`, and a safety
-- problem moves the listing to SUSPENDED. PENDING_REVIEW and REJECTED describe a
-- pre-publication queue that no code path has ever run, so they are removed rather than
-- left as states the UI has to keep branching on.
--
-- Legacy rows (seeded or hand-written before the instant-publish flow) are moved to
-- UNPUBLISHED, never APPROVED: UNPUBLISHED is the host-recoverable "off the site" state,
-- so a listing that was never live cannot be published as a side effect of this
-- migration. `moderationNote`, `needsReview` and every other Listing column are left
-- untouched, so the reason an admin gave survives the move.

-- Keep the data rewrite and enum replacement atomic. If any part of the type swap
-- fails, legacy rows must retain their original status so the migration can be safely
-- diagnosed and retried without leaving a half-applied lifecycle change.
BEGIN;

-- Step 1: retire the obsolete values while they still exist in the type.
UPDATE "Listing"
SET "status" = 'UNPUBLISHED'
WHERE "status" IN ('PENDING_REVIEW', 'REJECTED');

-- Step 2: replace the enum. "Listing"."status" is the only column of this type, and it
-- carries a DEFAULT that has to be dropped first — Postgres cannot cast a default
-- expression to a type that does not exist yet — and restored after the rename.
CREATE TYPE "ListingStatus_new" AS ENUM ('DRAFT', 'APPROVED', 'UNPUBLISHED', 'SUSPENDED', 'ARCHIVED');
ALTER TABLE "Listing" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Listing" ALTER COLUMN "status" TYPE "ListingStatus_new" USING ("status"::text::"ListingStatus_new");
ALTER TYPE "ListingStatus" RENAME TO "ListingStatus_old";
ALTER TYPE "ListingStatus_new" RENAME TO "ListingStatus";
DROP TYPE "ListingStatus_old";
ALTER TABLE "Listing" ALTER COLUMN "status" SET DEFAULT 'DRAFT';
COMMIT;
