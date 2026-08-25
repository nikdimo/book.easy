import { differenceInCalendarDays, startOfDay } from "date-fns";
import { compareYmd } from "@/lib/utils/date-only";

export type BookingSelectionStatus =
  | "incomplete"
  | "invalid"
  | "minimum-stay"
  | "unavailable"
  | "valid";

export interface BookingSelectionValidation {
  status: BookingSelectionStatus;
  nights: number;
}

interface DisabledDateRange {
  from: Date;
  to: Date;
}

/**
 * Validates a prospective stay using the same interval convention as the server:
 * stay nights are [checkIn, checkOut), while public blocked ranges are inclusive.
 */
export function validateBookingSelection(
  checkIn: Date | undefined,
  checkOut: Date | undefined,
  minNights: number,
  disabledDateRanges: DisabledDateRange[]
): BookingSelectionValidation {
  if (!checkIn || !checkOut) {
    return { status: "incomplete", nights: 0 };
  }

  const normalizedCheckIn = startOfDay(checkIn);
  const normalizedCheckOut = startOfDay(checkOut);
  const nights = differenceInCalendarDays(
    normalizedCheckOut,
    normalizedCheckIn
  );

  if (nights <= 0) {
    return { status: "invalid", nights };
  }

  const overlapsUnavailableNight = disabledDateRanges.some((range) => {
    const blockedFrom = startOfDay(range.from);
    const blockedTo = startOfDay(range.to);
    return normalizedCheckIn <= blockedTo && normalizedCheckOut > blockedFrom;
  });

  if (overlapsUnavailableNight) {
    return { status: "unavailable", nights };
  }

  if (nights < minNights) {
    return { status: "minimum-stay", nights };
  }

  return { status: "valid", nights };
}

const YMD_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const asYmd = (value: unknown): string | undefined =>
  typeof value === "string" && YMD_PATTERN.test(value) ? value : undefined;

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
