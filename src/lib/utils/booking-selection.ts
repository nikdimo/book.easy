import { compareYmd, isValidYmd, nightsBetweenYmd } from "@/lib/utils/date-only";
import { dateKey, type CalendarDayRange } from "@/lib/utils/stay-pricing";

export type BookingSelectionStatus =
  | "incomplete"
  | "invalid"
  | "minimum-stay"
  | "maximum-stay"
  | "unavailable"
  | "valid";

/**
 * The host's stay-length cap, or `null` when they have not set one.
 *
 * A cap counts only from one night up. The stored column is non-nullable
 * (`maxNights Int @default(365)`), so "no maximum" reaches the database as a zero, and
 * reading that zero literally would mean "no stay is ever bookable" — a rule no host
 * means to state. `null`/`undefined` cover the callers that have no pricing rule to
 * read at all.
 *
 * `createBooking`, the booking widget and the search filter all resolve the cap through
 * here (search spells the same test in SQL), and the host calendar's own ABOVE_MAXIMUM
 * check applies the identical `>= 1` reading.
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

export interface BookingSelectionValidation {
  status: BookingSelectionStatus;
  nights: number;
}

type DisabledDateRange = CalendarDayRange;

const dayKey = (value: Date | string): string =>
  typeof value === "string" ? value : dateKey(value);

/**
 * Validates a prospective stay using the same interval convention as the server:
 * stay nights are [checkIn, checkOut), while public blocked ranges are inclusive.
 */
export function validateBookingSelection(
  checkIn: Date | undefined,
  checkOut: Date | undefined,
  minNights: number,
  disabledDateRanges: DisabledDateRange[],
  /** The host's cap, when they set one. Optional so a caller that has no pricing rule
   * to read it from keeps the minimum-only behaviour rather than inventing a limit. */
  maxNights?: number | null
): BookingSelectionValidation {
  if (!checkIn || !checkOut) {
    return { status: "incomplete", nights: 0 };
  }

  // Compared as calendar dates throughout. Both ends come from the picker as local
  // midnight, and the blocked runs arrive as the date-only keys the availability
  // service publishes, so nothing here can be pulled onto a neighbouring day by the
  // reader's own zone or by a daylight-saving change inside the stay.
  if (Number.isNaN(checkIn.getTime()) || Number.isNaN(checkOut.getTime())) {
    return { status: "invalid", nights: Number.NaN };
  }
  const checkInKey = dateKey(checkIn);
  const checkOutKey = dateKey(checkOut);
  const nights = nightsBetweenYmd(checkInKey, checkOutKey);

  if (!Number.isFinite(nights) || nights <= 0) {
    return { status: "invalid", nights };
  }

  const overlapsUnavailableNight = disabledDateRanges.some((range) => {
    const blockedFrom = dayKey(range.from);
    const blockedTo = dayKey(range.to);
    return (
      compareYmd(checkInKey, blockedTo) <= 0 &&
      compareYmd(checkOutKey, blockedFrom) > 0
    );
  });

  if (overlapsUnavailableNight) {
    return { status: "unavailable", nights };
  }

  if (nights < minNights) {
    return { status: "minimum-stay", nights };
  }

  // The other end of the same rule. `createBooking` has always refused a stay over the
  // cap, but nothing said so until the guest had picked their dates, filled in the
  // party, accepted the house rules and pressed request to book — so the refusal
  // arrived after the only steps that could have avoided it.
  if (exceedsMaxNights(nights, maxNights)) {
    return { status: "maximum-stay", nights };
  }

  return { status: "valid", nights };
}

const asYmd = (value: unknown): string | undefined =>
  isValidYmd(value) ? value : undefined;

/**
 * The stay a listing page may seed its booking widget from, given the `checkIn` and
 * `checkOut` it was opened with.
 *
 * Listing links are shared and bookmarked, so these two arrive holding whatever dates
 * the sender was looking at — often a stay that has since gone by, occasionally a
 * check-out before its check-in, and sometimes not dates at all. None of that is
 * bookable, and seeding it anyway produced a card that quoted a total and offered
 * Reserve for a stay the server refuses on sight. What survives is dropped to what the
 * page shows a guest who arrived with no dates: an empty picker.
 *
 * A check-out that does not follow its check-in is dropped on its own, leaving the
 * picker open on the check-out it is missing rather than throwing away a check-in the
 * guest can still use.
 */
export function bookableStayFromSearch(
  checkIn: unknown,
  checkOut: unknown,
  todayYmdValue: string,
): { checkIn?: string; checkOut?: string } {
  const from = asYmd(checkIn);
  if (!from || compareYmd(from, todayYmdValue) < 0) return {};

  const to = asYmd(checkOut);
  return {
    checkIn: from,
    checkOut: to && compareYmd(to, from) > 0 ? to : undefined,
  };
}
