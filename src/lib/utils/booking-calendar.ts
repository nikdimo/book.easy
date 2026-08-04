import { addDays, differenceInCalendarDays, isAfter, isSameDay, startOfDay } from "date-fns";

export interface CalendarBlockedRange {
  from: Date;
  to: Date;
}

/**
 * Blocked-range start days, normalized to local midnight and sorted ascending, so the
 * lookups below can stop at the first block that starts after a candidate day instead
 * of scanning every range for every rendered calendar cell.
 */
export function blockedRangeStarts(
  ranges: CalendarBlockedRange[]
): Date[] {
  return ranges
    .map((range) => startOfDay(range.from))
    .sort((a, b) => a.getTime() - b.getTime());
}

/** The first blocked range that begins strictly after `date`, if any. */
export function nextBlockedRangeStart(
  date: Date,
  sortedBlockStarts: Date[]
): Date | undefined {
  const day = startOfDay(date);
  return sortedBlockStarts.find((start) => isAfter(start, day));
}

/**
 * How many nights a guest checking in on `date` can actually book before running into
 * the next blocked range.
 *
 * Stay nights are `[checkIn, checkOut)`, so the first blocked day is still a legal
 * check-out — it is the next guest's arrival day, not a night this guest occupies.
 * The run is therefore the plain calendar-day difference; subtracting one would lose a
 * night and wrongly reject an exact fit (block on Aug 10, check-in Aug 7, 3 nights).
 *
 * `Infinity` when nothing is blocked ahead.
 */
export function usableNightsFrom(
  date: Date,
  sortedBlockStarts: Date[]
): number {
  const nextStart = nextBlockedRangeStart(date, sortedBlockStarts);
  if (!nextStart) return Number.POSITIVE_INFINITY;
  return differenceInCalendarDays(nextStart, startOfDay(date));
}

/**
 * A check-in day is a dead end when the free run that follows it is shorter than the
 * minimum stay: every check-out the guest could reach is either inside the minimum
 * window or already booked, so the selection can never be completed.
 */
export function isDeadEndCheckIn(
  date: Date,
  minimumStayNights: number | undefined,
  sortedBlockStarts: Date[]
): boolean {
  if (!minimumStayNights || minimumStayNights < 2) return false;
  return usableNightsFrom(date, sortedBlockStarts) < minimumStayNights;
}

/**
 * The single blocked start that a pending check-in may use as its check-out.
 *
 * Only the *first* future block qualifies: reaching a later one would mean sleeping
 * through the nights of the earlier block. Undefined while no check-in is pending, so
 * a blocked start is never selectable as a check-in.
 */
export function checkoutBoundary(
  pendingCheckIn: Date | undefined,
  sortedBlockStarts: Date[]
): Date | undefined {
  if (!pendingCheckIn) return undefined;
  return nextBlockedRangeStart(pendingCheckIn, sortedBlockStarts);
}

/** True when `date` is the check-out boundary currently on offer. */
export function isCheckoutBoundaryDay(
  date: Date,
  boundary: Date | undefined
): boolean {
  return Boolean(boundary && isSameDay(startOfDay(date), boundary));
}

export interface CalendarSelection {
  from?: Date;
  to?: Date;
}

/**
 * The check-out boundary for the *whole* selection lifecycle, not just while a check-in
 * is pending.
 *
 * `checkoutBoundary` above only answers for a pending check-in, which left a gap: the
 * moment the guest clicked the boundary the range completed, the exception vanished,
 * and the day they had just legitimately chosen dropped back inside its blocked range —
 * so a valid check-out rendered struck through and disabled.
 *
 * The exception therefore has to survive completion, but only for the day the guest
 * actually landed on:
 *
 * - No `from` — nothing selected, so no exception. The blocked start is not a check-in.
 * - `from` only — the first blocked day reachable from it is offered as a check-out.
 * - `from` and `to` — the exception holds **only while `to` is exactly that first
 *   reachable day**. A `to` anywhere else means the guest is not sitting on an exact
 *   fit, so the block is whole again.
 *
 * Only the first reachable block ever qualifies. A later one would mean sleeping
 * through the nights of an earlier block, which `usableNightsFrom` already rules out.
 */
export function selectionCheckoutBoundary(
  selection: CalendarSelection | undefined,
  sortedBlockStarts: Date[]
): Date | undefined {
  const from = selection?.from;
  if (!from) return undefined;

  const firstReachable = nextBlockedRangeStart(from, sortedBlockStarts);
  if (!firstReachable) return undefined;
  if (!selection?.to) return firstReachable;

  return isSameDay(startOfDay(selection.to), firstReachable)
    ? firstReachable
    : undefined;
}

/**
 * Whether a day is genuinely blocked, ignoring any check-out exception.
 *
 * This is the question "may the guest *check in* here", which stays no even while the
 * day is temporarily enabled as a check-out. Used to guard the transition out of a
 * completed exact fit — see the note in the picker's commit handler.
 */
export function isBlockedDay(
  date: Date,
  ranges: CalendarBlockedRange[]
): boolean {
  const day = startOfDay(date);
  return ranges.some(
    (range) =>
      day >= startOfDay(range.from) && day <= startOfDay(range.to)
  );
}

/**
 * The disabled ranges the calendar should apply for the current selection state.
 *
 * The matcher can only disable, never re-enable, so the boundary day is carved out of
 * its own range: the range now starts the day after, leaving every later blocked night
 * disabled. A single-day block collapses to nothing and is dropped.
 */
export function disabledRangesForSelection(
  ranges: CalendarBlockedRange[],
  boundary: Date | undefined
): CalendarBlockedRange[] {
  if (!boundary) return ranges;

  return ranges.flatMap((range) => {
    if (!isSameDay(startOfDay(range.from), boundary)) return [range];
    const from = addDays(startOfDay(range.from), 1);
    if (isAfter(from, startOfDay(range.to))) return [];
    return [{ from, to: range.to }];
  });
}
