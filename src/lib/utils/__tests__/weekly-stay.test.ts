import { describe, expect, it } from "vitest";
import { addDaysToYmd, weekdayOfYmd } from "@/lib/utils/date-only";
import {
  changeoverWeekdayIndex,
  changeoverWeekdayName,
  isChangeoverDay,
  isWeeklyStay,
  weeklyCheckOutDates,
  shortestBookableNights,
  statedStayCap,
  weeklyStayCap,
  weeklyStayIssue,
  weeklyStayWeekRange,
  CHANGEOVER_WEEKDAY_CHOICES,
  CHANGEOVER_WEEKDAY_NAMES,
  type ChangeoverWeekdayName,
} from "@/lib/utils/weekly-stay";

/**
 * The weekly rule on its own, with no listing, no database and no calendar.
 *
 * Availability is deliberately absent from every case here: whether a night is free is
 * `AvailabilityBlock`'s answer, and duplicating it in this module is exactly how two
 * surfaces start disagreeing about a blocked night. What this file pins down is the
 * shape of a weekly stay — the day it starts, the day it ends, and how long it may run.
 */

const anyLength = { minNights: 1, maxNights: 365 };

const issue = (
  checkIn: string,
  checkOut: string,
  changeoverWeekday: ChangeoverWeekdayName | null = "SATURDAY",
  limits = anyLength,
) => weeklyStayIssue({ checkIn, checkOut, changeoverWeekday, limits });

describe("the changeover weekday", () => {
  it("maps every stored name onto its own weekday, both ways", () => {
    expect(CHANGEOVER_WEEKDAY_NAMES).toHaveLength(7);
    for (const name of CHANGEOVER_WEEKDAY_NAMES) {
      expect(changeoverWeekdayName(changeoverWeekdayIndex(name))).toBe(name);
    }
    // Index is `Date#getUTCDay`, so Sunday is 0 and Saturday is 6.
    expect(changeoverWeekdayIndex("SUNDAY")).toBe(0);
    expect(changeoverWeekdayIndex("SATURDAY")).toBe(6);
  });

  it("offers all seven days, Monday first", () => {
    expect(CHANGEOVER_WEEKDAY_CHOICES).toEqual([
      "MONDAY",
      "TUESDAY",
      "WEDNESDAY",
      "THURSDAY",
      "FRIDAY",
      "SATURDAY",
      "SUNDAY",
    ]);
  });

  it("recognises its own day and no other", () => {
    // 2029-06-09 is a Saturday.
    expect(isChangeoverDay("2029-06-09", "SATURDAY")).toBe(true);
    expect(isChangeoverDay("2029-06-09", "SUNDAY")).toBe(false);
    expect(isChangeoverDay("2029-06-10", "SUNDAY")).toBe(true);
  });
});

describe("every weekday works as a changeover day", () => {
  // One anchor week: 2029-06-10 is a Sunday, so +n lands on weekday n.
  it.each(CHANGEOVER_WEEKDAY_NAMES.map((name, index) => [name, index] as const))(
    "accepts a same-weekday week on %s",
    (name, index) => {
      const checkIn = `2029-06-${String(10 + index).padStart(2, "0")}`;
      expect(weekdayOfYmd(checkIn)).toBe(index);
      const checkOut = `2029-06-${String(17 + index).padStart(2, "0")}`;
      expect(issue(checkIn, checkOut, name)).toBeNull();
      // And refuses the same range on any other changeover day.
      for (const other of CHANGEOVER_WEEKDAY_NAMES) {
        if (other === name) continue;
        expect(issue(checkIn, checkOut, other)).toBe("WRONG_CHECK_IN_DAY");
      }
    },
  );
});

describe("the shape of a weekly stay", () => {
  it("accepts one, two, three and four whole weeks from a Saturday", () => {
    for (const [checkOut, nights] of [
      ["2029-06-16", 7],
      ["2029-06-23", 14],
      ["2029-06-30", 21],
      ["2029-07-07", 28],
    ] as const) {
      expect(issue("2029-06-09", checkOut), `${nights} nights`).toBeNull();
    }
  });

  it("refuses a check-in on the wrong weekday", () => {
    // Sunday arrival on a Saturday listing.
    expect(issue("2029-06-10", "2029-06-17")).toBe("WRONG_CHECK_IN_DAY");
  });

  it("refuses a checkout on the wrong weekday", () => {
    // Right arrival, but leaving on the Friday — six nights, not a week.
    expect(issue("2029-06-09", "2029-06-15")).toBe("WRONG_CHECK_OUT_DAY");
    // ...or on the Sunday, eight nights.
    expect(issue("2029-06-09", "2029-06-17")).toBe("WRONG_CHECK_OUT_DAY");
  });

  it("refuses a range that does not run forwards", () => {
    expect(issue("2029-06-16", "2029-06-09")).toBe("INVALID_RANGE");
    expect(issue("2029-06-09", "2029-06-09")).toBe("INVALID_RANGE");
  });

  it("refuses a malformed date", () => {
    expect(issue("2029-06-31", "2029-07-07")).toBe("INVALID_RANGE");
    expect(issue("09/06/2029", "2029-06-16")).toBe("INVALID_RANGE");
  });

  it("fails closed when the host has not chosen a changeover day", () => {
    expect(issue("2029-06-09", "2029-06-16", null)).toBe("NO_CHANGEOVER_DAY");
    expect(
      issue("2029-06-09", "2029-06-16", "SATURDAYS" as ChangeoverWeekdayName),
    ).toBe("NO_CHANGEOVER_DAY");
    expect(
      isWeeklyStay({
        checkIn: "2029-06-09",
        checkOut: "2029-06-16",
        changeoverWeekday: null,
        limits: anyLength,
      }),
    ).toBe(false);
  });
});

describe("whole weeks across awkward boundaries", () => {
  it("counts seven nights across a spring-forward change", () => {
    // Europe springs forward on 2029-03-25 (a Sunday); this Saturday week spans it.
    expect(issue("2029-03-24", "2029-03-31")).toBeNull();
  });

  it("counts seven nights across an autumn fall-back", () => {
    // 2029-10-28 is the autumn change.
    expect(issue("2029-10-27", "2029-11-03")).toBeNull();
  });

  it("counts whole weeks across a month boundary", () => {
    expect(issue("2029-06-30", "2029-07-07")).toBeNull();
    expect(issue("2029-06-30", "2029-07-14")).toBeNull();
  });

  it("counts whole weeks across a year boundary", () => {
    // 2029-12-29 is a Saturday.
    expect(issue("2029-12-29", "2030-01-05")).toBeNull();
    expect(issue("2029-12-29", "2030-01-12")).toBeNull();
  });

  it("counts whole weeks across a leap day", () => {
    // 2028-02-26 is a Saturday; the week that follows contains 29 February.
    expect(issue("2028-02-26", "2028-03-04")).toBeNull();
  });
});

describe("the listing's minimum and maximum stay", () => {
  it("refuses a week below a fortnight minimum", () => {
    const limits = { minNights: 10, maxNights: 30 };
    expect(issue("2029-06-09", "2029-06-16", "SATURDAY", limits)).toBe(
      "BELOW_MINIMUM",
    );
    expect(issue("2029-06-09", "2029-06-23", "SATURDAY", limits)).toBeNull();
  });

  it("refuses a stay over the maximum", () => {
    const limits = { minNights: 1, maxNights: 30 };
    // 28 nights fits; 35 does not.
    expect(issue("2029-06-09", "2029-07-07", "SATURDAY", limits)).toBeNull();
    expect(issue("2029-06-09", "2029-07-14", "SATURDAY", limits)).toBe(
      "ABOVE_MAXIMUM",
    );
  });

  it("handles a maximum that is not a multiple of seven", () => {
    // 30 is the acceptance example: four weeks fit, five do not.
    expect(weeklyStayWeekRange({ minNights: 1, maxNights: 30 })).toEqual({
      minWeeks: 1,
      maxWeeks: 4,
    });
    // 13 leaves room for one week only, even though 13 > 7.
    expect(weeklyStayWeekRange({ minNights: 1, maxNights: 13 })).toEqual({
      minWeeks: 1,
      maxWeeks: 1,
    });
    // A minimum that is not a multiple of seven rounds up to a whole week.
    expect(weeklyStayWeekRange({ minNights: 10, maxNights: 30 })).toEqual({
      minWeeks: 2,
      maxWeeks: 4,
    });
  });

  it("reports no possible stay when the limits leave no whole week", () => {
    // Between 20 and 21 nights there is no week multiple at all.
    expect(weeklyStayWeekRange({ minNights: 20, maxNights: 20 })).toBeNull();
    expect(
      issue("2029-06-09", "2029-06-30", "SATURDAY", {
        minNights: 20,
        maxNights: 20,
      }),
    ).toBe("ABOVE_MAXIMUM");
  });

  it("reads a stored zero maximum as no cap, like the rest of the product", () => {
    expect(weeklyStayCap(0)).toBeNull();
    expect(weeklyStayCap(null)).toBeNull();
    expect(weeklyStayCap(undefined)).toBeNull();
    expect(weeklyStayCap(365)).toBe(365);
    expect(
      issue("2029-06-09", "2029-09-08", "SATURDAY", { minNights: 1, maxNights: 0 }),
    ).toBeNull();
  });

  it("states every enforced cap, including the 365-night column default", () => {
    expect(statedStayCap(365)).toBe(365);
    expect(statedStayCap(28)).toBe(28);
    expect(statedStayCap(0)).toBeNull();
  });
});

describe("the checkouts a guest may pick", () => {
  it("offers exactly the acceptance example", () => {
    // Saturday 3 October 2026, minimum 1, maximum 30.
    expect(weekdayOfYmd("2026-10-03")).toBe(6);
    expect(
      weeklyCheckOutDates({
        checkIn: "2026-10-03",
        changeoverWeekday: "SATURDAY",
        limits: { minNights: 1, maxNights: 30 },
      }),
    ).toEqual(["2026-10-10", "2026-10-17", "2026-10-24", "2026-10-31"]);
  });

  it("excludes the five-week checkout that would exceed the maximum", () => {
    expect(
      weeklyCheckOutDates({
        checkIn: "2026-10-03",
        changeoverWeekday: "SATURDAY",
        limits: { minNights: 1, maxNights: 30 },
      }),
    ).not.toContain("2026-11-07");
  });

  it("starts at the minimum rather than at one week", () => {
    expect(
      weeklyCheckOutDates({
        checkIn: "2029-06-09",
        changeoverWeekday: "SATURDAY",
        limits: { minNights: 10, maxNights: 30 },
      }),
    ).toEqual(["2029-06-23", "2029-06-30", "2029-07-07"]);
  });

  it("offers nothing for a check-in on the wrong weekday", () => {
    expect(
      weeklyCheckOutDates({
        checkIn: "2029-06-10",
        changeoverWeekday: "SATURDAY",
        limits: anyLength,
      }),
    ).toEqual([]);
  });

  it("offers nothing without a changeover day", () => {
    expect(
      weeklyCheckOutDates({
        checkIn: "2029-06-09",
        changeoverWeekday: null,
        limits: anyLength,
      }),
    ).toEqual([]);
  });

  it("stops at the horizon", () => {
    expect(
      weeklyCheckOutDates({
        checkIn: "2029-06-09",
        changeoverWeekday: "SATURDAY",
        limits: { minNights: 1, maxNights: 365 },
        horizonEnd: "2029-07-01",
      }),
    ).toEqual(["2029-06-16", "2029-06-23", "2029-06-30"]);
  });

  it("stays bounded on an uncapped listing", () => {
    const dates = weeklyCheckOutDates({
      checkIn: "2029-06-09",
      changeoverWeekday: "SATURDAY",
      limits: { minNights: 1, maxNights: 0 },
    });
    expect(dates.length).toBeLessThanOrEqual(78);
    expect(dates[0]).toBe("2029-06-16");
  });

  it("offers only checkouts the rule itself accepts", () => {
    const limits = { minNights: 1, maxNights: 30 };
    for (const checkOut of weeklyCheckOutDates({
      checkIn: "2026-10-03",
      changeoverWeekday: "SATURDAY",
      limits,
    })) {
      expect(
        weeklyStayIssue({
          checkIn: "2026-10-03",
          checkOut,
          changeoverWeekday: "SATURDAY",
          limits,
        }),
        checkOut,
      ).toBeNull();
    }
  });
});

describe("the shortest stay a listing will actually take", () => {
  it("is the stored minimum on a flexible listing", () => {
    expect(
      shortestBookableNights({
        bookingMode: "FLEXIBLE",
        limits: { minNights: 3, maxNights: 30 },
      }),
    ).toBe(3);
  });

  it("is one whole week on a weekly listing with a one-night minimum", () => {
    // The difference the helper exists for: the stored column says 1, and the listing
    // refuses every stay shorter than a changeover-to-changeover week.
    expect(
      shortestBookableNights({
        bookingMode: "FIXED_STAYS",
        limits: { minNights: 1, maxNights: 28 },
      }),
    ).toBe(7);
  });

  it("rounds a weekly minimum up to the next whole week", () => {
    expect(
      shortestBookableNights({
        bookingMode: "FIXED_STAYS",
        limits: { minNights: 10, maxNights: 28 },
      }),
    ).toBe(14);
  });

  it("leaves an exact multiple of seven alone", () => {
    expect(
      shortestBookableNights({
        bookingMode: "FIXED_STAYS",
        limits: { minNights: 14, maxNights: 28 },
      }),
    ).toBe(14);
  });

  it("reports nothing bookable when no whole week fits inside the limits", () => {
    expect(
      shortestBookableNights({
        bookingMode: "FIXED_STAYS",
        limits: { minNights: 16, maxNights: 20 },
      }),
    ).toBeNull();
  });

  it("reports nothing bookable when a flexible maximum is under its minimum", () => {
    expect(
      shortestBookableNights({
        bookingMode: "FLEXIBLE",
        limits: { minNights: 10, maxNights: 5 },
      }),
    ).toBeNull();
  });

  it("reads a stored zero maximum as no cap, in both modes", () => {
    expect(
      shortestBookableNights({
        bookingMode: "FLEXIBLE",
        limits: { minNights: 4, maxNights: 0 },
      }),
    ).toBe(4);
    expect(
      shortestBookableNights({
        bookingMode: "FIXED_STAYS",
        limits: { minNights: 4, maxNights: 0 },
      }),
    ).toBe(7);
  });

  it("agrees with the rule itself: the length it names is one the listing accepts", () => {
    // The helper is only useful if what it returns would really be taken, so it is
    // checked against `weeklyStayIssue` rather than against a second copy of the maths.
    for (const minNights of [1, 5, 7, 8, 14, 15]) {
      const nights = shortestBookableNights({
        bookingMode: "FIXED_STAYS",
        limits: { minNights, maxNights: 28 },
      });
      expect(nights).not.toBeNull();
      expect(
        weeklyStayIssue({
          // A Saturday, and Saturday + n weeks.
          checkIn: "2026-03-14",
          checkOut: addDaysToYmd("2026-03-14", nights!),
          changeoverWeekday: "SATURDAY",
          limits: { minNights, maxNights: 28 },
        }),
      ).toBeNull();
    }
  });
});
