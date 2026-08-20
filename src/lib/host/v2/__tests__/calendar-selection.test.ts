import { describe, expect, it } from "vitest";
import {
  extendSelection,
  isSelected,
  selectDate,
  selectRange,
  selectionAfterListingSwitch,
  selectionContainsPastDate,
  selectionDates,
  selectionNights,
  selectionRange,
  toggleDate,
  type CalendarSelection,
} from "@/lib/host/v2/calendar-selection";
import { addDaysToYmd } from "@/lib/utils/date-only";
import { TODAY } from "./fixtures";

describe("selectDate", () => {
  it("starts a single-date selection from nothing", () => {
    expect(selectDate(null, "2026-03-12", TODAY).selection).toEqual({
      start: "2026-03-12",
      end: "2026-03-12",
    });
  });

  it("completes a range on the second click, in either direction", () => {
    const forward = selectDate(
      { start: "2026-03-12", end: "2026-03-12" },
      "2026-03-15",
      TODAY,
    );
    expect(forward.selection).toEqual({ start: "2026-03-12", end: "2026-03-15" });

    const backward = selectDate(
      { start: "2026-03-15", end: "2026-03-15" },
      "2026-03-12",
      TODAY,
    );
    expect(backward.selection).toEqual({ start: "2026-03-12", end: "2026-03-15" });
  });

  it("clears when the single selected date is clicked again", () => {
    expect(
      selectDate({ start: "2026-03-12", end: "2026-03-12" }, "2026-03-12", TODAY)
        .selection,
    ).toBeNull();
  });

  it("starts over when a completed range is already in place", () => {
    expect(
      selectDate({ start: "2026-03-12", end: "2026-03-15" }, "2026-03-20", TODAY)
        .selection,
    ).toEqual({ start: "2026-03-20", end: "2026-03-20" });
  });

  it("refuses a past date and leaves the selection untouched", () => {
    const current = { start: "2026-03-12", end: "2026-03-12" };
    const result = selectDate(current, "2026-03-09", TODAY);
    expect(result.rejected).toBe("past");
    expect(result.selection).toBe(current);
  });

  it("accepts today itself", () => {
    expect(selectDate(null, TODAY, TODAY).rejected).toBeUndefined();
  });

  it("cannot produce a range that reaches into the past", () => {
    const first = selectDate(null, TODAY, TODAY).selection;
    const second = selectDate(first, "2026-03-01", TODAY);
    expect(second.rejected).toBe("past");
    expect(selectionContainsPastDate(second.selection, TODAY)).toBe(false);
  });
});

describe("toggleDate", () => {
  it("adds and removes individual dates without filling the gap between them", () => {
    const first = toggleDate(null, "2026-03-12", TODAY);
    const second = toggleDate(first.selection, "2026-03-15", TODAY);

    expect(selectionDates(second.selection)).toEqual([
      "2026-03-12",
      "2026-03-15",
    ]);
    expect(isSelected(second.selection, "2026-03-13")).toBe(false);

    const removed = toggleDate(second.selection, "2026-03-12", TODAY);
    expect(selectionDates(removed.selection)).toEqual(["2026-03-15"]);
  });
});

describe("extendSelection", () => {
  it("grows the run from its anchor", () => {
    expect(
      extendSelection({ start: "2026-03-12", end: "2026-03-13" }, "2026-03-18", TODAY)
        .selection,
    ).toEqual({ start: "2026-03-12", end: "2026-03-18" });
  });

  it("still refuses past dates", () => {
    expect(
      extendSelection({ start: "2026-03-12", end: "2026-03-13" }, "2026-03-01", TODAY)
        .rejected,
    ).toBe("past");
  });

  it("keeps the selection and the anchor when a date is refused", () => {
    const current = { start: "2026-03-12", end: "2026-03-13" };
    const result = extendSelection(current, "2026-03-01", TODAY, "2026-03-13");
    expect(result.selection).toBe(current);
    expect(result.anchor).toBe("2026-03-13");
  });

  it("grows from the given anchor rather than the range's start", () => {
    // A run built backwards from the 15th is stored as { 12, 15 }; without the
    // anchor, extending it would grow from the 12th and invert the gesture.
    const result = extendSelection(
      { start: "2026-03-12", end: "2026-03-15" },
      "2026-03-14",
      TODAY,
      "2026-03-15",
    );
    expect(result.selection).toEqual({ start: "2026-03-14", end: "2026-03-15" });
    expect(result.anchor).toBe("2026-03-15");
  });

  it("ignores an anchor that has fallen into the past", () => {
    const result = extendSelection(
      { start: "2026-03-12", end: "2026-03-15" },
      "2026-03-18",
      TODAY,
      "2026-03-01",
    );
    expect(result.selection).toEqual({ start: "2026-03-12", end: "2026-03-18" });
  });

  it("starts a run between the focused date and the new one", () => {
    // The first Shift-arrow from a bare focus ring: the date the host was standing
    // on has to join the run, not be left behind by it.
    const result = extendSelection(null, "2026-03-13", TODAY, "2026-03-12");
    expect(result.selection).toEqual({ start: "2026-03-12", end: "2026-03-13" });
    expect(result.anchor).toBe("2026-03-12");
  });
});

/**
 * Shift-arrow, as the workspace drives it: the anchor is whatever the last result
 * reported, and a keystroke is `extendSelection` from the focused date to the next.
 */
describe("Shift-arrow keyboard extension", () => {
  function press(
    state: { selection: CalendarSelection | null; anchor: string | null },
    from: string,
    days: number,
  ) {
    const to = addDaysToYmd(from, days);
    const anchor = state.selection
      ? (state.anchor ?? state.selection.start)
      : from;
    const result = extendSelection(state.selection, to, TODAY, anchor);
    return { state: result, focus: result.rejected ? from : to };
  }

  const start = { selection: null as CalendarSelection | null, anchor: null };

  it("extends right one day at a time", () => {
    let step = press(start, "2026-03-12", 1);
    expect(step.state.selection).toEqual({ start: "2026-03-12", end: "2026-03-13" });
    step = press(step.state, step.focus, 1);
    expect(step.state.selection).toEqual({ start: "2026-03-12", end: "2026-03-14" });
  });

  it("extends left one day at a time", () => {
    let step = press(start, "2026-03-20", -1);
    expect(step.state.selection).toEqual({ start: "2026-03-19", end: "2026-03-20" });
    step = press(step.state, step.focus, -1);
    expect(step.state.selection).toEqual({ start: "2026-03-18", end: "2026-03-20" });
    expect(step.state.anchor).toBe("2026-03-20");
  });

  it("extends down a whole week", () => {
    const step = press(start, "2026-03-12", 7);
    expect(step.state.selection).toEqual({ start: "2026-03-12", end: "2026-03-19" });
  });

  it("extends up a whole week", () => {
    const step = press(start, "2026-03-20", -7);
    expect(step.state.selection).toEqual({ start: "2026-03-13", end: "2026-03-20" });
  });

  it("shrinks back towards the anchor rather than re-anchoring", () => {
    let step = press(start, "2026-03-20", -7);
    expect(step.state.selection).toEqual({ start: "2026-03-13", end: "2026-03-20" });
    step = press(step.state, step.focus, 1);
    expect(step.state.selection).toEqual({ start: "2026-03-14", end: "2026-03-20" });
    step = press(step.state, step.focus, 7);
    expect(step.state.selection).toEqual({ start: "2026-03-20", end: "2026-03-21" });
  });

  it("crosses a month boundary in either direction", () => {
    const forward = press(start, "2026-03-29", 7);
    expect(forward.state.selection).toEqual({
      start: "2026-03-29",
      end: "2026-04-05",
    });
    const backward = press(start, "2026-04-02", -7);
    expect(backward.state.selection).toEqual({
      start: "2026-03-26",
      end: "2026-04-02",
    });
  });

  it("refuses to extend into the past and keeps what was already selected", () => {
    const seeded = press(start, TODAY, 1);
    const blocked = press(seeded.state, TODAY, -1);
    expect(blocked.state.rejected).toBe("past");
    expect(blocked.state.selection).toEqual({ start: TODAY, end: "2026-03-11" });
    expect(blocked.focus).toBe(TODAY);
  });
});

describe("selectRange", () => {
  it("orders a forward drag", () => {
    const result = selectRange("2026-03-12", "2026-03-15", TODAY);
    expect(result.selection).toEqual({ start: "2026-03-12", end: "2026-03-15" });
    expect(result.anchor).toBe("2026-03-12");
  });

  it("orders a backward drag and keeps the end it started from", () => {
    const result = selectRange("2026-03-15", "2026-03-12", TODAY);
    expect(result.selection).toEqual({ start: "2026-03-12", end: "2026-03-15" });
    expect(result.anchor).toBe("2026-03-15");
  });

  it("accepts a single-date run", () => {
    expect(selectRange("2026-03-12", "2026-03-12", TODAY).selection).toEqual({
      start: "2026-03-12",
      end: "2026-03-12",
    });
  });

  it("refuses either end in the past", () => {
    expect(selectRange("2026-03-01", "2026-03-15", TODAY).rejected).toBe("past");
    expect(selectRange("2026-03-15", "2026-03-01", TODAY).rejected).toBe("past");
  });
});

describe("anchors reported by the click path", () => {
  it("anchors a fresh single-date selection on the date clicked", () => {
    expect(selectDate(null, "2026-03-12", TODAY).anchor).toBe("2026-03-12");
  });

  it("keeps the first click as the anchor of a two-click range", () => {
    const first = selectDate(null, "2026-03-15", TODAY);
    const second = selectDate(first.selection, "2026-03-12", TODAY);
    expect(second.selection).toEqual({ start: "2026-03-12", end: "2026-03-15" });
    // Anchored where the host started, so a Shift-arrow now grows from the 15th.
    expect(second.anchor).toBe("2026-03-15");
  });

  it("drops the anchor when the selection is cleared", () => {
    const first = selectDate(null, "2026-03-12", TODAY);
    expect(selectDate(first.selection, "2026-03-12", TODAY).anchor).toBeNull();
  });

  it("re-anchors when a completed range is clicked past", () => {
    expect(
      selectDate({ start: "2026-03-12", end: "2026-03-15" }, "2026-03-20", TODAY)
        .anchor,
    ).toBe("2026-03-20");
  });
});

describe("selection helpers", () => {
  it("expands an inclusive run of dates", () => {
    expect(selectionDates({ start: "2026-03-12", end: "2026-03-14" })).toEqual([
      "2026-03-12",
      "2026-03-13",
      "2026-03-14",
    ]);
    expect(selectionNights({ start: "2026-03-12", end: "2026-03-14" })).toBe(3);
  });

  it("converts to the exclusive checkout boundary the services expect", () => {
    expect(selectionRange({ start: "2026-03-12", end: "2026-03-14" })).toEqual({
      startDate: "2026-03-12",
      endDate: "2026-03-15",
    });
  });

  it("knows which dates are inside the selection", () => {
    const selection = { start: "2026-03-12", end: "2026-03-14" };
    expect(isSelected(selection, "2026-03-13")).toBe(true);
    expect(isSelected(selection, "2026-03-15")).toBe(false);
    expect(isSelected(null, "2026-03-13")).toBe(false);
  });
});

describe("selectionAfterListingSwitch", () => {
  it("drops the selection when the property changes", () => {
    expect(
      selectionAfterListingSwitch(
        { start: "2026-03-12", end: "2026-03-14" },
        "listing-1",
        "listing-2",
      ),
    ).toBeNull();
  });

  it("keeps the selection when the same property is re-selected", () => {
    const selection = { start: "2026-03-12", end: "2026-03-14" };
    expect(
      selectionAfterListingSwitch(selection, "listing-1", "listing-1"),
    ).toBe(selection);
  });
});
