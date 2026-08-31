import { describe, expect, it } from "vitest";
import {
  CALENDAR_BLOCKS,
  FIXED_PERIODS,
  LAB_TODAY,
  NIGHTLY_PRICING,
} from "./fixtures";
import {
  blocksOverlapping,
  checkOutFor,
  draftIssue,
  groupByMonth,
  isOfferedLength,
  isSelectable,
  overlappingPeriods,
  periodNights,
  periodsOverlap,
  quoteForPeriod,
  resolvePeriod,
  resolvePeriodsForGuest,
  resolvePeriodsForHost,
  sortPeriods,
  type FixedStayPeriodDraft,
} from "./periods";

const draft = (over: Partial<FixedStayPeriodDraft> = {}): FixedStayPeriodDraft => ({
  checkIn: "2026-07-04",
  nights: 7,
  ...over,
});

const byId = (id: string) => FIXED_PERIODS.find((period) => period.id === id)!;

const stateOf = (id: string) =>
  resolvePeriod(byId(id), CALENDAR_BLOCKS, LAB_TODAY).state;

describe("checkout derivation", () => {
  it("adds the chosen length to the check-in date", () => {
    expect(checkOutFor("2026-07-04", 7)).toBe("2026-07-11");
    expect(checkOutFor("2026-07-04", 14)).toBe("2026-07-18");
  });

  it("crosses a month boundary without drifting", () => {
    expect(checkOutFor("2026-07-25", 7)).toBe("2026-08-01");
    expect(checkOutFor("2026-08-22", 14)).toBe("2026-09-05");
  });

  it("derives every fixture's length from its two stored dates", () => {
    for (const period of FIXED_PERIODS) {
      expect(isOfferedLength(periodNights(period))).toBe(true);
    }
  });

  it("only accepts the two lengths version one offers", () => {
    expect(isOfferedLength(7)).toBe(true);
    expect(isOfferedLength(14)).toBe(true);
    expect(isOfferedLength(10)).toBe(false);
    expect(isOfferedLength(0)).toBe(false);
  });
});

describe("overlap", () => {
  it("treats back-to-back periods as not overlapping", () => {
    // 4–11 July and 11–18 July share a date but no night.
    expect(periodsOverlap("2026-07-04", "2026-07-11", "2026-07-11", "2026-07-18")).toBe(
      false,
    );
  });

  it("reports periods that share nights", () => {
    expect(periodsOverlap("2026-07-04", "2026-07-18", "2026-07-11", "2026-07-18")).toBe(
      true,
    );
  });

  it("warns about existing periods a new one would sit across", () => {
    const ids = overlappingPeriods(draft({ nights: 14 }), FIXED_PERIODS, "period-jul-04-14")
      .map((period) => period.id);
    // 4–18 July covers the 11 July week and the 4 July one; it stops short of 18 July.
    expect(ids).toEqual(["period-jul-04-7", "period-jul-11-7"]);
  });

  it("never lists the period being edited as an overlap of itself", () => {
    const ids = overlappingPeriods(draft(), FIXED_PERIODS, "period-jul-04-7").map(
      (period) => period.id,
    );
    expect(ids).not.toContain("period-jul-04-7");
  });
});

describe("draft validation", () => {
  it("accepts a fresh check-in", () => {
    expect(
      draftIssue(draft({ checkIn: "2026-09-12" }), FIXED_PERIODS, LAB_TODAY),
    ).toBeNull();
  });

  it("requires a date", () => {
    expect(draftIssue(draft({ checkIn: "" }), FIXED_PERIODS, LAB_TODAY)).toBe(
      "MISSING_DATE",
    );
  });

  it("rejects a date that has passed", () => {
    expect(draftIssue(draft({ checkIn: "2026-05-31" }), FIXED_PERIODS, LAB_TODAY)).toBe(
      "PAST_DATE",
    );
  });

  it("rejects the exact same check-in and checkout twice", () => {
    expect(draftIssue(draft(), FIXED_PERIODS, LAB_TODAY)).toBe("DUPLICATE");
  });

  it("allows a second length from a check-in that is already used", () => {
    const withoutFortnight = FIXED_PERIODS.filter(
      (period) => period.id !== "period-jul-04-14",
    );
    expect(draftIssue(draft({ nights: 14 }), withoutFortnight, LAB_TODAY)).toBeNull();
  });

  it("does not call the period being edited a duplicate of itself", () => {
    expect(
      draftIssue(draft(), FIXED_PERIODS, LAB_TODAY, "period-jul-04-7"),
    ).toBeNull();
  });
});

describe("state, derived from the listing's blocks", () => {
  it("leaves an unblocked future period available", () => {
    expect(stateOf("period-jul-04-7")).toBe("AVAILABLE");
    expect(stateOf("period-jul-18-7")).toBe("AVAILABLE");
  });

  it("marks the exact option a guest booked as booked", () => {
    expect(stateOf("period-jul-11-7")).toBe("BOOKED");
  });

  it("takes the dates of every option the booking overlaps", () => {
    // Nobody booked the fortnight, but its middle week is gone, so it cannot be sold.
    expect(stateOf("period-jul-04-14")).toBe("DATES_TAKEN");
  });

  it("lets three imported nights withdraw a whole week", () => {
    expect(stateOf("period-aug-15-7")).toBe("DATES_TAKEN");
    const [block] = blocksOverlapping(byId("period-aug-15-7"), CALENDAR_BLOCKS);
    expect(block.kind).toBe("IMPORTED");
    expect(block.label).toBe("Airbnb");
  });

  it("reports the host's own switch and a check-in that has gone by", () => {
    expect(stateOf("period-aug-22-14")).toBe("DISABLED");
    expect(stateOf("period-may-23-7")).toBe("PAST");
  });

  it("names what is holding a booked period, for the sentence under the row", () => {
    const booked = resolvePeriod(byId("period-jul-11-7"), CALENDAR_BLOCKS, LAB_TODAY);
    expect(booked.blockedBy?.label).toBe("Marta P.");
  });

  it("only lets an available period be picked", () => {
    const guest = resolvePeriodsForGuest(FIXED_PERIODS, CALENDAR_BLOCKS, LAB_TODAY);
    const selectable = guest.filter(isSelectable).map((period) => period.id);
    expect(selectable).toEqual([
      "period-jul-04-7",
      "period-jul-18-7",
      "period-jul-25-7",
      "period-aug-01-14",
    ]);
  });
});

describe("projections", () => {
  it("shows the host everything, in date order and shortest first", () => {
    const ids = resolvePeriodsForHost(
      FIXED_PERIODS,
      CALENDAR_BLOCKS,
      LAB_TODAY,
    ).map((period) => period.id);
    expect(ids).toEqual([
      "period-may-23-7",
      "period-jul-04-7",
      "period-jul-04-14",
      "period-jul-11-7",
      "period-jul-18-7",
      "period-jul-25-7",
      "period-aug-01-14",
      "period-aug-15-7",
      "period-aug-22-14",
    ]);
  });

  it("never sends a guest a period the host switched off or one that has gone by", () => {
    const states = resolvePeriodsForGuest(
      FIXED_PERIODS,
      CALENDAR_BLOCKS,
      LAB_TODAY,
    ).map((period) => period.state);
    expect(states).not.toContain("DISABLED");
    expect(states).not.toContain("PAST");
  });

  it("keeps booked and taken options in the guest's list", () => {
    const ids = resolvePeriodsForGuest(FIXED_PERIODS, CALENDAR_BLOCKS, LAB_TODAY).map(
      (period) => period.id,
    );
    expect(ids).toContain("period-jul-11-7");
    expect(ids).toContain("period-jul-04-14");
    expect(ids).toHaveLength(7);
  });

  it("orders two lengths from one check-in as a ladder", () => {
    const order = sortPeriods(FIXED_PERIODS).map((period) => period.id);
    expect(order.slice(1, 3)).toEqual(["period-jul-04-7", "period-jul-04-14"]);
  });
});

describe("pricing, from the listing's existing rules", () => {
  it("prices a plain week at the nightly rate plus the cleaning fee", () => {
    const quote = quoteForPeriod(byId("period-jul-04-7"), NIGHTLY_PRICING);
    expect(quote.originalAccommodationSubtotal).toBe(7 * 160);
    expect(quote.cleaningFee).toBe(60);
    expect(quote.total).toBe(7 * 160 + 60);
  });

  it("honours per-date overrides on the nights they cover", () => {
    // 18–25 July: four nights at 185, three at 160.
    const quote = quoteForPeriod(byId("period-jul-18-7"), NIGHTLY_PRICING);
    expect(quote.originalAccommodationSubtotal).toBe(4 * 185 + 3 * 160);
    expect(quote.total).toBe(4 * 185 + 3 * 160 + 60);
  });

  it("applies an ordinary listing promotion to a fixed stay that qualifies", () => {
    // The listing's offer is "10% off, 14 nights or more" — an existing rule, with no
    // fixed-stay exception. The fortnight meets it.
    const quote = quoteForPeriod(byId("period-aug-01-14"), NIGHTLY_PRICING);
    expect(quote.accommodationDiscount).toBe(224);
    expect(quote.accommodationSubtotal).toBe(2016);
    expect(quote.total).toBe(2016 + 60);
  });

  it("leaves a week below the offer's threshold undiscounted", () => {
    const quote = quoteForPeriod(byId("period-jul-25-7"), NIGHTLY_PRICING);
    expect(quote.discountAmount).toBe(0);
    expect(quote.appliedPromotion).toBeNull();
  });

  it("adds cleaning after the accommodation, never inside it", () => {
    const quote = quoteForPeriod(byId("period-aug-01-14"), NIGHTLY_PRICING);
    expect(quote.accommodationSubtotal + quote.cleaningFee).toBe(quote.total);
  });
});

describe("grouping", () => {
  it("splits a season into the months its stays start in, in order", () => {
    const groups = groupByMonth(
      resolvePeriodsForHost(FIXED_PERIODS, CALENDAR_BLOCKS, LAB_TODAY),
    );
    expect(groups.map((group) => group.month)).toEqual([
      "2026-05",
      "2026-07",
      "2026-08",
    ]);
    expect(groups.map((group) => group.items.length)).toEqual([1, 5, 3]);
  });

  it("groups a stay by where it starts, not where it ends", () => {
    // 25 July – 1 August belongs to July, the month a guest would look for it in.
    const july = groupByMonth(
      resolvePeriodsForHost(FIXED_PERIODS, CALENDAR_BLOCKS, LAB_TODAY),
    ).find((group) => group.month === "2026-07")!;
    expect(july.items.map((item) => item.id)).toContain("period-jul-25-7");
  });

  it("returns nothing for an empty season", () => {
    expect(groupByMonth([])).toEqual([]);
  });
});
