import { describe, expect, it } from "vitest";
import { FIXED_PERIODS, LAB_TODAY, QUICK_SETUP_EXAMPLE } from "./fixtures";
import {
  generateFixedStayPeriods,
  newStaysFrom,
  quickSetupIssue,
  quickSetupPreview,
  weekdayOfYmd,
  type QuickSetupDraft,
} from "./quick-setup";

const season = (over: Partial<QuickSetupDraft> = {}): QuickSetupDraft => ({
  ...QUICK_SETUP_EXAMPLE,
  ...over,
});

describe("weekdayOfYmd", () => {
  it("reads the weekday off the stored calendar date", () => {
    expect(weekdayOfYmd("2026-07-04")).toBe(6); // Saturday
    expect(weekdayOfYmd("2026-06-01")).toBe(1); // Monday
    expect(weekdayOfYmd("2026-03-29")).toBe(0); // Sunday
  });
});

describe("generating a season", () => {
  it("walks changeover day to changeover day, one stay per requested length", () => {
    const stays = generateFixedStayPeriods(season(), LAB_TODAY);
    expect(stays).toHaveLength(15);
    expect(stays.slice(0, 3)).toEqual([
      { checkIn: "2026-07-04", checkOut: "2026-07-11", nights: 7 },
      { checkIn: "2026-07-04", checkOut: "2026-07-18", nights: 14 },
      { checkIn: "2026-07-11", checkOut: "2026-07-18", nights: 7 },
    ]);
  });

  it("puts every check-in on the changeover weekday the host chose", () => {
    for (const stay of generateFixedStayPeriods(season(), LAB_TODAY)) {
      expect(weekdayOfYmd(stay.checkIn)).toBe(6);
    }
  });

  it("only generates stays that finish inside the season", () => {
    // 4 and 11 July are both Saturdays, but only the 4th's fortnight ends by the 18th.
    const stays = generateFixedStayPeriods(
      season({ seasonStart: "2026-07-04", seasonEnd: "2026-07-18" }),
      LAB_TODAY,
    );
    expect(stays).toEqual([
      { checkIn: "2026-07-04", checkOut: "2026-07-11", nights: 7 },
      { checkIn: "2026-07-04", checkOut: "2026-07-18", nights: 14 },
      { checkIn: "2026-07-11", checkOut: "2026-07-18", nights: 7 },
    ]);
  });

  it("starts at today's first changeover when the season has already begun", () => {
    const stays = generateFixedStayPeriods(
      season({
        seasonStart: "2026-01-01",
        seasonEnd: "2026-06-30",
        lengths: [7],
      }),
      LAB_TODAY,
    );
    // Today is Monday 1 June; the first Saturday on or after it is the 6th.
    expect(stays[0].checkIn).toBe("2026-06-06");
    expect(stays.map((stay) => stay.checkIn)).toEqual([
      "2026-06-06",
      "2026-06-13",
      "2026-06-20",
    ]);
  });

  it("keeps stepping by whole weeks across a daylight-saving change", () => {
    const stays = generateFixedStayPeriods(
      season({
        seasonStart: "2026-03-21",
        seasonEnd: "2026-04-18",
        lengths: [7],
      }),
      "2026-01-01",
    );
    // Europe moves its clocks on 29 March 2026, in the middle of this run.
    expect(stays.map((stay) => stay.checkIn)).toEqual([
      "2026-03-21",
      "2026-03-28",
      "2026-04-04",
      "2026-04-11",
    ]);
  });

  it("offers one length or both, as asked", () => {
    const weeks = generateFixedStayPeriods(season({ lengths: [7] }), LAB_TODAY);
    const fortnights = generateFixedStayPeriods(season({ lengths: [14] }), LAB_TODAY);
    expect(new Set(weeks.map((stay) => stay.nights))).toEqual(new Set([7]));
    expect(new Set(fortnights.map((stay) => stay.nights))).toEqual(new Set([14]));
  });

  it("is deterministic, so a confirm can regenerate rather than trust a posted list", () => {
    expect(generateFixedStayPeriods(season(), LAB_TODAY)).toEqual(
      generateFixedStayPeriods(season(), LAB_TODAY),
    );
  });

  it("returns nothing rather than throwing on a half-typed form", () => {
    expect(generateFixedStayPeriods(season({ seasonStart: "" }), LAB_TODAY)).toEqual([]);
    expect(generateFixedStayPeriods(season({ lengths: [] }), LAB_TODAY)).toEqual([]);
  });
});

describe("what is still wrong", () => {
  it("passes a season that produces stays", () => {
    expect(quickSetupIssue(season(), LAB_TODAY)).toBeNull();
  });

  it("asks for the fields it needs, cheapest question first", () => {
    expect(quickSetupIssue(season({ seasonStart: "" }), LAB_TODAY)).toBe(
      "MISSING_START",
    );
    expect(quickSetupIssue(season({ seasonEnd: "" }), LAB_TODAY)).toBe("MISSING_END");
    expect(quickSetupIssue(season({ lengths: [] }), LAB_TODAY)).toBe("NO_LENGTHS");
  });

  it("refuses a season that runs backwards or has already finished", () => {
    expect(
      quickSetupIssue(
        season({ seasonStart: "2026-08-29", seasonEnd: "2026-07-04" }),
        LAB_TODAY,
      ),
    ).toBe("SEASON_REVERSED");
    expect(
      quickSetupIssue(
        season({ seasonStart: "2026-05-01", seasonEnd: "2026-05-30" }),
        LAB_TODAY,
      ),
    ).toBe("SEASON_ENDED");
  });

  it("refuses a season past the horizon guests are ever shown", () => {
    expect(
      quickSetupIssue(season({ seasonEnd: "2029-01-01" }), LAB_TODAY),
    ).toBe("SEASON_TOO_LONG");
  });

  it("says so when no whole stay fits between the two dates", () => {
    expect(
      quickSetupIssue(
        season({ seasonStart: "2026-07-04", seasonEnd: "2026-07-10", lengths: [7] }),
        LAB_TODAY,
      ),
    ).toBe("NOTHING_TO_GENERATE");
  });
});

describe("preview", () => {
  it("marks the stays the listing already offers", () => {
    const rows = quickSetupPreview(season(), FIXED_PERIODS, LAB_TODAY);
    expect(rows).toHaveLength(15);
    expect(rows.filter((row) => row.duplicate)).toHaveLength(7);
    expect(newStaysFrom(rows)).toHaveLength(8);
  });

  it("counts an existing period as already offered whatever state it is in", () => {
    const rows = quickSetupPreview(season(), FIXED_PERIODS, LAB_TODAY);
    const find = (checkIn: string, checkOut: string) =>
      rows.find((row) => row.checkIn === checkIn && row.checkOut === checkOut);

    // Booked, and the fortnight whose dates a booking has taken.
    expect(find("2026-07-11", "2026-07-18")?.duplicate).toBe(true);
    expect(find("2026-07-04", "2026-07-18")?.duplicate).toBe(true);
  });

  it("never proposes a stay that would touch a period outside the season", () => {
    // The host's switched-off 22 August fortnight ends after the season, so Quick setup
    // does not generate it — and therefore cannot disturb it.
    const rows = quickSetupPreview(season(), FIXED_PERIODS, LAB_TODAY);
    expect(
      rows.some((row) => row.checkIn === "2026-08-22" && row.checkOut === "2026-09-05"),
    ).toBe(false);
  });

  it("finds nothing new to add on a second run over the same season", () => {
    const rows = quickSetupPreview(season(), FIXED_PERIODS, LAB_TODAY);
    const after = [
      ...FIXED_PERIODS,
      ...newStaysFrom(rows).map((stay) => ({
        id: `period-${stay.checkIn}-${stay.nights}`,
        checkIn: stay.checkIn,
        checkOut: stay.checkOut,
        disabled: false,
      })),
    ];
    expect(newStaysFrom(quickSetupPreview(season(), after, LAB_TODAY))).toHaveLength(0);
  });
});
