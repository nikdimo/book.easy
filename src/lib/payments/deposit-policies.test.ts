import { describe, expect, it } from "vitest";
import {
  calculateDepositAmounts,
  createDepositPoliciesSnapshot,
  depositPoliciesFromV1,
  hasAnyDepositPolicy,
  parseDepositPoliciesSnapshot,
  validateDepositPolicies,
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

const advanceSection = {
  enabled: true,
  amountType: "PERCENTAGE",
  value: "25",
  dueTiming: "AFTER_ACCEPTANCE",
  dueDaysBeforeCheckIn: null,
};
const damageSection = {
  enabled: true,
  amountType: "FIXED",
  value: " 150.500 ",
  dueTiming: "DAYS_BEFORE_CHECK_IN",
  dueDaysBeforeCheckIn: "7",
  returnDaysAfterCheckout: "14",
};

describe("validating two independent policies", () => {
  it("accepts neither policy as a complete answer", () => {
    expect(validateDepositPolicies({ currency: "EUR" })).toEqual({
      success: true,
      value: { advancePayment: null, damageDeposit: null },
    });
    expect(
      validateDepositPolicies({
        currency: "EUR",
        advancePayment: { enabled: false },
        damageDeposit: { enabled: false },
      }),
    ).toEqual({
      success: true,
      value: { advancePayment: null, damageDeposit: null },
    });
  });

  it("accepts an advance payment on its own", () => {
    const result = validateDepositPolicies({
      currency: "eur",
      advancePayment: advanceSection,
      damageDeposit: { enabled: false },
    });
    expect(result).toEqual({
      success: true,
      value: {
        advancePayment: {
          amountType: "PERCENTAGE",
          value: "25",
          currency: "EUR",
          dueTiming: "AFTER_ACCEPTANCE",
          dueDaysBeforeCheckIn: null,
        },
        damageDeposit: null,
      },
    });
  });

  it("accepts a damage deposit on its own, with its return period", () => {
    const result = validateDepositPolicies({
      currency: "EUR",
      advancePayment: { enabled: false },
      damageDeposit: damageSection,
    });
    expect(result).toEqual({
      success: true,
      value: {
        advancePayment: null,
        damageDeposit: {
          amountType: "FIXED",
          value: "150.5",
          currency: "EUR",
          dueTiming: "DAYS_BEFORE_CHECK_IN",
          dueDaysBeforeCheckIn: 7,
          returnDaysAfterCheckout: 14,
        },
      },
    });
  });

  it("accepts both at once, each with its own amount type and timing", () => {
    const result = validateDepositPolicies({
      currency: "EUR",
      advancePayment: advanceSection,
      damageDeposit: damageSection,
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.value.advancePayment).toMatchObject({
      amountType: "PERCENTAGE",
      value: "25",
      dueTiming: "AFTER_ACCEPTANCE",
    });
    expect(result.value.damageDeposit).toMatchObject({
      amountType: "FIXED",
      value: "150.5",
      dueTiming: "DAYS_BEFORE_CHECK_IN",
      returnDaysAfterCheckout: 14,
    });
  });

  it("reports each section's problems separately and leaves the other usable", () => {
    const result = validateDepositPolicies({
      currency: "EUR",
      advancePayment: { ...advanceSection, value: "120" },
      damageDeposit: damageSection,
    });
    expect(result).toEqual({
      success: false,
      issues: { advancePayment: { value: "PERCENTAGE_TOO_HIGH" } },
    });
  });

  it.each([
    [
      { ...advanceSection, dueTiming: "DAYS_BEFORE_CHECK_IN", dueDaysBeforeCheckIn: null },
      { dueDaysBeforeCheckIn: "DUE_DAYS_REQUIRED" },
    ],
    [
      { ...advanceSection, dueTiming: "AT_CHECK_IN", dueDaysBeforeCheckIn: 3 },
      { dueDaysBeforeCheckIn: "DUE_DAYS_NOT_ALLOWED" },
    ],
    [{ ...advanceSection, value: "0" }, { value: "VALUE_MUST_BE_POSITIVE" }],
    [{ ...advanceSection, value: "abc" }, { value: "INVALID_VALUE" }],
    [{ ...advanceSection, value: null }, { value: "VALUE_REQUIRED" }],
    [{ ...advanceSection, amountType: "SLIDING" }, { amountType: "UNKNOWN_AMOUNT_TYPE" }],
    [{ ...advanceSection, amountType: null }, { amountType: "AMOUNT_TYPE_REQUIRED" }],
    [{ ...advanceSection, dueTiming: "WHENEVER" }, { dueTiming: "UNKNOWN_DUE_TIMING" }],
  ])("rejects an incoherent advance-payment section %#", (section, issues) => {
    expect(
      validateDepositPolicies({ currency: "EUR", advancePayment: section }),
    ).toEqual({ success: false, issues: { advancePayment: issues } });
  });

  it("requires a currency only for a section that is switched on", () => {
    expect(validateDepositPolicies({ currency: null }).success).toBe(true);
    expect(
      validateDepositPolicies({ currency: null, advancePayment: advanceSection }),
    ).toEqual({
      success: false,
      issues: { advancePayment: { currency: "CURRENCY_REQUIRED" } },
    });
  });

  it("rejects a return period only the damage deposit could have", () => {
    expect(
      validateDepositPolicies({
        currency: "EUR",
        damageDeposit: { ...damageSection, returnDaysAfterCheckout: "0" },
      }),
    ).toEqual({
      success: false,
      issues: { damageDeposit: { returnDaysAfterCheckout: "INVALID_RETURN_DAYS" } },
    });
    // The advance-payment section simply has no such field to set.
    const advanceWithReturn = validateDepositPolicies({
      currency: "EUR",
      advancePayment: { ...advanceSection, returnDaysAfterCheckout: 14 },
    });
    expect(advanceWithReturn.success).toBe(true);
    if (advanceWithReturn.success) {
      expect(advanceWithReturn.value.advancePayment).not.toHaveProperty(
        "returnDaysAfterCheckout",
      );
    }
  });
});

describe("freezing a V2 snapshot from a listing row", () => {
  it("distinguishes an unanswered listing from an explicit 'neither'", () => {
    expect(
      createDepositPoliciesSnapshot({ ...OFF_ROW, depositPoliciesReviewedAt: null }),
    ).toEqual({
      version: 2,
      status: "UNANSWERED",
      advancePayment: null,
      damageDeposit: null,
    });
    expect(createDepositPoliciesSnapshot(OFF_ROW)).toEqual({
      version: 2,
      status: "REVIEWED",
      advancePayment: null,
      damageDeposit: null,
    });
  });

  it("freezes both sections and survives a round trip through the parser", () => {
    const snapshot = createDepositPoliciesSnapshot({
      ...OFF_ROW,
      advancePaymentEnabled: true,
      advancePaymentType: "PERCENTAGE",
      advancePaymentValue: { toString: () => "20" },
      advancePaymentDueTiming: "AFTER_ACCEPTANCE",
      damageDepositEnabled: true,
      damageDepositType: "FIXED",
      damageDepositValue: "200",
      damageDepositDueTiming: "AT_CHECK_IN",
      damageDepositReturnDaysAfterCheckout: 10,
      depositPoliciesCurrency: "EUR",
    });
    expect(snapshot).toEqual({
      version: 2,
      status: "REVIEWED",
      advancePayment: {
        amountType: "PERCENTAGE",
        value: "20",
        currency: "EUR",
        dueTiming: "AFTER_ACCEPTANCE",
        dueDaysBeforeCheckIn: null,
      },
      damageDeposit: {
        amountType: "FIXED",
        value: "200",
        currency: "EUR",
        dueTiming: "AT_CHECK_IN",
        dueDaysBeforeCheckIn: null,
        returnDaysAfterCheckout: 10,
      },
    });
    expect(parseDepositPoliciesSnapshot(snapshot)).toEqual(snapshot);
  });

  it("degrades a half-configured row to UNANSWERED rather than a partial term", () => {
    expect(
      createDepositPoliciesSnapshot({
        ...OFF_ROW,
        advancePaymentEnabled: true,
        advancePaymentType: "FIXED",
        advancePaymentValue: null,
        depositPoliciesCurrency: "EUR",
      }),
    ).toMatchObject({ version: 2, status: "UNANSWERED", advancePayment: null });
  });
});

describe("reading historical V1 snapshots", () => {
  const v1Advance = {
    version: 1,
    status: "REVIEWED",
    policy: "PERCENTAGE",
    purpose: "ADVANCE_PAYMENT",
    value: "25",
    currency: "EUR",
    dueTiming: "AFTER_ACCEPTANCE",
    dueDaysBeforeCheckIn: null,
    returnDaysAfterCheckout: null,
  };
  const v1Damage = {
    version: 1,
    status: "REVIEWED",
    policy: "FIXED",
    purpose: "DAMAGE_SECURITY",
    value: "125.50",
    currency: "EUR",
    dueTiming: "DAYS_BEFORE_CHECK_IN",
    dueDaysBeforeCheckIn: 7,
    returnDaysAfterCheckout: 14,
  };

  it("maps an old ADVANCE_PAYMENT policy onto the advance-payment slot only", () => {
    expect(parseDepositPoliciesSnapshot(v1Advance)).toEqual({
      version: 2,
      status: "REVIEWED",
      advancePayment: {
        amountType: "PERCENTAGE",
        value: "25",
        currency: "EUR",
        dueTiming: "AFTER_ACCEPTANCE",
        dueDaysBeforeCheckIn: null,
      },
      damageDeposit: null,
    });
  });

  it("maps an old DAMAGE_SECURITY policy onto the damage-deposit slot only", () => {
    expect(parseDepositPoliciesSnapshot(v1Damage)).toEqual({
      version: 2,
      status: "REVIEWED",
      advancePayment: null,
      damageDeposit: {
        amountType: "FIXED",
        value: "125.5",
        currency: "EUR",
        dueTiming: "DAYS_BEFORE_CHECK_IN",
        dueDaysBeforeCheckIn: 7,
        returnDaysAfterCheckout: 14,
      },
    });
  });

  it("keeps an old explicit 'no deposit' answer distinct from an unanswered one", () => {
    const none = {
      version: 1,
      status: "REVIEWED",
      policy: "NONE",
      purpose: null,
      value: null,
      currency: null,
      dueTiming: "AFTER_ACCEPTANCE",
      dueDaysBeforeCheckIn: null,
      returnDaysAfterCheckout: null,
    };
    expect(parseDepositPoliciesSnapshot(none)).toMatchObject({
      version: 2,
      status: "REVIEWED",
      advancePayment: null,
      damageDeposit: null,
    });
    expect(
      parseDepositPoliciesSnapshot({ ...none, status: "UNANSWERED" }),
    ).toMatchObject({ version: 2, status: "UNANSWERED" });
  });

  it("projects V1 without rewriting it — the stored object is untouched", () => {
    const stored = {
      version: 1 as const,
      status: "REVIEWED" as const,
      policy: "FIXED" as const,
      purpose: "DAMAGE_SECURITY" as const,
      value: "125.5",
      currency: "EUR",
      dueTiming: "DAYS_BEFORE_CHECK_IN" as const,
      dueDaysBeforeCheckIn: 7,
      returnDaysAfterCheckout: 14,
    };
    const before = structuredClone(stored);
    expect(depositPoliciesFromV1(stored)).toMatchObject({
      version: 2,
      damageDeposit: { value: "125.5", returnDaysAfterCheckout: 14 },
    });
    expect(stored).toEqual(before);
  });

  it.each([
    [null],
    [undefined],
    [42],
    [[1, 2]],
    [{ version: 3, status: "REVIEWED" }],
    [{ version: 1, status: "REVIEWED", policy: "FIXED", purpose: "ADVANCE_PAYMENT" }],
  ])("refuses anything that is not a well-formed snapshot %#", (value) => {
    expect(parseDepositPoliciesSnapshot(value)).toBeNull();
  });

  it("refuses a V2 snapshot whose two sections disagree about the currency", () => {
    expect(
      parseDepositPoliciesSnapshot({
        version: 2,
        status: "REVIEWED",
        advancePayment: {
          amountType: "FIXED",
          value: "50",
          currency: "EUR",
          dueTiming: "AFTER_ACCEPTANCE",
          dueDaysBeforeCheckIn: null,
        },
        damageDeposit: {
          amountType: "FIXED",
          value: "50",
          currency: "USD",
          dueTiming: "AFTER_ACCEPTANCE",
          dueDaysBeforeCheckIn: null,
          returnDaysAfterCheckout: null,
        },
      }),
    ).toBeNull();
  });

  it("drops unknown keys instead of letting them reach a rendered term", () => {
    const parsed = parseDepositPoliciesSnapshot({
      ...v1Damage,
      bankDetails: "DK5000400440116243",
      paymentLink: "https://pay.example/private",
    });
    expect(JSON.stringify(parsed)).not.toContain("DK5000400440116243");
    expect(JSON.stringify(parsed)).not.toContain("pay.example");
  });
});

describe("calculating the two amounts", () => {
  it("resolves each policy independently and never sums them", () => {
    const validation = validateDepositPolicies({
      currency: "EUR",
      advancePayment: {
        enabled: true,
        amountType: "PERCENTAGE",
        value: "25",
        dueTiming: "AFTER_ACCEPTANCE",
        dueDaysBeforeCheckIn: null,
      },
      damageDeposit: {
        enabled: true,
        amountType: "FIXED",
        value: "200",
        dueTiming: "AT_CHECK_IN",
        dueDaysBeforeCheckIn: null,
        returnDaysAfterCheckout: 14,
      },
    });
    expect(validation.success).toBe(true);
    if (!validation.success) return;

    const amounts = calculateDepositAmounts(validation.value, "480", "EUR");
    expect(amounts).toEqual({
      advancePaymentAmount: "120.00",
      damageDepositAmount: "200.00",
    });
    // The advance payment is a slice of the total; the damage deposit is not, and the
    // two must never be presented as one figure.
    expect(Number(amounts.advancePaymentAmount)).toBeLessThan(480);
    expect(amounts.advancePaymentAmount).not.toBe(amounts.damageDepositAmount);
  });

  it("returns null for a policy that is switched off", () => {
    expect(
      calculateDepositAmounts(
        { advancePayment: null, damageDeposit: null },
        "500",
        "EUR",
      ),
    ).toEqual({ advancePaymentAmount: null, damageDepositAmount: null });
  });

  it("uses decimal arithmetic and deterministic half-up currency rounding", () => {
    const eur = validateDepositPolicies({
      currency: "EUR",
      advancePayment: {
        enabled: true,
        amountType: "PERCENTAGE",
        value: "12.5",
        dueTiming: "AFTER_ACCEPTANCE",
        dueDaysBeforeCheckIn: null,
      },
    });
    expect(
      eur.success &&
        calculateDepositAmounts(eur.value, "99.99", "EUR").advancePaymentAmount,
    ).toBe("12.50");

    // A zero-decimal currency rounds to whole minor units.
    const jpy = validateDepositPolicies({
      currency: "JPY",
      damageDeposit: {
        enabled: true,
        amountType: "FIXED",
        value: "149.5",
        dueTiming: "AT_CHECK_IN",
        dueDaysBeforeCheckIn: null,
        returnDaysAfterCheckout: null,
      },
    });
    expect(
      jpy.success &&
        calculateDepositAmounts(jpy.value, "100", "JPY").damageDepositAmount,
    ).toBe("150");
  });
});

describe("hasAnyDepositPolicy", () => {
  it.each([
    [{ advancePayment: null, damageDeposit: null }, false],
    [null, false],
    [undefined, false],
  ])("is false when nothing is asked for %#", (policies, expected) => {
    expect(hasAnyDepositPolicy(policies)).toBe(expected);
  });
});
