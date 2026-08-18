import { describe, expect, it } from "vitest";
import {
  AUTO_SCROLL_EDGE_PX,
  AUTO_SCROLL_MAX_STEP_PX,
  autoScrollStep,
  beginDrag,
  cancelDrag,
  completeDrag,
  dragPreview,
  dragSelection,
  dragToDate,
  isDraggableDate,
  type DragBounds,
} from "@/lib/host/v2/calendar-drag";
import { HORIZON_END, TODAY } from "./fixtures";

const bounds: DragBounds = { today: TODAY, horizonEnd: HORIZON_END };

/** Press, then move across each date in turn, the way a pointer actually arrives. */
function drag(from: string, over: string[], scope: DragBounds = bounds) {
  const start = beginDrag({ date: from, pointerId: 1 }, scope);
  if (!start) return null;
  return over.reduce((state, date) => dragToDate(state, date, scope), start);
}

describe("starting a drag", () => {
  it("starts from a future date and is not yet a drag", () => {
    const state = beginDrag({ date: "2026-03-12", pointerId: 7 }, bounds);
    expect(state).toEqual({
      pointerId: 7,
      anchor: "2026-03-12",
      current: "2026-03-12",
      moved: false,
    });
    // Nothing is painted until the pointer has actually left the cell, so a press
    // that turns out to be a click never flickers a selection on the way.
    expect(dragPreview(state)).toBeNull();
  });

  it("starts from today itself", () => {
    expect(beginDrag({ date: TODAY, pointerId: 1 }, bounds)).not.toBeNull();
  });

  it("refuses to start on a past date", () => {
    expect(beginDrag({ date: "2026-03-09", pointerId: 1 }, bounds)).toBeNull();
  });

  it("refuses to start beyond the loaded horizon", () => {
    expect(beginDrag({ date: HORIZON_END, pointerId: 1 }, bounds)).toBeNull();
    expect(isDraggableDate(HORIZON_END, bounds)).toBe(false);
    expect(isDraggableDate("2027-09-09", bounds)).toBe(true);
  });
});

describe("dragging", () => {
  it("builds an inclusive run forwards", () => {
    const state = drag("2026-03-12", ["2026-03-13", "2026-03-14", "2026-03-15"])!;
    expect(state.moved).toBe(true);
    expect(dragSelection(state)).toEqual({
      start: "2026-03-12",
      end: "2026-03-15",
    });
  });

  it("builds an inclusive run backwards", () => {
    const state = drag("2026-03-15", ["2026-03-14", "2026-03-13", "2026-03-12"])!;
    expect(dragSelection(state)).toEqual({
      start: "2026-03-12",
      end: "2026-03-15",
    });
    // The stored range is ordered either way, so the direction only survives in the
    // anchor — which is what a Shift-arrow afterwards has to grow from.
    expect(state.anchor).toBe("2026-03-15");
  });

  it("crosses a month boundary", () => {
    const state = drag("2026-03-30", ["2026-03-31", "2026-04-01", "2026-04-02"])!;
    expect(dragSelection(state)).toEqual({
      start: "2026-03-30",
      end: "2026-04-02",
    });
  });

  it("crosses a year boundary", () => {
    const state = drag("2026-12-30", ["2026-12-31", "2027-01-01"])!;
    expect(dragSelection(state)).toEqual({
      start: "2026-12-30",
      end: "2027-01-01",
    });
  });

  it("follows the pointer back the other way without re-anchoring", () => {
    const state = drag("2026-03-12", [
      "2026-03-16",
      "2026-03-15",
      "2026-03-10",
    ])!;
    expect(dragSelection(state)).toEqual({
      start: "2026-03-10",
      end: "2026-03-12",
    });
    expect(state.anchor).toBe("2026-03-12");
  });

  it("keeps the same state object when the pointer stays on one date", () => {
    const start = beginDrag({ date: "2026-03-12", pointerId: 1 }, bounds)!;
    // Referential equality is what stops a pointermove storm from re-rendering a
    // month that would look exactly the same.
    expect(dragToDate(start, "2026-03-12", bounds)).toBe(start);
  });

  it("ignores a past date instead of dragging into it", () => {
    const state = drag("2026-03-12", ["2026-03-11", "2026-03-09"])!;
    expect(state.current).toBe("2026-03-11");
    expect(dragSelection(state)).toEqual({
      start: "2026-03-11",
      end: "2026-03-12",
    });
  });

  it("ignores a date past the horizon instead of dragging into it", () => {
    const state = drag("2027-09-08", ["2027-09-09", "2027-09-11"])!;
    expect(state.current).toBe("2027-09-09");
  });

  it("stays a drag once it has been one, even back on its own anchor", () => {
    const state = drag("2026-03-12", ["2026-03-18", "2026-03-12"])!;
    expect(state.moved).toBe(true);
    expect(dragSelection(state)).toEqual({
      start: "2026-03-12",
      end: "2026-03-12",
    });
  });
});

describe("finishing a drag", () => {
  it("commits the run and swallows the click that follows", () => {
    const state = drag("2026-03-12", ["2026-03-14"])!;
    expect(completeDrag(state)).toEqual({
      selection: { start: "2026-03-12", end: "2026-03-14" },
      anchor: "2026-03-12",
      suppressClick: true,
    });
  });

  it("commits the anchor of a backwards drag, not the range's start", () => {
    const state = drag("2026-03-14", ["2026-03-12"])!;
    expect(completeDrag(state).anchor).toBe("2026-03-14");
  });

  it("leaves a press that never left its cell to behave as a click", () => {
    const state = beginDrag({ date: "2026-03-12", pointerId: 1 }, bounds)!;
    // No selection is committed and the click is not swallowed, so the ordinary
    // one-click and two-click paths keep working untouched.
    expect(completeDrag(state)).toEqual({
      selection: null,
      anchor: null,
      suppressClick: false,
    });
  });

  it("commits nothing when there was no drag at all", () => {
    expect(completeDrag(null)).toEqual({
      selection: null,
      anchor: null,
      suppressClick: false,
    });
  });
});

describe("cancelling a drag", () => {
  it("commits nothing but still swallows the click of an abandoned drag", () => {
    const state = drag("2026-03-12", ["2026-03-16"])!;
    expect(cancelDrag(state)).toEqual({
      selection: null,
      anchor: null,
      suppressClick: true,
    });
  });

  it("leaves the click alone when the gesture had not become a drag", () => {
    const state = beginDrag({ date: "2026-03-12", pointerId: 1 }, bounds)!;
    expect(cancelDrag(state)).toEqual({
      selection: null,
      anchor: null,
      suppressClick: false,
    });
  });

  it("survives being cancelled when nothing was in flight", () => {
    expect(cancelDrag(null)).toEqual({
      selection: null,
      anchor: null,
      suppressClick: false,
    });
  });
});

describe("auto-scroll", () => {
  // A 600px-tall pane sitting 100px down the viewport.
  const pane = { top: 100, bottom: 700 };

  it("does nothing while the pointer is in the middle", () => {
    expect(autoScrollStep({ pointerY: 400, ...pane })).toBe(0);
  });

  it("does nothing exactly at the inner edge of either band", () => {
    expect(autoScrollStep({ pointerY: pane.top + AUTO_SCROLL_EDGE_PX, ...pane })).toBe(0);
    expect(
      autoScrollStep({ pointerY: pane.bottom - AUTO_SCROLL_EDGE_PX, ...pane }),
    ).toBe(0);
  });

  it("scrolls up near the top and down near the bottom", () => {
    expect(autoScrollStep({ pointerY: pane.top + 10, ...pane })).toBeLessThan(0);
    expect(autoScrollStep({ pointerY: pane.bottom - 10, ...pane })).toBeGreaterThan(0);
  });

  it("ramps with depth into the band rather than switching on at full speed", () => {
    const shallow = autoScrollStep({ pointerY: pane.top + 50, ...pane });
    const deep = autoScrollStep({ pointerY: pane.top + 5, ...pane });
    expect(shallow).toBeLessThan(0);
    expect(deep).toBeLessThan(shallow);
  });

  it("caps at the maximum step, at the edge and beyond it", () => {
    expect(autoScrollStep({ pointerY: pane.top, ...pane })).toBe(
      -AUTO_SCROLL_MAX_STEP_PX,
    );
    // Dragged clean off the top of the pane: fast, but not accelerating away.
    expect(autoScrollStep({ pointerY: -400, ...pane })).toBe(
      -AUTO_SCROLL_MAX_STEP_PX,
    );
    expect(autoScrollStep({ pointerY: pane.bottom, ...pane })).toBe(
      AUTO_SCROLL_MAX_STEP_PX,
    );
    expect(autoScrollStep({ pointerY: 4000, ...pane })).toBe(
      AUTO_SCROLL_MAX_STEP_PX,
    );
  });

  it("reads against the viewport when the document is the scroller", () => {
    // Below `md` the pane is not its own scroller; the bands sit at the viewport.
    const viewport = { top: 0, bottom: 800 };
    expect(autoScrollStep({ pointerY: 4, ...viewport })).toBeLessThan(0);
    expect(autoScrollStep({ pointerY: 400, ...viewport })).toBe(0);
    expect(autoScrollStep({ pointerY: 796, ...viewport })).toBeGreaterThan(0);
  });

  it("does nothing in a pane with no height to scroll", () => {
    expect(autoScrollStep({ pointerY: 0, top: 0, bottom: 0 })).toBe(0);
  });
});
