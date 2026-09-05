import { describe, expect, it } from "vitest";
import { isStayWithinAvailabilityWindows } from "@/lib/utils/availability-windows";
import {
  decideStayAvailability,
  isFixedStayBookingMode,
  type StayAvailabilityInput,
} from "@/lib/utils/stay-availability";

const TODAY = "2027-06-01";

const ask = (overrides: Partial<StayAvailabilityInput>): StayAvailabilityInput => ({
  bookingMode: "FLEXIBLE",
  availabilityMode: "OPEN",
  windows: [],
  checkIn: "2027-06-05",
  checkOut: "2027-06-12",
  today: TODAY,
  ...overrides,
});

describe("flexible listings are unchanged", () => {
  it("offers any dates on an OPEN calendar", () => {
    expect(decideStayAvailability(ask({}))).toEqual({
      offered: true,
      fixedStayPeriodId: null,
    });
  });

  it("offers a CLOSED calendar's dates only inside its windows", () => {
    const closed = ask({
      availabilityMode: "CLOSED",
      windows: [{ startDate: "2027-06-01", endDate: "2027-06-15" }],
    });
    expect(decideStayAvailability(closed)).toEqual({
      offered: true,
      fixedStayPeriodId: null,
    });
    expect(
      decideStayAvailability({
        ...closed,
        checkIn: "2027-06-10",
        checkOut: "2027-06-20",
      }),
    ).toEqual({ offered: false, reason: "OUTSIDE_AVAILABILITY_WINDOWS" });
  });

  it("bridges touching windows exactly as the existing rule does", () => {
    const windows = [
      { startDate: "2027-06-01", endDate: "2027-06-15" },
      { startDate: "2027-06-15", endDate: "2027-06-30" },
    ];
    expect(
      decideStayAvailability(
        ask({
          availabilityMode: "CLOSED",
          windows,
          checkIn: "2027-06-10",
          checkOut: "2027-06-20",
        }),
      ),
    ).toEqual({ offered: true, fixedStayPeriodId: null });
  });

  it("agrees with the existing availability-window rule on every case", () => {
    const windows = [
      { startDate: "2027-06-01", endDate: "2027-06-15" },
      { startDate: "2027-06-20", endDate: "2027-06-30" },
    ];
    const stays = [
      ["2027-06-02", "2027-06-09"],
      ["2027-06-10", "2027-06-20"],
      ["2027-06-14", "2027-06-22"],
      ["2027-06-21", "2027-06-28"],
      ["2027-06-25", "2027-07-05"],
    ];

    for (const availabilityMode of ["OPEN", "CLOSED"]) {
      for (const [checkIn, checkOut] of stays) {
        const decision = decideStayAvailability(
          ask({ availabilityMode, windows, checkIn, checkOut }),
        );
        expect(decision.offered).toBe(
          isStayWithinAvailabilityWindows({
            availabilityMode,
            windows: windows.map((window) => ({
              startDate: new Date(window.startDate),
              endDate: new Date(window.endDate),
            })),
            checkIn: new Date(checkIn),
            checkOut: new Date(checkOut),
          }),
        );
      }
    }
  });

  it("identifies the internal flexible booking mode", () => {
    expect(isFixedStayBookingMode("FLEXIBLE")).toBe(false);
  });
});

/**
 * #4: the two listing-wide rules the flexible branch used to return above.
 *
 * The test that should have caught this was named "keeps minimum and maximum night rules
 * in force" and asserted only that `"FLEXIBLE"` is not the fixed mode. It tested nothing
 * about limits, so the gap it named survived every run.
 *
 * The consequence was real. `createBooking` re-implemented the limits itself and the
 * action-layer Zod refinement re-implemented the past-date rule, so the booking path held
 * — but search built its flexible arm without the past-date rule (past-dated searches
 * listed flexible listings as bookable), and promotion validation could not be routed
 * through this helper without losing min/max enforcement entirely.
 */
describe("a flexible listing obeys its listing-wide stay limits", () => {
  const limited = (overrides: Partial<StayAvailabilityInput> = {}) =>
    ask({ limits: { minNights: 3, maxNights: 14 }, ...overrides });

  it("offers a stay inside the limits", () => {
    expect(decideStayAvailability(limited()).offered).toBe(true);
  });

  it("refuses a stay one night under the minimum", () => {
    expect(
      decideStayAvailability(
        limited({ checkIn: "2027-06-05", checkOut: "2027-06-07" }),
      ),
    ).toEqual({ offered: false, reason: "BELOW_MINIMUM" });
  });

  it("refuses a stay one night over the maximum", () => {
    expect(
      decideStayAvailability(
        limited({ checkIn: "2027-06-05", checkOut: "2027-06-20" }),
      ),
    ).toEqual({ offered: false, reason: "ABOVE_MAXIMUM" });
  });

  it("offers a stay exactly at each boundary", () => {
    expect(
      decideStayAvailability(
        limited({ checkIn: "2027-06-05", checkOut: "2027-06-08" }),
      ).offered,
    ).toBe(true);
    expect(
      decideStayAvailability(
        limited({ checkIn: "2027-06-05", checkOut: "2027-06-19" }),
      ).offered,
    ).toBe(true);
  });

  /** The product-wide reading of the stored column, now shared by both branches. */
  it("treats a stored maximum of 0 as no cap", () => {
    expect(
      decideStayAvailability(
        ask({
          limits: { minNights: 1, maxNights: 0 },
          checkIn: "2027-06-05",
          checkOut: "2027-12-05",
        }),
      ).offered,
    ).toBe(true);
  });

  it("applies no limit at all when the caller supplies none", () => {
    expect(
      decideStayAvailability(
        ask({ checkIn: "2027-06-05", checkOut: "2027-06-06" }),
      ).offered,
    ).toBe(true);
  });
});

describe("a flexible listing does not offer a stay that has already begun", () => {
  it("refuses a check-in before today", () => {
    expect(
      decideStayAvailability(
        ask({ checkIn: "2027-05-20", checkOut: "2027-05-27" }),
      ),
    ).toEqual({ offered: false, reason: "STAY_IN_PAST" });
  });

  it("still offers a check-in today", () => {
    expect(
      decideStayAvailability(
        ask({ checkIn: TODAY, checkOut: "2027-06-08" }),
      ).offered,
    ).toBe(true);
  });

  /** The rule is listing-wide, so a CLOSED calendar covering the dates cannot save it. */
  it("refuses a past stay even inside an open window", () => {
    expect(
      decideStayAvailability(
        ask({
          availabilityMode: "CLOSED",
          windows: [{ startDate: "2027-05-01", endDate: "2027-07-01" }],
          checkIn: "2027-05-20",
          checkOut: "2027-05-27",
        }),
      ),
    ).toEqual({ offered: false, reason: "STAY_IN_PAST" });
  });
});

/**
 * Precedence, pinned. Adding the limit and past-date rules to the flexible branch must
 * not reorder the weekly one: a guest who picks the wrong arrival day is told *that*,
 * not that their week is the wrong length, because the weekday is the thing they can act
 * on. This is why the two rules were written inside the flexible branch rather than
 * hoisted above the mode split.
 */
describe("weekly shape errors still outrank limit and past-date errors", () => {
  const weekly = (overrides: Partial<StayAvailabilityInput> = {}) =>
    ask({
      bookingMode: "FIXED_STAYS",
      changeoverWeekday: "SATURDAY",
      limits: { minNights: 14, maxNights: 21 },
      ...overrides,
    });

  it("reports the wrong check-in day rather than the length", () => {
    // A Tuesday check-in *and* only one night: two rules broken, one answer.
    expect(
      decideStayAvailability(
        weekly({ checkIn: "2027-06-08", checkOut: "2027-06-09" }),
      ),
    ).toEqual({ offered: false, reason: "WRONG_CHECK_IN_DAY" });
  });

  it("reports the wrong check-out day rather than the length", () => {
    expect(
      decideStayAvailability(
        weekly({ checkIn: "2027-06-05", checkOut: "2027-06-07" }),
      ),
    ).toEqual({ offered: false, reason: "WRONG_CHECK_OUT_DAY" });
  });

  it("reports the wrong check-in day rather than the past-date rule", () => {
    // A past Tuesday: both the shape and the calendar are against it.
    expect(
      decideStayAvailability(
        weekly({ checkIn: "2027-05-18", checkOut: "2027-05-25" }),
      ),
    ).toEqual({ offered: false, reason: "WRONG_CHECK_IN_DAY" });
  });

  it("reports the length rather than the past-date rule", () => {
    // A past Saturday of the right shape but under the minimum.
    expect(
      decideStayAvailability(
        weekly({ checkIn: "2027-05-22", checkOut: "2027-05-29" }),
      ),
    ).toEqual({ offered: false, reason: "BELOW_MINIMUM" });
  });

  it("still reports the past-date rule when the shape and length are fine", () => {
    expect(
      decideStayAvailability(
        weekly({ checkIn: "2027-05-15", checkOut: "2027-05-29" }),
      ),
    ).toEqual({ offered: false, reason: "STAY_IN_PAST" });
  });
});

describe("a weekly listing offers whole weeks on its changeover day", () => {
  const weekly = (overrides: Partial<StayAvailabilityInput> = {}) =>
    ask({
      bookingMode: "FIXED_STAYS",
      changeoverWeekday: "SATURDAY",
      limits: { minNights: 1, maxNights: 30 },
      // 2027-06-05 is a Saturday.
      checkIn: "2027-06-05",
      checkOut: "2027-06-12",
      ...overrides,
    });

  it("offers a whole week starting on the changeover day", () => {
    expect(decideStayAvailability(weekly())).toEqual({
      offered: true,
      fixedStayPeriodId: null,
    });
  });

  it("offers two, three and four weeks inside the maximum", () => {
    for (const checkOut of ["2027-06-19", "2027-06-26", "2027-07-03"]) {
      expect(decideStayAvailability(weekly({ checkOut })).offered, checkOut).toBe(
        true,
      );
    }
  });

  it("refuses a check-in on any other weekday", () => {
    expect(
      decideStayAvailability(
        weekly({ checkIn: "2027-06-06", checkOut: "2027-06-13" }),
      ),
    ).toEqual({ offered: false, reason: "WRONG_CHECK_IN_DAY" });
  });

  it("refuses a checkout that is not a whole number of weeks away", () => {
    expect(
      decideStayAvailability(weekly({ checkOut: "2027-06-11" })),
    ).toEqual({ offered: false, reason: "WRONG_CHECK_OUT_DAY" });
  });

  it("refuses a stay under the listing's minimum", () => {
    expect(
      decideStayAvailability(
        weekly({ limits: { minNights: 10, maxNights: 30 } }),
      ),
    ).toEqual({ offered: false, reason: "BELOW_MINIMUM" });
  });

  it("refuses a stay over the listing's maximum", () => {
    expect(
      decideStayAvailability(weekly({ checkOut: "2027-07-10" })),
    ).toEqual({ offered: false, reason: "ABOVE_MAXIMUM" });
  });

  it("fails closed when the host has not chosen a changeover day", () => {
    expect(
      decideStayAvailability(weekly({ changeoverWeekday: null })),
    ).toEqual({ offered: false, reason: "NO_CHANGEOVER_DAY" });
  });

  it("refuses a stay whose check-in has gone by", () => {
    expect(
      decideStayAvailability(
        weekly({ checkIn: "2027-05-22", checkOut: "2027-05-29" }),
      ),
    ).toEqual({ offered: false, reason: "STAY_IN_PAST" });
  });

  it("refuses dates outside the listing's availability windows", () => {
    expect(
      decideStayAvailability(
        weekly({ availabilityMode: "CLOSED", windows: [] }),
      ),
    ).toEqual({ offered: false, reason: "OUTSIDE_AVAILABILITY_WINDOWS" });
  });

  it("accepts a weekly stay covered by touching availability windows", () => {
    expect(
      decideStayAvailability(
        weekly({
          availabilityMode: "CLOSED",
          windows: [
            { startDate: "2027-06-01", endDate: "2027-06-08" },
            { startDate: "2027-06-08", endDate: "2027-06-15" },
          ],
        }),
      ).offered,
    ).toBe(true);
  });

  it("names no period — a weekly booking is an ordinary pair of dates", () => {
    const decision = decideStayAvailability(weekly());
    expect(decision).toEqual({ offered: true, fixedStayPeriodId: null });
  });

  it("identifies the internal weekly booking mode", () => {
    expect(isFixedStayBookingMode("FIXED_STAYS")).toBe(true);
  });
});

describe("ranges that are not stays", () => {
  it.each(["FLEXIBLE", "FIXED_STAYS"])(
    "refuses a reversed range in %s mode",
    (bookingMode) => {
      expect(
        decideStayAvailability(
          ask({ bookingMode, checkIn: "2027-06-12", checkOut: "2027-06-05" }),
        ),
      ).toEqual({ offered: false, reason: "INVALID_RANGE" });
    },
  );

  it("refuses a zero-night range", () => {
    expect(
      decideStayAvailability(ask({ checkIn: "2027-06-05", checkOut: "2027-06-05" })),
    ).toEqual({ offered: false, reason: "INVALID_RANGE" });
  });

  it("refuses a malformed date", () => {
    expect(
      decideStayAvailability(ask({ checkIn: "2027-06-31" })),
    ).toEqual({ offered: false, reason: "INVALID_RANGE" });
  });
});
describe("date-only behaviour across DST boundaries", () => {
  // Europe's autumn change falls inside this week; a week is still a week.
  const acrossFallBack = (overrides: Partial<StayAvailabilityInput> = {}) =>
    ask({
      bookingMode: "FIXED_STAYS",
      changeoverWeekday: "SATURDAY",
      limits: { minNights: 1, maxNights: 30 },
      checkIn: "2027-10-30",
      checkOut: "2027-11-06",
      ...overrides,
    });

  it("offers a week spanning the change", () => {
    expect(decideStayAvailability(acrossFallBack())).toEqual({
      offered: true,
      fixedStayPeriodId: null,
    });
  });

  it("judges past-ness on the calendar date, not on elapsed hours", () => {
    expect(
      decideStayAvailability(acrossFallBack({ today: "2027-10-30" })).offered,
    ).toBe(true);
    expect(
      decideStayAvailability(acrossFallBack({ today: "2027-10-31" })),
    ).toEqual({ offered: false, reason: "STAY_IN_PAST" });
  });
});
