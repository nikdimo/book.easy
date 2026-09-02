const OVERLAP_CONSTRAINT_NAME = "availability_block_no_overlap";

/** True if `error` is the Postgres exclusion-constraint violation from
 * prisma/migrations/20260710175030_availability_block_no_overlap — the database-level
 * backstop against overlapping availability blocks/booking holds for the same listing.
 * This should be rare in practice (the advisory lock in createBooking/blockDates
 * prevents the race under normal operation) but must never surface as a raw 500. */
export function isAvailabilityOverlapConstraintError(error: unknown): boolean {
  return error instanceof Error && error.message.includes(OVERLAP_CONSTRAINT_NAME);
}

/**
 * True if `error` is Prisma's unique-constraint violation (P2002).
 *
 * Read off the error's own `code` rather than by importing `Prisma` — this module is
 * imported by pure and server code alike, and matching the documented code keeps it
 * dependency-free in the same way the check above does.
 *
 * Used where a unique index is a *rule*, not a bug: two hosts adding the same fixed stay
 * at once, or a Quick setup run racing itself. The database refusing the second write is
 * the correct outcome, and the caller turns it into "already offered" rather than a 500.
 */
export function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "P2002"
  );
}
