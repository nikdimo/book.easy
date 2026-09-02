import { describe, expect, it } from "vitest";
import { weekdayOfYmd } from "@/lib/utils/date-only";
import {
  fixedStayNights,
  validateFixedStayPeriod,
} from "@/lib/utils/fixed-stay-periods";
import {
  generateFixedStayPeriods,
  markExistingFixedStays,
  newFixedStaysFrom,
  nextChangeoverOnOrAfter,
  previewFixedStayQuickSetup,
  validateFixedStayQuickSetup,
  DEFAULT_CHANGEOVER_WEEKDAY,
  QUICK_SETUP_MAX_SEASON_NIGHTS,
  type FixedStayQuickSetup,
} from "@/lib/utils/fixed-stay-quick-setup";

const SATURDAY = 6;
const MONDAY = 1;

/** 2027-06-05 is a Saturday; 2027-06-01 is the Tuesday before it. */
const saturdaySeason = (
  overrides: Partial<FixedStayQuickSetup> = {},
): FixedStayQuickSetup => ({
  seasonStart: "2027-06-01",
  lastCheckOut: "2027-07-03",
  changeoverWeekday: SATURDAY,
  nights: [7],
  ...overrides,
});

/** Compact `checkIn>checkOut` pairs, so an expectation reads as a season. */
const pairs = (stays: readonly { checkIn: string; checkOut: string }[]) =>
  stays.map((stay) => `${stay.checkIn}>${stay.checkOut}`);

describe("nextChangeoverOnOrAfter", () => {
  it("keeps a date that already falls on the changeover day", () => {
    expect(nextChangeoverOnOrAfter("2027-06-05", SATURDAY)).toBe("2027-06-05");
  });

  it("walks forward to the next one", () => {
    expect(nextChangeoverOnOrAfter("2027-06-01", SATURDAY)).toBe("2027-06-05");
    expect(nextChangeoverOnOrAfter("2027-06-01", MONDAY)).toBe("2027-06-07");
  });

  it("defaults to Saturday, the changeover nearly every weekly let uses", () => {
    expect(DEFAULT_CHANGEOVER_WEEKDAY).toBe(SATURDAY);
  });
});

describe("Saturday-to-Saturday generation", () => {
  it("generates a week from every Saturday in the season", () => {
    expect(pairs(generateFixedStayPeriods(saturdaySeason()))).toEqual([
      "2027-06-05>2027-06-12",
      "2027-06-12>2027-06-19",
      "2027-06-19>2027-06-26",
      "2027-06-26>2027-07-03",
    ]);
  });

  it("starts on the first changeover day on or after the season start", () => {
    const stays = generateFixedStayPeriods(saturdaySeason());
    expect(stays[0].checkIn).toBe("2027-06-05");
    expect(stays.every((stay) => weekdayOfYmd(stay.checkIn) === SATURDAY)).toBe(true);
  });

  it("includes a season start that already is the changeover day", () => {
    expect(
      generateFixedStayPeriods(saturdaySeason({ seasonStart: "2027-06-05" }))[0]
        .checkIn,
    ).toBe("2027-06-05");
  });

  it("generates other weekdays the same way", () => {
    expect(
      pairs(
        generateFixedStayPeriods(
          saturdaySeason({ changeoverWeekday: MONDAY, lastCheckOut: "2027-06-28" }),
        ),
      ),
    ).toEqual([
      "2027-06-07>2027-06-14",
      "2027-06-14>2027-06-21",
      "2027-06-21>2027-06-28",
    ]);
  });

  it("produces only stays this product can store", () => {
    for (const stay of generateFixedStayPeriods(
      saturdaySeason({ nights: [7, 14], lastCheckOut: "2027-09-25" }),
    )) {
      expect(validateFixedStayPeriod(stay)).toEqual({ ok: true, nights: stay.nights });
    }
  });
});

describe("the last-checkout boundary", () => {
  it("includes a stay that ends exactly on the last checkout", () => {
    expect(pairs(generateFixedStayPeriods(saturdaySeason()))).toContain(
      "2027-06-26>2027-07-03",
    );
  });

  it("excludes a stay that would end one day after it", () => {
    expect(
      pairs(generateFixedStayPeriods(saturdaySeason({ lastCheckOut: "2027-07-02" }))),
    ).toEqual([
      "2027-06-05>2027-06-12",
      "2027-06-12>2027-06-19",
      "2027-06-19>2027-06-26",
    ]);
  });

  it("means the last day a guest may leave, not the last day they may arrive", () => {
    // The last Saturday inside the season is 2027-06-26, but a fortnight from it ends
    // on 2027-07-10 — after the season — so only the week is generated from it.
    expect(
      pairs(
        generateFixedStayPeriods(
          saturdaySeason({ nights: [7, 14], lastCheckOut: "2027-07-03" }),
        ),
      ),
    ).toEqual([
      "2027-06-05>2027-06-12",
      "2027-06-05>2027-06-19",
      "2027-06-12>2027-06-19",
      "2027-06-12>2027-06-26",
      "2027-06-19>2027-06-26",
      "2027-06-19>2027-07-03",
      "2027-06-26>2027-07-03",
    ]);
  });

  it("generates nothing when no changeover day fits inside the season", () => {
    const setup = saturdaySeason({
      seasonStart: "2027-06-06",
      lastCheckOut: "2027-06-11",
    });
    expect(generateFixedStayPeriods(setup)).toEqual([]);
    expect(validateFixedStayQuickSetup(setup)).toBe("NOTHING_TO_GENERATE");
  });
});

describe("both durations at once", () => {
  const both = saturdaySeason({ nights: [7, 14], lastCheckOut: "2027-06-26" });

  it("offers a week and a fortnight from each changeover day that fits", () => {
    expect(pairs(generateFixedStayPeriods(both))).toEqual([
      "2027-06-05>2027-06-12",
      "2027-06-05>2027-06-19",
      "2027-06-12>2027-06-19",
      "2027-06-12>2027-06-26",
      "2027-06-19>2027-06-26",
    ]);
  });

  it("lets the alternatives overlap rather than dropping one", () => {
    const stays = generateFixedStayPeriods(both);
    const fromFirstSaturday = stays.filter((stay) => stay.checkIn === "2027-06-05");
    expect(fromFirstSaturday.map((stay) => stay.nights)).toEqual([7, 14]);
  });

  it("sorts chronologically, then shortest first", () => {
    expect(pairs(generateFixedStayPeriods(both))).toEqual(
      pairs([...generateFixedStayPeriods(both)]),
    );
    expect(
      generateFixedStayPeriods(both).map((stay) => [stay.checkIn, stay.nights]),
    ).toEqual([
      ["2027-06-05", 7],
      ["2027-06-05", 14],
      ["2027-06-12", 7],
      ["2027-06-12", 14],
      ["2027-06-19", 7],
    ]);
  });

  it("is deterministic — the order the lengths arrive in changes nothing", () => {
    expect(generateFixedStayPeriods({ ...both, nights: [14, 7] })).toEqual(
      generateFixedStayPeriods(both),
    );
    expect(generateFixedStayPeriods({ ...both, nights: [14, 7, 14] })).toEqual(
      generateFixedStayPeriods(both),
    );
    expect(generateFixedStayPeriods(both)).toEqual(generateFixedStayPeriods(both));
  });
});

describe("date-only behaviour across DST boundaries", () => {
  // 2027-10-31 is the autumn clock change in Europe. Every stay either side of it is
  // still exactly seven nights, and every check-in is still a Saturday.
  const acrossFallBack = saturdaySeason({
    seasonStart: "2027-10-01",
    lastCheckOut: "2027-11-27",
  });

  it("keeps every generated stay exactly seven nights", () => {
    const stays = generateFixedStayPeriods(acrossFallBack);
    expect(stays.length).toBeGreaterThan(4);
    expect(stays.every((stay) => fixedStayNights(stay) === 7)).toBe(true);
  });

  it("keeps every check-in on the changeover weekday", () => {
    expect(
      generateFixedStayPeriods(acrossFallBack).every(
        (stay) => weekdayOfYmd(stay.checkIn) === SATURDAY,
      ),
    ).toBe(true);
  });

  it("steps across the change itself without skipping or repeating a week", () => {
    expect(pairs(generateFixedStayPeriods(acrossFallBack))).toContain(
      "2027-10-30>2027-11-06",
    );
  });

  it("does the same across a spring-forward season", () => {
    const stays = generateFixedStayPeriods(
      saturdaySeason({ seasonStart: "2027-03-01", lastCheckOut: "2027-04-24" }),
    );
    expect(pairs(stays)).toContain("2027-03-27>2027-04-03");
    expect(stays.every((stay) => fixedStayNights(stay) === 7)).toBe(true);
  });
});

describe("re-running the same setup", () => {
  const setup = saturdaySeason();
  const existing = [{ checkIn: "2027-06-05", checkOut: "2027-06-12" }];

  it("marks the stays the listing already offers", () => {
    expect(
      previewFixedStayQuickSetup(setup, existing).map((row) => [
        `${row.checkIn}>${row.checkOut}`,
        row.duplicate,
      ]),
    ).toEqual([
      ["2027-06-05>2027-06-12", true],
      ["2027-06-12>2027-06-19", false],
      ["2027-06-19>2027-06-26", false],
      ["2027-06-26>2027-07-03", false],
    ]);
  });

  it("leaves nothing to create when every stay already exists", () => {
    const everything = generateFixedStayPeriods(setup);
    expect(
      newFixedStaysFrom(markExistingFixedStays(everything, everything)),
    ).toEqual([]);
  });

  it("marks a duplicate on both dates only", () => {
    expect(
      markExistingFixedStays(generateFixedStayPeriods(setup), [
        // Same check-in, different length: a real second option, not a duplicate.
        { checkIn: "2027-06-05", checkOut: "2027-06-19" },
      ]).some((row) => row.duplicate),
    ).toBe(false);
  });

  it("creates only what is missing", () => {
    expect(
      pairs(newFixedStaysFrom(previewFixedStayQuickSetup(setup, existing))),
    ).toEqual([
      "2027-06-12>2027-06-19",
      "2027-06-19>2027-06-26",
      "2027-06-26>2027-07-03",
    ]);
  });
});

describe("validateFixedStayQuickSetup", () => {
  it("accepts a season it can generate from", () => {
    expect(validateFixedStayQuickSetup(saturdaySeason())).toBeNull();
  });

  it.each([
    ["MISSING_START", { seasonStart: "" }],
    ["MISSING_LAST_CHECKOUT", { lastCheckOut: "  " }],
    ["INVALID_DATE", { seasonStart: "2027-13-01" }],
    ["INVALID_CHANGEOVER_WEEKDAY", { changeoverWeekday: 7 }],
    ["NO_LENGTHS", { nights: [] }],
    ["UNSUPPORTED_LENGTH", { nights: [8] }],
    ["SEASON_REVERSED", { seasonStart: "2027-07-03", lastCheckOut: "2027-06-01" }],
    ["SEASON_REVERSED", { lastCheckOut: "2027-06-01" }],
  ] as const)("reports %s", (issue, overrides) => {
    expect(
      validateFixedStayQuickSetup(
        saturdaySeason(overrides as Partial<FixedStayQuickSetup>),
      ),
    ).toBe(issue);
  });

  it("refuses a season reaching past the bookable horizon", () => {
    expect(
      validateFixedStayQuickSetup(
        saturdaySeason({ seasonStart: "2027-06-01", lastCheckOut: "2029-06-01" }),
      ),
    ).toBe("SEASON_TOO_LONG");
    expect(QUICK_SETUP_MAX_SEASON_NIGHTS).toBeGreaterThan(365);
  });

  it("generates nothing rather than throwing on half-typed input", () => {
    expect(generateFixedStayPeriods(saturdaySeason({ seasonStart: "2027-06" }))).toEqual(
      [],
    );
    expect(generateFixedStayPeriods(saturdaySeason({ nights: [] }))).toEqual([]);
    expect(
      generateFixedStayPeriods(
        saturdaySeason({ changeoverWeekday: 7 as FixedStayQuickSetup["changeoverWeekday"] }),
      ),
    ).toEqual([]);
    expect(
      generateFixedStayPeriods(
        saturdaySeason({ nights: [8] as unknown as FixedStayQuickSetup["nights"] }),
      ),
    ).toEqual([]);
    expect(
      generateFixedStayPeriods(saturdaySeason({ lastCheckOut: "2027-05-01" })),
    ).toEqual([]);
  });

  it("says nothing about today — a past season still generates its stays", () => {
    expect(
      pairs(
        generateFixedStayPeriods(
          saturdaySeason({ seasonStart: "2020-06-01", lastCheckOut: "2020-06-27" }),
        ),
      ),
    ).toEqual([
      "2020-06-06>2020-06-13",
      "2020-06-13>2020-06-20",
      "2020-06-20>2020-06-27",
    ]);
  });
});
