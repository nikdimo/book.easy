/**
 * Pointer-drag selection, as arithmetic.
 *
 * The browser half of a drag — where the pointer is, which cell is under it, when to
 * scroll — belongs to the component. Everything that decides *what the host has
 * selected* lives here, in plain functions over plain values, so the parts that can be
 * wrong in a way a host would notice are the parts that can be tested: which run a
 * drag produces, whether the gesture was a drag at all, and whether the click the
 * browser sends afterwards has to be swallowed.
 *
 * A drag is deliberately not allowed to answer a different question than a click does.
 * It produces the same `CalendarSelection` the click path produces, it refuses the same
 * dates, and it commits through the same review step. Nothing here mutates anything.
 */

import { compareYmd } from "@/lib/utils/date-only";
import type { CalendarSelection } from "@/lib/host/v2/calendar-selection";

/**
 * How far into the scroller's edge the pointer has to be before the viewport starts
 * moving under it, and the most it moves in one frame.
 *
 * The band is a little taller than a calendar row so a host dragging towards the edge
 * enters it before running out of cells, and the step is small enough that a month
 * boundary can still be stopped on.
 */
export const AUTO_SCROLL_EDGE_PX = 56;
export const AUTO_SCROLL_MAX_STEP_PX = 18;

/** The window of dates a drag is allowed to touch: today up to the loaded horizon. */
export interface DragBounds {
  today: string;
  /** Exclusive. */
  horizonEnd: string;
}

export interface DragState {
  /** Only events from the pointer that started the drag are listened to. */
  pointerId: number;
  /** Where the drag began. The run always grows from here. */
  anchor: string;
  /** The date under the pointer now. */
  current: string;
  /**
   * True once the pointer has reached a different date.
   *
   * Sticky: a drag out to the 18th and back to the 12th is still a drag, and the
   * click the browser sends on release still has to be swallowed. It is also the whole
   * of the click/drag distinction — the cell is the unit of selection, so a wobble
   * that never leaves the cell the host pressed is a click and is left to behave like
   * one, without a pixel threshold to tune.
   */
  moved: boolean;
}

/** Past dates and dates beyond the loaded horizon can neither start nor join a drag. */
export function isDraggableDate(date: string, bounds: DragBounds): boolean {
  return (
    compareYmd(date, bounds.today) >= 0 &&
    compareYmd(date, bounds.horizonEnd) < 0
  );
}

/** Pointer down on a cell. Returns null when that cell is not one to drag from. */
export function beginDrag(
  origin: { date: string; pointerId: number },
  bounds: DragBounds,
): DragState | null {
  if (!isDraggableDate(origin.date, bounds)) return null;
  return {
    pointerId: origin.pointerId,
    anchor: origin.date,
    current: origin.date,
    moved: false,
  };
}

/**
 * The pointer is now over `date`.
 *
 * Returns the same object when nothing has changed, so the component can set state on
 * every pointer move without re-rendering a month that would look identical — and an
 * ineligible date is ignored outright rather than clamped, leaving the preview on the
 * last date the host could actually have meant.
 */
export function dragToDate(
  state: DragState,
  date: string,
  bounds: DragBounds,
): DragState {
  if (!isDraggableDate(date, bounds)) return state;
  if (date === state.current) return state;
  return { ...state, current: date, moved: true };
}

/** The inclusive run the drag currently describes, in either direction. */
export function dragSelection(state: DragState): CalendarSelection {
  return compareYmd(state.anchor, state.current) <= 0
    ? { start: state.anchor, end: state.current }
    : { start: state.current, end: state.anchor };
}

/**
 * What the calendar should paint mid-drag, or null when the gesture is still
 * indistinguishable from a click and the committed selection should keep showing.
 */
export function dragPreview(state: DragState | null): CalendarSelection | null {
  return state?.moved ? dragSelection(state) : null;
}

export interface DragCompletion {
  /** The run to commit, or null when this was really a click. */
  selection: CalendarSelection | null;
  /**
   * The end the drag grew from. Carried separately because `selection` is ordered and
   * a backwards drag is stored identically to a forwards one — a Shift-arrow straight
   * after the release has to continue from the end the host actually pressed on.
   */
  anchor: string | null;
  /**
   * Whether the `click` the browser sends after a drag has to be swallowed. Without
   * this the click lands on whichever cell the pointer was released over and, because
   * a click on a completed range starts over, wipes the run that was just drawn.
   */
  suppressClick: boolean;
}

/** Pointer up. */
export function completeDrag(state: DragState | null): DragCompletion {
  if (!state?.moved) {
    return { selection: null, anchor: null, suppressClick: false };
  }
  return {
    selection: dragSelection(state),
    anchor: state.anchor,
    suppressClick: true,
  };
}

/**
 * Pointer cancelled, Escape pressed, the window blurred, or the host switched property
 * mid-gesture. Nothing is selected, but a drag that had already drawn a run still owes
 * the click a suppression — the button is often still down, and its release would
 * otherwise select the cell the drag was abandoned over.
 */
export function cancelDrag(state: DragState | null): DragCompletion {
  return { selection: null, anchor: null, suppressClick: Boolean(state?.moved) };
}

/**
 * How far to scroll this frame while the pointer sits near an edge of the scroller.
 *
 * Negative scrolls up, positive down, zero leaves it alone. The speed ramps with depth
 * into the band so the calendar creeps at the boundary and runs at the very edge, and
 * a pointer dragged clean past the edge is treated as being at the edge rather than
 * accelerating away.
 *
 * `top` and `bottom` are viewport coordinates of whatever is actually scrolling: the
 * pane's own box from `md` up, and the viewport itself below it, where the document is
 * the scroller.
 */
export function autoScrollStep(input: {
  pointerY: number;
  top: number;
  bottom: number;
  edge?: number;
  maxStep?: number;
}): number {
  const edge = input.edge ?? AUTO_SCROLL_EDGE_PX;
  const maxStep = input.maxStep ?? AUTO_SCROLL_MAX_STEP_PX;
  if (edge <= 0 || input.bottom - input.top <= 0) return 0;

  const intoTop = input.top + edge - input.pointerY;
  if (intoTop > 0) {
    return -Math.ceil((maxStep * Math.min(intoTop, edge)) / edge);
  }
  const intoBottom = input.pointerY - (input.bottom - edge);
  if (intoBottom > 0) {
    return Math.ceil((maxStep * Math.min(intoBottom, edge)) / edge);
  }
  return 0;
}
