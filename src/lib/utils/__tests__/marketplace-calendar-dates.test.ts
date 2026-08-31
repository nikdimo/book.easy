import { afterAll, describe, expect, it } from "vitest";
import {
  MARKETPLACE_TIME_ZONE,
  addDaysToYmd,
  addMonthsToYmd,
  dbDateToLocalDate,
  dbDateToYmd,
  eachYmdExclusive,
  marketplaceYmd,
  nightsBetweenYmd,
  todayYmd,
  ymdToDbDate,
  ymdToLocalDate,
} from "@/lib/utils/date-only";
import {
  buildPriceOverrideMap,
  computeDayRate,
  computeNightlyRateRange,
  computeStayQuote,
  dateKey,
  eachStayNightKey,
  parseLocalYmd,
  promotionCoversNight,
  toStayPromotion,
  type StayPromotion,
} from "@/lib/utils/stay-pricing";

/**
 * M6: one marketplace calendar, and an answer that does not move with the clock the
 * process happens to be started under.
 *
 * Every assertion here runs under four deliberately hostile zones. Europe/Skopje is
 * where the marketplace actually is; UTC is what a default container gives you;
 * America/Chicago is the case the audit called out as *silently* wrong, because a
 * zone behind UTC reads the UTC midnight a `@db.Date` column comes back as the
 * previous day; and Pacific/Kiritimati (UTC+14) is the far end of the same problem.
 *
 * These are not "runs in my zone" tests. A result that depends on the server's zone
 * fails here in three of the four, which is the whole point.
 */
const ZONES = [
  "UTC",
  "Europe/Skopje",
  "America/Chicago",
  "Pacific/Kiritimati",
] as const;

const ORIGINAL_TZ = process.env.TZ;
afterAll(() => {
  process.env.TZ = ORIGINAL_TZ;
});

/** Run `body` with the *process* in `zone`, the way a deployment would be. */
function inZone<T>(zone: string, body: () => T): T {
  const previous = process.env.TZ;
  process.env.TZ = zone;
  try {
    return body();
  } finally {
    process.env.TZ = previous;
  }
}

/** The same computation in every zone, asserted to give one answer. */
function acrossZones<T>(body: () => T): T[] {
  return ZONES.map((zone) => inZone(zone, body));
}

function expectZoneIndependent<T>(body: () => T): T {
  const [first, ...rest] = acrossZones(body);
  for (const [index, value] of rest.entries()) {
    expect(
      value,
      `${ZONES[index + 1]} disagreed with ${ZONES[0]}`,
    ).toEqual(first);
  }
  return first;
}

describe("the marketplace's own day", () => {
  it("is read in the marketplace zone whatever the server is set to", () => {
    // 22:30Z on 9 June is 00:30 on the 10th in Skopje (UTC+2 in summer). The
    // marketplace day is the 10th — and stays the 10th on a UTC server, which would
    // otherwise say the 9th, and on a Chicago server, which would say the 9th too.
    const justAfterSkopjeMidnight = new Date("2026-06-09T22:30:00Z");

    const answers = acrossZones(() => todayYmd(undefined, justAfterSkopjeMidnight));

    expect(answers).toEqual(["2026-06-10", "2026-06-10", "2026-06-10", "2026-06-10"]);
  });

  it("gives a past instant its own marketplace day, not today's", () => {
    // The distinction `marketplaceYmd` exists for: an acceptance at 00:30 Skopje is
    // on the 10th, though its UTC fields say the 9th.
    const acceptedAt = new Date("2026-06-09T22:30:00Z");

    expectZoneIndependent(() => {
      expect(marketplaceYmd(acceptedAt)).toBe("2026-06-10");
      expect(dbDateToYmd(acceptedAt)).toBe("2026-06-09");
      return null;
    });
  });

  it("does not roll over early — 23:30 in Skopje is still the same day", () => {
    expectZoneIndependent(() =>
      marketplaceYmd(new Date("2026-06-09T21:30:00Z")),
    );
    expect(marketplaceYmd(new Date("2026-06-09T21:30:00Z"))).toBe("2026-06-09");
  });

  it("crosses month and year boundaries at the marketplace's midnight", () => {
    expect(marketplaceYmd(new Date("2026-08-31T22:30:00Z"))).toBe("2026-09-01");
    expect(marketplaceYmd(new Date("2026-12-31T23:30:00Z"))).toBe("2027-01-01");
    // …and only at it: half an hour earlier is still the old month.
    expect(marketplaceYmd(new Date("2026-08-31T21:30:00Z"))).toBe("2026-08-31");
  });

  it("is the same rule `todayYmd` runs, so the two cannot disagree", () => {
    const instant = new Date("2026-06-09T22:30:00Z");
    expect(marketplaceYmd(instant)).toBe(todayYmd(MARKETPLACE_TIME_ZONE, instant));
  });
});

describe("the mistake these tests exist to catch", () => {
  it("proves the zone switch bites, by reproducing the old defect under it", () => {
    // Without this, every assertion below would be vacuous: if `process.env.TZ` did
    // not actually move the process's clock, a broken reader would look correct.
    //
    // `dateKey` reads local fields — right for a calendar-date `Date`, and exactly
    // wrong for the UTC midnight a `@db.Date` column comes back as. That is the M6
    // defect in one line, and it is only visible from a zone behind UTC.
    expect(inZone("America/Chicago", () => dateKey(ymdToDbDate("2026-06-10")))).toBe(
      "2026-06-09",
    );
    expect(inZone("Europe/Skopje", () => dateKey(ymdToDbDate("2026-06-10")))).toBe(
      "2026-06-10",
    );

    // And the boundary conversion the code now goes through instead.
    expect(
      expectZoneIndependent(() => dateKey(dbDateToLocalDate(ymdToDbDate("2026-06-10")))),
    ).toBe("2026-06-10");
  });
});

describe("@db.Date round-trips", () => {
  const dates = [
    "2026-06-10",
    "2028-02-29", // leap day
    "2028-03-01", // the day after one
    "2026-12-31",
    "2027-01-01",
    "2026-03-29", // Europe/Skopje springs forward
    "2026-10-25", // …and falls back
  ];

  it("never moves a stored day to the one before or after it", () => {
    for (const ymd of dates) {
      expectZoneIndependent(() => dbDateToYmd(ymdToDbDate(ymd)));
      expect(dbDateToYmd(ymdToDbDate(ymd))).toBe(ymd);
    }
  });

  it("survives the ISO string a serialized `@db.Date` becomes", () => {
    for (const ymd of dates) {
      expectZoneIndependent(() =>
        dbDateToYmd(ymdToDbDate(ymd).toISOString()),
      );
      expect(dbDateToYmd(ymdToDbDate(ymd).toISOString())).toBe(ymd);
    }
  });

  it("hands the calendar layer the same day it was stored under", () => {
    for (const ymd of dates) {
      // The boundary conversion: UTC midnight in, this reader's own midnight out.
      expectZoneIndependent(() => dateKey(dbDateToLocalDate(ymdToDbDate(ymd))));
      expect(dateKey(dbDateToLocalDate(ymdToDbDate(ymd)))).toBe(ymd);
    }
  });

  it("round-trips a calendar-date `Date` through `dateKey` unchanged", () => {
    for (const ymd of dates) {
      expectZoneIndependent(() => dateKey(parseLocalYmd(ymd)));
      expect(dateKey(ymdToLocalDate(ymd))).toBe(ymd);
    }
  });
});

describe("calendar arithmetic", () => {
  it("counts nights across an autumn DST change without losing one", () => {
    // Europe/Skopje puts the clocks back on 25 October 2026. `differenceInDays` over
    // UTC-midnight anchors sees a short last day here and answers two.
    expectZoneIndependent(() => nightsBetweenYmd("2026-10-24", "2026-10-27"));
    expect(nightsBetweenYmd("2026-10-24", "2026-10-27")).toBe(3);
  });

  it("counts nights across a spring DST change without gaining one", () => {
    expectZoneIndependent(() => nightsBetweenYmd("2026-03-28", "2026-03-31"));
    expect(nightsBetweenYmd("2026-03-28", "2026-03-31")).toBe(3);
  });

  it("counts the leap day as a night", () => {
    expect(nightsBetweenYmd("2028-02-28", "2028-03-01")).toBe(2);
    expect(nightsBetweenYmd("2027-02-28", "2027-03-01")).toBe(1);
    expectZoneIndependent(() => nightsBetweenYmd("2028-02-28", "2028-03-01"));
  });

  it("counts across a year boundary", () => {
    expect(nightsBetweenYmd("2026-12-30", "2027-01-02")).toBe(3);
    expectZoneIndependent(() => nightsBetweenYmd("2026-12-30", "2027-01-02"));
  });

  it("steps days over month, year and leap boundaries", () => {
    expect(addDaysToYmd("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDaysToYmd("2028-02-29", 1)).toBe("2028-03-01");
    expect(addDaysToYmd("2027-02-28", 1)).toBe("2027-03-01");
    expect(addDaysToYmd("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDaysToYmd("2027-01-01", -1)).toBe("2026-12-31");
    expectZoneIndependent(() => addDaysToYmd("2026-10-25", 1));
  });

  it("steps months to the day the horizon names", () => {
    expect(addMonthsToYmd("2026-06-10", 18)).toBe("2027-12-10");
    expect(addMonthsToYmd("2027-12-31", 12)).toBe("2028-12-31");
    expectZoneIndependent(() => addMonthsToYmd("2026-06-10", 18));
  });

  it("walks a stay's nights as [check-in, check-out)", () => {
    expect(eachYmdExclusive("2026-06-10", "2026-06-13")).toEqual([
      "2026-06-10",
      "2026-06-11",
      "2026-06-12",
    ]);
  });
});

describe("stay nights", () => {
  it("rejects malformed and impossible date-only values instead of normalizing them", () => {
    expect(parseLocalYmd("not-a-date").getTime()).toBeNaN();
    expect(parseLocalYmd("2026-02-31").getTime()).toBeNaN();
    expect(parseLocalYmd("2026-13-01").getTime()).toBeNaN();
  });

  it("names the same nights whatever zone the process runs in", () => {
    const nights = expectZoneIndependent(() =>
      eachStayNightKey(parseLocalYmd("2026-06-10"), parseLocalYmd("2026-06-13")),
    );

    expect(nights).toEqual(["2026-06-10", "2026-06-11", "2026-06-12"]);
  });

  it("names the same nights when the stay is handed over as stored dates", () => {
    // The booking transaction's case: `checkIn`/`checkOut` are the UTC-midnight
    // instants the columns take, converted at the boundary before pricing.
    const nights = expectZoneIndependent(() =>
      eachStayNightKey(
        dbDateToLocalDate(ymdToDbDate("2026-06-10")),
        dbDateToLocalDate(ymdToDbDate("2026-06-13")),
      ),
    );

    expect(nights).toEqual(["2026-06-10", "2026-06-11", "2026-06-12"]);
  });

  it("keeps every night of a stay that spans an autumn DST change", () => {
    const nights = expectZoneIndependent(() =>
      eachStayNightKey(parseLocalYmd("2026-10-24"), parseLocalYmd("2026-10-27")),
    );

    expect(nights).toEqual(["2026-10-24", "2026-10-25", "2026-10-26"]);
  });

  it("keeps every night of a stay that spans a spring DST change", () => {
    const nights = expectZoneIndependent(() =>
      eachStayNightKey(parseLocalYmd("2026-03-28"), parseLocalYmd("2026-03-31")),
    );

    expect(nights).toEqual(["2026-03-28", "2026-03-29", "2026-03-30"]);
  });

  it("includes the leap day and crosses into the next year", () => {
    expect(
      expectZoneIndependent(() =>
        eachStayNightKey(parseLocalYmd("2028-02-28"), parseLocalYmd("2028-03-02")),
      ),
    ).toEqual(["2028-02-28", "2028-02-29", "2028-03-01"]);

    expect(
      expectZoneIndependent(() =>
        eachStayNightKey(parseLocalYmd("2026-12-30"), parseLocalYmd("2027-01-02")),
      ),
    ).toEqual(["2026-12-30", "2026-12-31", "2027-01-01"]);
  });

  it("sells nothing for a date that is not one, rather than hanging", () => {
    // The day walkers step a `yyyy-MM-dd` cursor until it passes the end key, and
    // "NaN-NaN-NaN" is never passed. Garbage arrives here from edited URLs and stale
    // shared links, so it has to be refused rather than walked.
    const invalid = parseLocalYmd("not-a-date");
    expect(Number.isNaN(invalid.getTime())).toBe(true);

    expect(eachStayNightKey(parseLocalYmd("2026-06-10"), invalid)).toEqual([]);
    expect(eachStayNightKey(invalid, parseLocalYmd("2026-06-13"))).toEqual([]);
    expect(
      computeStayQuote({
        baseNightly: 100,
        cleaningFee: 0,
        checkIn: parseLocalYmd("2026-06-10"),
        checkOut: invalid,
        overrides: new Map(),
      }).nights,
    ).toBe(0);
    expect(
      computeNightlyRateRange({
        baseNightly: 100,
        overrides: new Map(),
        blockedRanges: [],
        from: parseLocalYmd("2026-06-10"),
        to: invalid,
      }),
    ).toBeNull();
  });

  it("sells nothing for a stay that does not run forwards", () => {
    expect(
      eachStayNightKey(parseLocalYmd("2026-06-13"), parseLocalYmd("2026-06-10")),
    ).toEqual([]);
    expect(
      eachStayNightKey(parseLocalYmd("2026-06-10"), parseLocalYmd("2026-06-10")),
    ).toEqual([]);
  });
});

/** A `listingDatePrice` row exactly as Prisma reads a `@db.Date` column back. */
const storedRow = (ymd: string, rate: number) => ({
  date: ymdToDbDate(ymd),
  nightlyRate: rate,
});

describe("nightly price overrides", () => {
  it("keys a stored override under the day the host set it for", () => {
    const map = expectZoneIndependent(() =>
      Object.fromEntries(
        buildPriceOverrideMap([storedRow("2026-06-11", 250)]).entries(),
      ),
    );

    expect(map).toEqual({ "2026-06-11": 250 });
  });

  it("charges the override on the night it belongs to, in any zone", () => {
    const quote = expectZoneIndependent(() =>
      computeStayQuote({
        baseNightly: 100,
        cleaningFee: 0,
        checkIn: dbDateToLocalDate(ymdToDbDate("2026-06-10")),
        checkOut: dbDateToLocalDate(ymdToDbDate("2026-06-13")),
        overrides: buildPriceOverrideMap([storedRow("2026-06-11", 250)]),
      }),
    );

    expect(quote.nightlyBreakdown.map((night) => [night.date, night.rate])).toEqual([
      ["2026-06-10", 100],
      ["2026-06-11", 250],
      ["2026-06-12", 100],
    ]);
    expect(quote.total).toBe(450);
  });

  it("prices a stay over the leap day identically everywhere", () => {
    const quote = expectZoneIndependent(() =>
      computeStayQuote({
        baseNightly: 100,
        cleaningFee: 20,
        checkIn: parseLocalYmd("2028-02-28"),
        checkOut: parseLocalYmd("2028-03-02"),
        overrides: buildPriceOverrideMap([storedRow("2028-02-29", 400)]),
      }),
    );

    expect(quote.nights).toBe(3);
    expect(quote.total).toBe(620);
  });

  it("prices a stay over the new year identically everywhere", () => {
    const quote = expectZoneIndependent(() =>
      computeStayQuote({
        baseNightly: 100,
        cleaningFee: 0,
        checkIn: parseLocalYmd("2026-12-30"),
        checkOut: parseLocalYmd("2027-01-02"),
        overrides: buildPriceOverrideMap([storedRow("2026-12-31", 500)]),
      }),
    );

    expect(quote.nightlyBreakdown.map((night) => night.date)).toEqual([
      "2026-12-30",
      "2026-12-31",
      "2027-01-01",
    ]);
    expect(quote.total).toBe(700);
  });
});

describe("promotion windows", () => {
  /** A promotion row exactly as it comes off `ListingPromotion`. */
  const storedPromotion = (startYmd: string, endYmd: string): StayPromotion =>
    toStayPromotion({
      id: "promo",
      type: "PERCENT_DISCOUNT",
      discountPercent: 50,
      minimumNights: 1,
      startDate: ymdToDbDate(startYmd),
      endDate: ymdToDbDate(endYmd),
      createdAt: new Date("2026-01-01T00:00:00Z"),
    });

  it("covers [start, end) — the start night in, the end night out", () => {
    const promotion = storedPromotion("2026-06-11", "2026-06-13");

    expectZoneIndependent(() => [
      promotionCoversNight(promotion, parseLocalYmd("2026-06-10")),
      promotionCoversNight(promotion, parseLocalYmd("2026-06-11")),
      promotionCoversNight(promotion, parseLocalYmd("2026-06-12")),
      promotionCoversNight(promotion, parseLocalYmd("2026-06-13")),
    ]);

    expect(promotionCoversNight(promotion, parseLocalYmd("2026-06-10"))).toBe(false);
    expect(promotionCoversNight(promotion, parseLocalYmd("2026-06-11"))).toBe(true);
    expect(promotionCoversNight(promotion, parseLocalYmd("2026-06-12"))).toBe(true);
    expect(promotionCoversNight(promotion, parseLocalYmd("2026-06-13"))).toBe(false);
  });

  it("reads the same window out of the ISO string the card is serialized with", () => {
    const isoPromotion: StayPromotion = {
      id: "promo",
      type: "PERCENT_DISCOUNT",
      discountPercent: 50,
      startDate: ymdToDbDate("2026-06-11").toISOString(),
      endDate: ymdToDbDate("2026-06-13").toISOString(),
    };

    expectZoneIndependent(() => [
      promotionCoversNight(isoPromotion, parseLocalYmd("2026-06-10")),
      promotionCoversNight(isoPromotion, parseLocalYmd("2026-06-11")),
      promotionCoversNight(isoPromotion, parseLocalYmd("2026-06-12")),
      promotionCoversNight(isoPromotion, parseLocalYmd("2026-06-13")),
    ]);
    expect(promotionCoversNight(isoPromotion, parseLocalYmd("2026-06-11"))).toBe(true);
    expect(promotionCoversNight(isoPromotion, parseLocalYmd("2026-06-13"))).toBe(false);
  });

  it("discounts exactly the nights inside the window, in any zone", () => {
    const quote = expectZoneIndependent(() =>
      computeStayQuote({
        baseNightly: 100,
        cleaningFee: 0,
        checkIn: dbDateToLocalDate(ymdToDbDate("2026-06-10")),
        checkOut: dbDateToLocalDate(ymdToDbDate("2026-06-13")),
        overrides: new Map(),
        promotions: [storedPromotion("2026-06-11", "2026-06-13")],
      }),
    );

    expect(
      quote.nightlyBreakdown.map((night) => [night.date, night.discountedRate]),
    ).toEqual([
      ["2026-06-10", 100],
      ["2026-06-11", 50],
      ["2026-06-12", 50],
    ]);
    expect(quote.total).toBe(200);
  });

  it("holds its boundaries across a DST change and a year end", () => {
    expectZoneIndependent(() => {
      const autumn = storedPromotion("2026-10-25", "2026-10-26");
      expect(promotionCoversNight(autumn, parseLocalYmd("2026-10-24"))).toBe(false);
      expect(promotionCoversNight(autumn, parseLocalYmd("2026-10-25"))).toBe(true);
      expect(promotionCoversNight(autumn, parseLocalYmd("2026-10-26"))).toBe(false);

      const newYear = storedPromotion("2026-12-31", "2027-01-02");
      expect(promotionCoversNight(newYear, parseLocalYmd("2026-12-30"))).toBe(false);
      expect(promotionCoversNight(newYear, parseLocalYmd("2026-12-31"))).toBe(true);
      expect(promotionCoversNight(newYear, parseLocalYmd("2027-01-01"))).toBe(true);
      expect(promotionCoversNight(newYear, parseLocalYmd("2027-01-02"))).toBe(false);
      return null;
    });
  });

  it("prices a calendar cell off the same window the quote uses", () => {
    const promotions = [storedPromotion("2026-06-11", "2026-06-13")];

    expectZoneIndependent(() => [
      computeDayRate({
        baseNightly: 100,
        overrides: new Map(),
        day: parseLocalYmd("2026-06-11"),
        promotions,
      }),
      computeDayRate({
        baseNightly: 100,
        overrides: new Map(),
        day: parseLocalYmd("2026-06-13"),
        promotions,
      }),
    ]);

    expect(
      computeDayRate({
        baseNightly: 100,
        overrides: new Map(),
        day: parseLocalYmd("2026-06-11"),
        promotions,
      }),
    ).toEqual({ rate: 50, originalRate: 100 });
    expect(
      computeDayRate({
        baseNightly: 100,
        overrides: new Map(),
        day: parseLocalYmd("2026-06-13"),
        promotions,
      }),
    ).toEqual({ rate: 100, originalRate: null });
  });
});

describe("blocked-date boundaries", () => {
  it("excludes exactly the blocked days from the advertised rate range", () => {
    // Blocked runs are inclusive on both ends and arrive as calendar-date keys.
    const range = expectZoneIndependent(() =>
      computeNightlyRateRange({
        baseNightly: 100,
        overrides: buildPriceOverrideMap([
          storedRow("2026-06-10", 500),
          storedRow("2026-06-11", 40),
          storedRow("2026-06-12", 80),
        ]),
        blockedRanges: [{ from: "2026-06-10", to: "2026-06-11" }],
        from: parseLocalYmd("2026-06-10"),
        to: parseLocalYmd("2026-06-12"),
      }),
    );

    // The 500 and the 40 are both blocked, so only the 12th's 80 is on offer.
    expect(range).toEqual({ min: 80, max: 80 });
  });

  it("treats the day after a block's last day as bookable", () => {
    const range = expectZoneIndependent(() =>
      computeNightlyRateRange({
        baseNightly: 100,
        overrides: buildPriceOverrideMap([storedRow("2026-06-12", 60)]),
        blockedRanges: [{ from: "2026-06-10", to: "2026-06-11" }],
        from: parseLocalYmd("2026-06-10"),
        to: parseLocalYmd("2026-06-12"),
      }),
    );

    expect(range).toEqual({ min: 60, max: 60 });
  });

  it("still reads a blocked run given as calendar-date `Date`s", () => {
    const range = expectZoneIndependent(() =>
      computeNightlyRateRange({
        baseNightly: 100,
        overrides: buildPriceOverrideMap([storedRow("2026-06-12", 60)]),
        blockedRanges: [
          { from: parseLocalYmd("2026-06-10"), to: parseLocalYmd("2026-06-11") },
        ],
        from: parseLocalYmd("2026-06-10"),
        to: parseLocalYmd("2026-06-12"),
      }),
    );

    expect(range).toEqual({ min: 60, max: 60 });
  });

  it("has nothing to quote when every day in the horizon is blocked", () => {
    expect(
      expectZoneIndependent(() =>
        computeNightlyRateRange({
          baseNightly: 100,
          overrides: new Map(),
          blockedRanges: [{ from: "2026-06-10", to: "2026-06-12" }],
          from: parseLocalYmd("2026-06-10"),
          to: parseLocalYmd("2026-06-12"),
        }),
      ),
    ).toBeNull();
  });
});
