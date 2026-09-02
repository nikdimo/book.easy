import { describe, expect, it } from "vitest";
import { addDaysToYmd, weekdayOfYmd } from "@/lib/utils/date-only";

describe("weekdayOfYmd", () => {
  it("numbers the week from Sunday, as Date does", () => {
    expect(weekdayOfYmd("2027-06-06")).toBe(0); // Sunday
    expect(weekdayOfYmd("2027-06-07")).toBe(1); // Monday
    expect(weekdayOfYmd("2027-06-05")).toBe(6); // Saturday
  });

  it("reads the calendar date, not a local midnight", () => {
    // `new Date("2027-06-05").getDay()` is read in the server's zone and answers for the
    // previous day west of UTC — which is how a Saturday changeover starts generating
    // Fridays. This helper is UTC-anchored, so the answer is the same everywhere.
    expect(weekdayOfYmd("2027-06-05")).toBe(
      new Date(Date.UTC(2027, 5, 5)).getUTCDay(),
    );
  });

  it("advances one weekday per day across a spring-forward change", () => {
    // Europe springs forward on 2027-03-28. A day is still a day.
    expect(weekdayOfYmd("2027-03-27")).toBe(6);
    expect(weekdayOfYmd("2027-03-28")).toBe(0);
    expect(weekdayOfYmd("2027-03-29")).toBe(1);
  });

  it("advances one weekday per day across an autumn fall-back", () => {
    // Europe falls back on 2027-10-31.
    expect(weekdayOfYmd("2027-10-30")).toBe(6);
    expect(weekdayOfYmd("2027-10-31")).toBe(0);
    expect(weekdayOfYmd("2027-11-01")).toBe(1);
  });

  it("returns the same weekday exactly seven days later, DST or not", () => {
    for (const start of ["2027-03-27", "2027-10-30", "2028-02-26", "2027-12-31"]) {
      expect(weekdayOfYmd(addDaysToYmd(start, 7))).toBe(weekdayOfYmd(start));
    }
  });

  it("refuses a value that is not a calendar date", () => {
    expect(() => weekdayOfYmd("2027-02-30")).toThrow();
  });
});
