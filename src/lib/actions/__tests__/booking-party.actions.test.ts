import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The web booking-creation path, from the form the widget posts to the arguments the
 * service is handed.
 *
 * The service is mocked here on purpose: what this file pins down is that the action
 * carries the whole party across rather than the one number it used to, that it derives
 * nothing itself, and that a refusal from the service reaches the guest instead of a
 * redirect. The rules themselves are exercised against the real database in
 * `src/lib/services/__tests__/booking-party.service.test.ts`.
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

const HOUSE_RULES_VERSION = "a".repeat(64);

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

function futureStay() {
  const checkIn = new Date();
  checkIn.setUTCDate(checkIn.getUTCDate() + 30);
  const checkOut = new Date(checkIn);
  checkOut.setUTCDate(checkOut.getUTCDate() + 2);
  return {
    checkIn: checkIn.toISOString().slice(0, 10),
    checkOut: checkOut.toISOString().slice(0, 10),
  };
}

function party(over: Record<string, string> = {}) {
  const { checkIn, checkOut } = futureStay();
  return form({
    listingId: "listing-1",
    checkIn,
    checkOut,
    adults: "2",
    children: "1",
    infants: "1",
    pets: "1",
    houseRulesAccepted: "true",
    houseRulesVersion: HOUSE_RULES_VERSION,
    ...over,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ user: { id: "guest-1" } });
  mocks.rateLimit.mockReturnValue({ success: true });
  mocks.getLocale.mockResolvedValue("en");
  mocks.getPriceFormatter.mockResolvedValue({ context: null });
  mocks.createBooking.mockResolvedValue({ id: "booking-1" });
});

describe("createBookingAction carries the whole party", () => {
  it("hands the service four counters and derives no capacity of its own", async () => {
    await createBookingAction(party());

    expect(mocks.createBooking).toHaveBeenCalledTimes(1);
    const input = mocks.createBooking.mock.calls[0][0];
    expect(input.party).toEqual({ adults: 2, children: 1, infants: 1, pets: 1 });
    // The action must not post a capacity the client chose: `createBooking` derives it
    // from adults + children, so a request cannot claim a party of four and a count of
    // one.
    expect(input.guestCount).toBeUndefined();
    expect(input.guestId).toBe("guest-1");
    expect(mocks.redirect).toHaveBeenCalledWith("/bookings/confirm?id=booking-1");
  });

  it("defaults the three optional counters when the form omits them", async () => {
    const { checkIn, checkOut } = futureStay();
    await createBookingAction(
      form({
        listingId: "listing-1",
        checkIn,
        checkOut,
        adults: "2",
        houseRulesAccepted: "true",
        houseRulesVersion: HOUSE_RULES_VERSION,
      }),
    );

    expect(mocks.createBooking.mock.calls[0][0].party).toEqual({
      adults: 2,
      children: 0,
      infants: 0,
      pets: 0,
    });
  });

  it("refuses a party with no adult before the service is reached", async () => {
    const result = await createBookingAction(party({ adults: "0" }));

    expect(result).toEqual({ error: "Add at least one adult to the booking." });
    expect(mocks.createBooking).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("refuses a party larger than any listing could declare capacity for", async () => {
    const result = await createBookingAction(
      party({ adults: "15", children: "15" }),
    );

    expect(result).toEqual({ error: "Maximum 20 guests allowed" });
    expect(mocks.createBooking).not.toHaveBeenCalled();
  });

  it("reads a stale client's lone guestCount as the adults rather than failing", async () => {
    const { checkIn, checkOut } = futureStay();
    // A page loaded before the four counters shipped still posts `guestCount` and
    // nothing else. That request is a real guest mid-booking, not an attack, so it
    // books as a party of adults instead of dying on a deploy boundary.
    await createBookingAction(
      form({
        listingId: "listing-1",
        checkIn,
        checkOut,
        guestCount: "3",
        houseRulesAccepted: "true",
        houseRulesVersion: HOUSE_RULES_VERSION,
      }),
    );

    expect(mocks.createBooking.mock.calls[0][0].party).toEqual({
      adults: 3,
      children: 0,
      infants: 0,
      pets: 0,
    });
  });

  it("surfaces the self-booking refusal instead of redirecting", async () => {
    mocks.createBooking.mockRejectedValue(
      new Error("You can't book your own listing."),
    );

    const result = await createBookingAction(party());

    expect(result).toEqual({ error: "You can't book your own listing." });
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("still requires a signed-in guest before anything else", async () => {
    mocks.auth.mockResolvedValue(null);

    await expect(createBookingAction(party())).resolves.toEqual({
      error: "You must be logged in to book",
    });
    expect(mocks.createBooking).not.toHaveBeenCalled();
  });
});
