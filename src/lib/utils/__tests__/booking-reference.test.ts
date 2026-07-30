import { describe, expect, it } from "vitest";
import {
  formatBookingReference,
  newBookingReference,
} from "../booking-reference";

describe("booking references", () => {
  it("creates short, readable references with the booking year", () => {
    const reference = newBookingReference(new Date("2026-07-29T10:00:00Z"));

    expect(reference).toMatch(/^LH-2026-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$/);
    expect(reference.split("-").at(-1)).not.toMatch(/[01IO]/);
  });

  it("normalizes references for display", () => {
    expect(formatBookingReference("lh-2026-abcd2345")).toBe("LH-2026-ABCD2345");
  });
});
