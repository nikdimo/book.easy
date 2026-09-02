import { describe, expect, it } from "vitest";
import {
  buildFixedStaySnapshot,
  checkOutForFixedStay,
  findDuplicateFixedStay,
  fixedStayNights,
  fixedStayPeriodKey,
  fixedStaysOverlap,
  isFixedStayNights,
  overlappingFixedStays,
  sortFixedStayPeriods,
  validateFixedStayPeriod,
  FIXED_STAY_NIGHTS,
  FIXED_STAY_SNAPSHOT_VERSION,
} from "@/lib/utils/fixed-stay-periods";

/** A stored period: two dates and an id, which is all a period ever is. */
const p = (id: string, checkIn: string, checkOut: string) => ({
  id,
  checkIn,
  checkOut,
});

describe("validateFixedStayPeriod", () => {
  it("accepts an exact 7-night stay", () => {
    expect(
      validateFixedStayPeriod({ checkIn: "2027-06-05", checkOut: "2027-06-12" }),
    ).toEqual({ ok: true, nights: 7 });
  });

  it("accepts an exact 14-night stay", () => {
    expect(
      validateFixedStayPeriod({ checkIn: "2027-06-05", checkOut: "2027-06-19" }),
    ).toEqual({ ok: true, nights: 14 });
  });

  it.each([
    ["one night short of a week", "2027-06-05", "2027-06-11", 6],
    ["one night over a week", "2027-06-05", "2027-06-13", 8],
    ["ten nights, between the two offered lengths", "2027-06-05", "2027-06-15", 10],
    ["one night short of a fortnight", "2027-06-05", "2027-06-18", 13],
    ["three weeks", "2027-06-05", "2027-06-26", 21],
  ])("refuses %s", (_label, checkIn, checkOut, nights) => {
    expect(fixedStayNights({ checkIn, checkOut })).toBe(nights);
    expect(validateFixedStayPeriod({ checkIn, checkOut })).toEqual({
      ok: false,
      issue: "UNSUPPORTED_LENGTH",
    });
  });

  it("refuses a checkout before check-in", () => {
    expect(
      validateFixedStayPeriod({ checkIn: "2027-06-12", checkOut: "2027-06-05" }),
    ).toEqual({ ok: false, issue: "NOT_FORWARD" });
  });

  it("refuses a checkout on the check-in day", () => {
    expect(
      validateFixedStayPeriod({ checkIn: "2027-06-05", checkOut: "2027-06-05" }),
    ).toEqual({ ok: false, issue: "NOT_FORWARD" });
  });

  it("reports a malformed date before anything else", () => {
    expect(
      validateFixedStayPeriod({ checkIn: "2027-06-32", checkOut: "2027-06-12" }),
    ).toEqual({ ok: false, issue: "INVALID_DATE" });
    expect(
      validateFixedStayPeriod({ checkIn: "05/06/2027", checkOut: "2027-06-12" }),
    ).toEqual({ ok: false, issue: "INVALID_DATE" });
  });

  it("offers exactly two lengths", () => {
    expect(FIXED_STAY_NIGHTS).toEqual([7, 14]);
    expect(isFixedStayNights(7)).toBe(true);
    expect(isFixedStayNights(14)).toBe(true);
    expect(isFixedStayNights(10)).toBe(false);
  });
});

describe("checkOutForFixedStay", () => {
  it("derives the checkout from the check-in and the length", () => {
    expect(checkOutForFixedStay("2027-06-05", 7)).toBe("2027-06-12");
    expect(checkOutForFixedStay("2027-06-05", 14)).toBe("2027-06-19");
  });

  it("crosses a month boundary without losing a day", () => {
    expect(checkOutForFixedStay("2027-06-26", 7)).toBe("2027-07-03");
    expect(checkOutForFixedStay("2028-02-26", 7)).toBe("2028-03-04");
  });
});

describe("date-only behaviour across DST boundaries", () => {
  // Europe/Skopje springs forward on 2027-03-28 and falls back on 2027-10-31. A stay
  // spanning either is still exactly seven or fourteen nights: the clock changed, the
  // calendar did not. Local-midnight arithmetic gets these wrong by a night, which on a
  // fixed stay is the difference between a valid period and a refused one.
  it.each([
    ["spring forward", "2027-03-27", "2027-04-03"],
    ["autumn fall back", "2027-10-30", "2027-11-06"],
  ])("keeps a 7-night stay 7 nights across %s", (_label, checkIn, checkOut) => {
    expect(checkOutForFixedStay(checkIn, 7)).toBe(checkOut);
    expect(fixedStayNights({ checkIn, checkOut })).toBe(7);
    expect(validateFixedStayPeriod({ checkIn, checkOut })).toEqual({
      ok: true,
      nights: 7,
    });
  });

  it("keeps a 14-night stay 14 nights across a fall-back", () => {
    expect(checkOutForFixedStay("2027-10-23", 14)).toBe("2027-11-06");
    expect(
      validateFixedStayPeriod({ checkIn: "2027-10-23", checkOut: "2027-11-06" }),
    ).toEqual({ ok: true, nights: 14 });
  });
});

describe("findDuplicateFixedStay", () => {
  const existing = [
    p("week", "2027-06-05", "2027-06-12"),
    p("fortnight", "2027-06-05", "2027-06-19"),
  ];

  it("finds a period with exactly the same two dates", () => {
    expect(
      findDuplicateFixedStay(
        { checkIn: "2027-06-05", checkOut: "2027-06-12" },
        existing,
      ),
    ).toEqual(existing[0]);
  });

  it("does not treat a shared check-in as a duplicate", () => {
    expect(
      findDuplicateFixedStay(
        { checkIn: "2027-06-05", checkOut: "2027-06-26" },
        existing,
      ),
    ).toBeNull();
  });

  it("does not treat a shared checkout as a duplicate", () => {
    expect(
      findDuplicateFixedStay(
        { checkIn: "2027-05-29", checkOut: "2027-06-12" },
        existing,
      ),
    ).toBeNull();
  });

  it("does not report a period being edited as its own duplicate", () => {
    expect(
      findDuplicateFixedStay(
        { checkIn: "2027-06-05", checkOut: "2027-06-12" },
        existing,
        "week",
      ),
    ).toBeNull();
  });
});

describe("overlapping alternatives", () => {
  const existing = [p("week", "2027-06-05", "2027-06-12")];

  it("allows a fortnight from the same Saturday as a week", () => {
    const fortnight = { checkIn: "2027-06-05", checkOut: "2027-06-19" };
    expect(validateFixedStayPeriod(fortnight)).toEqual({ ok: true, nights: 14 });
    expect(findDuplicateFixedStay(fortnight, existing)).toBeNull();
    expect(overlappingFixedStays(fortnight, existing)).toEqual(existing);
  });

  it("allows the second week a fortnight already covers", () => {
    const secondWeek = { checkIn: "2027-06-12", checkOut: "2027-06-19" };
    const fortnight = [p("fortnight", "2027-06-05", "2027-06-19")];
    expect(findDuplicateFixedStay(secondWeek, fortnight)).toBeNull();
    expect(overlappingFixedStays(secondWeek, fortnight)).toEqual(fortnight);
  });

  it("treats back-to-back weeks as not overlapping — checkout is not a night", () => {
    expect(
      fixedStaysOverlap(
        { checkIn: "2027-06-05", checkOut: "2027-06-12" },
        { checkIn: "2027-06-12", checkOut: "2027-06-19" },
      ),
    ).toBe(false);
    expect(
      overlappingFixedStays(
        { checkIn: "2027-06-12", checkOut: "2027-06-19" },
        existing,
      ),
    ).toEqual([]);
  });

  it("excludes an exact duplicate from the overlap list", () => {
    expect(
      overlappingFixedStays(
        { checkIn: "2027-06-05", checkOut: "2027-06-12" },
        existing,
      ),
    ).toEqual([]);
  });

  it("excludes the period being edited", () => {
    expect(
      overlappingFixedStays(
        { checkIn: "2027-06-06", checkOut: "2027-06-13" },
        existing,
        "week",
      ),
    ).toEqual([]);
  });
});

describe("sortFixedStayPeriods", () => {
  it("orders chronologically, then shortest first from a shared check-in", () => {
    expect(
      sortFixedStayPeriods([
        p("c", "2027-06-12", "2027-06-19"),
        p("b", "2027-06-05", "2027-06-19"),
        p("a", "2027-06-05", "2027-06-12"),
      ]).map((period) => period.id),
    ).toEqual(["a", "b", "c"]);
  });

  it("does not mutate the list it was handed", () => {
    const periods = [
      p("late", "2027-07-03", "2027-07-10"),
      p("early", "2027-06-05", "2027-06-12"),
    ];
    sortFixedStayPeriods(periods);
    expect(periods[0].id).toBe("late");
  });

  it("sorts across a year boundary by calendar order", () => {
    expect(
      sortFixedStayPeriods([
        p("jan", "2028-01-01", "2028-01-08"),
        p("dec", "2027-12-25", "2028-01-01"),
      ]).map((period) => period.id),
    ).toEqual(["dec", "jan"]);
  });
});

describe("fixedStayPeriodKey", () => {
  it("is the pair of dates the unique index is built on", () => {
    expect(fixedStayPeriodKey({ checkIn: "2027-06-05", checkOut: "2027-06-12" })).toBe(
      "2027-06-05/2027-06-12",
    );
  });
});

describe("buildFixedStaySnapshot", () => {
  it("freezes the version, the period, both dates and the derived length", () => {
    expect(
      buildFixedStaySnapshot(p("period-1", "2027-06-05", "2027-06-19")),
    ).toEqual({
      version: FIXED_STAY_SNAPSHOT_VERSION,
      periodId: "period-1",
      checkIn: "2027-06-05",
      checkOut: "2027-06-19",
      nights: 14,
    });
  });

  it("carries no price of any kind", () => {
    const snapshot = buildFixedStaySnapshot(p("period-1", "2027-06-05", "2027-06-12"));
    expect(Object.keys(snapshot).sort()).toEqual([
      "checkIn",
      "checkOut",
      "nights",
      "periodId",
      "version",
    ]);
  });
});
