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
 * The stay-length rule lives in `stay-limits`, which is where both booking modes and the
 * shared availability decision read it from. Re-exported here so the widget's own
 * importers keep one import for "everything the booking selection needs".
 */
import { exceedsMaxNights, stayLengthCap } from "@/lib/utils/stay-limits";

export { exceedsMaxNights, stayLengthCap };

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
