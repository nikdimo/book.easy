const OVERLAP_CONSTRAINT_NAME = "availability_block_no_overlap";

/** True if `error` is the Postgres exclusion-constraint violation from
 * prisma/migrations/20260710175030_availability_block_no_overlap — the database-level
 * backstop against overlapping availability blocks/booking holds for the same listing.
 * This should be rare in practice (the advisory lock in createBooking/blockDates
 * prevents the race under normal operation) but must never surface as a raw 500. */
export function isAvailabilityOverlapConstraintError(error: unknown): boolean {
  return error instanceof Error && error.message.includes(OVERLAP_CONSTRAINT_NAME);
}
