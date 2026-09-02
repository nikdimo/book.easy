import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * What the web action forwards for each of the two ways a stay can be asked for.
 *
 * The service is mocked: what this file pins down is that exactly one selection travels
 * onward, that the action derives no fixed-stay dates of its own, and that a crafted
 * extra on the form never reaches the service. The rules themselves run against the real
 * database in `src/lib/services/__tests__/booking-fixed-stay.service.test.ts`.
 */

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  createBooking: vi.fn(),
  redirect: vi.fn(),
  rateLimit: vi.fn(),
  getLocale: vi.fn(),
  getPriceFormatter: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/services/booking.service", () => ({
  createBooking: mocks.createBooking,
  cancelBooking: vi.fn(),
  confirmBooking: vi.fn(),
  getBookingAcceptancePaymentData: vi.fn(),
  rejectBooking: vi.fn(),
  saveBookingPaymentInstructionTemplate: vi.fn(),
}));
vi.mock("@/lib/services/audit.service", () => ({ createAuditLog: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: mocks.rateLimit }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/i18n/t", () => ({ getLocale: mocks.getLocale }));
vi.mock("@/lib/currency/price", () => ({
  getPriceFormatter: mocks.getPriceFormatter,
}));

import { createBookingAction } from "../booking.actions";
import { addDaysToYmd, todayYmd, ymdToDbDate } from "@/lib/utils/date-only";

const HOUSE_RULES_VERSION = "a".repeat(64);

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

const base = {
  listingId: "listing-1",
  adults: "2",
  houseRulesAccepted: "true",
  houseRulesVersion: HOUSE_RULES_VERSION,
};

const future = (days: number) => addDaysToYmd(todayYmd(), days);

describe("the booking action's stay selection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ user: { id: "guest-1" } });
    mocks.rateLimit.mockReturnValue({ success: true });
    mocks.getLocale.mockResolvedValue("en");
    mocks.getPriceFormatter.mockResolvedValue({ context: null });
    mocks.createBooking.mockResolvedValue({ id: "booking-1" });
    mocks.redirect.mockImplementation(() => undefined);
  });

  it("forwards a flexible selection as two UTC-midnight dates", async () => {
    await createBookingAction(
      form({ ...base, checkIn: future(10), checkOut: future(13) }),
    );

    const passed = mocks.createBooking.mock.calls[0][0];
    expect(passed.checkIn).toEqual(ymdToDbDate(future(10)));
    expect(passed.checkOut).toEqual(ymdToDbDate(future(13)));
    expect(passed.fixedStayPeriodId).toBeUndefined();
  });

  it("forwards a fixed selection as an id and nothing else", async () => {
    await createBookingAction(form({ ...base, fixedStayPeriodId: "period-1" }));

    const passed = mocks.createBooking.mock.calls[0][0];
    expect(passed.fixedStayPeriodId).toBe("period-1");
    expect(passed.checkIn).toBeUndefined();
    expect(passed.checkOut).toBeUndefined();
    // The action derives no dates for a fixed stay — the service reads them from the
    // stored period inside its transaction.
    expect(JSON.stringify(passed)).not.toContain("checkIn");
  });

  it("carries the party, note, locale and rules acceptance either way", async () => {
    await createBookingAction(
      form({
        ...base,
        fixedStayPeriodId: "period-1",
        children: "1",
        infants: "1",
        pets: "0",
        guestNote: "Arriving late",
      }),
    );

    const passed = mocks.createBooking.mock.calls[0][0];
    expect(passed.party).toEqual({ adults: 2, children: 1, infants: 1, pets: 0 });
    expect(passed.guestNote).toBe("Arriving late");
    expect(passed.expectedHouseRulesVersion).toBe(HOUSE_RULES_VERSION);
    expect(passed.houseRulesAcceptedAt).toBeInstanceOf(Date);
  });

  it("refuses a crafted checkout sent beside a fixed period", async () => {
    const result = await createBookingAction(
      form({ ...base, fixedStayPeriodId: "period-1", checkOut: future(400) }),
    );

    expect(result).toEqual({
      error: "Choose either your own dates or one of the host's stays, not both.",
    });
    expect(mocks.createBooking).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("refuses a request naming both a period and full dates", async () => {
    const result = await createBookingAction(
      form({
        ...base,
        fixedStayPeriodId: "period-1",
        checkIn: future(10),
        checkOut: future(13),
      }),
    );
    expect(result).toMatchObject({ error: expect.stringContaining("not both") });
    expect(mocks.createBooking).not.toHaveBeenCalled();
  });

  it("refuses a request with no selection at all", async () => {
    const result = await createBookingAction(form(base));
    expect(result).toEqual({
      error: "Choose your dates before sending your request.",
    });
    expect(mocks.createBooking).not.toHaveBeenCalled();
  });

  it("refuses half a stay", async () => {
    expect(await createBookingAction(form({ ...base, checkIn: future(10) }))).toEqual({
      error: "Choose both a check-in and a check-out date.",
    });
    expect(await createBookingAction(form({ ...base, checkOut: future(13) }))).toEqual({
      error: "Choose both a check-in and a check-out date.",
    });
    expect(mocks.createBooking).not.toHaveBeenCalled();
  });

  it("reads a blank posted date as absent rather than as a selection", async () => {
    // A page that renders both controls posts the empty one as "".
    await createBookingAction(
      form({ ...base, fixedStayPeriodId: "period-1", checkIn: "", checkOut: "" }),
    );
    expect(mocks.createBooking).toHaveBeenCalledTimes(1);
    expect(mocks.createBooking.mock.calls[0][0].fixedStayPeriodId).toBe("period-1");
  });

  it("still enforces the session, the rate limit and the house rules", async () => {
    mocks.auth.mockResolvedValue(null);
    expect(
      await createBookingAction(form({ ...base, fixedStayPeriodId: "period-1" })),
    ).toEqual({ error: "You must be logged in to book" });

    mocks.auth.mockResolvedValue({ user: { id: "guest-1" } });
    mocks.rateLimit.mockReturnValue({ success: false });
    expect(
      await createBookingAction(form({ ...base, fixedStayPeriodId: "period-1" })),
    ).toMatchObject({ error: expect.stringContaining("Too many booking requests") });

    mocks.rateLimit.mockReturnValue({ success: true });
    expect(
      await createBookingAction(
        form({ ...base, fixedStayPeriodId: "period-1", houseRulesAccepted: "false" }),
      ),
    ).toMatchObject({ error: expect.any(String) });
    expect(mocks.createBooking).not.toHaveBeenCalled();
  });

  it("returns the service's refusal to the guest instead of redirecting", async () => {
    mocks.createBooking.mockRejectedValue(
      new Error("That stay is no longer offered. Please choose another."),
    );
    expect(
      await createBookingAction(form({ ...base, fixedStayPeriodId: "period-1" })),
    ).toEqual({ error: "That stay is no longer offered. Please choose another." });
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});
