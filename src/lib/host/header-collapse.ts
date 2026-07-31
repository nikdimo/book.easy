/**
 * Decides whether the collapsing mobile host header should hide, show, or stay put
 * for a given scroll event.
 *
 * The subtlety this exists to handle: the header is a flex sibling of the scroll
 * area, so collapsing it makes that area taller, which shrinks its maximum scrollTop,
 * which makes the browser clamp scrollTop downwards — and that clamp arrives as a
 * scroll event pointing the other way. At the bottom of a page that feedback loop
 * flips the header back and forth and the content visibly jumps.
 */

/** The header is ~72px with its border; leave margin so a toggle cannot clamp. */
export const HEADER_COLLAPSE_SLACK = 96;

/** Ignore sub-pixel and momentum jitter. */
export const HEADER_COLLAPSE_MIN_DELTA = 6;

/** Treat anything this close to the top as "at the top". */
export const HEADER_COLLAPSE_TOP_THRESHOLD = 8;

export interface HeaderCollapseInput {
  /** Current scroll offset of the scrolling element. */
  top: number;
  /** Its offset on the previous scroll event. */
  previous: number;
  /** Visible height of the scrolling element. */
  viewport: number;
  /** Full scrollable height of its content. */
  total: number;
  /** True while a text field has focus. */
  editing?: boolean;
  /** True while the post-toggle settling window is open. */
  locked?: boolean;
}

/**
 * Returns the header's next hidden state, or `null` to leave it unchanged.
 */
export function nextHeaderHidden({
  top,
  previous,
  viewport,
  total,
  editing = false,
  locked = false,
}: HeaderCollapseInput): boolean | null {
  // The echo from our own resize must not be read as user intent.
  if (locked) return null;

  // Collapsing while a field is focused makes iOS fight the keyboard for the
  // viewport and the input jumps under the user's thumb.
  if (editing) return null;

  // Back at the top the header always returns, whatever the delta says.
  if (top <= HEADER_COLLAPSE_TOP_THRESHOLD) return false;

  // Not enough room left below to absorb the height change — this is where the
  // oscillation starts, so make no decision at all here.
  if (total - (top + viewport) < HEADER_COLLAPSE_SLACK) return null;

  const delta = top - previous;
  if (Math.abs(delta) < HEADER_COLLAPSE_MIN_DELTA) return null;
  return delta > 0;
}
