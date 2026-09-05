import { describe, expect, it } from "vitest";
import {
  batchesForPlan,
  buildMultiAvailabilityPlan,
} from "@/lib/host/v2/calendar-availability-action";
import { buildListingCalendarIndex } from "@/lib/host/v2/calendar-model";
import type { HostCalendarListing } from "@/lib/host/v2/calendar-types";
import {
  bookingBlock,
  externalBlock,
  makeListing,
  manualBlock,
  TODAY,
} from "./fixtures";

/**
 * Blocking dates on several properties at once.
 *
 * The risk this covers is not arithmetic, it is over-promising: a set of properties
 * never has one answer, and a panel that reports a single number invites a host to
 * believe five properties were blocked when a reservation on one of them meant four
 * were. Every test here is about a property refusing something the others accepted.
 */

const DATES = ["2026-04-01", "2026-04-02", "2026-04-03"];

function target(listing: HostCalendarListing) {
  return { listing, index: buildListingCalendarIndex(listing) };
}

describe("buildMultiAvailabilityPlan", () => {
  it("sums movable nights across properties that start open and closed", () => {
    // A closed-by-default listing has no open nights to block; an open one has three.
    // The plan has to hold both without either deciding the other's answer.
    const plan = buildMultiAvailabilityPlan({
      entries: [
        target(makeListing({ id: "open", availabilityMode: "OPEN" })),
        target(
          makeListing({
            id: "half-open",
            availabilityMode: "OPEN",
            blocks: [manualBlock("2026-04-01", "2026-04-02")],
          }),
        ),
        target(makeListing({ id: "closed", availabilityMode: "CLOSED" })),
      ],
      dates: DATES,
      today: TODAY,
      direction: "BLOCK",
    });

    expect(plan.nights).toBe(5);
    expect(plan.properties).toBe(2);
    expect(plan.lockedNights).toBe(0);
  });

  it("counts a property whose nights are all booked as zero, and names it", () => {
    const plan = buildMultiAvailabilityPlan({
      entries: [
        target(makeListing({ id: "free" })),
        target(
          makeListing({
            id: "busy",
            title: "Apartment Vodno",
            blocks: [bookingBlock("2026-04-01", "2026-04-04")],
          }),
        ),
      ],
      dates: DATES,
      today: TODAY,
      direction: "BLOCK",
    });

    expect(plan.nights).toBe(3);
    expect(plan.properties).toBe(1);
    expect(plan.lockedNights).toBe(3);
    expect(plan.bookedNights).toBe(3);
    // The count alone would leave the host hunting for which property refused.
    expect(plan.lockedTitles).toEqual(["Apartment Vodno"]);
    // ...and it still appears in the target list, rather than vanishing from the set
    // the host chose.
    expect(plan.targets).toHaveLength(2);
  });

  it("treats a night held by a connected calendar as unmovable, not as blockable", () => {
    const plan = buildMultiAvailabilityPlan({
      entries: [
        target(makeListing({ id: "free" })),
        target(
          makeListing({
            id: "synced",
            title: "Villa Ohrid",
            blocks: [externalBlock("2026-04-01", "2026-04-04")],
          }),
        ),
      ],
      dates: DATES,
      today: TODAY,
      direction: "OPEN",
    });

    // Opening cannot touch a block the remote calendar would only put back.
    expect(plan.nights).toBe(0);
    expect(plan.externalNights).toBe(3);
    expect(plan.lockedTitles).toEqual(["Villa Ohrid"]);
  });
});

describe("batchesForPlan", () => {
  it("writes nothing for a property with no movable nights", () => {
    const plan = buildMultiAvailabilityPlan({
      entries: [
        target(makeListing({ id: "free" })),
        target(
          makeListing({
            id: "busy",
            blocks: [bookingBlock("2026-04-01", "2026-04-04")],
          }),
        ),
      ],
      dates: DATES,
      today: TODAY,
      direction: "BLOCK",
    });

    const batches = batchesForPlan(plan, null);
    expect(batches.map((batch) => batch.listingId)).toEqual(["free"]);
    expect(batches[0].nights).toBe(3);
  });

  it("groups each property's own dates into its own contiguous ranges", () => {
    // The middle night is already blocked on `gap`, so its write is two ranges while
    // the other property's is one. A shared range list would block a night on `gap`
    // that the host's selection never made movable there.
    const plan = buildMultiAvailabilityPlan({
      entries: [
        target(makeListing({ id: "whole" })),
        target(
          makeListing({
            id: "gap",
            blocks: [manualBlock("2026-04-02", "2026-04-03")],
          }),
        ),
      ],
      dates: DATES,
      today: TODAY,
      direction: "BLOCK",
    });

    const batches = batchesForPlan(plan, null);
    expect(batches[0].steps).toHaveLength(1);
    expect(batches[1].steps).toHaveLength(2);
    expect(batches[1].steps).toEqual([
      { type: "BLOCK_RANGE", startDate: "2026-04-01", endDate: "2026-04-02" },
      { type: "BLOCK_RANGE", startDate: "2026-04-03", endDate: "2026-04-04" },
    ]);
  });

  it("undoes only the nights each property moved", () => {
    // `gap` was already blocked on 2 April before the host pressed anything. Undo must
    // leave that block alone — reopening it would throw away a decision the host made
    // weeks ago and never touched.
    const plan = buildMultiAvailabilityPlan({
      entries: [
        target(makeListing({ id: "whole" })),
        target(
          makeListing({
            id: "gap",
            blocks: [manualBlock("2026-04-02", "2026-04-03")],
          }),
        ),
      ],
      dates: DATES,
      today: TODAY,
      direction: "BLOCK",
    });

    const [, gap] = batchesForPlan(plan, null);
    expect(gap.undoSteps).toEqual([
      { type: "OPEN_RANGE", startDate: "2026-04-01", endDate: "2026-04-02" },
      { type: "OPEN_RANGE", startDate: "2026-04-03", endDate: "2026-04-04" },
    ]);
    // The pre-existing block's night is in neither range.
    expect(
      gap.undoSteps.some(
        (step) =>
          step.type === "OPEN_RANGE" && step.startDate === "2026-04-02",
      ),
    ).toBe(false);
  });

  it("carries the private note onto every property it blocks", () => {
    const plan = buildMultiAvailabilityPlan({
      entries: [target(makeListing({ id: "a" })), target(makeListing({ id: "b" }))],
      dates: DATES,
      today: TODAY,
      direction: "BLOCK",
    });

    for (const batch of batchesForPlan(plan, "Family stay")) {
      expect(batch.steps).toEqual([
        {
          type: "BLOCK_RANGE",
          startDate: "2026-04-01",
          endDate: "2026-04-04",
          note: "Family stay",
        },
      ]);
    }
  });

  it("never puts a note on the way back", () => {
    const plan = buildMultiAvailabilityPlan({
      entries: [target(makeListing({ id: "a" }))],
      dates: DATES,
      today: TODAY,
      direction: "BLOCK",
    });

    const [batch] = batchesForPlan(plan, "Family stay");
    expect(batch.undoSteps).toEqual([
      { type: "OPEN_RANGE", startDate: "2026-04-01", endDate: "2026-04-04" },
    ]);
  });

  it("is identical to the single-property act when only one property is aimed at", () => {
    const listing = makeListing({ id: "only" });
    const plan = buildMultiAvailabilityPlan({
      entries: [target(listing)],
      dates: DATES,
      today: TODAY,
      direction: "BLOCK",
    });

    expect(plan.nights).toBe(3);
    expect(plan.properties).toBe(1);
    expect(batchesForPlan(plan, null)).toEqual([
      {
        listingId: "only",
        nights: 3,
        steps: [
          { type: "BLOCK_RANGE", startDate: "2026-04-01", endDate: "2026-04-04" },
        ],
        undoSteps: [
          { type: "OPEN_RANGE", startDate: "2026-04-01", endDate: "2026-04-04" },
        ],
      },
    ]);
  });
});
