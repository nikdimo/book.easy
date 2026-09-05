/**
 * The listing-wide stay-length rule: two numbers, one reading of them.
 *
 * `PricingRule.minNights` and `PricingRule.maxNights` are listing-wide. Both booking
 * modes obey them — `createBooking` applies them to flexible stays, `weeklyStayIssue`
 * applies them to weekly ones, search spells the same test in SQL, and the booking
 * widget applies them client-side. The rule they share used to be described by a type
 * called `WeeklyStayLimits`, which is how a limit check ended up living only in the
 * weekly branch of the shared availability rule: the *name* said the limits were a
 * weekly concern, so the flexible branch looked complete without them.
 *
 * Free of every other import on purpose. This is the bottom of the dependency graph, so
 * `booking-selection` (guest widget), `weekly-stay` (weekly shape) and
 * `stay-availability` (the shared decision) can all read one definition without a cycle.
 */

/**
 * A listing's stay-length rule, as the two columns it is made of.
 *
 * `maxNights` follows the reading the whole product applies: the column is non-nullable
 * and defaults to 365, so a stored zero means "no maximum" rather than "no stay is ever
 * bookable". Null and undefined mean the same. Read it through `stayLengthCap`.
 */
export interface StayLimits {
  minNights: number;
  maxNights?: number | null;
}

/**
 * The host's stay-length cap, or `null` when they have not set one.
 *
 * A cap counts only from one night up. "No maximum" reaches the database as a zero, and
 * reading that zero literally would mean "no stay is ever bookable" — a rule no host
 * means to state. `null`/`undefined` cover the callers that have no pricing rule to read
 * at all.
 *
 * `createBooking`, the booking widget, the promotion editor and the search filter all
 * resolve the cap through here (search spells the same test in SQL), and the host
 * calendar's own ABOVE_MAXIMUM check applies the identical `>= 1` reading.
 */
export function stayLengthCap(
  maxNights: number | null | undefined,
): number | null {
  return typeof maxNights === "number" && maxNights >= 1 ? maxNights : null;
}

/** Whether `nights` is over the host's cap, if they set one. */
export function exceedsMaxNights(
  nights: number,
  maxNights: number | null | undefined,
): boolean {
  const cap = stayLengthCap(maxNights);
  return cap !== null && nights > cap;
}

/** Which limit a stay length breaks, if it breaks one. */
export type StayLimitIssue = "BELOW_MINIMUM" | "ABOVE_MAXIMUM";

/**
 * What is wrong with this stay *length* on this listing, or null when nothing is.
 *
 * Length only. It says nothing about weekday shape, availability windows, past dates or
 * occupancy — each of those is a different question with a different answer, and callers
 * order them deliberately. `weeklyStayIssue` in particular runs its weekday checks
 * *before* this one, so a guest who picked the wrong arrival day is told that rather
 * than being told their week is too short.
 */
export function stayLimitIssue(
  nights: number,
  limits: StayLimits,
): StayLimitIssue | null {
  if (nights < limits.minNights) return "BELOW_MINIMUM";
  const cap = stayLengthCap(limits.maxNights);
  if (cap !== null && nights > cap) return "ABOVE_MAXIMUM";
  return null;
}
