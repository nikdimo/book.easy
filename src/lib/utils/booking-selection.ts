import { differenceInCalendarDays, startOfDay } from "date-fns";

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
