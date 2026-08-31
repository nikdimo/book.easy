import {
  addDaysToYmd,
  compareYmd,
  eachYmdInclusive,
} from "@/lib/utils/date-only";

/** An inclusive run of civil dates the host is about to act on. */
export interface CalendarSelection {
  start: string;
  end: string;
  /**
   * Explicit dates selected with Ctrl/⌘-click. Omitted for the normal contiguous
   * range gesture, which keeps the common path compact.
   */
  dates?: string[];
}

export type SelectionRejection = "past";

export interface SelectionResult {
  selection: CalendarSelection | null;
  /**
   * The end a later Shift-extension grows *from*.
   *
   * Not derivable from the range itself: `{ start, end }` is ordered, so a run built
   * backwards from the 15th to the 12th is stored identically to one built forwards
   * from the 12th. Shift-arrow then has to know which end the host planted, or the
   * first keystroke back towards the anchor silently re-anchors the selection at the
   * other end and the run grows in the wrong direction.
   */
  anchor: string | null;
  /** Set when the click was refused, so the UI can say why instead of doing nothing. */
  rejected?: SelectionRejection;
}

function ordered(a: string, b: string): CalendarSelection {
  return compareYmd(a, b) <= 0 ? { start: a, end: b } : { start: b, end: a };
}

function selectionFromDates(dates: Iterable<string>): CalendarSelection | null {
  const selected = [...new Set(dates)].sort(compareYmd);
  if (selected.length === 0) return null;
  return {
    start: selected[0],
    end: selected[selected.length - 1],
    dates: selected,
  };
}

export function isPastDate(date: string, today: string): boolean {
  return compareYmd(date, today) < 0;
}

/**
 * One click on a date cell.
 *
 * Nothing here mutates anything: a selection is a question ("these dates"), and the
 * answer is only ever committed from the review step.
 *
 * - first click starts a single-date selection
 * - a second click completes a contiguous range in either direction
 * - clicking the single selected date again clears it
 * - clicking with a completed range already in place starts over
 *
 * Past dates are refused outright rather than clamped: a host who clicked yesterday
 * meant to click something, and silently selecting a different date would be worse
 * than telling them the date has gone.
 */
export function selectDate(
  current: CalendarSelection | null,
  date: string,
  today: string,
): SelectionResult {
  if (isPastDate(date, today)) {
    return { selection: current, anchor: current?.start ?? null, rejected: "past" };
  }
  if (!current) return { selection: { start: date, end: date }, anchor: date };
  if (current.start === current.end) {
    if (current.start === date) return { selection: null, anchor: null };
    // The two-click range keeps its *first* click as the anchor, so Shift-arrow
    // afterwards grows from the date the host actually planted.
    return { selection: ordered(current.start, date), anchor: current.start };
  }
  return { selection: { start: date, end: date }, anchor: date };
}

/**
 * Shift-click / Shift-arrow: grow the run from its existing anchor.
 *
 * `anchor` is the date the host planted; without it the run can only grow from
 * `current.start`, which is the wrong end for any selection that was built backwards.
 * It is ignored when it has fallen into the past, because an anchor the host can no
 * longer click is not one the keyboard should keep extending from either.
 */
export function extendSelection(
  current: CalendarSelection | null,
  date: string,
  today: string,
  anchor?: string | null,
): SelectionResult {
  if (isPastDate(date, today)) {
    return {
      selection: current,
      anchor: anchor ?? current?.start ?? null,
      rejected: "past",
    };
  }
  const base =
    anchor && !isPastDate(anchor, today)
      ? anchor
      : current
        ? current.start
        : null;
  if (!base) return { selection: { start: date, end: date }, anchor: date };
  return { selection: ordered(base, date), anchor: base };
}

/**
 * Ctrl/⌘-click toggles exactly one date while preserving every other selected date.
 * Unlike a normal click, this may produce a non-contiguous selection.
 */
export function toggleDate(
  current: CalendarSelection | null,
  date: string,
  today: string,
): SelectionResult {
  if (isPastDate(date, today)) {
    return { selection: current, anchor: current?.start ?? null, rejected: "past" };
  }
  const selected = selectionDates(current);
  const next = selected.includes(date)
    ? selected.filter((selectedDate) => selectedDate !== date)
    : [...selected, date];
  const selection = selectionFromDates(next);
  return { selection, anchor: selection ? date : null };
}

/**
 * A whole run chosen in one gesture — a completed pointer drag.
 *
 * Unlike the click path this never toggles and never starts over: the host has already
 * shown both ends, so the only two answers are "this run" or, if either end has gone
 * into the past, a refusal. The anchor stays where the drag began, so a Shift-arrow
 * straight afterwards continues from the same end the drag did.
 */
export function selectRange(
  anchorDate: string,
  endDate: string,
  today: string,
): SelectionResult {
  if (isPastDate(anchorDate, today) || isPastDate(endDate, today)) {
    return { selection: null, anchor: null, rejected: "past" };
  }
  return { selection: ordered(anchorDate, endDate), anchor: anchorDate };
}

export function selectionDates(
  selection: CalendarSelection | null,
): string[] {
  if (!selection) return [];
  if (selection.dates) return selection.dates;
  return eachYmdInclusive(selection.start, selection.end);
}

export function selectionNights(selection: CalendarSelection | null): number {
  return selectionDates(selection).length;
}

/**
 * The `[checkIn, checkOut)` pair that the selected dates represent.
 *
 * Selecting a date means "this night", so checkout is the morning after the last
 * selected night — the same conversion the current calendar and every mutation
 * service already use.
 */
export function selectionRange(
  selection: CalendarSelection,
): { startDate: string; endDate: string } {
  return {
    startDate: selection.start,
    endDate: addDaysToYmd(selection.end, 1),
  };
}

export function isSelected(
  selection: CalendarSelection | null,
  date: string,
): boolean {
  if (!selection) return false;
  if (selection.dates) return selection.dates.includes(date);
  return (
    compareYmd(date, selection.start) >= 0 &&
    compareYmd(date, selection.end) <= 0
  );
}

export function selectionContainsPastDate(
  selection: CalendarSelection | null,
  today: string,
): boolean {
  if (!selection) return false;
  return isPastDate(selection.start, today);
}

/**
 * Switching property drops the pending selection.
 *
 * Dates mean different things on different listings — a range that is free on one is
 * mid-reservation on the next — so carrying a selection across would leave a half-
 * written edit pointing at dates the host never looked at. Same listing keeps it.
 */
export function selectionAfterListingSwitch(
  selection: CalendarSelection | null,
  previousListingId: string | null,
  nextListingId: string | null,
): CalendarSelection | null {
  return previousListingId === nextListingId ? selection : null;
}

/**
 * A selection a deep link asked for, narrowed to dates this calendar actually renders.
 *
 * A link can be old, bookmarked or hand-typed, so its range is a request rather than a
 * fact: dates before today cannot be acted on and dates past the horizon are not in the
 * stream at all. The overlap is what the host is shown; a range with no overlap selects
 * nothing, which is the same state as arriving with no range and is exactly what the
 * intent banner is there to prompt about.
 *
 * `horizonEnd` is the exclusive end used everywhere else here, so the last selectable
 * date is the day before it.
 */
export function clampSelectionToHorizon(
  selection: CalendarSelection,
  today: string,
  horizonEnd: string,
): CalendarSelection | null {
  const lastDate = addDaysToYmd(horizonEnd, -1);
  const start = compareYmd(selection.start, today) < 0 ? today : selection.start;
  const end = compareYmd(selection.end, lastDate) > 0 ? lastDate : selection.end;
  if (compareYmd(start, end) > 0) return null;
  return { start, end };
}
