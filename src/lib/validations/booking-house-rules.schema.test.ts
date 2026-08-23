import { describe, expect, it } from "vitest";
import { createBookingSchema } from "@/lib/validations/booking.schema";

/**
 * The acceptance is a required field on the request, not a nicety in the widget.
 *
 * The widget checks it too, so the guest is told which control they missed — but this is
 * the check that decides, because a request that never went through the widget is
 * exactly the one that would otherwise book a stay without agreeing to anything.
 */

function request(overrides: Record<string, unknown> = {}) {
  const checkIn = new Date();
  checkIn.setDate(checkIn.getDate() + 30);
  const checkOut = new Date(checkIn);
  checkOut.setDate(checkOut.getDate() + 2);
  const ymd = (date: Date) => date.toISOString().slice(0, 10);

  return {
    listingId: "listing-1",
    checkIn: ymd(checkIn),
    checkOut: ymd(checkOut),
    guestCount: "2",
    houseRulesAccepted: "true",
    houseRulesVersion: "a".repeat(64),
    ...overrides,
  };
}

describe("createBookingSchema house-rules acceptance", () => {
  it("accepts a request that carries an explicit acceptance", () => {
    expect(createBookingSchema.safeParse(request()).success).toBe(true);
  });

  it("refuses a request that omits it", () => {
    const parsed = createBookingSchema.safeParse(
      request({ houseRulesAccepted: undefined }),
    );

    expect(parsed.success).toBe(false);
  });

  it("refuses anything that is not an explicit yes", () => {
    for (const value of ["false", "", "1", "on", "TRUE", true, null]) {
      expect(
        createBookingSchema.safeParse(request({ houseRulesAccepted: value })).success,
      ).toBe(false);
    }
  });

  it("requires a valid fingerprint of the rules that were shown", () => {
    for (const value of [undefined, "", "not-a-version", "A".repeat(64)]) {
      expect(
        createBookingSchema.safeParse(request({ houseRulesVersion: value })).success,
      ).toBe(false);
    }
  });

  it("says what the guest has to do", () => {
    const parsed = createBookingSchema.safeParse(
      request({ houseRulesAccepted: "false" }),
    );

    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(JSON.stringify(parsed.error.issues)).toContain(
        "agree to the house rules",
      );
    }
  });

  it("takes no rules from the request — only the yes", () => {
    // The stored snapshot is built on the server from the listing row. A field here
    // through which a client could describe the rules would defeat the point.
    const parsed = createBookingSchema.safeParse(
      request({ houseRulesSnapshot: { petPolicy: "ALLOWED" } }),
    );

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data).not.toHaveProperty("houseRulesSnapshot");
    }
  });
});
