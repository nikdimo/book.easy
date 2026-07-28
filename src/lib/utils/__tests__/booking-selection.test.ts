import { describe, expect, it } from "vitest";
import { validateBookingSelection } from "@/lib/utils/booking-selection";

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
});
