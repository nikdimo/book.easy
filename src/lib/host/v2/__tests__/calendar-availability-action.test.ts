import { describe, expect, it } from "vitest";
import { buildListingCalendarIndex, resolveDay } from "@/lib/host/v2/calendar-model";
import {
  buildAvailabilityAction,
  contiguousRuns,
  lockedCount,
  stepsForDates,
  undoStepsForDates,
} from "@/lib/host/v2/calendar-availability-action";
import {
  bookingBlock,
  externalBlock,
  makeListing,
  manualBlock,
  TODAY,
} from "./fixtures";

function datesFrom(...days: string[]): string[] {
  return days;
}

describe("buildAvailabilityAction", () => {
  it("splits a selection into what each button can actually move", () => {
    const listing = makeListing({
      blocks: [
        manualBlock("2026-03-12", "2026-03-13"),
        bookingBlock("2026-03-14", "2026-03-15"),
        externalBlock("2026-03-16", "2026-03-17"),
      ],
    });
    const index = buildListingCalendarIndex(listing);
    const model = buildAvailabilityAction({
      listing,
      index,
      dates: datesFrom(
        "2026-03-11",
        "2026-03-12",
        "2026-03-14",
        "2026-03-16",
        "2026-03-17",
      ),
      today: TODAY,
    });

    expect(model.blockable).toEqual(["2026-03-11", "2026-03-17"]);
    expect(model.openable).toEqual(["2026-03-12"]);
    expect(model.booked).toBe(1);
    expect(model.external).toBe(1);
    expect(lockedCount(model)).toBe(2);
  });

  it("treats closed-by-default dates as openable and windows as blockable", () => {
    const listing = makeListing({
      availabilityMode: "CLOSED",
      availabilityWindows: [
        { id: "window-1", startDate: "2026-03-12", endDate: "2026-03-13" },
      ],
    });
    const index = buildListingCalendarIndex(listing);
    const model = buildAvailabilityAction({
      listing,
      index,
      dates: datesFrom("2026-03-11", "2026-03-12"),
      today: TODAY,
    });

    expect(model.openable).toEqual(["2026-03-11"]);
    expect(model.blockable).toEqual(["2026-03-12"]);
  });

  /**
   * Blocking means one thing in both availability modes.
   *
   * v2 no longer routes "block" on a closed-by-default listing into deleting the
   * availability window: a host who blocks an open date is making a decision, and it is
   * recorded as a MANUAL_BLOCK with an optional note like anywhere else. "Closed" is
   * then reserved for a date nobody ever opened. See calendar-v2.actions.ts.
   */
  it("produces the same block step on a closed-by-default listing", () => {
    const closed = makeListing({
      availabilityMode: "CLOSED",
      availabilityWindows: [
        { id: "window-1", startDate: "2026-03-12", endDate: "2026-03-14" },
      ],
    });
    const open = makeListing();
    const dates = datesFrom("2026-03-12", "2026-03-13");

    expect(stepsForDates(dates, "BLOCK")).toEqual([
      {
        type: "BLOCK_RANGE",
        startDate: "2026-03-12",
        endDate: "2026-03-14",
        note: undefined,
      },
    ]);
    // The model reaches the same conclusion either way: these nights are open, so the
    // Block button is what the panel offers.
    for (const listing of [closed, open]) {
      const model = buildAvailabilityAction({
        listing,
        index: buildListingCalendarIndex(listing),
        dates,
        today: TODAY,
      });
      expect(model.blockable).toEqual(dates);
      expect(model.openable).toEqual([]);
    }
  });

  it("reports a manual block on a closed-by-default listing as blocked, not closed", () => {
    const listing = makeListing({
      availabilityMode: "CLOSED",
      availabilityWindows: [
        { id: "window-1", startDate: "2026-03-12", endDate: "2026-03-14" },
      ],
      blocks: [manualBlock("2026-03-12", "2026-03-13")],
    });
    const index = buildListingCalendarIndex(listing);

    // The host's own decision keeps its own word...
    expect(resolveDay(listing, index, "2026-03-12", TODAY)).toMatchObject({
      state: "blocked",
      reason: "manual",
      editable: true,
    });
    // ...and a date nobody ever opened keeps the other one.
    expect(resolveDay(listing, index, "2026-03-20", TODAY)).toMatchObject({
      state: "blocked",
      reason: "closed_default",
    });
  });
});

describe("contiguousRuns", () => {
  it("keeps a gap as a separate run", () => {
    expect(
      contiguousRuns(["2026-03-11", "2026-03-12", "2026-03-14"]),
    ).toEqual([
      { start: "2026-03-11", end: "2026-03-12" },
      { start: "2026-03-14", end: "2026-03-14" },
    ]);
  });

  it("crosses a month boundary in one run", () => {
    expect(contiguousRuns(["2026-03-31", "2026-04-01"])).toEqual([
      { start: "2026-03-31", end: "2026-04-01" },
    ]);
  });
});

describe("stepsForDates", () => {
  it("sends an exclusive checkout date", () => {
    expect(stepsForDates(["2026-03-11", "2026-03-12"], "BLOCK")).toEqual([
      {
        type: "BLOCK_RANGE",
        startDate: "2026-03-11",
        endDate: "2026-03-13",
        note: undefined,
      },
    ]);
  });

  it("skips the nights it cannot move rather than spanning them", () => {
    // A booked night in the middle must not end up inside a blocked range.
    expect(stepsForDates(["2026-03-11", "2026-03-14"], "BLOCK")).toHaveLength(2);
  });

  it("carries a trimmed note only on a block", () => {
    expect(stepsForDates(["2026-03-11"], "BLOCK", "  Maintenance ")).toEqual([
      {
        type: "BLOCK_RANGE",
        startDate: "2026-03-11",
        endDate: "2026-03-12",
        note: "Maintenance",
      },
    ]);
    expect(stepsForDates(["2026-03-11"], "BLOCK", "   ")[0]).toMatchObject({
      note: undefined,
    });
  });

  it("produces no steps for no dates, so a no-op cannot reach the server", () => {
    expect(stepsForDates([], "OPEN")).toEqual([]);
  });
});

describe("undoStepsForDates", () => {
  it("reverses only the dates that moved", () => {
    // The host blocked two nights inside a longer range that was already part-blocked.
    // Undo must reopen those two and leave the older block alone.
    expect(undoStepsForDates(["2026-03-11", "2026-03-12"], "BLOCK")).toEqual([
      { type: "OPEN_RANGE", startDate: "2026-03-11", endDate: "2026-03-13" },
    ]);
  });

  it("re-blocks what an open reopened, without inheriting a note", () => {
    expect(undoStepsForDates(["2026-03-11"], "OPEN")).toEqual([
      {
        type: "BLOCK_RANGE",
        startDate: "2026-03-11",
        endDate: "2026-03-12",
        note: undefined,
      },
    ]);
  });
});
