import { describe, expect, it } from "vitest";
import {
  buildScheduledChanges,
  filterScheduledChanges,
  isDatedPromotion,
  scheduledChangeCounts,
  SCHEDULED_FILTERS,
} from "@/lib/host/v2/calendar-schedule";
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

function build(listing: HostCalendarListing) {
  return buildScheduledChanges({ listing, today: TODAY, horizonEnd: HORIZON_END });
}

describe("what counts as a scheduled change", () => {
  it("reports a manual block as one row for its whole run, with its note", () => {
    const listing = makeListing({
      blocks: [
        { ...manualBlock("2026-03-12", "2026-03-15"), reason: "  Bathroom refit  " },
      ],
    });
    const [entry] = build(listing);
    expect(entry).toMatchObject({
      kind: "MANUAL_BLOCK",
      category: "availability",
      from: "2026-03-12",
      to: "2026-03-14",
      nights: 3,
      note: "Bathroom refit",
      editable: true,
      protection: null,
    });
    expect(entry.target).toEqual({
      selection: { start: "2026-03-12", end: "2026-03-14" },
      editor: "availability",
    });
  });

  it("carries no note when the block never had one", () => {
    const listing = makeListing({
      blocks: [manualBlock("2026-03-12", "2026-03-15")],
    });
    expect(build(listing)[0].note).toBeNull();
  });

  it("clips a run that started before today", () => {
    const listing = makeListing({
      blocks: [manualBlock("2026-03-01", "2026-03-13")],
    });
    expect(build(listing)[0]).toMatchObject({
      from: TODAY,
      to: "2026-03-12",
      nights: 3,
    });
  });

  it("drops a run that is entirely in the past", () => {
    const listing = makeListing({
      blocks: [manualBlock("2026-02-01", "2026-03-05")],
    });
    expect(build(listing)).toEqual([]);
  });

  it("lists explicit open windows only while the listing is closed by default", () => {
    const windows = [
      { id: "window-1", startDate: "2026-04-01", endDate: "2026-04-05" },
    ];
    expect(
      build(makeListing({ availabilityMode: "OPEN", availabilityWindows: windows })),
    ).toEqual([]);
    const closed = build(
      makeListing({ availabilityMode: "CLOSED", availabilityWindows: windows }),
    );
    expect(closed).toHaveLength(1);
    expect(closed[0]).toMatchObject({
      kind: "OPEN_WINDOW",
      category: "availability",
      from: "2026-04-01",
      to: "2026-04-04",
    });
  });
});

describe("grouping custom prices", () => {
  it("collapses consecutive dates that share a rate into one row", () => {
    const listing = makeListing({
      datePrices: [
        { date: "2026-04-01", nightlyRate: 140 },
        { date: "2026-04-02", nightlyRate: 140 },
        { date: "2026-04-03", nightlyRate: 140 },
      ],
    });
    const entries = build(listing);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      kind: "DATE_PRICE",
      from: "2026-04-01",
      to: "2026-04-03",
      nights: 3,
      nightlyRate: 140,
    });
  });

  it("starts a new row when the rate changes", () => {
    const listing = makeListing({
      datePrices: [
        { date: "2026-04-01", nightlyRate: 140 },
        { date: "2026-04-02", nightlyRate: 160 },
      ],
    });
    expect(build(listing).map((entry) => entry.nightlyRate)).toEqual([140, 160]);
  });

  it("starts a new row across a gap, because the dates between are not priced", () => {
    const listing = makeListing({
      datePrices: [
        { date: "2026-04-01", nightlyRate: 140 },
        { date: "2026-04-03", nightlyRate: 140 },
      ],
    });
    const entries = build(listing);
    expect(entries).toHaveLength(2);
    expect(entries.map((entry) => entry.from)).toEqual(["2026-04-01", "2026-04-03"]);
  });

  it("never emits a row per date for a long unchanged run", () => {
    const datePrices = Array.from({ length: 60 }, (_, offset) => {
      const day = String(offset + 1).padStart(2, "0");
      return { date: `2026-05-${day}`, nightlyRate: 150 };
    }).slice(0, 31);
    const entries = build(makeListing({ datePrices }));
    expect(entries).toHaveLength(1);
    expect(entries[0].nights).toBe(31);
  });

  it("opens its editor on the run it grouped", () => {
    const listing = makeListing({
      datePrices: [
        { date: "2026-04-01", nightlyRate: 140 },
        { date: "2026-04-02", nightlyRate: 140 },
      ],
    });
    expect(build(listing)[0].target).toEqual({
      selection: { start: "2026-04-01", end: "2026-04-02" },
      editor: "pricing",
    });
  });
});

describe("promotions", () => {
  it("lists a dated offer and ignores an always-active one", () => {
    const listing = makeListing({
      promotions: [
        promotion({ id: "ongoing" }),
        promotion({
          id: "dated",
          startDate: "2026-04-01",
          endDate: "2026-04-08",
        }),
      ],
    });
    expect(isDatedPromotion(listing.promotions[0])).toBe(false);
    expect(isDatedPromotion(listing.promotions[1])).toBe(true);
    const entries = build(listing);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      kind: "DATED_PROMOTION",
      category: "promotions",
      from: "2026-04-01",
      to: "2026-04-07",
      nights: 7,
    });
  });

  it("selects the offer's own range, so its editor updates it in place", () => {
    const listing = makeListing({
      promotions: [
        promotion({ id: "dated", startDate: "2026-04-01", endDate: "2026-04-08" }),
      ],
    });
    // `promotionSaveMode` reads the exclusive checkout boundary back off this
    // inclusive selection, so an exact match here is what produces an edit rather
    // than a second offer stacked on top.
    expect(build(listing)[0].target).toEqual({
      selection: { start: "2026-04-01", end: "2026-04-07" },
      editor: "promotions",
    });
  });

  it("carries the stored offer so the row can be edited or removed by id", () => {
    const listing = makeListing({
      promotions: [
        promotion({ id: "dated", startDate: "2026-04-01", endDate: "2026-04-08" }),
      ],
    });
    const [entry] = build(listing);
    expect(entry.promotion?.id).toBe("dated");
    expect(entry.editable).toBe(true);
  });
});

describe("protected entries", () => {
  it("marks a reservation read-only and says which guest holds it", () => {
    const listing = makeListing({
      blocks: [bookingBlock("2026-03-20", "2026-03-23", "Ana")],
    });
    const [entry] = build(listing);
    expect(entry).toMatchObject({
      kind: "RESERVATION",
      category: "reservations",
      editable: false,
      protection: "RESERVATION",
      guestName: "Ana",
      note: null,
    });
  });

  it("marks an imported block read-only and files it under availability", () => {
    const listing = makeListing({
      blocks: [externalBlock("2026-03-20", "2026-03-23")],
    });
    const [entry] = build(listing);
    expect(entry).toMatchObject({
      kind: "EXTERNAL_BLOCK",
      category: "availability",
      editable: false,
      protection: "EXTERNAL",
    });
  });

  it("never attaches a note to a reservation or an imported block", () => {
    const listing = makeListing({
      blocks: [
        { ...bookingBlock("2026-03-20", "2026-03-23"), reason: "internal" },
        { ...externalBlock("2026-03-24", "2026-03-26"), reason: "airbnb" },
      ],
    });
    for (const entry of build(listing)) expect(entry.note).toBeNull();
  });

  it("still opens an editor, which is what explains why it cannot be changed", () => {
    const listing = makeListing({
      blocks: [bookingBlock("2026-03-20", "2026-03-23")],
    });
    expect(build(listing)[0].target.editor).toBe("availability");
  });
});

describe("ordering and filtering", () => {
  const listing = makeListing({
    availabilityMode: "OPEN",
    blocks: [
      manualBlock("2026-04-10", "2026-04-12"),
      bookingBlock("2026-03-20", "2026-03-23"),
      externalBlock("2026-05-01", "2026-05-03"),
    ],
    datePrices: [{ date: "2026-04-01", nightlyRate: 140 }],
    promotions: [
      promotion({ id: "dated", startDate: "2026-06-01", endDate: "2026-06-08" }),
    ],
  });

  it("reads in date order", () => {
    expect(build(listing).map((entry) => entry.from)).toEqual([
      "2026-03-20",
      "2026-04-01",
      "2026-04-10",
      "2026-05-01",
      "2026-06-01",
    ]);
  });

  it("counts each category, and everything under All", () => {
    const counts = scheduledChangeCounts(build(listing));
    expect(counts).toEqual({
      all: 5,
      availability: 2,
      pricing: 1,
      promotions: 1,
      reservations: 1,
    });
  });

  it("filters to one category at a time and back to everything", () => {
    const entries = build(listing);
    expect(filterScheduledChanges(entries, "all")).toHaveLength(5);
    expect(
      filterScheduledChanges(entries, "availability").map((entry) => entry.kind),
    ).toEqual(["MANUAL_BLOCK", "EXTERNAL_BLOCK"]);
    expect(filterScheduledChanges(entries, "pricing")).toHaveLength(1);
    expect(filterScheduledChanges(entries, "promotions")).toHaveLength(1);
    expect(filterScheduledChanges(entries, "reservations")).toHaveLength(1);
  });

  it("has a filter for every category it can produce", () => {
    const categories = new Set(build(listing).map((entry) => entry.category));
    for (const category of categories) {
      expect(SCHEDULED_FILTERS).toContain(category);
    }
  });

  it("reports nothing at all for a listing with no decisions on it", () => {
    const counts = scheduledChangeCounts(build(makeListing()));
    expect(build(makeListing())).toEqual([]);
    expect(counts.all).toBe(0);
  });
});
