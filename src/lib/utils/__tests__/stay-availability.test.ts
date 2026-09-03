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

  it("keeps minimum and maximum night rules in force", () => {
    expect(isFixedStayBookingMode("FLEXIBLE")).toBe(false);
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
