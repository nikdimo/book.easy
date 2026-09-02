import { describe, expect, it } from "vitest";
import {
  buildListingCalendarIndex,
  countDates,
  resolveDay,
  resolveSelectionStayBookability,
  sellsFixedStays,
  summarizeSelectionAvailability,
} from "@/lib/host/v2/calendar-model";
import {
  backFrom,
  ctaForEditor,
  editorScope,
  openEditor,
  scopeOfSelection,
  viewAfterScopeChange,
  WORKBENCH_MENU,
} from "@/lib/host/v2/calendar-workbench";
import { eachYmdExclusive } from "@/lib/utils/date-only";
import type { HostCalendarFixedStay } from "@/lib/host/v2/calendar-types";
import { makeListing, manualBlock, TODAY } from "./fixtures";

/**
 * What the host's own calendar says about a listing that sells whole stays.
 *
 * The grid, the counts and the panel all read `resolveDay`, so this is the one place the
 * fixed-mode rule has to be right: the union of the offered stays is open, everything
 * else in the horizon is closed, and none of it is a night the host can open by hand —
 * there is no such thing as opening one night on a listing that sells whole stays.
 */

const stay = (
  id: string,
  checkIn: string,
  checkOut: string,
  state: HostCalendarFixedStay["state"] = "AVAILABLE",
): HostCalendarFixedStay => ({
  id,
  checkIn,
  checkOut,
  nights: eachYmdExclusive(checkIn, checkOut).length,
  state,
  manageable: state !== "BOOKED" && state !== "PAST",
});

const fixedListing = (periods: HostCalendarFixedStay[], overrides = {}) =>
  makeListing({
    bookingMode: "FIXED_STAYS",
    fixedStayPeriods: periods,
    ...overrides,
  });

/** Every night the grid would draw as open, across the fixture's own window. */
function openNights(listing: ReturnType<typeof makeListing>): string[] {
  const index = buildListingCalendarIndex(listing);
  return eachYmdExclusive(TODAY, "2026-05-10").filter(
    (date) => resolveDay(listing, index, date, TODAY).open,
  );
}

describe("the calendar's fixed-stay rule", () => {
  it("opens exactly the nights of one offered stay", () => {
    const listing = fixedListing([stay("a", "2026-04-04", "2026-04-11")]);
    expect(openNights(listing)).toEqual(
      eachYmdExclusive("2026-04-04", "2026-04-11"),
    );
  });

  it("closes the gaps before, between and after the stays", () => {
    const listing = fixedListing([
      stay("a", "2026-04-04", "2026-04-11"),
      stay("b", "2026-04-25", "2026-05-02"),
    ]);
    const open = new Set(openNights(listing));
    expect(open.has("2026-04-03")).toBe(false);
    expect(open.has("2026-04-11")).toBe(false);
    expect(open.has("2026-04-18")).toBe(false);
    expect(open.has("2026-05-02")).toBe(false);
    expect(open.has(TODAY)).toBe(false);
  });

  it("unions two overlapping stays", () => {
    const listing = fixedListing([
      stay("week", "2026-04-04", "2026-04-11"),
      stay("fortnight", "2026-04-04", "2026-04-18"),
    ]);
    expect(openNights(listing)).toEqual(
      eachYmdExclusive("2026-04-04", "2026-04-18"),
    );
  });

  it("runs two back-to-back stays together with no closed sliver", () => {
    const listing = fixedListing([
      stay("a", "2026-04-04", "2026-04-11"),
      stay("b", "2026-04-11", "2026-04-18"),
    ]);
    expect(openNights(listing)).toEqual(
      eachYmdExclusive("2026-04-04", "2026-04-18"),
    );
  });

  it("opens nothing for a switched-off or already-started stay", () => {
    expect(
      openNights(fixedListing([stay("off", "2026-04-04", "2026-04-11", "DISABLED")])),
    ).toEqual([]);
    expect(
      openNights(fixedListing([stay("gone", "2026-03-01", "2026-03-08", "PAST")])),
    ).toEqual([]);
  });

  it("opens nothing at all when the host has added no stays", () => {
    expect(openNights(fixedListing([]))).toEqual([]);
  });

  it("names a night outside every stay, and offers no way to open it", () => {
    const listing = fixedListing([stay("a", "2026-04-04", "2026-04-11")]);
    const index = buildListingCalendarIndex(listing);
    const outside = resolveDay(listing, index, "2026-04-20", TODAY);
    expect(outside.state).toBe("blocked");
    expect(outside.reason).toBe("outside_fixed_stay");
    // The remedy is adding a stay, not opening a night — so the grid offers nothing.
    expect(outside.editable).toBe(false);
  });

  it("lets a block override an offered stay", () => {
    const listing = fixedListing([stay("a", "2026-04-04", "2026-04-11")], {
      blocks: [manualBlock("2026-04-06", "2026-04-08")],
    });
    const index = buildListingCalendarIndex(listing);
    expect(resolveDay(listing, index, "2026-04-06", TODAY).state).toBe("blocked");
    expect(resolveDay(listing, index, "2026-04-06", TODAY).reason).toBe("manual");
    // A manual block inside an offered stay is still the host's own, so still theirs
    // to lift.
    expect(resolveDay(listing, index, "2026-04-06", TODAY).editable).toBe(true);
    expect(resolveDay(listing, index, "2026-04-05", TODAY).state).toBe("available");
  });

  it("ignores availability windows and the closed-by-default rule", () => {
    const listing = fixedListing([stay("a", "2026-04-04", "2026-04-11")], {
      availabilityMode: "CLOSED",
      availabilityWindows: [
        { id: "w", startDate: "2026-06-01", endDate: "2026-06-30" },
      ],
    });
    expect(openNights(listing)).toEqual(
      eachYmdExclusive("2026-04-04", "2026-04-11"),
    );
  });

  it("ignores the minimum stay for one exact offered stay", () => {
    const listing = fixedListing([stay("a", "2026-04-04", "2026-04-11")], {
      pricing: {
        currency: "EUR",
        baseNightlyRate: 120,
        cleaningFee: 30,
        minNights: 30,
        maxNights: 365,
      },
    });
    const index = buildListingCalendarIndex(listing);
    const dates = eachYmdExclusive("2026-04-04", "2026-04-11");
    const availability = summarizeSelectionAvailability(
      listing,
      index,
      dates,
      TODAY,
    );
    expect(
      resolveSelectionStayBookability({ listing, availability, dates }),
    ).toEqual({ code: "BOOKABLE" });
  });

  it("does not call a partial offered week bookable", () => {
    const listing = fixedListing([stay("a", "2026-04-04", "2026-04-11")]);
    const index = buildListingCalendarIndex(listing);
    const dates = ["2026-04-04", "2026-04-05"];
    const availability = summarizeSelectionAvailability(
      listing,
      index,
      dates,
      TODAY,
    );
    expect(
      resolveSelectionStayBookability({ listing, availability, dates }),
    ).toEqual({ code: "NOT_FIXED_STAY", nights: 2 });
  });

  it("counts the offered nights as bookable and the rest as blocked", () => {
    const listing = fixedListing([stay("a", "2026-04-04", "2026-04-11")]);
    const index = buildListingCalendarIndex(listing);
    const counts = countDates(listing, index, TODAY, "2026-05-10");
    expect(counts.bookable).toBe(7);
    expect(counts.blocked).toBe(counts.total - 7);
    expect(counts.booked).toBe(0);
  });

  it("names the mode without anyone reading the column by hand", () => {
    expect(sellsFixedStays(fixedListing([]))).toBe(true);
    expect(sellsFixedStays(makeListing())).toBe(false);
  });
});

describe("a flexible listing's calendar is unchanged", () => {
  it("still opens every unblocked night on an OPEN calendar", () => {
    const listing = makeListing({
      // Stays it kept from selling fixed must open and close nothing here.
      fixedStayPeriods: [stay("a", "2026-04-04", "2026-04-11")],
      blocks: [manualBlock("2026-04-06", "2026-04-08")],
    });
    const index = buildListingCalendarIndex(listing);
    expect(resolveDay(listing, index, "2026-04-20", TODAY).state).toBe("available");
    expect(resolveDay(listing, index, "2026-04-06", TODAY).reason).toBe("manual");
  });

  it("still closes an unopened night on a CLOSED calendar, and still lets it be opened", () => {
    const listing = makeListing({
      availabilityMode: "CLOSED",
      availabilityWindows: [
        { id: "w", startDate: "2026-04-01", endDate: "2026-04-10" },
      ],
    });
    const index = buildListingCalendarIndex(listing);
    const outside = resolveDay(listing, index, "2026-04-20", TODAY);
    expect(outside.reason).toBe("closed_default");
    expect(outside.editable).toBe(true);
    expect(resolveDay(listing, index, "2026-04-05", TODAY).state).toBe("available");
  });

  it("still enforces the minimum stay on a selection", () => {
    const listing = makeListing({
      pricing: {
        currency: "EUR",
        baseNightlyRate: 120,
        cleaningFee: 30,
        minNights: 5,
        maxNights: 365,
      },
    });
    const index = buildListingCalendarIndex(listing);
    const availability = summarizeSelectionAvailability(
      listing,
      index,
      ["2026-04-04", "2026-04-05"],
      TODAY,
    );
    expect(
      resolveSelectionStayBookability({ listing, availability, dates: ["2026-04-04", "2026-04-05"] }).code,
    ).toBe("BELOW_MINIMUM");
  });
});

describe("where Booking method lives in the panel", () => {
  it("is the one destination reachable with no dates selected", () => {
    expect(WORKBENCH_MENU.ALL_FUTURE).toEqual(["booking-method"]);
    expect(WORKBENCH_MENU.DATES).not.toContain("booking-method");
    expect(scopeOfSelection(null)).toBe("ALL_FUTURE");
  });

  it("belongs to the listing rather than to selected dates", () => {
    expect(editorScope("booking-method")).toBe("ALL_FUTURE");
    for (const dated of ["availability", "pricing", "promotions"] as const) {
      expect(editorScope(dated)).toBe("DATES");
    }
  });

  it("opens with no selection and is refused with one", () => {
    expect(openEditor("booking-method", "ALL_FUTURE")).toEqual({
      kind: "editor",
      editor: "booking-method",
    });
    expect(openEditor("booking-method", "DATES")).toBeNull();
    // And the mirror: a date editor is still refused with nothing selected.
    expect(openEditor("availability", "ALL_FUTURE")).toBeNull();
  });

  it("closes back to the menu the moment dates are selected", () => {
    const open = { kind: "editor", editor: "booking-method" } as const;
    expect(viewAfterScopeChange(open, "ALL_FUTURE")).toBe(open);
    expect(viewAfterScopeChange(open, "DATES")).toEqual({ kind: "menu" });
    expect(backFrom(open)).toEqual({ kind: "menu" });
  });

  it("carries no sticky review action of its own", () => {
    // It holds several independent actions; one footer button would have to mean
    // whichever was last touched.
    expect(ctaForEditor("booking-method")).toBeNull();
    expect(ctaForEditor("pricing")).toBe("REVIEW_PRICE");
  });
});
