/**
 * Scroll geometry for the calendar's month stream.
 *
 * The stream reads and moves in two different coordinate systems. From `md` up the pane
 * is its own scroller inside a fixed app frame, so a month's position is relative to the
 * pane. Below `md` the shell is an ordinary scrolling document and the pane scrolls with
 * it — the pane and its months move together, so measuring a month against the pane's own
 * top says the same thing at every scroll offset and the reading never changes. What is
 * fixed on a phone is the chrome pinned to the top of the viewport, and that is what a
 * month has to be measured against.
 *
 * Kept here as arithmetic over plain numbers so both readings can be tested without a
 * layout engine.
 */

/** The calendar's own sticky month toolbar below `md` (`h-10`). */
export const MOBILE_MONTH_TOOLBAR_HEIGHT = 40;

/** The stream's sticky weekday row below `md` (`h-7`). */
export const MOBILE_WEEKDAY_HEIGHT = 28;

/**
 * Everything pinned to the top of the viewport below `md`. A month caption sitting at
 * this line is the first thing under the chrome rather than behind it, which is both
 * where a jump should land a month and where a month starts being the one being read.
 */
export const MOBILE_STICKY_OFFSET =
  MOBILE_MONTH_TOOLBAR_HEIGHT + MOBILE_WEEKDAY_HEIGHT;

/** Browser scroll positions can finish on a fractional pixel. */
export const SCROLL_END_EPSILON = 2;

/**
 * A few pixels of slack below the line, so a month boundary resting exactly on it does
 * not flicker the label back a month on every sub-pixel scroll.
 */
export const MONTH_READ_SLACK = 12;

export type MonthStreamScrollMode = "container" | "document";

/**
 * Which coordinate system is in play, asked of the element rather than of a media query:
 * the pane only overflows its own box when it is the scroller. A pane that fits its
 * content is not scrolling anything, so the document is the only thing that can move.
 */
export function monthStreamScrollMode(pane: {
  scrollHeight: number;
  clientHeight: number;
}): MonthStreamScrollMode {
  return pane.scrollHeight > pane.clientHeight + 1 ? "container" : "document";
}

/**
 * The viewport line a month has to have passed to count as the one being read: the top
 * of the pane when the pane scrolls, and the underside of the sticky chrome when the
 * document does.
 */
export function monthReadThreshold(input: {
  mode: MonthStreamScrollMode;
  /** `getBoundingClientRect().top` of the pane. Only used in `container` mode. */
  paneTop: number;
  stickyOffset?: number;
  slack?: number;
}): number {
  const base =
    input.mode === "container"
      ? input.paneTop
      : (input.stickyOffset ?? MOBILE_STICKY_OFFSET);
  return base + (input.slack ?? MONTH_READ_SLACK);
}

/**
 * The last month whose block has passed the threshold — the one the host is reading.
 * `sections` must be in document order, which is what `querySelectorAll` gives.
 */
export function pickVisibleMonth(
  sections: ReadonlyArray<{ month: string; top: number }>,
  threshold: number,
  fallback: string,
): string {
  let visible = fallback;
  for (const section of sections) {
    if (section.top > threshold) break;
    if (section.month) visible = section.month;
  }
  return visible;
}

/** Whether an element-owned scroll pane is at the end of its attainable range. */
export function containerStreamAtEnd(input: {
  scrollTop: number;
  clientHeight: number;
  scrollHeight: number;
  epsilon?: number;
}): boolean {
  return (
    input.scrollTop + input.clientHeight >=
    input.scrollHeight - (input.epsilon ?? SCROLL_END_EPSILON)
  );
}

/** Whether the bottom of a document-scrolled stream has entered the viewport. */
export function documentStreamAtEnd(input: {
  streamBottom: number;
  viewportHeight: number;
  epsilon?: number;
}): boolean {
  return (
    input.streamBottom <=
    input.viewportHeight + (input.epsilon ?? SCROLL_END_EPSILON)
  );
}

/**
 * Where the pane has to be scrolled to put a month's first row on top. `offsetTop` is
 * measured against the pane because the pane is the positioned ancestor.
 */
export function containerScrollTop(sectionOffsetTop: number): number {
  return Math.max(0, sectionOffsetTop);
}

/**
 * Where the document has to be scrolled to put a month's caption just under the sticky
 * chrome. Without the offset the caption lands behind the header and the month looks
 * like it started a row or two in.
 */
export function documentScrollTop(input: {
  /** `getBoundingClientRect().top` of the month section, i.e. viewport-relative. */
  sectionTop: number;
  scrollY: number;
  stickyOffset?: number;
}): number {
  return Math.max(
    0,
    input.sectionTop + input.scrollY - (input.stickyOffset ?? MOBILE_STICKY_OFFSET),
  );
}
