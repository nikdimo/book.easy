import { describe, expect, it } from "vitest";
import { isStayWithinAvailabilityWindows } from "@/lib/utils/availability-windows";
import {
  decideStayAvailability,
  findMatchingFixedStay,
  isFixedStayBookingMode,
  offeredFixedStays,
  stayLengthRulesApply,
  type StayAvailabilityInput,
  type StayFixedStayPeriod,
} from "@/lib/utils/stay-availability";

const TODAY = "2027-06-01";

const period = (
  id: string,
  checkIn: string,
  checkOut: string,
  disabledAt: Date | null = null,
): StayFixedStayPeriod => ({ id, checkIn, checkOut, disabledAt });

const ask = (overrides: Partial<StayAvailabilityInput>): StayAvailabilityInput => ({
  bookingMode: "FLEXIBLE",
  availabilityMode: "OPEN",
  windows: [],
  fixedStayPeriods: [],
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

  it("ignores fixed-stay periods entirely", () => {
    // A listing that once sold fixed stays and switched back keeps its rows. They must
    // not narrow the flexible calendar.
    expect(
      decideStayAvailability(
        ask({
          fixedStayPeriods: [period("a", "2027-07-03", "2027-07-10")],
          checkIn: "2027-06-05",
          checkOut: "2027-06-09",
        }),
      ),
    ).toEqual({ offered: true, fixedStayPeriodId: null });
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
    expect(stayLengthRulesApply("FLEXIBLE")).toBe(true);
    expect(isFixedStayBookingMode("FLEXIBLE")).toBe(false);
  });
});

describe("fixed-stay listings need an exact match", () => {
  const periods = [
    period("week", "2027-06-05", "2027-06-12"),
    period("fortnight", "2027-06-05", "2027-06-19"),
  ];
  const fixed = (overrides: Partial<StayAvailabilityInput> = {}) =>
    ask({ bookingMode: "FIXED_STAYS", fixedStayPeriods: periods, ...overrides });

  it("offers a stay whose two dates match a period exactly", () => {
    expect(decideStayAvailability(fixed())).toEqual({
      offered: true,
      fixedStayPeriodId: "week",
    });
  });

  it("offers each of two overlapping alternatives from the same check-in", () => {
    expect(
      decideStayAvailability(fixed({ checkOut: "2027-06-19" })),
    ).toEqual({ offered: true, fixedStayPeriodId: "fortnight" });
  });

  it("refuses a stay inside an offered period", () => {
    expect(
      decideStayAvailability(fixed({ checkIn: "2027-06-06", checkOut: "2027-06-11" })),
    ).toEqual({ offered: false, reason: "NO_MATCHING_FIXED_STAY" });
  });

  it("refuses a stay one night short of an offered period", () => {
    expect(
      decideStayAvailability(fixed({ checkOut: "2027-06-11" })),
    ).toEqual({ offered: false, reason: "NO_MATCHING_FIXED_STAY" });
  });

  it("refuses a stay on a listing that offers no periods at all", () => {
    expect(
      decideStayAvailability(fixed({ fixedStayPeriods: [] })),
    ).toEqual({ offered: false, reason: "NO_MATCHING_FIXED_STAY" });
  });

  it("refuses a period the host switched off", () => {
    expect(
      decideStayAvailability(
        fixed({
          fixedStayPeriods: [
            period("week", "2027-06-05", "2027-06-12", new Date("2027-05-20T10:00:00Z")),
          ],
        }),
      ),
    ).toEqual({ offered: false, reason: "FIXED_STAY_DISABLED" });
  });

  it("refuses a period whose check-in has gone by", () => {
    expect(
      decideStayAvailability(
        fixed({
          fixedStayPeriods: [period("gone", "2027-05-29", "2027-06-05")],
          checkIn: "2027-05-29",
          checkOut: "2027-06-05",
        }),
      ),
    ).toEqual({ offered: false, reason: "FIXED_STAY_IN_PAST" });
  });

  it("still offers a period checking in today", () => {
    expect(
      decideStayAvailability(
        fixed({
          fixedStayPeriods: [period("today", TODAY, "2027-06-08")],
          checkIn: TODAY,
          checkOut: "2027-06-08",
        }),
      ),
    ).toEqual({ offered: true, fixedStayPeriodId: "today" });
  });

  it("ignores the listing's availability windows", () => {
    // The host's flexible windows stay stored and stay irrelevant while the listing
    // sells whole stays — including a CLOSED calendar with no windows at all.
    expect(
      decideStayAvailability(fixed({ availabilityMode: "CLOSED", windows: [] })),
    ).toEqual({ offered: true, fixedStayPeriodId: "week" });
  });

  it("does not apply minimum or maximum night rules", () => {
    expect(stayLengthRulesApply("FIXED_STAYS")).toBe(false);
    expect(isFixedStayBookingMode("FIXED_STAYS")).toBe(true);
  });

  it("treats checkout as a departure, not an occupied night", () => {
    // Back-to-back periods share the 12th. Booking the first is still an exact match for
    // the first, and the second remains its own offer.
    const backToBack = [
      period("first", "2027-06-05", "2027-06-12"),
      period("second", "2027-06-12", "2027-06-19"),
    ];
    expect(
      decideStayAvailability(fixed({ fixedStayPeriods: backToBack })),
    ).toEqual({ offered: true, fixedStayPeriodId: "first" });
    expect(
      decideStayAvailability(
        fixed({
          fixedStayPeriods: backToBack,
          checkIn: "2027-06-12",
          checkOut: "2027-06-19",
        }),
      ),
    ).toEqual({ offered: true, fixedStayPeriodId: "second" });
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
  // The autumn clock change falls inside both stays. Matching is on the calendar dates,
  // so the extra hour cannot turn a matching stay into a near miss.
  const acrossFallBack = period("autumn", "2027-10-30", "2027-11-06");

  it("matches a stay spanning the change", () => {
    expect(
      decideStayAvailability(
        ask({
          bookingMode: "FIXED_STAYS",
          fixedStayPeriods: [acrossFallBack],
          checkIn: "2027-10-30",
          checkOut: "2027-11-06",
        }),
      ),
    ).toEqual({ offered: true, fixedStayPeriodId: "autumn" });
  });

  it("judges past-ness on the calendar date, not on elapsed hours", () => {
    expect(
      decideStayAvailability(
        ask({
          bookingMode: "FIXED_STAYS",
          fixedStayPeriods: [acrossFallBack],
          checkIn: "2027-10-30",
          checkOut: "2027-11-06",
          today: "2027-10-30",
        }),
      ),
    ).toEqual({ offered: true, fixedStayPeriodId: "autumn" });
    expect(
      decideStayAvailability(
        ask({
          bookingMode: "FIXED_STAYS",
          fixedStayPeriods: [acrossFallBack],
          checkIn: "2027-10-30",
          checkOut: "2027-11-06",
          today: "2027-10-31",
        }),
      ),
    ).toEqual({ offered: false, reason: "FIXED_STAY_IN_PAST" });
  });
});

describe("findMatchingFixedStay", () => {
  const periods = [
    period("week", "2027-06-05", "2027-06-12"),
    period("fortnight", "2027-06-05", "2027-06-19"),
  ];

  it("tells two options from the same check-in apart", () => {
    expect(
      findMatchingFixedStay(periods, {
        checkIn: "2027-06-05",
        checkOut: "2027-06-19",
      })?.id,
    ).toBe("fortnight");
  });

  it("returns null when nothing matches both dates", () => {
    expect(
      findMatchingFixedStay(periods, {
        checkIn: "2027-06-05",
        checkOut: "2027-06-26",
      }),
    ).toBeNull();
  });
});

describe("offeredFixedStays", () => {
  const periods = [
    period("past", "2027-05-22", "2027-05-29"),
    period("off", "2027-06-05", "2027-06-12", new Date("2027-05-20T10:00:00Z")),
    period("today", TODAY, "2027-06-08"),
    period("future", "2027-07-03", "2027-07-10"),
  ];

  it("drops switched-off and already-begun periods, and keeps the rest", () => {
    expect(offeredFixedStays(periods, TODAY).map((p) => p.id)).toEqual([
      "today",
      "future",
    ]);
  });

  it("keeps every period the decision would accept", () => {
    for (const candidate of offeredFixedStays(periods, TODAY)) {
      expect(
        decideStayAvailability({
          bookingMode: "FIXED_STAYS",
          availabilityMode: "OPEN",
          windows: [],
          fixedStayPeriods: periods,
          checkIn: candidate.checkIn,
          checkOut: candidate.checkOut,
          today: TODAY,
        }),
      ).toEqual({ offered: true, fixedStayPeriodId: candidate.id });
    }
  });
});
