import { describe, expect, it } from "vitest";
import {
  MARKETPLACE_TIME_ZONE,
  todayYmd,
  ymdInTimeZone,
} from "@/lib/utils/date-only";

/**
 * "Today" decides whether an availability start date is in the past, and what the date
 * field's `min` is. Reading it in UTC put anyone east of UTC on yesterday's date for the
 * first hour or two after their local midnight, which rejected perfectly good answers.
 *
 * Every case below pins the instant explicitly, so these do not depend on when or where
 * the suite runs.
 */
describe("civil today in a time zone", () => {
  it("is the next day in Copenhagen shortly after local midnight", () => {
    // 00:30 on 5 August in Copenhagen (UTC+2 in summer) is still 22:30 on the 4th in
    // UTC. The host sees the 5th; UTC would have said the 4th.
    const justAfterLocalMidnight = new Date("2026-08-04T22:30:00Z");

    expect(ymdInTimeZone(justAfterLocalMidnight, "Europe/Copenhagen")).toBe(
      "2026-08-05",
    );
    expect(ymdInTimeZone(justAfterLocalMidnight, "UTC")).toBe("2026-08-04");
  });

  it("agrees with Copenhagen for the marketplace zone, which shares its offset", () => {
    // Europe/Skopje and Europe/Copenhagen are both CET/CEST, so the marketplace rule
    // gives Danish owners the correct local date all year.
    const justAfterLocalMidnight = new Date("2026-08-04T22:30:00Z");

    expect(ymdInTimeZone(justAfterLocalMidnight, MARKETPLACE_TIME_ZONE)).toBe(
      ymdInTimeZone(justAfterLocalMidnight, "Europe/Copenhagen"),
    );
  });

  it("holds in winter, when the offset is +1 rather than +2", () => {
    // 00:30 on 5 January in Copenhagen is 23:30 on the 4th in UTC.
    const winterMidnight = new Date("2026-01-04T23:30:00Z");

    expect(ymdInTimeZone(winterMidnight, "Europe/Copenhagen")).toBe("2026-01-05");
    expect(ymdInTimeZone(winterMidnight, "UTC")).toBe("2026-01-04");
  });

  it("does not roll over early — 23:30 local is still the same day", () => {
    // 21:30Z is 23:30 in Copenhagen: the last half hour of 4 August, not the 5th.
    expect(ymdInTimeZone(new Date("2026-08-04T21:30:00Z"), "Europe/Copenhagen")).toBe(
      "2026-08-04",
    );
  });

  it("crosses a month boundary at local midnight, not at UTC midnight", () => {
    const endOfMonth = new Date("2026-08-31T22:30:00Z");

    expect(ymdInTimeZone(endOfMonth, "Europe/Copenhagen")).toBe("2026-09-01");
    expect(ymdInTimeZone(endOfMonth, "UTC")).toBe("2026-08-31");
  });

  it("crosses a year boundary at local midnight", () => {
    const newYear = new Date("2026-12-31T23:30:00Z");

    expect(ymdInTimeZone(newYear, "Europe/Copenhagen")).toBe("2027-01-01");
    expect(ymdInTimeZone(newYear, "UTC")).toBe("2026-12-31");
  });

  it("handles zones behind UTC, where local is still the previous day", () => {
    // 01:30Z on 5 August is 21:30 on the 4th in New York.
    expect(ymdInTimeZone(new Date("2026-08-05T01:30:00Z"), "America/New_York")).toBe(
      "2026-08-04",
    );
  });

  it("pads month and day to a valid date-only string", () => {
    expect(ymdInTimeZone(new Date("2026-01-02T12:00:00Z"), "UTC")).toBe("2026-01-02");
    expect(ymdInTimeZone(new Date("2026-11-20T12:00:00Z"), "UTC")).toMatch(
      /^\d{4}-\d{2}-\d{2}$/,
    );
  });
});

describe("todayYmd", () => {
  it("resolves against the marketplace zone by default", () => {
    const instant = new Date("2026-08-04T22:30:00Z");

    expect(todayYmd(undefined, instant)).toBe(
      ymdInTimeZone(instant, MARKETPLACE_TIME_ZONE),
    );
  });

  it("is the same rule the server and the browser both run", () => {
    // The point of the shared constant: there is one answer to "what day is it", not a
    // browser-local one and a UTC server one that disagree for two hours a night.
    const instant = new Date("2026-08-04T22:30:00Z");

    expect(todayYmd(MARKETPLACE_TIME_ZONE, instant)).toBe("2026-08-05");
    expect(todayYmd(MARKETPLACE_TIME_ZONE, instant)).not.toBe(
      ymdInTimeZone(instant, "UTC"),
    );
  });

  it("returns a well-formed date-only value for the real clock", () => {
    expect(todayYmd()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
