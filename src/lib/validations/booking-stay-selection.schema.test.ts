import { describe, expect, it } from "vitest";
import { createBookingSchema } from "@/lib/validations/booking.schema";
import { addDaysToYmd, todayYmd } from "@/lib/utils/date-only";
import {
  classifyBookingStayRequest,
  isValidBookingStayRequest,
} from "@/lib/utils/booking-stay-request";

/**
 * The either/or at the web boundary: a booking request names its own dates, or it names
 * one of the host's whole stays, and never both or neither.
 */

const HOUSE_RULES_VERSION = "a".repeat(64);

const base = {
  listingId: "listing-1",
  adults: "2",
  houseRulesAccepted: "true",
  houseRulesVersion: HOUSE_RULES_VERSION,
};

const future = (days: number) => addDaysToYmd(todayYmd(), days);

const parse = (fields: Record<string, unknown>) =>
  createBookingSchema.safeParse({ ...base, ...fields });

const messageOf = (result: ReturnType<typeof createBookingSchema.safeParse>) =>
  result.success ? null : result.error.issues[0]?.message;

describe("classifyBookingStayRequest", () => {
  it("reads two dates as a flexible request", () => {
    expect(
      classifyBookingStayRequest({ checkIn: "2029-06-09", checkOut: "2029-06-16" }),
    ).toEqual({ kind: "FLEXIBLE" });
  });

  it("reads a period id alone as a fixed request", () => {
    expect(classifyBookingStayRequest({ fixedStayPeriodId: "period-1" })).toEqual({
      kind: "FIXED_STAYS",
    });
  });

  it("refuses a request that names both", () => {
    expect(
      classifyBookingStayRequest({
        fixedStayPeriodId: "period-1",
        checkIn: "2029-06-09",
        checkOut: "2029-06-16",
      }),
    ).toEqual({ issue: "MIXED_SELECTION" });
  });

  it("refuses a period id beside a single stray date", () => {
    expect(
      classifyBookingStayRequest({
        fixedStayPeriodId: "period-1",
        checkOut: "2029-12-25",
      }),
    ).toEqual({ issue: "MIXED_SELECTION" });
    expect(
      classifyBookingStayRequest({
        fixedStayPeriodId: "period-1",
        checkIn: "2029-06-09",
      }),
    ).toEqual({ issue: "MIXED_SELECTION" });
  });

  it("refuses half a stay", () => {
    expect(classifyBookingStayRequest({ checkIn: "2029-06-09" })).toEqual({
      issue: "INCOMPLETE_DATES",
    });
    expect(classifyBookingStayRequest({ checkOut: "2029-06-16" })).toEqual({
      issue: "INCOMPLETE_DATES",
    });
  });

  it("refuses a request that says nothing at all", () => {
    expect(classifyBookingStayRequest({})).toEqual({ issue: "NO_SELECTION" });
    expect(
      classifyBookingStayRequest({
        checkIn: undefined,
        checkOut: null,
        fixedStayPeriodId: "",
      }),
    ).toEqual({ issue: "NO_SELECTION" });
  });

  it("treats a blank posted field as absent, not as a supplied value", () => {
    // What a form posts for an input it rendered but left empty.
    expect(
      classifyBookingStayRequest({
        fixedStayPeriodId: "period-1",
        checkIn: "",
        checkOut: "   ",
      }),
    ).toEqual({ kind: "FIXED_STAYS" });
    expect(isValidBookingStayRequest({ checkIn: "", checkOut: "" })).toBe(false);
  });
});

describe("createBookingSchema", () => {
  it("accepts a valid flexible selection", () => {
    const parsed = parse({ checkIn: future(10), checkOut: future(13) });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.fixedStayPeriodId).toBeUndefined();
      expect(parsed.data.checkIn).toBe(future(10));
    }
  });

  it("accepts a valid fixed selection", () => {
    const parsed = parse({ fixedStayPeriodId: "period-1" });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.fixedStayPeriodId).toBe("period-1");
      expect(parsed.data.checkIn).toBeUndefined();
      expect(parsed.data.checkOut).toBeUndefined();
    }
  });

  it("refuses a request with neither selection", () => {
    const parsed = parse({});
    expect(parsed.success).toBe(false);
    expect(messageOf(parsed)).toBe("Choose your dates before sending your request.");
  });

  it("refuses a period id sent together with dates", () => {
    const parsed = parse({
      fixedStayPeriodId: "period-1",
      checkIn: future(10),
      checkOut: future(13),
    });
    expect(parsed.success).toBe(false);
    expect(messageOf(parsed)).toBe(
      "Choose either your own dates or one of the host's stays, not both.",
    );
  });

  it("refuses a crafted checkout riding alongside a fixed period", () => {
    const parsed = parse({
      fixedStayPeriodId: "period-1",
      checkOut: future(400),
    });
    expect(parsed.success).toBe(false);
    expect(messageOf(parsed)).toBe(
      "Choose either your own dates or one of the host's stays, not both.",
    );
  });

  it("refuses one date without the other", () => {
    for (const half of [{ checkIn: future(10) }, { checkOut: future(13) }]) {
      const parsed = parse(half);
      expect(parsed.success).toBe(false);
      expect(messageOf(parsed)).toBe("Choose both a check-in and a check-out date.");
    }
  });

  it("still refuses a past check-in on a flexible request", () => {
    const parsed = parse({ checkIn: future(-1), checkOut: future(3) });
    expect(parsed.success).toBe(false);
    expect(
      parsed.success
        ? null
        : parsed.error.issues.find((issue) => issue.path[0] === "checkIn")?.message,
    ).toBe("Check-in date cannot be in the past");
  });

  it("still refuses a checkout that does not follow its check-in", () => {
    const parsed = parse({ checkIn: future(10), checkOut: future(10) });
    expect(parsed.success).toBe(false);
    expect(
      parsed.success
        ? null
        : parsed.error.issues.find((issue) => issue.path[0] === "checkOut")?.message,
    ).toBe("Check-out date must be after check-in date");
  });

  it("does not measure dates a fixed request never sent", () => {
    // A fixed request carries no dates, so the past-date and ordering rules have nothing
    // to say about it — they must not fire on the absent fields.
    expect(parse({ fixedStayPeriodId: "period-1" }).success).toBe(true);
  });

  it("keeps refusing a fixed request that fails an unrelated rule", () => {
    expect(
      parse({ fixedStayPeriodId: "period-1", houseRulesAccepted: "false" }).success,
    ).toBe(false);
    expect(
      parse({ fixedStayPeriodId: "period-1", adults: "0" }).success,
    ).toBe(false);
    expect(
      parse({ fixedStayPeriodId: "period-1", houseRulesVersion: "nope" }).success,
    ).toBe(false);
  });

  it("refuses a blank period id rather than reading it as a selection", () => {
    const parsed = parse({ fixedStayPeriodId: "" });
    expect(parsed.success).toBe(false);
  });
});
