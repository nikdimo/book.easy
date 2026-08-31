import { afterAll, describe, expect, it } from "vitest";
import { bookingPaymentObligations } from "./booking-payment-request";
import { derivePaymentReminderState } from "./payment-reminders";
import { marketplaceYmd, todayYmd, ymdToDbDate } from "@/lib/utils/date-only";

/**
 * M6, at the money end: what "today" is when a payment deadline is set.
 *
 * A host accepting a request at 00:30 in Skopje is on the 10th. Read in UTC — which is
 * what `new Date().toISOString().slice(0, 10)` and `dbDateToYmd` on a *timestamp* both
 * do — they are on the 9th, so an AFTER_ACCEPTANCE advance payment was created with a
 * deadline that had already passed, and the deadline picker's floor sat a day behind
 * the date the host was looking at.
 */
const ZONES = ["UTC", "Europe/Skopje", "America/Chicago", "Pacific/Kiritimati"];

const ORIGINAL_TZ = process.env.TZ;
afterAll(() => {
  process.env.TZ = ORIGINAL_TZ;
});

function acrossZones<T>(body: () => T): T[] {
  return ZONES.map((zone) => {
    const previous = process.env.TZ;
    process.env.TZ = zone;
    try {
      return body();
    } finally {
      process.env.TZ = previous;
    }
  });
}

function expectZoneIndependent<T>(body: () => T): T {
  const [first, ...rest] = acrossZones(body);
  for (const value of rest) expect(value).toEqual(first);
  return first;
}

const advanceAfterAcceptance = {
  version: 2,
  status: "REVIEWED",
  advancePayment: {
    amountType: "FIXED",
    value: "200",
    currency: "EUR",
    dueTiming: "AFTER_ACCEPTANCE",
    dueDaysBeforeCheckIn: null,
  },
} as const;

/** 00:30 on 10 June in Skopje — still 22:30 on the 9th in UTC. */
const JUST_AFTER_MARKETPLACE_MIDNIGHT = new Date("2026-06-09T22:30:00Z");

describe("an advance payment due on acceptance", () => {
  it("is due on the marketplace day the host accepted, not the UTC one", () => {
    const obligations = expectZoneIndependent(() =>
      bookingPaymentObligations({
        total: 1000,
        advancePaymentAmount: 200,
        damageDepositAmount: 0,
        depositPolicySnapshot: advanceAfterAcceptance,
        acceptedAt: JUST_AFTER_MARKETPLACE_MIDNIGHT,
        checkIn: ymdToDbDate("2026-09-20"),
      }),
    );

    expect(obligations).toEqual([
      { type: "ADVANCE_PAYMENT", amount: 200, dueDate: "2026-06-10" },
      { type: "ACCOMMODATION_BALANCE", amount: 800, dueDate: "2026-09-20" },
    ]);
  });

  it("is not already overdue the moment it is created", () => {
    const [advance] = bookingPaymentObligations({
      total: 1000,
      advancePaymentAmount: 200,
      damageDepositAmount: 0,
      depositPolicySnapshot: advanceAfterAcceptance,
      acceptedAt: JUST_AFTER_MARKETPLACE_MIDNIGHT,
      checkIn: ymdToDbDate("2026-09-20"),
    });

    // The reminder scheduler reads the same marketplace day, so a deadline set at
    // acceptance is DUE_DATE — never OVERDUE before anyone has had a chance to pay.
    expect(
      derivePaymentReminderState({
        dueDate: advance.dueDate,
        today: marketplaceYmd(JUST_AFTER_MARKETPLACE_MIDNIGHT),
      }),
    ).toBe("DUE_DATE");
  });

  it("still takes a caller's own calendar date at face value", () => {
    // `acceptedAt` may arrive as a date the caller already resolved. Re-reading that
    // through a time zone it was never in is how a day gets lost.
    const [advance] = expectZoneIndependent(() =>
      bookingPaymentObligations({
        total: 1000,
        advancePaymentAmount: 200,
        damageDepositAmount: 0,
        depositPolicySnapshot: advanceAfterAcceptance,
        acceptedAt: "2026-08-28",
        checkIn: "2026-09-20",
      }),
    );

    expect(advance.dueDate).toBe("2026-08-28");
  });

  it("reads check-in off its stored UTC fields, whatever the server's zone", () => {
    const obligations = expectZoneIndependent(() =>
      bookingPaymentObligations({
        total: 1000,
        advancePaymentAmount: 0,
        damageDepositAmount: 150,
        depositPolicySnapshot: {
          version: 2,
          status: "REVIEWED",
          damageDeposit: {
            amountType: "FIXED",
            value: "150",
            currency: "EUR",
            dueTiming: "DAYS_BEFORE_CHECK_IN",
            dueDaysBeforeCheckIn: 7,
            returnDaysAfterCheckout: 3,
          },
        },
        acceptedAt: JUST_AFTER_MARKETPLACE_MIDNIGHT,
        // A leap-year check-in, so the seven-day step crosses February's end too.
        checkIn: ymdToDbDate("2028-03-03"),
      }),
    );

    expect(obligations).toEqual([
      { type: "ACCOMMODATION_BALANCE", amount: 1000, dueDate: "2028-03-03" },
      { type: "DAMAGE_DEPOSIT", amount: 150, dueDate: "2028-02-25" },
    ]);
  });
});

describe("the deadline the host may choose", () => {
  it("floors at the marketplace day, which is what the host is looking at", () => {
    // The check both `acceptBookingAsHost` and `sendBookingPaymentRequestAction` run,
    // spelled out: a deadline is valid from today up to and including check-in.
    const today = todayYmd(undefined, JUST_AFTER_MARKETPLACE_MIDNIGHT);
    const checkIn = "2026-06-20";
    const withinRange = (dueDate: string) =>
      !(dueDate < today || dueDate > checkIn);

    expect(today).toBe("2026-06-10");
    expect(withinRange("2026-06-09")).toBe(false);
    // The day the UTC reading would have rejected: it is today in Skopje, and the
    // host's own picker offers it.
    expect(withinRange("2026-06-10")).toBe(true);
    expect(withinRange("2026-06-20")).toBe(true);
    expect(withinRange("2026-06-21")).toBe(false);
  });

  it("resolves that floor to one day in every server zone", () => {
    expect(
      expectZoneIndependent(() =>
        todayYmd(undefined, JUST_AFTER_MARKETPLACE_MIDNIGHT),
      ),
    ).toBe("2026-06-10");
  });
});
