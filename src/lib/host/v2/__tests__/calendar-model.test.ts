import { describe, expect, it } from "vitest";
import {
  buildListingCalendarIndex,
  countDates,
  simulateAvailabilityModeChange,
  isBookableDate,
  isSelectionStayBookable,
  resolveDay,
  resolveSelectionStayBookability,
  summarizeSelectionAvailability,
  summarizeSelectionPrices,
} from "@/lib/host/v2/calendar-model";
import { addDaysToYmd } from "@/lib/utils/date-only";
import {
  bookingBlock,
  externalBlock,
  HORIZON_END,
  makeListing,
  manualBlock,
  promotion,
  TODAY,
} from "./fixtures";

describe("promotion calendar markers", () => {
  it("counts enabled dated promotions on each covered night", () => {
    const listing = makeListing({
      promotions: [
        promotion({ startDate: "2026-03-12", endDate: "2026-03-15" }),
        promotion({
          id: "second",
          startDate: "2026-03-13",
          endDate: "2026-03-14",
        }),
        promotion({ id: "ongoing", startDate: null, endDate: null }),
      ],
    });
    const index = buildListingCalendarIndex(listing);

    expect(index.promotionCountByDate.get("2026-03-12")).toBe(1);
    expect(index.promotionCountByDate.get("2026-03-13")).toBe(2);
    expect(index.promotionCountByDate.get("2026-03-14")).toBe(1);
    expect(index.promotionCountByDate.has("2026-03-15")).toBe(false);
  });
});

describe("resolveDay", () => {
  it("marks dates before today as past and not editable", () => {
    const listing = makeListing();
    const index = buildListingCalendarIndex(listing);
    const day = resolveDay(listing, index, "2026-03-09", TODAY);
    expect(day.state).toBe("past");
    expect(day.editable).toBe(false);
  });

  it("reports a reservation ahead of any other reason and refuses editing", () => {
    const listing = makeListing({
      blocks: [
        bookingBlock("2026-03-12", "2026-03-15"),
        manualBlock("2026-03-12", "2026-03-13"),
      ],
    });
    const index = buildListingCalendarIndex(listing);
    const day = resolveDay(listing, index, "2026-03-12", TODAY);
    expect(day.state).toBe("booked");
    expect(day.reason).toBe("reservation");
    expect(day.editable).toBe(false);
    expect(day.guestName).toBe("Ana");
  });

  it("treats the checkout day of a reservation as free again", () => {
    const listing = makeListing({ blocks: [bookingBlock("2026-03-12", "2026-03-15")] });
    const index = buildListingCalendarIndex(listing);
    expect(resolveDay(listing, index, "2026-03-14", TODAY).state).toBe("booked");
    expect(resolveDay(listing, index, "2026-03-15", TODAY).state).toBe("available");
  });

  it("keeps imported blocks visible but out of the host's hands", () => {
    const listing = makeListing({ blocks: [externalBlock("2026-03-20", "2026-03-22")] });
    const index = buildListingCalendarIndex(listing);
    const day = resolveDay(listing, index, "2026-03-20", TODAY);
    expect(day.state).toBe("blocked");
    expect(day.reason).toBe("external");
    expect(day.editable).toBe(false);
  });

  it("closes every uncovered date on a closed-by-default listing", () => {
    const listing = makeListing({
      availabilityMode: "CLOSED",
      availabilityWindows: [
        { id: "w1", startDate: "2026-04-01", endDate: "2026-04-10" },
      ],
    });
    const index = buildListingCalendarIndex(listing);
    expect(resolveDay(listing, index, "2026-03-20", TODAY).reason).toBe(
      "closed_default",
    );
    expect(resolveDay(listing, index, "2026-04-05", TODAY).state).toBe("available");
    // The window's own exclusive end is not covered by it.
    expect(resolveDay(listing, index, "2026-04-10", TODAY).state).toBe("blocked");
  });

  it("lets a manual block override an open window, as the booking path does", () => {
    const listing = makeListing({
      availabilityMode: "CLOSED",
      availabilityWindows: [
        { id: "w1", startDate: "2026-04-01", endDate: "2026-04-10" },
      ],
      blocks: [manualBlock("2026-04-03", "2026-04-05")],
    });
    const index = buildListingCalendarIndex(listing);
    expect(isBookableDate(listing, index, "2026-04-03", TODAY)).toBe(false);
    expect(isBookableDate(listing, index, "2026-04-05", TODAY)).toBe(true);
  });

  it("uses a date override for the effective price and flags it as custom", () => {
    const listing = makeListing({
      datePrices: [{ date: "2026-03-14", nightlyRate: 210 }],
    });
    const index = buildListingCalendarIndex(listing);
    expect(resolveDay(listing, index, "2026-03-14", TODAY)).toMatchObject({
      price: 210,
      customPrice: true,
    });
    expect(resolveDay(listing, index, "2026-03-15", TODAY)).toMatchObject({
      price: 120,
      customPrice: false,
    });
  });
});

describe("countDates", () => {
  it("counts every state across the loaded window", () => {
    const listing = makeListing({
      blocks: [
        manualBlock("2026-03-11", "2026-03-14"),
        bookingBlock("2026-03-20", "2026-03-22"),
      ],
    });
    const index = buildListingCalendarIndex(listing);
    const counts = countDates(listing, index, TODAY, HORIZON_END);
    expect(counts.blocked).toBe(3);
    expect(counts.booked).toBe(2);
    expect(counts.bookable).toBe(counts.total - 5);
    expect(counts.total).toBeGreaterThan(500);
  });

  it("reports no bookable dates when the whole future is blocked", () => {
    const listing = makeListing({
      blocks: [manualBlock(TODAY, "2100-01-01")],
    });
    const index = buildListingCalendarIndex(listing);
    expect(countDates(listing, index, TODAY, HORIZON_END).bookable).toBe(0);
  });
});

describe("openness versus bookability", () => {
  it("does not call an open date available when the listing has no pricing", () => {
    const listing = makeListing({ pricing: null });
    const index = buildListingCalendarIndex(listing);
    const day = resolveDay(listing, index, "2026-03-20", TODAY);
    expect(day.open).toBe(true);
    expect(day.state).toBe("open_not_bookable");
    expect(day.saleBlockers).toEqual(["NO_PRICING"]);
    expect(isBookableDate(listing, index, "2026-03-20", TODAY)).toBe(false);
  });

  it("does not call an open date available when the listing is hidden", () => {
    const listing = makeListing({ status: "UNPUBLISHED" });
    const index = buildListingCalendarIndex(listing);
    const day = resolveDay(listing, index, "2026-03-20", TODAY);
    expect(day.state).toBe("open_not_bookable");
    expect(day.saleBlockers).toEqual(["NOT_LIVE"]);
  });

  it("counts those dates apart from bookable ones, never inside them", () => {
    const listing = makeListing({ pricing: null });
    const index = buildListingCalendarIndex(listing);
    const counts = countDates(listing, index, TODAY, HORIZON_END);
    expect(counts.bookable).toBe(0);
    expect(counts.openNotBookable).toBe(counts.total);
  });

  it("still lets the host block an open-but-unsellable date", () => {
    const listing = makeListing({ status: "DRAFT" });
    const index = buildListingCalendarIndex(listing);
    const summary = summarizeSelectionAvailability(
      listing,
      index,
      ["2026-03-20", "2026-03-21"],
      TODAY,
    );
    expect(summary.available).toBe(0);
    expect(summary.openNotBookable).toBe(2);
    expect(summary.blockable).toBe(2);
    expect(summary.saleBlockers).toEqual(["NOT_LIVE"]);
  });

  it("keeps a blocked date blocked regardless of listing state", () => {
    const listing = makeListing({
      status: "DRAFT",
      blocks: [manualBlock("2026-03-20", "2026-03-21")],
    });
    const index = buildListingCalendarIndex(listing);
    expect(resolveDay(listing, index, "2026-03-20", TODAY).state).toBe("blocked");
  });
});

describe("resolveSelectionStayBookability", () => {
  function stayFor(listing: ReturnType<typeof makeListing>, dates: string[]) {
    const index = buildListingCalendarIndex(listing);
    return resolveSelectionStayBookability({
      listing,
      availability: summarizeSelectionAvailability(listing, index, dates, TODAY),
      dates,
    });
  }

  it("calls one available night unbookable against a two-night minimum", () => {
    // The exact contradiction this exists to remove: one available date, and no
    // stay a guest could book.
    const listing = makeListing();
    const index = buildListingCalendarIndex(listing);
    const availability = summarizeSelectionAvailability(
      listing,
      index,
      ["2026-03-12"],
      TODAY,
    );
    expect(availability.available).toBe(1);

    const stay = resolveSelectionStayBookability({
      listing,
      availability,
      dates: ["2026-03-12"],
    });
    expect(stay).toEqual({ code: "BELOW_MINIMUM", nights: 1, minNights: 2 });
    expect(isSelectionStayBookable(stay)).toBe(false);
  });

  it("calls two available nights bookable against a two-night minimum", () => {
    const stay = stayFor(makeListing(), ["2026-03-12", "2026-03-13"]);
    expect(stay).toEqual({ code: "BOOKABLE" });
    expect(isSelectionStayBookable(stay)).toBe(true);
  });

  it("reports the listing itself when it cannot sell, ahead of stay length", () => {
    // One night on an unpriced listing fails the minimum too, but the reason the
    // host needs is the missing price, not the night count.
    const stay = stayFor(makeListing({ pricing: null }), ["2026-03-12"]);
    expect(stay).toEqual({
      code: "LISTING_CANNOT_SELL",
      saleBlockers: ["NO_PRICING"],
    });
  });

  it("reports an unpublished listing the same way", () => {
    const stay = stayFor(makeListing({ status: "UNPUBLISHED" }), [
      "2026-03-12",
      "2026-03-13",
    ]);
    expect(stay).toEqual({
      code: "LISTING_CANNOT_SELL",
      saleBlockers: ["NOT_LIVE"],
    });
  });

  it("reports unavailable dates before stay length", () => {
    const listing = makeListing({
      blocks: [manualBlock("2026-03-13", "2026-03-14")],
    });
    expect(stayFor(listing, ["2026-03-12", "2026-03-13"])).toEqual({
      code: "DATES_UNAVAILABLE",
      blocked: 1,
      booked: 0,
    });
  });

  it("counts a reservation separately from a block", () => {
    const listing = makeListing({
      blocks: [bookingBlock("2026-03-13", "2026-03-14")],
    });
    expect(stayFor(listing, ["2026-03-12", "2026-03-13"])).toEqual({
      code: "DATES_UNAVAILABLE",
      blocked: 0,
      booked: 1,
    });
  });

  it("is bookable for a single night when the minimum is one", () => {
    const listing = makeListing({
      pricing: {
        currency: "EUR",
        baseNightlyRate: 120,
        cleaningFee: 30,
        minNights: 1,
        maxNights: 365,
      },
    });
    expect(stayFor(listing, ["2026-03-12"])).toEqual({ code: "BOOKABLE" });
  });

  /**
   * The other end of the stay-length rule. `booking.service` refuses a request longer
   * than `maxNights`, so a selection above it is unbookable in exactly the way a
   * selection below the minimum is — and the panel used to call it bookable and put a
   * guest total under it.
   */
  describe("maximum stay", () => {
    /** Five nights, so a maximum of five is exact and six is one over. */
    function stayOfNights(count: number, maxNights: number) {
      const listing = makeListing({
        pricing: {
          currency: "EUR",
          baseNightlyRate: 120,
          cleaningFee: 30,
          minNights: 1,
          maxNights,
        },
      });
      const dates = Array.from({ length: count }, (_, offset) =>
        addDaysToYmd("2026-03-12", offset),
      );
      return stayFor(listing, dates);
    }

    it("is bookable at exactly the maximum", () => {
      const stay = stayOfNights(5, 5);
      expect(stay).toEqual({ code: "BOOKABLE" });
      expect(isSelectionStayBookable(stay)).toBe(true);
    });

    it("is not bookable at the maximum plus one", () => {
      const stay = stayOfNights(6, 5);
      expect(stay).toEqual({ code: "ABOVE_MAXIMUM", nights: 6, maxNights: 5 });
      expect(isSelectionStayBookable(stay)).toBe(false);
    });

    it("reports unavailable dates before the maximum", () => {
      // Precedence: a blocked date in the range is the more immediate obstacle, and
      // shortening the stay would not fix it.
      const listing = makeListing({
        pricing: {
          currency: "EUR",
          baseNightlyRate: 120,
          cleaningFee: 30,
          minNights: 1,
          maxNights: 2,
        },
        blocks: [manualBlock("2026-03-13", "2026-03-14")],
      });
      expect(
        stayFor(listing, ["2026-03-12", "2026-03-13", "2026-03-14"]),
      ).toEqual({ code: "DATES_UNAVAILABLE", blocked: 1, booked: 0 });
    });

    it("ignores a stored maximum below one rather than making every stay unbookable", () => {
      expect(stayOfNights(3, 0)).toEqual({ code: "BOOKABLE" });
    });
  });
});

describe("simulateAvailabilityModeChange", () => {
  it("counts only dates the rule itself would open, and only those a live priced listing could sell", () => {
    const listing = makeListing({
      availabilityMode: "CLOSED",
      availabilityWindows: [
        { id: "w1", startDate: TODAY, endDate: "2026-03-20" },
      ],
      blocks: [
        bookingBlock("2026-04-01", "2026-04-03"),
        manualBlock("2026-05-01", "2026-05-04"),
      ],
    });
    const index = buildListingCalendarIndex(listing);
    const transition = simulateAvailabilityModeChange(
      listing,
      index,
      "OPEN",
      TODAY,
      HORIZON_END,
    );
    // A reservation and a manual block survive the rule change, so neither is
    // counted as becoming open.
    expect(transition.stayingBlocked).toBe(5);
    expect(transition.becomingOpen).toBeGreaterThan(0);
    expect(transition.becomingBookable).toBe(transition.becomingOpen);
    expect(transition.saleBlockers).toEqual([]);
  });

  it("never claims dates become bookable when the listing cannot sell", () => {
    const listing = makeListing({
      status: "UNPUBLISHED",
      pricing: null,
      availabilityMode: "CLOSED",
    });
    const index = buildListingCalendarIndex(listing);
    const transition = simulateAvailabilityModeChange(
      listing,
      index,
      "OPEN",
      TODAY,
      HORIZON_END,
    );
    expect(transition.becomingOpen).toBeGreaterThan(0);
    expect(transition.becomingBookable).toBe(0);
    expect(transition.saleBlockers).toEqual(["NOT_LIVE", "NO_PRICING"]);
  });

  it("acknowledges windows that keep dates open after switching to closed", () => {
    const listing = makeListing({
      availabilityMode: "OPEN",
      availabilityWindows: [
        { id: "w1", startDate: TODAY, endDate: "2026-03-20" },
      ],
    });
    const index = buildListingCalendarIndex(listing);
    const transition = simulateAvailabilityModeChange(
      listing,
      index,
      "CLOSED",
      TODAY,
      HORIZON_END,
    );
    expect(transition.stayingOpenViaWindows).toBe(10);
    expect(transition.closing).toBeGreaterThan(0);
    expect(transition.losingBookability).toBe(transition.closing);
  });

  it("reports nothing moving when the mode is already in force", () => {
    const listing = makeListing({ availabilityMode: "OPEN" });
    const index = buildListingCalendarIndex(listing);
    const transition = simulateAvailabilityModeChange(
      listing,
      index,
      "OPEN",
      TODAY,
      HORIZON_END,
    );
    expect(transition.becomingOpen).toBe(0);
    expect(transition.closing).toBe(0);
  });
});

describe("selection summaries", () => {
  it("separates what can be opened, blocked, and neither", () => {
    const listing = makeListing({
      blocks: [
        manualBlock("2026-03-12", "2026-03-13"),
        externalBlock("2026-03-13", "2026-03-14"),
        bookingBlock("2026-03-14", "2026-03-15"),
      ],
    });
    const index = buildListingCalendarIndex(listing);
    const summary = summarizeSelectionAvailability(
      listing,
      index,
      ["2026-03-11", "2026-03-12", "2026-03-13", "2026-03-14"],
      TODAY,
    );
    expect(summary).toMatchObject({
      dates: 4,
      available: 1,
      openNotBookable: 0,
      blocked: 2,
      booked: 1,
      openable: 1,
      blockable: 1,
      locked: 2,
    });
  });

  it("describes a mixed-price selection by its span", () => {
    const listing = makeListing({
      datePrices: [
        { date: "2026-03-12", nightlyRate: 150 },
        { date: "2026-03-13", nightlyRate: 90 },
      ],
    });
    const index = buildListingCalendarIndex(listing);
    const prices = summarizeSelectionPrices(listing, index, [
      "2026-03-11",
      "2026-03-12",
      "2026-03-13",
    ]);
    expect(prices).toEqual({ min: 90, max: 150, mixed: true, customCount: 2 });
  });

  it("reports a single price when every date agrees", () => {
    const listing = makeListing();
    const index = buildListingCalendarIndex(listing);
    expect(
      summarizeSelectionPrices(listing, index, ["2026-03-11", "2026-03-12"]),
    ).toEqual({ min: 120, max: 120, mixed: false, customCount: 0 });
  });
});
