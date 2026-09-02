/**
 * What a booking request says the stay *is* — and the one rule that decides whether it
 * has said it coherently.
 *
 * There are exactly two ways to ask for a stay, and a request must pick one:
 *
 * - **Flexible** — a check-in and a checkout, the way every booking has always worked.
 * - **Fixed** — the id of one of the stays the host put on sale, and no dates at all.
 *   The dates are the host's; the server reads them out of the stored period. A request
 *   that carried its own would be choosing the length of a stay whose length is not the
 *   guest's to choose.
 *
 * Anything else is refused rather than interpreted. A request holding both a period and
 * a date is ambiguous about which one is authoritative, and the safe reading of an
 * ambiguous request is none of them: silently preferring one would mean a crafted
 * checkout could ride along beside a legitimate period id and hope some later branch
 * reads it.
 *
 * Pure and dependency-free on purpose. The zod schema at the web boundary and
 * `createBooking` itself — which has callers that never pass through a schema — both ask
 * this same function, so the two boundaries cannot come to different conclusions about
 * the same request.
 */

export type BookingStayRequestKind = "FLEXIBLE" | "FIXED_STAYS";

export type BookingStayRequestIssue =
  /** Neither dates nor a fixed stay: the request does not say what is being booked. */
  | "NO_SELECTION"
  /** A fixed stay *and* at least one date. Which one is authoritative is unanswerable. */
  | "MIXED_SELECTION"
  /** One date without the other. Half a stay is not a stay. */
  | "INCOMPLETE_DATES";

export interface BookingStayRequestFields {
  checkIn?: unknown;
  checkOut?: unknown;
  fixedStayPeriodId?: unknown;
}

export type BookingStayRequestClassification =
  | { kind: BookingStayRequestKind }
  | { issue: BookingStayRequestIssue };

/**
 * Whether a field was actually supplied.
 *
 * An empty or whitespace-only string counts as absent. `FormData.get` returns `""` for a
 * field the form rendered but left blank, and treating that as a supplied date would
 * turn "the guest picked a fixed stay" into a mixed request on a form that carries both
 * inputs.
 */
function isPresent(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return value.trim() !== "";
  return true;
}

export function classifyBookingStayRequest(
  fields: BookingStayRequestFields,
): BookingStayRequestClassification {
  const hasPeriod = isPresent(fields.fixedStayPeriodId);
  const hasCheckIn = isPresent(fields.checkIn);
  const hasCheckOut = isPresent(fields.checkOut);

  // Mixed first: it is the only combination that is *wrong* rather than incomplete, and
  // reporting it as a missing date would tell a crafted request to try again with less.
  if (hasPeriod && (hasCheckIn || hasCheckOut)) return { issue: "MIXED_SELECTION" };
  if (hasPeriod) return { kind: "FIXED_STAYS" };
  if (hasCheckIn && hasCheckOut) return { kind: "FLEXIBLE" };
  if (hasCheckIn || hasCheckOut) return { issue: "INCOMPLETE_DATES" };
  return { issue: "NO_SELECTION" };
}

/** Whether a request describes one coherent stay. */
export function isValidBookingStayRequest(
  fields: BookingStayRequestFields,
): boolean {
  return "kind" in classifyBookingStayRequest(fields);
}

/**
 * What the guest is told.
 *
 * Deliberately says nothing about the listing's mode: at this point nothing has been
 * loaded, and a message that named the mode would be guessing. The mode mismatch has its
 * own sentences, decided inside the booking transaction where the mode is actually known.
 */
export function bookingStayRequestIssueMessage(
  issue: BookingStayRequestIssue,
): string {
  switch (issue) {
    case "NO_SELECTION":
      return "Choose your dates before sending your request.";
    case "MIXED_SELECTION":
      return "Choose either your own dates or one of the host's stays, not both.";
    case "INCOMPLETE_DATES":
      return "Choose both a check-in and a check-out date.";
  }
}
