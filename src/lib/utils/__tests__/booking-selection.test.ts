import { describe, expect, it } from "vitest";
import {
  bookableStayFromSearch,
  exceedsMaxNights,
  stayLengthCap,
  validateBookingSelection,
} from "@/lib/utils/booking-selection";

function localDate(ymd: string) {
  const [year, month, day] = ymd.split("-").map(Number);
  return new Date(year, month - 1, day);
}

describe("validateBookingSelection", () => {
  const blocked = [
    { from: localDate("2026-09-20"), to: localDate("2026-09-22") },
  ];

  it("reports incomplete and minimum-stay selections", () => {
    expect(
      validateBookingSelection(localDate("2026-09-15"), undefined, 5, blocked)
    ).toEqual({ status: "incomplete", nights: 0 });

    expect(
      validateBookingSelection(
        localDate("2026-09-15"),
        localDate("2026-09-16"),
        5,
        blocked
      )
    ).toEqual({ status: "minimum-stay", nights: 1 });
  });

  it("rejects an invalid Date instead of treating NaN nights as bookable", () => {
    expect(
      validateBookingSelection(
        new Date(Number.NaN),
        localDate("2026-09-18"),
        1,
        blocked,
      ),
    ).toEqual({ status: "invalid", nights: Number.NaN });
  });

  it("rejects stays containing a blocked night", () => {
    expect(
      validateBookingSelection(
        localDate("2026-09-19"),
        localDate("2026-09-21"),
        1,
        blocked
      )
    ).toEqual({ status: "unavailable", nights: 2 });
  });

  it("allows checkout on the first blocked day", () => {
    expect(
      validateBookingSelection(
        localDate("2026-09-18"),
        localDate("2026-09-20"),
        1,
        blocked
      )
    ).toEqual({ status: "valid", nights: 2 });
  });

  it("accepts a sufficiently long available stay", () => {
    expect(
      validateBookingSelection(
        localDate("2026-09-23"),
        localDate("2026-09-28"),
        5,
        blocked
      )
    ).toEqual({ status: "valid", nights: 5 });
  });

  it("accepts a stay of exactly the minimum", () => {
    expect(
      validateBookingSelection(
        localDate("2026-09-23"),
        localDate("2026-09-25"),
        2,
        blocked
      )
    ).toEqual({ status: "valid", nights: 2 });
  });

  it("accepts a stay of exactly the maximum", () => {
    expect(
      validateBookingSelection(
        localDate("2026-09-23"),
        localDate("2026-09-30"),
        1,
        blocked,
        7
      )
    ).toEqual({ status: "valid", nights: 7 });
  });

  it("rejects the first night past the maximum", () => {
    expect(
      validateBookingSelection(
        localDate("2026-09-23"),
        localDate("2026-10-01"),
        1,
        blocked,
        7
      )
    ).toEqual({ status: "maximum-stay", nights: 8 });
  });

  it("keeps the minimum-only behaviour when no cap is passed", () => {
    expect(
      validateBookingSelection(
        localDate("2026-09-23"),
        localDate("2026-10-30"),
        1,
        blocked
      )
    ).toEqual({ status: "valid", nights: 37 });
  });

  it("treats a stored zero as no cap rather than as an unbookable listing", () => {
    expect(
      validateBookingSelection(
        localDate("2026-09-23"),
        localDate("2026-09-30"),
        1,
        blocked,
        0
      )
    ).toEqual({ status: "valid", nights: 7 });
  });

  it("reports an unavailable night ahead of an over-long stay", () => {
    // Both are wrong, but "those dates are taken" is the one the guest can act on.
    expect(
      validateBookingSelection(
        localDate("2026-09-19"),
        localDate("2026-09-30"),
        1,
        blocked,
        2
      )
    ).toEqual({ status: "unavailable", nights: 11 });
  });
});

describe("stayLengthCap", () => {
  it("reads a positive maximum as a cap", () => {
    expect(stayLengthCap(14)).toBe(14);
    expect(stayLengthCap(1)).toBe(1);
  });

  it("reads zero, negatives and absence as no cap at all", () => {
    expect(stayLengthCap(0)).toBeNull();
    expect(stayLengthCap(-3)).toBeNull();
    expect(stayLengthCap(null)).toBeNull();
    expect(stayLengthCap(undefined)).toBeNull();
  });
});

describe("exceedsMaxNights", () => {
  it("allows a stay up to and including the cap", () => {
    expect(exceedsMaxNights(13, 14)).toBe(false);
    expect(exceedsMaxNights(14, 14)).toBe(false);
  });

  it("refuses the first night beyond the cap", () => {
    expect(exceedsMaxNights(15, 14)).toBe(true);
  });

  it("never refuses when there is no cap", () => {
    expect(exceedsMaxNights(400, 0)).toBe(false);
    expect(exceedsMaxNights(400, null)).toBe(false);
  });
});

describe("bookableStayFromSearch", () => {
  const today = "2026-08-25";

  it("keeps a stay that is still ahead of today", () => {
    expect(bookableStayFromSearch("2026-09-15", "2026-09-18", today)).toEqual({
      checkIn: "2026-09-15",
      checkOut: "2026-09-18",
    });
    expect(bookableStayFromSearch(today, "2026-08-27", today)).toEqual({
      checkIn: today,
      checkOut: "2026-08-27",
    });
  });

  it("drops a stay whose check-in has passed", () => {
    expect(bookableStayFromSearch("2026-08-24", "2026-08-30", today)).toEqual({});
  });

  it("drops anything that is not a date-only pair", () => {
    expect(bookableStayFromSearch(undefined, undefined, today)).toEqual({});
    expect(bookableStayFromSearch(["2026-09-15"], "2026-09-18", today)).toEqual({});
    expect(bookableStayFromSearch("15/09/2026", "2026-09-18", today)).toEqual({});
    expect(bookableStayFromSearch("2026-02-30", "2026-03-03", today)).toEqual({});
  });

  it("keeps a future check-in whose check-out does not follow it", () => {
    expect(bookableStayFromSearch("2026-09-15", "2026-09-15", today)).toEqual({
      checkIn: "2026-09-15",
      checkOut: undefined,
    });
    expect(bookableStayFromSearch("2026-09-15", "2026-09-10", today)).toEqual({
      checkIn: "2026-09-15",
      checkOut: undefined,
    });
  });
});
