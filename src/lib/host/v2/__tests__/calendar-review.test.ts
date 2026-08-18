import { describe, expect, it } from "vitest";
import {
  buildListingCalendarIndex,
  countDates,
} from "@/lib/host/v2/calendar-model";
import { summarizeListingStatus } from "@/lib/host/v2/listing-status";
import {
  buildDateReviewPlan,
  buildListingReviewPlan,
  type DateChange,
} from "@/lib/host/v2/calendar-review";
import {
  bookingBlock,
  externalBlock,
  HORIZON_END,
  makeListing,
  manualBlock,
  promotion,
  TODAY,
} from "./fixtures";
import type { HostCalendarListing } from "@/lib/host/v2/calendar-types";

const selection = { start: "2026-03-12", end: "2026-03-14" };
/** Well after `TODAY`, so the publish-availability check is evaluated deterministically. */
const NOW = new Date("2026-03-10T09:00:00.000Z");

function datePlan(listing: HostCalendarListing, change: DateChange | null) {
  return buildDateReviewPlan({
    listing,
    index: buildListingCalendarIndex(listing),
    selection,
    change,
    today: TODAY,
  });
}

function listingPlan(
  listing: HostCalendarListing,
  change: Parameters<typeof buildListingReviewPlan>[0]["change"],
) {
  const index = buildListingCalendarIndex(listing);
  const counts = countDates(listing, index, TODAY, HORIZON_END);
  return buildListingReviewPlan({
    listing,
    index,
    change,
    summary: summarizeListingStatus({ listing, counts, horizonMonths: 18 }),
    today: TODAY,
    horizonEnd: HORIZON_END,
    horizonMonths: 18,
    now: NOW,
  });
}

describe("one change per review", () => {
  it("never produces more than one mutation step", () => {
    const listing = makeListing({ blocks: [manualBlock("2026-03-12", "2026-03-15")] });
    for (const change of [
      { kind: "AVAILABILITY", to: "OPEN" },
      { kind: "PRICE", to: { mode: "SET", value: 140 } },
      {
        kind: "PROMOTION",
        offer: {
          discountPercent: 10,
          minimumNights: 2,
          freeCleaning: false,
          roundToWholeUnit: true,
        },
      },
    ] as DateChange[]) {
      expect(datePlan(listing, change).steps).toHaveLength(1);
    }
  });

  /**
   * Nothing in this module writes anything: a plan is a description, and the only
   * thing that can act on it is the confirm button in the review dialog. The
   * invariant that makes that safe is that an unsavable plan carries no steps at all,
   * so a caller that ignored `errors` still could not half-save.
   */
  it("carries no mutation step in any plan the review would refuse", () => {
    const unsavable: Array<{
      listing: HostCalendarListing;
      change: DateChange | null;
    }> = [
      { listing: makeListing(), change: null },
      {
        listing: makeListing({ blocks: [externalBlock("2026-03-12", "2026-03-15")] }),
        change: { kind: "AVAILABILITY", to: "BLOCK" },
      },
      {
        listing: makeListing({ blocks: [bookingBlock("2026-03-12", "2026-03-15")] }),
        change: { kind: "AVAILABILITY", to: "OPEN" },
      },
      { listing: makeListing(), change: { kind: "PRICE", to: { mode: "SET", value: 0 } } },
      { listing: makeListing({ pricing: null }), change: { kind: "PRICE", to: { mode: "RESET" } } },
    ];
    for (const { listing, change } of unsavable) {
      const plan = datePlan(listing, change);
      expect(plan.savable).toBe(false);
      expect(plan.steps).toEqual([]);
    }
  });

  it("rebuilds the identical plan after a failed save, note included", () => {
    // A rejected write leaves the selection and the draft exactly where they were, so
    // the retry has to describe the same change rather than a subtly different one.
    const listing = makeListing();
    const change: DateChange = {
      kind: "AVAILABILITY",
      to: "BLOCK",
      note: "Bathroom refit",
    };
    expect(datePlan(listing, change)).toEqual(datePlan(listing, change));
  });
});

describe("date review — availability", () => {
  it("turns blocked dates into an open-range step with a bookable consequence", () => {
    const listing = makeListing({ blocks: [manualBlock("2026-03-12", "2026-03-15")] });
    const plan = datePlan(listing, { kind: "AVAILABILITY", to: "OPEN" });

    expect(plan.savable).toBe(true);
    expect(plan.saveAction).toBe("SAVE_AND_OPEN");
    expect(plan.rows).toEqual([
      {
        field: "availability",
        before: { code: "AVAILABILITY_BLOCKED", dates: 3 },
        after: { code: "AVAILABILITY_AVAILABLE", dates: 3 },
      },
    ]);
    expect(plan.consequences).toEqual([
      {
        code: "DATES_OPENED",
        dates: 3,
        bookable: 3,
        lockedDates: 0,
        saleBlockers: [],
      },
    ]);
    expect(plan.steps).toEqual([
      { type: "OPEN_RANGE", startDate: "2026-03-12", endDate: "2026-03-15" },
    ]);
  });

  it("promises openness but not bookability when the listing cannot sell", () => {
    const listing = makeListing({
      status: "UNPUBLISHED",
      blocks: [manualBlock("2026-03-12", "2026-03-15")],
    });
    const plan = datePlan(listing, { kind: "AVAILABILITY", to: "OPEN" });
    expect(plan.rows[0].after).toEqual({
      code: "AVAILABILITY_OPEN_NOT_BOOKABLE",
      dates: 3,
    });
    expect(plan.consequences).toEqual([
      {
        code: "DATES_OPENED",
        dates: 3,
        bookable: 0,
        lockedDates: 0,
        saleBlockers: ["NOT_LIVE"],
      },
    ]);
  });

  it("turns open dates into a block step and says bookings are safe", () => {
    const listing = makeListing({ blocks: [bookingBlock("2026-03-14", "2026-03-15")] });
    const plan = datePlan(listing, { kind: "AVAILABILITY", to: "BLOCK" });

    expect(plan.saveAction).toBe("SAVE_AND_BLOCK");
    expect(plan.rows[0].before).toEqual({
      code: "AVAILABILITY_MIXED",
      available: 2,
      openNotBookable: 0,
      blocked: 0,
      booked: 1,
    });
    expect(plan.consequences).toEqual([
      { code: "DATES_CLOSED", dates: 2, bookable: 2, bookedDates: 1 },
    ]);
  });

  it("counts dates it cannot free so the consequence is not overstated", () => {
    const listing = makeListing({
      blocks: [
        manualBlock("2026-03-12", "2026-03-13"),
        externalBlock("2026-03-13", "2026-03-15"),
      ],
    });
    const plan = datePlan(listing, { kind: "AVAILABILITY", to: "OPEN" });
    expect(plan.consequences).toEqual([
      {
        code: "DATES_OPENED",
        dates: 1,
        bookable: 1,
        lockedDates: 2,
        saleBlockers: [],
      },
    ]);
  });

  it("refuses when there is nothing in the range it could open", () => {
    const listing = makeListing({ blocks: [bookingBlock("2026-03-12", "2026-03-15")] });
    const plan = datePlan(listing, { kind: "AVAILABILITY", to: "OPEN" });
    expect(plan.errors).toEqual([{ code: "NOTHING_TO_OPEN" }]);
    expect(plan.steps).toEqual([]);
    expect(plan.savable).toBe(false);
  });
});

describe("date review — private block notes", () => {
  /** The manual block covering exactly `selection`, so its note is the one shown. */
  function blockedWithNote(note: string | null) {
    return makeListing({
      blocks: [{ ...manualBlock("2026-03-12", "2026-03-15"), reason: note }],
    });
  }

  it("carries the note into the block step", () => {
    const plan = datePlan(makeListing(), {
      kind: "AVAILABILITY",
      to: "BLOCK",
      note: "Bathroom refit",
    });
    expect(plan.steps).toEqual([
      {
        type: "BLOCK_RANGE",
        startDate: "2026-03-12",
        endDate: "2026-03-15",
        note: "Bathroom refit",
      },
    ]);
    expect(plan.savable).toBe(true);
  });

  it("shows the note in the review before it is saved", () => {
    const plan = datePlan(makeListing(), {
      kind: "AVAILABILITY",
      to: "BLOCK",
      note: "Bathroom refit",
    });
    expect(plan.rows).toContainEqual({
      field: "block_note",
      before: { code: "NOTE_NONE" },
      after: { code: "NOTE_TEXT", note: "Bathroom refit" },
    });
    expect(plan.consequences).toContainEqual({
      code: "BLOCK_NOTE_SAVED",
      dates: 3,
      keptOnExisting: 0,
    });
  });

  it("says nothing about a note when the host did not write one", () => {
    const plan = datePlan(makeListing(), { kind: "AVAILABILITY", to: "BLOCK" });
    expect(plan.rows.map((row) => row.field)).toEqual(["availability"]);
    expect(plan.consequences).toEqual([
      { code: "DATES_CLOSED", dates: 3, bookable: 3, bookedDates: 0 },
    ]);
    // No `reason` reaches the action at all, so an existing block's note cannot be
    // overwritten with an empty string by a host who simply never opened the field.
    expect(
      (plan.steps[0] as { note?: string }).note,
    ).toBeUndefined();
  });

  it("treats a note of nothing but spaces as no note", () => {
    const plan = datePlan(makeListing(), {
      kind: "AVAILABILITY",
      to: "BLOCK",
      note: "   ",
    });
    expect(plan.steps).toEqual([
      { type: "BLOCK_RANGE", startDate: "2026-03-12", endDate: "2026-03-15" },
    ]);
    expect(plan.rows.map((row) => row.field)).toEqual(["availability"]);
  });

  it("reads back the note stored on the block covering exactly these dates", () => {
    // Two of the three dates are already blocked, one is still open, so there is
    // something to write the new note onto.
    const listing = makeListing({
      blocks: [{ ...manualBlock("2026-03-12", "2026-03-15"), reason: "Old note" }],
    });
    expect(
      buildDateReviewPlan({
        listing,
        index: buildListingCalendarIndex(listing),
        selection,
        change: { kind: "AVAILABILITY", to: "BLOCK", note: "Old note" },
        today: TODAY,
      }).rows,
    ).toContainEqual({
      field: "block_note",
      before: { code: "NOTE_TEXT", note: "Old note" },
      after: { code: "NOTE_TEXT", note: "Old note" },
    });
  });

  it("does not read a note off a block that merely overlaps the dates", () => {
    const listing = makeListing({
      blocks: [{ ...manualBlock("2026-03-13", "2026-03-14"), reason: "Other note" }],
    });
    const plan = buildDateReviewPlan({
      listing,
      index: buildListingCalendarIndex(listing),
      selection,
      change: { kind: "AVAILABILITY", to: "BLOCK", note: "New note" },
      today: TODAY,
    });
    expect(plan.rows).toContainEqual({
      field: "block_note",
      before: { code: "NOTE_NONE" },
      after: { code: "NOTE_TEXT", note: "New note" },
    });
  });

  it("never reads a note off a reservation or an imported block", () => {
    const listing = makeListing({
      blocks: [
        { ...bookingBlock("2026-03-12", "2026-03-15"), reason: "Guest booking" },
        { ...externalBlock("2026-03-12", "2026-03-15"), reason: "Airbnb" },
      ],
    });
    const plan = buildDateReviewPlan({
      listing,
      index: buildListingCalendarIndex(listing),
      selection,
      change: { kind: "AVAILABILITY", to: "BLOCK", note: "Mine" },
      today: TODAY,
    });
    expect(plan.rows).toContainEqual({
      field: "block_note",
      before: { code: "NOTE_NONE" },
      after: { code: "NOTE_TEXT", note: "Mine" },
    });
  });

  it("updates existing manual dates and newly blocks open dates with one note", () => {
    // The 12th and 13th are already blocked; the 14th is open. The canonical
    // operation makes the selected manual dates carry one truthful note.
    const listing = makeListing({
      blocks: [{ ...manualBlock("2026-03-12", "2026-03-14"), reason: "Old note" }],
    });
    const plan = buildDateReviewPlan({
      listing,
      index: buildListingCalendarIndex(listing),
      selection,
      change: { kind: "AVAILABILITY", to: "BLOCK", note: "New note" },
      today: TODAY,
    });
    expect(plan.consequences).toContainEqual({
      code: "BLOCK_NOTE_SAVED",
      dates: 3,
      keptOnExisting: 0,
    });
    expect(plan.savable).toBe(true);
  });

  it("changes the note on a range that is already fully blocked", () => {
    const plan = buildDateReviewPlan({
      listing: blockedWithNote("Old note"),
      index: buildListingCalendarIndex(blockedWithNote("Old note")),
      selection,
      change: { kind: "AVAILABILITY", to: "BLOCK", note: "New note" },
      today: TODAY,
    });
    expect(plan.errors).toEqual([]);
    expect(plan.steps).toEqual([
      {
        type: "BLOCK_RANGE",
        startDate: "2026-03-12",
        endDate: "2026-03-15",
        note: "New note",
      },
    ]);
    expect(plan.rows).toEqual([
      {
        field: "block_note",
        before: { code: "NOTE_TEXT", note: "Old note" },
        after: { code: "NOTE_TEXT", note: "New note" },
      },
    ]);
    expect(plan.savable).toBe(true);
  });

  it("can clear the note on a range that is already fully blocked", () => {
    const listing = blockedWithNote("Old note");
    const plan = buildDateReviewPlan({
      listing,
      index: buildListingCalendarIndex(listing),
      selection,
      change: { kind: "AVAILABILITY", to: "BLOCK", note: "" },
      today: TODAY,
    });
    expect(plan.steps).toEqual([
      {
        type: "BLOCK_RANGE",
        startDate: "2026-03-12",
        endDate: "2026-03-15",
        note: null,
      },
    ]);
    expect(plan.savable).toBe(true);
  });

  it("does not raise the note gap when the note has not actually changed", () => {
    const listing = blockedWithNote("Old note");
    const plan = buildDateReviewPlan({
      listing,
      index: buildListingCalendarIndex(listing),
      selection,
      change: { kind: "AVAILABILITY", to: "BLOCK", note: "Old note" },
      today: TODAY,
    });
    expect(plan.errors).toEqual([{ code: "NOTHING_TO_BLOCK" }]);
  });

  it("keeps the note out of an open change entirely", () => {
    const listing = makeListing({ blocks: [manualBlock("2026-03-12", "2026-03-15")] });
    const plan = datePlan(listing, { kind: "AVAILABILITY", to: "OPEN" });
    expect(plan.steps).toEqual([
      { type: "OPEN_RANGE", startDate: "2026-03-12", endDate: "2026-03-15" },
    ]);
    expect(plan.rows.map((row) => row.field)).toEqual(["availability"]);
  });

  it("never promises a private note in closed-by-default mode", () => {
    const listing = makeListing({ availabilityMode: "CLOSED" });
    const plan = buildDateReviewPlan({
      listing,
      index: buildListingCalendarIndex(listing),
      selection,
      change: { kind: "AVAILABILITY", to: "BLOCK", note: "Cannot be stored" },
      today: TODAY,
    });
    expect(plan.rows.map((row) => row.field)).not.toContain("block_note");
    expect(plan.steps).toEqual([]);
  });
});

describe("date review — removing a saved dated offer", () => {
  const dated = promotion({
    id: "dated",
    startDate: "2026-03-12",
    endDate: "2026-03-15",
  });

  it("produces one removal step and says what guests will pay instead", () => {
    const listing = makeListing({ promotions: [dated] });
    const plan = datePlan(listing, {
      kind: "PROMOTION_REMOVE",
      promotionId: "dated",
    });
    expect(plan.savable).toBe(true);
    expect(plan.saveAction).toBe("REMOVE_DATE_PROMOTION");
    expect(plan.steps).toEqual([
      { type: "REMOVE_PROMOTION", promotionId: "dated" },
    ]);
    expect(plan.rows[0].after).toEqual({ code: "PROMOTION_NONE" });
    expect(plan.consequences).toEqual([
      { code: "DATE_PROMOTION_REMOVED", fallsBackToOngoing: false },
    ]);
  });

  it("names the always-active offer that would take these dates over", () => {
    // Removing the dated offer does not mean no discount: the ongoing one applies
    // the moment the date-specific one stops, and the review has to say so.
    const listing = makeListing({
      promotions: [dated, promotion({ id: "ongoing", discountPercent: 5 })],
    });
    const plan = datePlan(listing, {
      kind: "PROMOTION_REMOVE",
      promotionId: "dated",
    });
    expect(plan.consequences).toEqual([
      { code: "DATE_PROMOTION_REMOVED", fallsBackToOngoing: true },
    ]);
    expect(plan.rows[0].after).toMatchObject({
      code: "PROMOTION_OFFER",
      discountPercent: 5,
      evergreen: true,
    });
  });

  it("refuses to end an always-active offer from the date scope", () => {
    const listing = makeListing({ promotions: [promotion({ id: "ongoing" })] });
    const plan = datePlan(listing, {
      kind: "PROMOTION_REMOVE",
      promotionId: "ongoing",
    });
    expect(plan.errors).toContainEqual({ code: "PROMOTION_NOT_DATED" });
    expect(plan.steps).toEqual([]);
    expect(plan.savable).toBe(false);
  });

  it("refuses an offer that is no longer there", () => {
    const plan = datePlan(makeListing(), {
      kind: "PROMOTION_REMOVE",
      promotionId: "gone",
    });
    expect(plan.errors).toContainEqual({ code: "PROMOTION_NOT_FOUND" });
    expect(plan.steps).toEqual([]);
  });

  it("still works on a listing whose pricing rule has gone missing", () => {
    // The offer is running whether or not a base price is set; refusing to take it
    // off would leave the host with no way to stop it.
    const listing = makeListing({ pricing: null, promotions: [dated] });
    const plan = datePlan(listing, {
      kind: "PROMOTION_REMOVE",
      promotionId: "dated",
    });
    expect(plan.savable).toBe(true);
    expect(plan.steps).toEqual([
      { type: "REMOVE_PROMOTION", promotionId: "dated" },
    ]);
  });
});

describe("date review — protected dates", () => {
  it("blocks only the open dates and never the booked ones", () => {
    const listing = makeListing({
      blocks: [bookingBlock("2026-03-13", "2026-03-14")],
    });
    const plan = datePlan(listing, {
      kind: "AVAILABILITY",
      to: "BLOCK",
      note: "Private stay",
    });
    // Two of the three dates are blockable; the reservation is counted and named
    // rather than quietly dropped from the total.
    expect(plan.consequences).toContainEqual({
      code: "DATES_CLOSED",
      dates: 2,
      bookable: 2,
      bookedDates: 1,
    });
    expect(plan.consequences).toContainEqual({
      code: "BLOCK_NOTE_SAVED",
      dates: 2,
      keptOnExisting: 0,
    });
  });

  it("counts an imported block as locked when opening, and still opens the rest", () => {
    const listing = makeListing({
      blocks: [
        manualBlock("2026-03-12", "2026-03-13"),
        externalBlock("2026-03-13", "2026-03-15"),
      ],
    });
    const plan = datePlan(listing, { kind: "AVAILABILITY", to: "OPEN" });
    const opened = plan.consequences.find((one) => one.code === "DATES_OPENED");
    expect(opened).toMatchObject({ dates: 1, lockedDates: 2 });
    expect(plan.savable).toBe(true);
  });

  it("refuses outright when every date in the range is protected", () => {
    const listing = makeListing({
      blocks: [externalBlock("2026-03-12", "2026-03-15")],
    });
    expect(datePlan(listing, { kind: "AVAILABILITY", to: "OPEN" }).steps).toEqual([]);
    expect(
      datePlan(listing, { kind: "AVAILABILITY", to: "BLOCK" }).errors,
    ).toContainEqual({ code: "NOTHING_TO_BLOCK" });
  });
});

describe("date review — price", () => {
  it("shows the mixed price it is replacing", () => {
    const listing = makeListing({
      datePrices: [{ date: "2026-03-13", nightlyRate: 200 }],
    });
    const plan = datePlan(listing, {
      kind: "PRICE",
      to: { mode: "SET", value: 140 },
    });
    expect(plan.rows[0]).toEqual({
      field: "price",
      before: { code: "PRICE_RANGE", min: 120, max: 200 },
      after: { code: "PRICE_SINGLE", amount: 140 },
    });
    expect(plan.consequences).toEqual([
      { code: "PRICE_APPLIES", dates: 3, sellable: true },
    ]);
  });

  it("says a new price is not on offer when nothing can be booked", () => {
    const plan = datePlan(makeListing({ status: "DRAFT" }), {
      kind: "PRICE",
      to: { mode: "SET", value: 140 },
    });
    expect(plan.consequences).toEqual([
      { code: "PRICE_APPLIES", dates: 3, sellable: false },
    ]);
  });

  it("clears overrides when resetting to the base price", () => {
    const listing = makeListing({
      datePrices: [{ date: "2026-03-13", nightlyRate: 200 }],
    });
    const plan = datePlan(listing, { kind: "PRICE", to: { mode: "RESET" } });
    expect(plan.rows[0].after).toEqual({ code: "PRICE_BASE", amount: 120 });
    expect(plan.steps).toEqual([
      {
        type: "CLEAR_DATE_PRICE",
        startDate: "2026-03-12",
        endDate: "2026-03-15",
      },
    ]);
  });
});

describe("date review — promotions already in force", () => {
  const offer = {
    discountPercent: 20,
    minimumNights: 2,
    freeCleaning: false,
    roundToWholeUnit: true,
  };

  it("shows an always-active offer as the before state, not 'no promotion'", () => {
    const listing = makeListing({
      promotions: [promotion({ discountPercent: 10, minimumNights: 1 })],
    });
    const plan = datePlan(listing, { kind: "PROMOTION", offer });
    expect(plan.rows[0].before).toEqual({
      code: "PROMOTION_OFFER",
      discountPercent: 10,
      freeCleaning: false,
      minimumNights: 1,
      roundToWholeUnit: false,
      evergreen: true,
    });
    expect(plan.consequences).toEqual([
      { code: "PROMOTION_APPLIES", dates: 3, mode: "OVERRIDE", sellable: true },
    ]);
    // An always-active offer is never edited in place by a date-scoped change.
    expect(plan.steps[0]).toMatchObject({ promotionId: undefined });
  });

  it("edits in place when a dated offer covers exactly this range", () => {
    const listing = makeListing({
      promotions: [
        promotion({
          id: "dated-1",
          discountPercent: 15,
          minimumNights: 1,
          startDate: "2026-03-12",
          endDate: "2026-03-15",
        }),
      ],
    });
    const plan = datePlan(listing, { kind: "PROMOTION", offer });
    expect(plan.rows[0].before).toMatchObject({
      code: "PROMOTION_OFFER",
      discountPercent: 15,
      evergreen: false,
    });
    expect(plan.consequences[0]).toMatchObject({ mode: "EDIT" });
    expect(plan.steps[0]).toMatchObject({ promotionId: "dated-1" });
  });

  it("overrides rather than edits when a dated offer has different bounds", () => {
    const listing = makeListing({
      promotions: [
        promotion({
          id: "dated-2",
          discountPercent: 15,
          minimumNights: 1,
          startDate: "2026-03-01",
          endDate: "2026-04-01",
        }),
      ],
    });
    const plan = datePlan(listing, { kind: "PROMOTION", offer });
    expect(plan.consequences[0]).toMatchObject({ mode: "OVERRIDE" });
    expect(plan.steps[0]).toMatchObject({ promotionId: undefined });
  });

  it("says 'no promotion' only when none actually applies", () => {
    // Minimum stay of seven nights, against a three-night selection.
    const listing = makeListing({
      promotions: [promotion({ discountPercent: 25, minimumNights: 7 })],
    });
    const plan = datePlan(listing, { kind: "PROMOTION", offer });
    expect(plan.rows[0].before).toEqual({ code: "PROMOTION_NONE" });
    expect(plan.consequences[0]).toMatchObject({ mode: "CREATE" });
  });
});

describe("date review — fail closed", () => {
  it("produces no steps without a selection", () => {
    const plan = buildDateReviewPlan({
      listing: makeListing(),
      index: buildListingCalendarIndex(makeListing()),
      selection: null,
      change: { kind: "AVAILABILITY", to: "BLOCK" },
      today: TODAY,
    });
    expect(plan.errors).toEqual([{ code: "NO_SELECTION" }]);
    expect(plan.steps).toEqual([]);
  });

  it("produces no steps when nothing has been edited", () => {
    expect(datePlan(makeListing(), null).errors).toEqual([
      { code: "NO_CHANGES" },
    ]);
  });

  it("rejects a selection that reaches into the past and drops every step", () => {
    const listing = makeListing();
    const plan = buildDateReviewPlan({
      listing,
      index: buildListingCalendarIndex(listing),
      selection: { start: "2026-03-01", end: "2026-03-14" },
      change: { kind: "AVAILABILITY", to: "BLOCK" },
      today: TODAY,
    });
    expect(plan.errors).toContainEqual({ code: "PAST_DATE" });
    expect(plan.steps).toEqual([]);
    expect(plan.savable).toBe(false);
  });

  it.each([0, -50, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects the nightly price %p",
    (value) => {
      const plan = datePlan(makeListing(), {
        kind: "PRICE",
        to: { mode: "SET", value },
      });
      expect(plan.errors).toEqual([{ code: "INVALID_PRICE" }]);
      expect(plan.steps).toEqual([]);
    },
  );

  it("rejects a promotion with no benefit, or an out-of-range discount", () => {
    const base = {
      minimumNights: 2,
      freeCleaning: false,
      roundToWholeUnit: true,
    };
    for (const discountPercent of [0, 80, 10.5]) {
      const plan = datePlan(makeListing(), {
        kind: "PROMOTION",
        offer: { ...base, discountPercent },
      });
      expect(plan.errors).toEqual([{ code: "INVALID_PROMOTION" }]);
      expect(plan.steps).toEqual([]);
    }
  });

  it("refuses free cleaning when there is no cleaning fee to waive", () => {
    const listing = makeListing({
      pricing: {
        currency: "EUR",
        baseNightlyRate: 120,
        cleaningFee: 0,
        minNights: 1,
        maxNights: 365,
      },
    });
    expect(
      datePlan(listing, {
        kind: "PROMOTION",
        offer: {
          discountPercent: 0,
          minimumNights: 1,
          freeCleaning: true,
          roundToWholeUnit: false,
        },
      }).errors,
    ).toEqual([{ code: "FREE_CLEANING_WITHOUT_FEE" }]);
  });

  it("refuses a promotion on a listing that is not live", () => {
    expect(
      datePlan(makeListing({ status: "UNPUBLISHED" }), {
        kind: "PROMOTION",
        offer: {
          discountPercent: 15,
          minimumNights: 2,
          freeCleaning: false,
          roundToWholeUnit: true,
        },
      }).errors,
    ).toEqual([{ code: "PROMOTION_REQUIRES_LIVE" }]);
  });

  it("refuses price edits on a listing with no pricing rule", () => {
    const plan = datePlan(makeListing({ pricing: null }), {
      kind: "PRICE",
      to: { mode: "SET", value: 100 },
    });
    expect(plan.errors).toContainEqual({ code: "NO_PRICING" });
    expect(plan.steps).toEqual([]);
  });
});

describe("listing review — publish readiness", () => {
  it("publishes when every check `submitForReview` makes would pass", () => {
    const listing = makeListing({ status: "UNPUBLISHED" });
    const plan = listingPlan(listing, { kind: "VISIBILITY", to: "LIVE" });
    expect(plan.savable).toBe(true);
    expect(plan.steps).toEqual([{ type: "PUBLISH_LISTING" }]);
    expect(plan.consequences[0]).toMatchObject({ code: "LISTING_GOES_LIVE" });
  });

  it("lists a missing photo count as an actionable blocker", () => {
    const plan = listingPlan(makeListing({ status: "DRAFT", photoCount: 2 }), {
      kind: "VISIBILITY",
      to: "LIVE",
    });
    expect(plan.errors).toEqual([
      { code: "CANNOT_PUBLISH", blockers: ["PHOTOS"] },
    ]);
    expect(plan.steps).toEqual([]);
  });

  it("lists missing pricing as a blocker", () => {
    const plan = listingPlan(
      makeListing({ status: "DRAFT", pricing: null }),
      { kind: "VISIBILITY", to: "LIVE" },
    );
    expect(plan.errors[0]).toMatchObject({ code: "CANNOT_PUBLISH" });
    if (plan.errors[0].code === "CANNOT_PUBLISH") {
      expect(plan.errors[0].blockers).toContain("PRICING");
    }
  });

  it("blocks a never-published open listing with no confirmed availability start", () => {
    const plan = listingPlan(
      makeListing({ status: "DRAFT", publishedAt: null }),
      { kind: "VISIBILITY", to: "LIVE" },
    );
    expect(plan.errors[0]).toMatchObject({ code: "CANNOT_PUBLISH" });
    if (plan.errors[0].code === "CANNOT_PUBLISH") {
      expect(plan.errors[0].blockers).toContain("AVAILABILITY_UNCONFIRMED");
    }
  });

  it("accepts a never-published listing protected by a start-date block", () => {
    const plan = listingPlan(
      makeListing({
        status: "DRAFT",
        publishedAt: null,
        blocks: [
          {
            id: "start-block",
            startDate: TODAY,
            endDate: "2026-06-01",
            blockType: "MANUAL_BLOCK",
            reason: "Before the listing's availability start date",
            guestName: null,
            bookingStatus: null,
          },
        ],
      }),
      { kind: "VISIBILITY", to: "LIVE" },
    );
    expect(plan.errors).toEqual([]);
    expect(plan.savable).toBe(true);
  });

  it("reports every blocker at once rather than one at a time", () => {
    const plan = listingPlan(
      makeListing({
        status: "DRAFT",
        pricing: null,
        photoCount: 0,
        publishedAt: null,
      }),
      { kind: "VISIBILITY", to: "LIVE" },
    );
    if (plan.errors[0].code === "CANNOT_PUBLISH") {
      expect(plan.errors[0].blockers).toEqual([
        "PRICING",
        "PHOTOS",
        "AVAILABILITY_UNCONFIRMED",
      ]);
    }
  });

  it("refuses to publish a listing already on the site", () => {
    const plan = listingPlan(makeListing({ status: "APPROVED" }), {
      kind: "VISIBILITY",
      to: "LIVE",
    });
    if (plan.errors[0].code === "CANNOT_PUBLISH") {
      expect(plan.errors[0].blockers).toContain("STATUS");
    }
  });

  it("counts the dates publishing would make bookable, not merely open", () => {
    const listing = makeListing({
      status: "UNPUBLISHED",
      blocks: [manualBlock("2026-03-12", "2026-03-15")],
    });
    const plan = listingPlan(listing, { kind: "VISIBILITY", to: "LIVE" });
    const consequence = plan.consequences[0];
    if (consequence.code === "LISTING_GOES_LIVE") {
      const index = buildListingCalendarIndex(listing);
      const counts = countDates(listing, index, TODAY, HORIZON_END);
      expect(consequence.bookableDates).toBe(counts.openNotBookable);
      expect(consequence.bookableDates).toBe(counts.total - 3);
    }
  });
});

describe("listing review — availability mode", () => {
  it("reports the computed transition, not the rule alone", () => {
    const listing = makeListing({
      availabilityMode: "CLOSED",
      availabilityWindows: [{ id: "w", startDate: TODAY, endDate: "2026-03-20" }],
      blocks: [bookingBlock("2026-04-01", "2026-04-03")],
    });
    const plan = listingPlan(listing, { kind: "AVAILABILITY_MODE", to: "OPEN" });
    const consequence = plan.consequences[0];
    expect(consequence.code).toBe("MODE_TO_OPEN");
    if (consequence.code === "MODE_TO_OPEN") {
      expect(consequence.becomingBookable).toBe(consequence.becomingOpen);
      expect(consequence.stayingBlocked).toBe(2);
      expect(consequence.saleBlockers).toEqual([]);
    }
  });

  it("does not claim any date becomes bookable on an unsellable listing", () => {
    const listing = makeListing({
      status: "DRAFT",
      availabilityMode: "CLOSED",
    });
    const plan = listingPlan(listing, { kind: "AVAILABILITY_MODE", to: "OPEN" });
    const consequence = plan.consequences[0];
    if (consequence.code === "MODE_TO_OPEN") {
      expect(consequence.becomingOpen).toBeGreaterThan(0);
      expect(consequence.becomingBookable).toBe(0);
      expect(consequence.saleBlockers).toEqual(["NOT_LIVE"]);
    }
  });

  it("acknowledges windows that survive a switch to closed", () => {
    const listing = makeListing({
      availabilityWindows: [{ id: "w", startDate: TODAY, endDate: "2026-03-20" }],
    });
    const plan = listingPlan(listing, {
      kind: "AVAILABILITY_MODE",
      to: "CLOSED",
    });
    const consequence = plan.consequences[0];
    if (consequence.code === "MODE_TO_CLOSED") {
      expect(consequence.stayingOpenViaWindows).toBe(10);
      expect(consequence.losingBookability).toBe(consequence.closing);
    }
  });

  it("does nothing when the mode is already what was asked for", () => {
    const plan = listingPlan(makeListing(), {
      kind: "AVAILABILITY_MODE",
      to: "OPEN",
    });
    expect(plan.errors).toEqual([{ code: "MODE_UNCHANGED" }]);
    expect(plan.steps).toEqual([]);
  });
});

describe("listing review — minimum stay", () => {
  it("saves it as a listing-wide change, resending the untouched fields", () => {
    const plan = listingPlan(makeListing(), { kind: "MIN_NIGHTS", to: 5 });
    expect(plan.rows).toEqual([
      {
        field: "min_nights",
        before: { code: "NIGHTS", nights: 2 },
        after: { code: "NIGHTS", nights: 5 },
      },
    ]);
    expect(plan.consequences).toEqual([
      { code: "MIN_NIGHTS_ALL_DATES", minNights: 5 },
    ]);
    expect(plan.steps).toEqual([
      {
        type: "SET_MIN_NIGHTS",
        minNights: 5,
        baseNightlyRate: 120,
        cleaningFee: 30,
      },
    ]);
  });

  it.each([0, 1.5, -3, 400, Number.NaN])(
    "rejects the minimum stay %p",
    (value) => {
      const plan = listingPlan(makeListing(), { kind: "MIN_NIGHTS", to: value });
      expect(plan.steps).toEqual([]);
      expect(plan.savable).toBe(false);
    },
  );
});

describe("listing review — default pricing", () => {
  it("merges a partial edit with the loaded rule and performs one whole-rule mutation", () => {
    const plan = listingPlan(makeListing(), {
      kind: "DEFAULT_PRICING",
      to: { baseNightlyRate: 145 },
    });

    expect(plan.savable).toBe(true);
    expect(plan.saveAction).toBe("SAVE_DEFAULT_PRICING");
    expect(plan.rows).toEqual([
      {
        field: "base_price",
        before: { code: "PRICE_BASE", amount: 120 },
        after: { code: "PRICE_BASE", amount: 145 },
      },
    ]);
    expect(plan.consequences).toEqual([
      { code: "BASE_PRICE_FALLBACK", amount: 145 },
    ]);
    expect(plan.steps).toEqual([
      {
        type: "SET_DEFAULT_PRICING",
        baseNightlyRate: 145,
        cleaningFee: 30,
        minNights: 2,
      },
    ]);
  });

  it("reviews every edited pricing field but still emits one atomic service call", () => {
    const plan = listingPlan(makeListing(), {
      kind: "DEFAULT_PRICING",
      to: { baseNightlyRate: 150, cleaningFee: 40, minNights: 4 },
    });

    expect(plan.rows.map((row) => row.field)).toEqual([
      "base_price",
      "cleaning_fee",
      "min_nights",
    ]);
    expect(plan.consequences).toEqual([
      { code: "BASE_PRICE_FALLBACK", amount: 150 },
      {
        code: "CLEANING_FEE_ALL_STAYS",
        amount: 40,
        freeCleaningBenefitsRemoved: 0,
      },
      { code: "MIN_NIGHTS_ALL_DATES", minNights: 4 },
    ]);
    expect(plan.steps).toHaveLength(1);
  });

  it("discloses that setting the fee to zero removes free-cleaning benefits", () => {
    const listing = makeListing({
      promotions: [
        promotion({ id: "free-1", discountPercent: 0, freeCleaning: true }),
        promotion({ id: "both-1", discountPercent: 10, freeCleaning: true }),
        promotion({ id: "percent-1", discountPercent: 10, freeCleaning: false }),
      ],
    });
    const plan = listingPlan(listing, {
      kind: "DEFAULT_PRICING",
      to: { cleaningFee: 0 },
    });

    expect(plan.consequences).toEqual([
      {
        code: "CLEANING_FEE_ALL_STAYS",
        amount: 0,
        freeCleaningBenefitsRemoved: 2,
      },
    ]);
    expect(plan.steps[0]).toMatchObject({
      type: "SET_DEFAULT_PRICING",
      baseNightlyRate: 120,
      minNights: 2,
      cleaningFee: 0,
    });
  });

  it("fails closed when the rule is missing or every proposed value is unchanged", () => {
    const missing = listingPlan(makeListing({ pricing: null }), {
      kind: "DEFAULT_PRICING",
      to: { baseNightlyRate: 140 },
    });
    expect(missing.errors).toEqual([{ code: "NO_PRICING" }]);
    expect(missing.steps).toEqual([]);

    const unchanged = listingPlan(makeListing(), {
      kind: "DEFAULT_PRICING",
      to: { baseNightlyRate: 120, cleaningFee: 30 },
    });
    expect(unchanged.errors).toEqual([{ code: "NO_CHANGES" }]);
    expect(unchanged.steps).toEqual([]);
  });

  it("rejects invalid values without exposing the otherwise-valid merged step", () => {
    const plan = listingPlan(makeListing(), {
      kind: "DEFAULT_PRICING",
      to: {
        baseNightlyRate: 0,
        cleaningFee: -1,
        minNights: 400,
      },
    });
    expect(plan.errors).toEqual([
      { code: "INVALID_PRICE" },
      { code: "INVALID_CLEANING_FEE" },
      { code: "INVALID_MIN_NIGHTS", maxNights: 365 },
    ]);
    expect(plan.steps).toEqual([]);
    expect(plan.savable).toBe(false);
  });
});

describe("listing review — always-active promotions", () => {
  const newOffer = {
    discountPercent: 15,
    minimumNights: 3,
    freeCleaning: false,
    roundToWholeUnit: true,
  };

  it("creates an evergreen offer by deliberately omitting dates", () => {
    const plan = listingPlan(makeListing(), {
      kind: "EVERGREEN_PROMOTION",
      action: "UPSERT",
      offer: newOffer,
    });

    expect(plan.savable).toBe(true);
    expect(plan.saveAction).toBe("SAVE_EVERGREEN_PROMOTION");
    expect(plan.rows).toEqual([
      {
        field: "promotion",
        before: { code: "PROMOTION_NONE" },
        after: {
          code: "PROMOTION_OFFER",
          discountPercent: 15,
          minimumNights: 3,
          freeCleaning: false,
          roundToWholeUnit: true,
          evergreen: true,
        },
      },
    ]);
    expect(plan.steps).toEqual([
      {
        type: "SAVE_EVERGREEN_PROMOTION",
        promotionId: undefined,
        ...newOffer,
      },
    ]);
    expect(plan.steps[0]).not.toHaveProperty("startDate");
    expect(plan.steps[0]).not.toHaveProperty("endDate");
  });

  it("edits the requested evergreen offer in place and preserves rounding", () => {
    const listing = makeListing({
      promotions: [
        promotion({
          id: "evergreen-1",
          discountPercent: 10,
          minimumNights: 2,
          roundToWholeUnit: false,
        }),
      ],
    });
    const plan = listingPlan(listing, {
      kind: "EVERGREEN_PROMOTION",
      action: "UPSERT",
      offer: { ...newOffer, promotionId: "evergreen-1" },
    });

    expect(plan.rows[0]?.before).toMatchObject({
      code: "PROMOTION_OFFER",
      roundToWholeUnit: false,
      evergreen: true,
    });
    expect(plan.rows[0]?.after).toMatchObject({ roundToWholeUnit: true });
    expect(plan.consequences).toEqual([
      { code: "EVERGREEN_PROMOTION_SAVED", mode: "EDIT" },
    ]);
    expect(plan.steps[0]).toMatchObject({
      type: "SAVE_EVERGREEN_PROMOTION",
      promotionId: "evergreen-1",
      roundToWholeUnit: true,
    });
  });

  it("normalizes irrelevant rounding off for a free-cleaning-only offer", () => {
    const plan = listingPlan(makeListing(), {
      kind: "EVERGREEN_PROMOTION",
      action: "UPSERT",
      offer: {
        discountPercent: 0,
        minimumNights: 2,
        freeCleaning: true,
        roundToWholeUnit: true,
      },
    });
    expect(plan.steps[0]).toMatchObject({ roundToWholeUnit: false });
    expect(plan.rows[0]?.after).toMatchObject({ roundToWholeUnit: false });
  });

  it("removes exactly the selected evergreen offer", () => {
    const listing = makeListing({
      promotions: [promotion({ id: "evergreen-1", roundToWholeUnit: true })],
    });
    const plan = listingPlan(listing, {
      kind: "EVERGREEN_PROMOTION",
      action: "REMOVE",
      promotionId: "evergreen-1",
    });

    expect(plan.saveAction).toBe("REMOVE_EVERGREEN_PROMOTION");
    expect(plan.rows[0]?.after).toEqual({ code: "PROMOTION_NONE" });
    expect(plan.consequences).toEqual([
      { code: "EVERGREEN_PROMOTION_REMOVED" },
    ]);
    expect(plan.steps).toEqual([
      { type: "REMOVE_PROMOTION", promotionId: "evergreen-1" },
    ]);
  });

  it("refuses a missing offer or a date-specific offer from the all-dates editor", () => {
    const listing = makeListing({
      promotions: [
        promotion({
          id: "dated-1",
          startDate: "2026-05-01",
          endDate: "2026-06-01",
        }),
      ],
    });
    const missing = listingPlan(listing, {
      kind: "EVERGREEN_PROMOTION",
      action: "REMOVE",
      promotionId: "missing",
    });
    expect(missing.errors).toContainEqual({ code: "PROMOTION_NOT_FOUND" });
    expect(missing.steps).toEqual([]);

    const dated = listingPlan(listing, {
      kind: "EVERGREEN_PROMOTION",
      action: "UPSERT",
      offer: { ...newOffer, promotionId: "dated-1" },
    });
    expect(dated.errors).toContainEqual({ code: "PROMOTION_NOT_EVERGREEN" });
    expect(dated.steps).toEqual([]);
  });

  it("preflights the canonical same-minimum evergreen conflict", () => {
    const listing = makeListing({
      promotions: [promotion({ id: "existing", minimumNights: 3 })],
    });
    const plan = listingPlan(listing, {
      kind: "EVERGREEN_PROMOTION",
      action: "UPSERT",
      offer: newOffer,
    });
    expect(plan.errors).toContainEqual({
      code: "PROMOTION_CONFLICT",
      minimumNights: 3,
    });
    expect(plan.steps).toEqual([]);
  });

  it("fails closed for unchanged, invalid, unpriced, and non-live offers", () => {
    const existing = promotion({
      id: "evergreen-1",
      discountPercent: 15,
      minimumNights: 3,
      roundToWholeUnit: true,
    });
    const unchanged = listingPlan(makeListing({ promotions: [existing] }), {
      kind: "EVERGREEN_PROMOTION",
      action: "UPSERT",
      offer: { ...newOffer, promotionId: "evergreen-1" },
    });
    expect(unchanged.errors).toEqual([{ code: "NO_CHANGES" }]);
    expect(unchanged.steps).toEqual([]);

    const invalid = listingPlan(makeListing(), {
      kind: "EVERGREEN_PROMOTION",
      action: "UPSERT",
      offer: { ...newOffer, discountPercent: 51 },
    });
    expect(invalid.errors).toEqual([{ code: "INVALID_PROMOTION" }]);
    expect(invalid.steps).toEqual([]);

    const unpriced = listingPlan(makeListing({ pricing: null }), {
      kind: "EVERGREEN_PROMOTION",
      action: "UPSERT",
      offer: newOffer,
    });
    expect(unpriced.errors).toEqual([{ code: "NO_PRICING" }]);
    expect(unpriced.steps).toEqual([]);

    const hidden = listingPlan(makeListing({ status: "UNPUBLISHED" }), {
      kind: "EVERGREEN_PROMOTION",
      action: "UPSERT",
      offer: newOffer,
    });
    expect(hidden.errors).toContainEqual({ code: "PROMOTION_REQUIRES_LIVE" });
    expect(hidden.steps).toEqual([]);
  });
});
