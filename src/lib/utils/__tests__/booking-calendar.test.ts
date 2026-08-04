import { describe, expect, it } from "vitest";
import {
  blockedRangeStarts,
  checkoutBoundary,
  disabledRangesForSelection,
  isBlockedDay,
  isCheckoutBoundaryDay,
  isDeadEndCheckIn,
  selectionCheckoutBoundary,
  usableNightsFrom,
} from "@/lib/utils/booking-calendar";
import { validateBookingSelection } from "@/lib/utils/booking-selection";

function localDate(ymd: string) {
  const [year, month, day] = ymd.split("-").map(Number);
  return new Date(year, month - 1, day);
}

/** One existing booking occupying the nights of Aug 10-14. */
const augustBlock = [
  { from: localDate("2026-08-10"), to: localDate("2026-08-14") },
];

const augustStarts = blockedRangeStarts(augustBlock);

/** A second booking later in the month, so "first reachable block" has teeth. */
const twoBlocks = [
  { from: localDate("2026-08-10"), to: localDate("2026-08-14") },
  { from: localDate("2026-08-20"), to: localDate("2026-08-24") },
];

const twoBlockStarts = blockedRangeStarts(twoBlocks);

function isSelectableCheckIn(ymd: string, minNights: number) {
  return !isDeadEndCheckIn(localDate(ymd), minNights, augustStarts);
}

describe("booking calendar availability", () => {
  it("counts the block's first day as a usable check-out (exact fit)", () => {
    // Aug 7 -> Aug 10 is three nights: 7th, 8th, 9th. The block's own first day is
    // the next guest's arrival, not a night this stay occupies.
    expect(usableNightsFrom(localDate("2026-08-07"), augustStarts)).toBe(3);
    expect(isSelectableCheckIn("2026-08-07", 3)).toBe(true);

    expect(
      validateBookingSelection(
        localDate("2026-08-07"),
        localDate("2026-08-10"),
        3,
        augustBlock
      )
    ).toEqual({ status: "valid", nights: 3 });
  });

  it("rules out a check-in one night too short", () => {
    expect(usableNightsFrom(localDate("2026-08-08"), augustStarts)).toBe(2);
    expect(isSelectableCheckIn("2026-08-08", 3)).toBe(false);
  });

  it("rules out a check-in two nights too short", () => {
    expect(usableNightsFrom(localDate("2026-08-09"), augustStarts)).toBe(1);
    expect(isSelectableCheckIn("2026-08-09", 3)).toBe(false);
  });

  it("offers the block start as a check-out only while a check-in is pending", () => {
    const boundary = checkoutBoundary(localDate("2026-08-07"), augustStarts);
    expect(boundary).toEqual(localDate("2026-08-10"));
    expect(isCheckoutBoundaryDay(localDate("2026-08-10"), boundary)).toBe(true);

    // No pending check-in: Aug 10 is an ordinary booked day again, so it stays
    // disabled and cannot be picked as an arrival.
    expect(checkoutBoundary(undefined, augustStarts)).toBeUndefined();
    expect(disabledRangesForSelection(augustBlock, undefined)).toEqual(
      augustBlock
    );
  });

  it("keeps every night inside the block disabled", () => {
    const boundary = checkoutBoundary(localDate("2026-08-07"), augustStarts);
    expect(disabledRangesForSelection(augustBlock, boundary)).toEqual([
      { from: localDate("2026-08-11"), to: localDate("2026-08-14") },
    ]);

    // Reaching past the boundary would sleep on a booked night.
    expect(
      validateBookingSelection(
        localDate("2026-08-07"),
        localDate("2026-08-11"),
        3,
        augustBlock
      )
    ).toEqual({ status: "unavailable", nights: 4 });
  });

  it("drops a single-day block entirely when it is the boundary", () => {
    const singleDay = [
      { from: localDate("2026-08-10"), to: localDate("2026-08-10") },
    ];
    const boundary = checkoutBoundary(
      localDate("2026-08-07"),
      blockedRangeStarts(singleDay)
    );
    expect(disabledRangesForSelection(singleDay, boundary)).toEqual([]);
  });

  it("only opens the first reachable block start, never a later one", () => {
    const boundary = checkoutBoundary(localDate("2026-08-07"), twoBlockStarts);
    expect(boundary).toEqual(localDate("2026-08-10"));
    expect(isCheckoutBoundaryDay(localDate("2026-08-20"), boundary)).toBe(false);

    // The later block keeps all of its days, including its start.
    expect(disabledRangesForSelection(twoBlocks, boundary)).toEqual([
      { from: localDate("2026-08-11"), to: localDate("2026-08-14") },
      { from: localDate("2026-08-20"), to: localDate("2026-08-24") },
    ]);

    // Once the guest checks in after the first block, the second one becomes the
    // reachable boundary.
    expect(checkoutBoundary(localDate("2026-08-16"), twoBlockStarts)).toEqual(
      localDate("2026-08-20")
    );
  });

  it("leaves minimum-stay behaviour untouched when no block lies ahead", () => {
    expect(usableNightsFrom(localDate("2026-09-01"), augustStarts)).toBe(
      Number.POSITIVE_INFINITY
    );
    expect(isDeadEndCheckIn(localDate("2026-09-01"), 3, augustStarts)).toBe(
      false
    );
    expect(checkoutBoundary(localDate("2026-09-01"), augustStarts)).toBeUndefined();
  });

  it("adds no dead-end restrictions for a one-night minimum", () => {
    for (const ymd of ["2026-08-07", "2026-08-08", "2026-08-09"]) {
      expect(isDeadEndCheckIn(localDate(ymd), 1, augustStarts)).toBe(false);
      expect(isDeadEndCheckIn(localDate(ymd), undefined, augustStarts)).toBe(
        false
      );
    }
  });

  it("offers nothing from the pending-check-in primitive once a range completes", () => {
    // `checkoutBoundary` answers only for a pending check-in — that is its contract and
    // it is unchanged. The picker no longer calls it directly, because dropping the
    // exception the instant the range completed struck through the day the guest had
    // just chosen; it uses `selectionCheckoutBoundary` instead. See the lifecycle
    // block below.
    const pendingCheckIn = (range: { from?: Date; to?: Date } | undefined) =>
      range?.from && !range.to ? range.from : undefined;

    const states = [
      { from: localDate("2026-08-07"), to: undefined },
      { from: localDate("2026-08-07"), to: localDate("2026-08-10") },
      undefined,
    ];
    const boundaries = states.map((state) =>
      checkoutBoundary(pendingCheckIn(state), augustStarts)
    );

    expect(boundaries[0]).toEqual(localDate("2026-08-10"));
    expect(boundaries[1]).toBeUndefined();
    expect(boundaries[2]).toBeUndefined();

    for (const boundary of boundaries.slice(1)) {
      expect(isCheckoutBoundaryDay(localDate("2026-08-10"), boundary)).toBe(
        false
      );
      expect(disabledRangesForSelection(augustBlock, boundary)).toEqual(
        augustBlock
      );
    }
  });

  it("normalizes and sorts block starts regardless of input order", () => {
    expect(
      blockedRangeStarts([
        { from: localDate("2026-08-20"), to: localDate("2026-08-24") },
        { from: localDate("2026-08-10"), to: localDate("2026-08-14") },
      ])
    ).toEqual([localDate("2026-08-10"), localDate("2026-08-20")]);
  });
});

/**
 * The completed-selection state, which is where the exact-fit check-out used to break.
 *
 * Every case drives `selectionCheckoutBoundary` exactly as the picker does, then asks
 * the two questions the picker asks of the result: what the calendar disables, and what
 * it marks `unavailable` (the strike-through). Both are built from
 * `disabledRangesForSelection`, so one helper models both.
 */
describe("exact-fit check-out through the selection lifecycle", () => {
  /** What the picker's disabled matcher and `unavailable` modifier would both say. */
  function unavailableOn(
    ymd: string,
    selection: { from?: Date; to?: Date } | undefined,
    ranges = augustBlock
  ) {
    const boundary = selectionCheckoutBoundary(
      selection,
      blockedRangeStarts(ranges)
    );
    return isBlockedDay(
      localDate(ymd),
      disabledRangesForSelection(ranges, boundary)
    );
  }

  /**
   * The guard in the picker's `commitRange`: a fresh check-in landing on a genuinely
   * blocked day drops the selection instead of starting a stay there.
   */
  function commitNewCheckIn(ymd: string, ranges = augustBlock) {
    const from = localDate(ymd);
    return isBlockedDay(from, ranges) ? undefined : { from, to: undefined };
  }

  it("keeps the blocked start unavailable as a check-in when nothing is selected", () => {
    expect(selectionCheckoutBoundary(undefined, augustStarts)).toBeUndefined();
    expect(unavailableOn("2026-08-10", undefined)).toBe(true);
    expect(unavailableOn("2026-08-10", { from: undefined, to: undefined })).toBe(
      true
    );
  });

  it("opens the first blocked day as a check-out while a check-in is pending", () => {
    const pending = { from: localDate("2026-08-07"), to: undefined };

    expect(selectionCheckoutBoundary(pending, augustStarts)).toEqual(
      localDate("2026-08-10")
    );
    expect(unavailableOn("2026-08-10", pending)).toBe(false);
    // Everything deeper into the block stays shut.
    expect(unavailableOn("2026-08-11", pending)).toBe(true);
    expect(unavailableOn("2026-08-14", pending)).toBe(true);
  });

  it("keeps the check-out valid after the range completes", () => {
    // The regression: `to` used to end the exception, so the day the guest had just
    // picked was struck through and disabled underneath their own selection.
    const completed = {
      from: localDate("2026-08-07"),
      to: localDate("2026-08-10"),
    };

    expect(selectionCheckoutBoundary(completed, augustStarts)).toEqual(
      localDate("2026-08-10")
    );
    expect(unavailableOn("2026-08-10", completed)).toBe(false);
    expect(unavailableOn("2026-08-11", completed)).toBe(true);

    // And the completed stay is still a legal booking.
    expect(
      validateBookingSelection(
        completed.from,
        completed.to,
        3,
        augustBlock
      )
    ).toEqual({ status: "valid", nights: 3 });
  });

  it("re-blocks the boundary when the selection is cleared", () => {
    expect(unavailableOn("2026-08-10", undefined)).toBe(true);
    expect(selectionCheckoutBoundary(undefined, augustStarts)).toBeUndefined();
  });

  it("refuses the boundary as the start of a new selection", () => {
    // The exception is live (a completed exact fit), so Aug 10 is enabled — clicking it
    // must not become a check-in. The guard drops the selection, which re-blocks it.
    const completed = {
      from: localDate("2026-08-07"),
      to: localDate("2026-08-10"),
    };
    expect(unavailableOn("2026-08-10", completed)).toBe(false);

    expect(commitNewCheckIn("2026-08-10")).toBeUndefined();
    expect(unavailableOn("2026-08-10", commitNewCheckIn("2026-08-10"))).toBe(
      true
    );

    // Days genuinely inside the block are refused too, and an open day still works.
    expect(commitNewCheckIn("2026-08-12")).toBeUndefined();
    expect(commitNewCheckIn("2026-08-16")).toEqual({
      from: localDate("2026-08-16"),
      to: undefined,
    });
  });

  it("drops the exception when the check-out is not the first reachable block", () => {
    // Aug 7 -> Aug 20 sleeps straight through the Aug 10-14 block, so nothing about it
    // is an exact fit and the whole first block stays shut.
    const crossing = {
      from: localDate("2026-08-07"),
      to: localDate("2026-08-20"),
    };

    expect(
      selectionCheckoutBoundary(crossing, twoBlockStarts)
    ).toBeUndefined();
    expect(unavailableOn("2026-08-10", crossing, twoBlocks)).toBe(true);
    expect(
      validateBookingSelection(crossing.from, crossing.to, 1, twoBlocks)
    ).toEqual({ status: "unavailable", nights: 13 });
  });

  it("rejects a check-out past the boundary", () => {
    const pending = { from: localDate("2026-08-07"), to: undefined };

    expect(unavailableOn("2026-08-11", pending)).toBe(true);
    expect(
      validateBookingSelection(
        localDate("2026-08-07"),
        localDate("2026-08-11"),
        1,
        augustBlock
      )
    ).toEqual({ status: "unavailable", nights: 4 });
  });

  it("allows an exact fit on a one-night minimum", () => {
    // Aug 9 -> Aug 10 is the shortest exact fit there is.
    const completed = {
      from: localDate("2026-08-09"),
      to: localDate("2026-08-10"),
    };

    expect(selectionCheckoutBoundary(completed, augustStarts)).toEqual(
      localDate("2026-08-10")
    );
    expect(unavailableOn("2026-08-10", completed)).toBe(false);
    expect(isDeadEndCheckIn(localDate("2026-08-09"), 1, augustStarts)).toBe(
      false
    );
    expect(
      validateBookingSelection(
        completed.from,
        completed.to,
        1,
        augustBlock
      )
    ).toEqual({ status: "valid", nights: 1 });
  });

  it("keeps multi-night minimum behaviour correct around the boundary", () => {
    // A 3-night minimum: Aug 7 exactly fits, Aug 8 cannot reach it.
    expect(isDeadEndCheckIn(localDate("2026-08-07"), 3, augustStarts)).toBe(
      false
    );
    expect(isDeadEndCheckIn(localDate("2026-08-08"), 3, augustStarts)).toBe(
      true
    );

    const exact = { from: localDate("2026-08-07"), to: localDate("2026-08-10") };
    expect(unavailableOn("2026-08-10", exact)).toBe(false);
    expect(
      validateBookingSelection(exact.from, exact.to, 3, augustBlock)
    ).toEqual({ status: "valid", nights: 3 });

    // One night short of the minimum is still refused, exception or not.
    expect(
      validateBookingSelection(
        localDate("2026-08-08"),
        localDate("2026-08-10"),
        3,
        augustBlock
      )
    ).toEqual({ status: "minimum-stay", nights: 2 });
  });

  it("qualifies only the first reachable boundary when several blocks exist", () => {
    const completed = {
      from: localDate("2026-08-07"),
      to: localDate("2026-08-10"),
    };

    expect(selectionCheckoutBoundary(completed, twoBlockStarts)).toEqual(
      localDate("2026-08-10")
    );
    // The later block is untouched, including its own start day.
    expect(unavailableOn("2026-08-20", completed, twoBlocks)).toBe(true);
    expect(unavailableOn("2026-08-10", completed, twoBlocks)).toBe(false);

    // Checking in after the first block makes the second one the exact fit.
    const later = { from: localDate("2026-08-16"), to: localDate("2026-08-20") };
    expect(selectionCheckoutBoundary(later, twoBlockStarts)).toEqual(
      localDate("2026-08-20")
    );
    expect(unavailableOn("2026-08-20", later, twoBlocks)).toBe(false);
    expect(unavailableOn("2026-08-10", later, twoBlocks)).toBe(true);
  });
});
