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

/**
 * #3: the same floor, on the sibling branch that never got it.
 *
 * `AFTER_ACCEPTANCE` was hardened against "already overdue the moment it is created"
 * above. `DAYS_BEFORE_CHECK_IN` was not: it subtracted the policy's days from check-in
 * with no floor at all, so a host with a "due 14 days before check-in" advance policy
 * accepting three days out created a deadline eleven days in the past.
 *
 * The exposed path is not hypothetical. Requests created at acceptance are normally
 * DRAFT and the reminder job only reads SENT — but cash-at-property and
 * arrange-directly are auto-marked SENT at acceptance, so they go straight into the
 * reminder loop carrying the unclamped date.
 */
describe("a deadline counted back from check-in", () => {
  const advanceDaysBefore = (days: number) =>
    ({
      version: 2,
      status: "REVIEWED",
      advancePayment: {
        amountType: "FIXED",
        value: "200",
        currency: "EUR",
        dueTiming: "DAYS_BEFORE_CHECK_IN",
        dueDaysBeforeCheckIn: days,
        },
    }) as const;

  const accept = (options: {
    days: number;
    acceptedAt: string;
    checkIn: string;
  }) =>
    bookingPaymentObligations({
      total: 1000,
      advancePaymentAmount: 200,
      damageDepositAmount: 0,
      depositPolicySnapshot: advanceDaysBefore(options.days),
      acceptedAt: options.acceptedAt,
      checkIn: ymdToDbDate(options.checkIn),
    });

  it("honours the policy when the host accepts in good time", () => {
    const [advance] = accept({
      days: 14,
      acceptedAt: "2026-06-01",
      checkIn: "2026-06-20",
    });
    expect(advance.dueDate).toBe("2026-06-06");
  });

  it("floors a late acceptance at the day the host accepted", () => {
    const [advance] = accept({
      days: 14,
      // Three days before check-in: the policy would say 6 June, eleven days ago.
      acceptedAt: "2026-06-17",
      checkIn: "2026-06-20",
    });
    expect(advance.dueDate).toBe("2026-06-17");
  });

  /**
   * The consequence the floor exists to prevent, spelled out through the same
   * scheduler the reminder job uses: an auto-SENT cash request whose deadline is
   * OVERDUE before the guest has been told anything.
   */
  it("is never OVERDUE on the day it is created", () => {
    for (const days of [0, 1, 7, 14, 30, 365]) {
      for (const acceptedAt of ["2026-06-17", "2026-06-19", "2026-06-20"]) {
        const [advance] = accept({ days, acceptedAt, checkIn: "2026-06-20" });
        expect(
          derivePaymentReminderState({ dueDate: advance.dueDate, today: acceptedAt }),
        ).not.toBe("OVERDUE");
      }
    }
  });

  /**
   * A stored value the policy parser rejects (it requires at least one day) leaves the
   * advance with no policy at all, and the no-policy fallback is the acceptance day.
   * Pinned because that fallback is the only thing standing between a corrupt snapshot
   * and a deadline counted *forward* from check-in.
   */
  it("falls back to the acceptance day when the stored policy does not parse", () => {
    const [advance] = accept({
      days: -10,
      acceptedAt: "2026-06-01",
      checkIn: "2026-06-20",
    });
    expect(advance.dueDate).toBe("2026-06-01");
  });

  /**
   * The tie-break, on the one branch that can ask for a day after check-in: a host
   * accepting once the stay has already started. `acceptedOn` wins, because clamping
   * to check-in would put the deadline back in the past — the very thing the floor
   * exists to prevent. (`confirmBooking` now expires such a request rather than
   * accepting it, so this is the defence behind that one, not the normal path.)
   */
  it("prefers the acceptance day over check-in when acceptance came later", () => {
    const [advance] = bookingPaymentObligations({
      total: 1000,
      advancePaymentAmount: 200,
      damageDepositAmount: 0,
      depositPolicySnapshot: advanceAfterAcceptance,
      acceptedAt: "2026-06-25",
      checkIn: ymdToDbDate("2026-06-20"),
    });
    expect(advance.dueDate).toBe("2026-06-25");
    expect(
      derivePaymentReminderState({ dueDate: advance.dueDate, today: "2026-06-25" }),
    ).not.toBe("OVERDUE");
  });

  /** The damage-deposit track shares the branch, so it shares the floor. */
  it("floors a late acceptance on the damage-deposit track too", () => {
    const [, damage] = bookingPaymentObligations({
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
      acceptedAt: "2026-06-18",
      checkIn: ymdToDbDate("2026-06-20"),
    });
    expect(damage.dueDate).toBe("2026-06-18");
  });

  /**
   * Every obligation this function returns, not only the ones a policy shaped. The
   * guarantee is a single sentence: nothing outside `[acceptedOn, checkIn]`.
   */
  it("keeps every obligation inside the acceptance-to-check-in range", () => {
    const acceptedAt = "2026-06-18";
    const checkIn = "2026-06-20";
    const obligations = bookingPaymentObligations({
      total: 1000,
      advancePaymentAmount: 200,
      damageDepositAmount: 150,
      depositPolicySnapshot: {
        version: 2,
        status: "REVIEWED",
        advancePayment: {
          amountType: "FIXED",
          value: "200",
          currency: "EUR",
          dueTiming: "DAYS_BEFORE_CHECK_IN",
          dueDaysBeforeCheckIn: 30,
        },
        damageDeposit: {
          amountType: "FIXED",
          value: "150",
          currency: "EUR",
          dueTiming: "DAYS_BEFORE_CHECK_IN",
          dueDaysBeforeCheckIn: 30,
          returnDaysAfterCheckout: 3,
        },
      },
      acceptedAt,
      checkIn: ymdToDbDate(checkIn),
    });
    expect(obligations).toHaveLength(3);
    for (const obligation of obligations) {
      expect(obligation.dueDate >= acceptedAt).toBe(true);
      expect(obligation.dueDate <= checkIn).toBe(true);
    }
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
