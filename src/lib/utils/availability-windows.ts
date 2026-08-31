/**
 * The one rule that decides whether a host's open windows leave a stay bookable.
 *
 * Four places used to answer this question and three of them disagreed. The guest
 * calendar complemented the windows as a *union*, bridging one window into the next;
 * `checkAvailability`, `createBooking` and the search filter each asked the database for
 * a **single** window spanning the whole stay. A stay lying across two touching windows
 * was therefore drawn as free, hidden from search, and refused on submit — three answers
 * to one question.
 *
 * The union wins, because it is what a host means. A host who opens June and then opens
 * July has not declared the night of the 30th unbookable; they have opened both months.
 * Splitting that into two rows is a storage detail, and storage details should not
 * decide what a guest may book.
 *
 * Windows use the database's half-open `[startDate, endDate)` convention, the same one
 * bookings and `AvailabilityBlock` rows use, so two windows *touch* when one ends on the
 * exact day the next begins. Touching windows merge; a real gap between them does not.
 *
 * This module is deliberately pure and Date-based: every caller already holds `Date`s
 * read straight from `@db.Date` columns, and the server, the search filter and the
 * calendar all need the identical answer. Anything that consults availability windows
 * should call in here rather than re-deriving the rule.
 */

/** An open window, in the database's half-open `[startDate, endDate)` convention. */
export interface AvailabilityWindowRange {
  startDate: Date;
  endDate: Date;
}

/**
 * The host's open windows collapsed into maximal spans, sorted by start.
 *
 * Overlapping *and* touching windows merge — touching being the case the calendar
 * already bridged and the server already refused. Empty and inverted rows
 * (`endDate <= startDate`) cover no night at all, so they are dropped rather than
 * carried through as zero-width spans that could appear to join two real windows
 * across a gap.
 */
export function mergeAvailabilityWindows(
  windows: readonly AvailabilityWindowRange[],
): AvailabilityWindowRange[] {
  const usable = windows
    .filter((window) => window.endDate.getTime() > window.startDate.getTime())
    .sort((left, right) => left.startDate.getTime() - right.startDate.getTime());

  const merged: AvailabilityWindowRange[] = [];
  for (const window of usable) {
    const last = merged[merged.length - 1];
    // `<=` rather than `<`: with an exclusive end, a window starting exactly where the
    // previous one ended is contiguous with it, not adjacent-but-separate.
    if (last && window.startDate.getTime() <= last.endDate.getTime()) {
      if (window.endDate.getTime() > last.endDate.getTime()) {
        last.endDate = window.endDate;
      }
      continue;
    }
    merged.push({ startDate: window.startDate, endDate: window.endDate });
  }

  return merged;
}

/**
 * Whether the union of `windows` covers every night of `[checkIn, checkOut)`.
 *
 * A stay that does not run forwards is not a stay, and is never covered — this is the
 * floor under the guest-facing guards, so a reversed or empty range cannot reach the
 * booking transaction by way of a URL a guest edited or a link someone shared.
 */
export function windowsCoverStay(
  windows: readonly AvailabilityWindowRange[],
  checkIn: Date,
  checkOut: Date,
): boolean {
  if (checkOut.getTime() <= checkIn.getTime()) return false;

  return mergeAvailabilityWindows(windows).some(
    (span) =>
      span.startDate.getTime() <= checkIn.getTime() &&
      span.endDate.getTime() >= checkOut.getTime(),
  );
}

/**
 * The shared rule, in the shape every caller actually has: a listing's availability mode
 * plus whatever windows it holds.
 *
 * `OPEN` listings sell every date unless something blocks them, so their windows say
 * nothing and are not consulted. Only a `CLOSED` listing — open exclusively on the dates
 * its host named — has to be covered.
 *
 * Blocks (bookings, manual blocks, imported calendars) are a separate question and stay
 * where they are: this answers "did the host offer these dates at all", not "is anyone
 * already in them".
 */
export function isStayWithinAvailabilityWindows(input: {
  availabilityMode: string;
  windows: readonly AvailabilityWindowRange[];
  checkIn: Date;
  checkOut: Date;
}): boolean {
  if (input.checkOut.getTime() <= input.checkIn.getTime()) return false;
  if (input.availabilityMode !== "CLOSED") return true;
  return windowsCoverStay(input.windows, input.checkIn, input.checkOut);
}

/**
 * The database filter that narrows windows to the ones capable of covering this stay.
 *
 * A window contributes to covering `[checkIn, checkOut)` only if it overlaps it, so this
 * is a safe prefilter for the rule above: any window it drops covers none of the stay's
 * nights and cannot bridge to one that does. It is deliberately *looser* than the
 * "one window spanning everything" filter it replaces — the merge decides coverage, and
 * it can only do that if it is handed every window in play, including the neighbour that
 * a spanning-window query would have discarded.
 */
export function windowsOverlappingStay(checkIn: Date, checkOut: Date) {
  return { startDate: { lt: checkOut }, endDate: { gt: checkIn } };
}
