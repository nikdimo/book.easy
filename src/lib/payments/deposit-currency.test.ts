/**
 * H6: which currency a booking's deposit amounts are denominated in, and how large an
 * advance payment may be.
 *
 * A listing carries two currency labels — the live `pricingRule.currency` that every
 * booking total is quoted in, and the `depositPoliciesCurrency` stamped when the host
 * last reviewed the payment-arrangements screen. They can drift apart. These cases pin
 * down that the drift is always resolved by refusing to quote, never by relabelling an
 * amount, and that an advance payment never exceeds the stay it is part of.
 */
import { describe, expect, it } from "vitest";
import {
  advanceExceedsEveryStay,
  calculateDepositAmounts,
  createDepositPoliciesSnapshot,
  maximumStayTotalAtBaseRate,
  type ListingDepositPoliciesRow,
} from "@/lib/payments/deposit-policies";

const OFF_ROW: ListingDepositPoliciesRow = {
  advancePaymentEnabled: false,
  advancePaymentType: null,
  advancePaymentValue: null,
  advancePaymentDueTiming: "AFTER_ACCEPTANCE",
  advancePaymentDueDaysBeforeCheckIn: null,
  damageDepositEnabled: false,
  damageDepositType: null,
  damageDepositValue: null,
  damageDepositDueTiming: "AFTER_ACCEPTANCE",
  damageDepositDueDaysBeforeCheckIn: null,
  damageDepositReturnDaysAfterCheckout: null,
  depositPoliciesCurrency: null,
  depositPoliciesReviewedAt: new Date("2026-08-27T10:00:00.000Z"),
  pricingRule: { currency: "EUR" },
};

const EUR_ROW: ListingDepositPoliciesRow = {
  ...OFF_ROW,
  advancePaymentEnabled: true,
  advancePaymentType: "FIXED",
  advancePaymentValue: "100",
  damageDepositEnabled: true,
  damageDepositType: "FIXED",
  damageDepositValue: "200",
  depositPoliciesCurrency: "EUR",
};

function advancePolicy(amountType: "FIXED" | "PERCENTAGE", value: string) {
  return {
    advancePayment: {
      amountType,
      value,
      currency: "EUR",
      dueTiming: "AFTER_ACCEPTANCE" as const,
      dueDaysBeforeCheckIn: null,
    },
    damageDeposit: null,
  };
}

describe("reconciling the stored policy currency with the live pricing currency", () => {
  it("freezes terms when the stored label matches the live pricing currency", () => {
    expect(createDepositPoliciesSnapshot(EUR_ROW)).toMatchObject({
      status: "REVIEWED",
      advancePayment: { value: "100", currency: "EUR" },
      damageDeposit: { value: "200", currency: "EUR" },
    });
  });

  it("refuses to re-serve amounts after the listing's pricing currency changed", () => {
    // The host reviewed deposits while priced in EUR, then switched to MKD. A flat 100
    // must not become 100 MKD, and a percentage must not resolve against an MKD total
    // under an EUR label. Nothing stored is rewritten; the listing simply reads as
    // unanswered until the host restates the amounts.
    expect(
      createDepositPoliciesSnapshot({ ...EUR_ROW, pricingRule: { currency: "MKD" } }),
    ).toEqual({
      version: 2,
      status: "UNANSWERED",
      advancePayment: null,
      damageDeposit: null,
    });
  });

  it("refuses a legacy row whose policy currency was never stamped", () => {
    expect(
      createDepositPoliciesSnapshot({ ...EUR_ROW, depositPoliciesCurrency: null }),
    ).toMatchObject({ status: "UNANSWERED", advancePayment: null, damageDeposit: null });
  });

  it("refuses a listing that asks for money with no pricing rule at all", () => {
    expect(
      createDepositPoliciesSnapshot({ ...EUR_ROW, pricingRule: null }),
    ).toMatchObject({ status: "UNANSWERED", advancePayment: null, damageDeposit: null });
  });

  it("compares the two labels case-insensitively", () => {
    expect(
      createDepositPoliciesSnapshot({
        ...EUR_ROW,
        depositPoliciesCurrency: "eur",
        pricingRule: { currency: "EUR" },
      }),
    ).toMatchObject({ status: "REVIEWED" });
  });

  it("keeps 'neither' a complete answer with no currency anywhere", () => {
    // Nothing is charged, so there is no amount for a currency to be wrong about. This
    // is the NOT_REQUIRED case, and it must keep working on a draft with no pricing rule.
    expect(
      createDepositPoliciesSnapshot({
        ...OFF_ROW,
        depositPoliciesCurrency: null,
        pricingRule: null,
      }),
    ).toEqual({
      version: 2,
      status: "REVIEWED",
      advancePayment: null,
      damageDeposit: null,
    });
  });

  it("still reports a never-reviewed listing as unanswered", () => {
    expect(
      createDepositPoliciesSnapshot({ ...EUR_ROW, depositPoliciesReviewedAt: null }),
    ).toMatchObject({ status: "UNANSWERED" });
  });
});

describe("resolving amounts in the booking currency", () => {
  const bothPolicies = {
    advancePayment: {
      amountType: "FIXED" as const,
      value: "100",
      currency: "EUR",
      dueTiming: "AFTER_ACCEPTANCE" as const,
      dueDaysBeforeCheckIn: null,
    },
    damageDeposit: {
      amountType: "PERCENTAGE" as const,
      value: "10",
      currency: "EUR",
      dueTiming: "AT_CHECK_IN" as const,
      dueDaysBeforeCheckIn: null,
      returnDaysAfterCheckout: null,
    },
  };

  it("drops a policy quoted in another currency rather than relabelling it", () => {
    // Defence in depth: the snapshot already refuses such a listing, so a policy can
    // only reach here on a booking frozen before that check existed.
    expect(calculateDepositAmounts(bothPolicies, "6000", "MKD")).toEqual({
      advancePaymentAmount: null,
      damageDepositAmount: null,
    });
  });

  it("resolves the same policies normally against a booking that really is in EUR", () => {
    expect(calculateDepositAmounts(bothPolicies, "6000", "EUR")).toEqual({
      advancePaymentAmount: "100.00",
      damageDepositAmount: "600.00",
    });
  });

  it("matches the booking currency case-insensitively", () => {
    expect(
      calculateDepositAmounts(advancePolicy("FIXED", "40"), "500", "eur")
        .advancePaymentAmount,
    ).toBe("40.00");
  });

  it("quotes nothing at all when the booking currency is unusable", () => {
    expect(calculateDepositAmounts(bothPolicies, "6000", "")).toEqual({
      advancePaymentAmount: null,
      damageDepositAmount: null,
    });
  });

  it("returns nulls for two switched-off policies", () => {
    expect(
      calculateDepositAmounts(
        { advancePayment: null, damageDeposit: null },
        "500",
        "EUR",
      ),
    ).toEqual({ advancePaymentAmount: null, damageDepositAmount: null });
  });
});

describe("bounding the advance payment by the booking total", () => {
  it("leaves a fixed advance below the total exactly as declared", () => {
    expect(calculateDepositAmounts(advancePolicy("FIXED", "120"), "480", "EUR")).toEqual({
      advancePaymentAmount: "120.00",
      damageDepositAmount: null,
    });
  });

  it("resolves a percentage against the booking total in the booking currency", () => {
    expect(
      calculateDepositAmounts(advancePolicy("PERCENTAGE", "20"), "480", "EUR")
        .advancePaymentAmount,
    ).toBe("96.00");
  });

  it("allows an advance equal to the whole total — paying the stay up front", () => {
    expect(
      calculateDepositAmounts(advancePolicy("FIXED", "480"), "480", "EUR")
        .advancePaymentAmount,
    ).toBe("480.00");
    expect(
      calculateDepositAmounts(advancePolicy("PERCENTAGE", "100"), "480", "EUR")
        .advancePaymentAmount,
    ).toBe("480.00");
  });

  it("caps an advance that exceeds the total at the total", () => {
    // More than the total is not a larger advance — it is a figure that cannot mean
    // anything, because the advance is part of that total.
    expect(
      calculateDepositAmounts(advancePolicy("FIXED", "900"), "480", "EUR")
        .advancePaymentAmount,
    ).toBe("480.00");
  });

  it("caps against the total rounded in the booking's own currency", () => {
    // A zero-decimal currency rounds the ceiling the same way it rounds the amount, so
    // the comparison is never between two differently-scaled figures.
    const jpy = {
      advancePayment: {
        amountType: "FIXED" as const,
        value: "1000",
        currency: "JPY",
        dueTiming: "AFTER_ACCEPTANCE" as const,
        dueDaysBeforeCheckIn: null,
      },
      damageDeposit: null,
    };
    expect(calculateDepositAmounts(jpy, "820.4", "JPY").advancePaymentAmount).toBe("820");
  });

  it("does not cap the damage deposit, which is money on top of the total", () => {
    // Security against damage has no documented relationship to the price of the stay,
    // so no cap is invented for it.
    const policies = {
      advancePayment: null,
      damageDeposit: {
        amountType: "FIXED" as const,
        value: "900",
        currency: "EUR",
        dueTiming: "AT_CHECK_IN" as const,
        dueDaysBeforeCheckIn: null,
        returnDaysAfterCheckout: 14,
      },
    };
    expect(calculateDepositAmounts(policies, "480", "EUR")).toEqual({
      advancePaymentAmount: null,
      damageDepositAmount: "900.00",
    });
  });

  it("caps a fixed advance to zero on a zero-total booking", () => {
    expect(
      calculateDepositAmounts(advancePolicy("FIXED", "50"), "0", "EUR")
        .advancePaymentAmount,
    ).toBe("0.00");
  });
});

describe("the save-time bound on a fixed advance payment", () => {
  const pricing = {
    baseNightlyRate: "50",
    cleaningFee: "10",
    maxNights: 10,
    currency: "EUR",
  };
  const fixed = (value: string) => ({
    amountType: "FIXED" as const,
    value,
    currency: "EUR",
    dueTiming: "AFTER_ACCEPTANCE" as const,
    dueDaysBeforeCheckIn: null,
  });

  it("computes the dearest stay the listing permits at its own base rate", () => {
    expect(maximumStayTotalAtBaseRate(pricing)).toBe("510.00");
    expect(
      maximumStayTotalAtBaseRate({ ...pricing, currency: "JPY", maxNights: 365 }),
    ).toBe("18260");
  });

  it("accepts a fixed advance that stay could cover", () => {
    expect(advanceExceedsEveryStay(fixed("510"), pricing)).toBe(false);
    expect(advanceExceedsEveryStay(fixed("509.99"), pricing)).toBe(false);
  });

  it("rejects a fixed advance no stay this listing sells could ever reach", () => {
    expect(advanceExceedsEveryStay(fixed("510.01"), pricing)).toBe(true);
    expect(advanceExceedsEveryStay(fixed("5000"), pricing)).toBe(true);
  });

  it("leaves percentages, switched-off policies and unpriced listings alone", () => {
    expect(
      advanceExceedsEveryStay({ ...fixed("100"), amountType: "PERCENTAGE" }, pricing),
    ).toBe(false);
    expect(advanceExceedsEveryStay(null, pricing)).toBe(false);
    expect(advanceExceedsEveryStay(fixed("5000"), null)).toBe(false);
  });

  it("declines to judge an advance quoted in another currency", () => {
    // Comparing 5000 MKD against a EUR ceiling would be arithmetic across currencies.
    // A mismatch is the snapshot's business, not this bound's.
    expect(advanceExceedsEveryStay({ ...fixed("5000"), currency: "MKD" }, pricing)).toBe(
      false,
    );
  });
});
