import { describe, expect, it } from "vitest";
import {
  clampMonth,
  lastMonth,
  monthIntersectsRange,
  monthOf,
  monthsInWindow,
  shiftMonth,
} from "@/lib/host/v2/calendar-months";
import { extendSelection, isSelected } from "@/lib/host/v2/calendar-selection";
import { HORIZON_END, TODAY } from "./fixtures";

describe("monthOf", () => {
  it("takes the first of the month a date falls in", () => {
    expect(monthOf("2026-03-31")).toBe("2026-03-01");
    expect(monthOf("2026-03-01")).toBe("2026-03-01");
  });
});

describe("shiftMonth", () => {
  it("moves within a year", () => {
    expect(shiftMonth("2026-03-01", 1)).toBe("2026-04-01");
    expect(shiftMonth("2026-03-01", -1)).toBe("2026-02-01");
  });

  it("crosses the year boundary in both directions", () => {
    expect(shiftMonth("2026-12-01", 1)).toBe("2027-01-01");
    expect(shiftMonth("2026-01-01", -1)).toBe("2025-12-01");
    expect(shiftMonth("2026-03-01", 18)).toBe("2027-09-01");
    expect(shiftMonth("2026-03-01", -15)).toBe("2024-12-01");
  });
});

describe("lastMonth", () => {
  it("reads the exclusive horizon end back to the last loaded month", () => {
    expect(lastMonth("2027-09-10")).toBe("2027-09-01");
  });

  it("does not offer a month the window only touches by one day", () => {
    // The horizon ends the instant September starts, so September holds no loaded
    // data and must not become a month the host can scroll into.
    expect(lastMonth("2027-09-01")).toBe("2027-08-01");
  });
});

describe("monthsInWindow", () => {
  it("covers today's month through the last loaded month, inclusive", () => {
    const months = monthsInWindow(TODAY, HORIZON_END);
    expect(months[0]).toBe("2026-03-01");
    expect(months[months.length - 1]).toBe("2027-09-01");
    expect(months).toHaveLength(19);
  });

  it("runs in order with no gaps across the year boundary", () => {
    const months = monthsInWindow(TODAY, HORIZON_END);
    for (let position = 1; position < months.length; position += 1) {
      expect(months[position]).toBe(shiftMonth(months[position - 1], 1));
    }
    expect(months).toContain("2026-12-01");
    expect(months).toContain("2027-01-01");
  });

  it("still renders one month when the window is shorter than a month", () => {
    expect(monthsInWindow("2026-03-10", "2026-03-12")).toEqual(["2026-03-01"]);
  });
});

describe("clampMonth", () => {
  const months = monthsInWindow(TODAY, HORIZON_END);

  it("keeps a jump inside the loaded stream", () => {
    expect(clampMonth("2025-11-01", months)).toBe("2026-03-01");
    expect(clampMonth("2030-01-01", months)).toBe("2027-09-01");
  });

  it("leaves a month that is already in the stream alone", () => {
    expect(clampMonth("2026-08-01", months)).toBe("2026-08-01");
  });
});

describe("monthIntersectsRange", () => {
  it("matches the months a range actually reaches", () => {
    const range = { start: "2026-03-29", end: "2026-04-02" };
    expect(monthIntersectsRange("2026-02-01", range)).toBe(false);
    expect(monthIntersectsRange("2026-03-01", range)).toBe(true);
    expect(monthIntersectsRange("2026-04-01", range)).toBe(true);
    expect(monthIntersectsRange("2026-05-01", range)).toBe(false);
  });

  it("counts a range that only touches the last day of a month", () => {
    expect(
      monthIntersectsRange("2026-02-01", { start: "2026-02-28", end: "2026-03-04" }),
    ).toBe(true);
  });

  it("counts a range that only touches the first day of a month", () => {
    expect(
      monthIntersectsRange("2026-04-01", { start: "2026-03-20", end: "2026-04-01" }),
    ).toBe(true);
  });
});

/**
 * The stream mounts every month at once and narrows the selection per month, so a
 * range that spans a boundary has to stay whole: each month must both be told about it
 * and paint its own share of it.
 */
describe("selection across a month boundary", () => {
  it("keeps every date of a cross-month range selected", () => {
    const selection = extendSelection(
      { start: "2026-03-30", end: "2026-03-30" },
      "2026-04-02",
      TODAY,
    ).selection;

    expect(selection).toEqual({ start: "2026-03-30", end: "2026-04-02" });
    for (const date of ["2026-03-30", "2026-03-31", "2026-04-01", "2026-04-02"]) {
      expect(isSelected(selection, date)).toBe(true);
    }
    expect(isSelected(selection, "2026-03-29")).toBe(false);
    expect(isSelected(selection, "2026-04-03")).toBe(false);
  });

  it("reaches both months of the stream, and only those two", () => {
    const selection = { start: "2026-03-30", end: "2026-04-02" };
    const reached = monthsInWindow(TODAY, HORIZON_END).filter((month) =>
      monthIntersectsRange(month, selection),
    );
    expect(reached).toEqual(["2026-03-01", "2026-04-01"]);
  });

  it("spans a year boundary the same way", () => {
    const selection = { start: "2026-12-28", end: "2027-01-03" };
    const reached = monthsInWindow(TODAY, HORIZON_END).filter((month) =>
      monthIntersectsRange(month, selection),
    );
    expect(reached).toEqual(["2026-12-01", "2027-01-01"]);
    expect(isSelected(selection, "2027-01-01")).toBe(true);
  });
});
