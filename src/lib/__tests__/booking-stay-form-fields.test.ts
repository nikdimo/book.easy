import { describe, expect, it } from "vitest";
import { bookingStayFormFields } from "@/lib/fixed-stay-options";
import { classifyBookingStayRequest } from "@/lib/utils/booking-stay-request";

/**
 * What the booking widget puts on the wire, read back through the very rule the server
 * applies to it. The two ends of the request are checked against each other here rather
 * than each against a hand-written expectation, so a payload this browser considers valid
 * cannot be one the server considers ambiguous.
 */

describe("a fixed-stay request", () => {
  const fields = bookingStayFormFields({ fixedStayPeriodId: "period-1" });

  it("sends the period id and nothing else", () => {
    expect(fields).toEqual({ fixedStayPeriodId: "period-1" });
  });

  it("sends no check-in or check-out, not even an empty one", () => {
    expect(Object.keys(fields)).not.toContain("checkIn");
    expect(Object.keys(fields)).not.toContain("checkOut");
  });

  it("reads on the server as a fixed selection", () => {
    expect(classifyBookingStayRequest(fields)).toEqual({ kind: "FIXED_STAYS" });
  });

  it("survives the trip through FormData without gaining a date", () => {
    const form = new FormData();
    for (const [key, value] of Object.entries(fields)) form.set(key, value);
    expect(form.get("fixedStayPeriodId")).toBe("period-1");
    expect(form.get("checkIn")).toBeNull();
    expect(form.get("checkOut")).toBeNull();
    expect(
      classifyBookingStayRequest({
        checkIn: form.get("checkIn") ?? undefined,
        checkOut: form.get("checkOut") ?? undefined,
        fixedStayPeriodId: form.get("fixedStayPeriodId") ?? undefined,
      }),
    ).toEqual({ kind: "FIXED_STAYS" });
  });
});

describe("a flexible request", () => {
  const fields = bookingStayFormFields({
    checkIn: "2029-06-09",
    checkOut: "2029-06-16",
  });

  it("sends the two dates and nothing else", () => {
    expect(fields).toEqual({ checkIn: "2029-06-09", checkOut: "2029-06-16" });
  });

  it("sends no period id", () => {
    expect(Object.keys(fields)).not.toContain("fixedStayPeriodId");
  });

  it("reads on the server as a flexible selection", () => {
    expect(classifyBookingStayRequest(fields)).toEqual({ kind: "FLEXIBLE" });
  });

  it("is unchanged from what the widget has always sent", () => {
    const form = new FormData();
    for (const [key, value] of Object.entries(fields)) form.set(key, value);
    expect(form.get("checkIn")).toBe("2029-06-09");
    expect(form.get("checkOut")).toBe("2029-06-16");
    expect(form.get("fixedStayPeriodId")).toBeNull();
  });
});

describe("the combination neither mode can produce", () => {
  it("has no way to be expressed through this helper", () => {
    // The union has no arm carrying both, so the mixed payload the server refuses is
    // unreachable from the widget rather than merely avoided by it.
    const mixed = {
      ...bookingStayFormFields({ fixedStayPeriodId: "period-1" }),
      ...bookingStayFormFields({ checkIn: "2029-06-09", checkOut: "2029-06-16" }),
    };
    // Forced together by hand, it is exactly what the server calls ambiguous.
    expect(classifyBookingStayRequest(mixed)).toEqual({
      issue: "MIXED_SELECTION",
    });
  });

  it("refuses an empty selection the same way the server does", () => {
    expect(classifyBookingStayRequest({})).toEqual({ issue: "NO_SELECTION" });
    expect(
      classifyBookingStayRequest({ checkIn: "", checkOut: "", fixedStayPeriodId: "" }),
    ).toEqual({ issue: "NO_SELECTION" });
  });
});
