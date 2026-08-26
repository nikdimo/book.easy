import { describe, expect, it } from "vitest";
import {
  calculateDepositAmount,
  createDepositPolicySnapshot,
  parseDepositPolicySnapshot,
  validateDepositPolicy,
} from "@/lib/payments/deposit-policy";

const fixedAdvance = {
  policy: "FIXED",
  purpose: "ADVANCE_PAYMENT",
  value: " 125.500 ",
  currency: "eur",
  dueTiming: "DAYS_BEFORE_CHECK_IN",
  dueDaysBeforeCheckIn: "7",
  returnDaysAfterCheckout: null,
};

describe("deposit-policy validation and snapshots", () => {
  it("normalizes a complete fixed advance-payment policy", () => {
    expect(validateDepositPolicy(fixedAdvance)).toEqual({
      success: true,
      value: {
        policy: "FIXED",
        purpose: "ADVANCE_PAYMENT",
        value: "125.5",
        currency: "EUR",
        dueTiming: "DAYS_BEFORE_CHECK_IN",
        dueDaysBeforeCheckIn: 7,
        returnDaysAfterCheckout: null,
      },
    });
  });

  it.each([
    [
      { ...fixedAdvance, dueTiming: "DAYS_BEFORE_CHECK_IN", dueDaysBeforeCheckIn: null },
      { dueDaysBeforeCheckIn: "DUE_DAYS_REQUIRED" },
    ],
    [
      { ...fixedAdvance, dueTiming: "AT_CHECK_IN", dueDaysBeforeCheckIn: 1 },
      { dueDaysBeforeCheckIn: "DUE_DAYS_NOT_ALLOWED" },
    ],
    [
      { ...fixedAdvance, purpose: "DAMAGE_SECURITY", returnDaysAfterCheckout: "14" },
      {},
    ],
    [
      { ...fixedAdvance, returnDaysAfterCheckout: 3 },
      { returnDaysAfterCheckout: "RETURN_DAYS_NOT_ALLOWED" },
    ],
    [
      { ...fixedAdvance, policy: "PERCENTAGE", value: "100.001" },
      { value: "PERCENTAGE_TOO_HIGH" },
    ],
    [
      { ...fixedAdvance, policy: "NONE" },
      {
        purpose: "PURPOSE_NOT_ALLOWED",
        value: "VALUE_NOT_ALLOWED",
        currency: "CURRENCY_NOT_ALLOWED",
        dueDaysBeforeCheckIn: "DUE_DAYS_NOT_ALLOWED",
      },
    ],
  ])("rejects incompatible policy fields %#", (input, issues) => {
    const validation = validateDepositPolicy(input);
    if (Object.keys(issues).length === 0) expect(validation.success).toBe(true);
    else expect(validation).toEqual({ success: false, issues });
  });

  it("builds reviewed and safe unanswered V1 snapshots", () => {
    const reviewedAt = new Date("2026-08-25T12:00:00.000Z");
    const reviewed = createDepositPolicySnapshot({
      depositPolicy: "FIXED",
      depositPurpose: "ADVANCE_PAYMENT",
      depositValue: { toString: () => "45" },
      depositCurrency: "EUR",
      depositDueTiming: "AFTER_ACCEPTANCE",
      depositDueDaysBeforeCheckIn: null,
      depositReturnDaysAfterCheckout: null,
      depositPolicyReviewedAt: reviewedAt,
    });
    expect(reviewed).toEqual({
      version: 1,
      status: "REVIEWED",
      policy: "FIXED",
      purpose: "ADVANCE_PAYMENT",
      value: "45",
      currency: "EUR",
      dueTiming: "AFTER_ACCEPTANCE",
      dueDaysBeforeCheckIn: null,
      returnDaysAfterCheckout: null,
    });
    expect(parseDepositPolicySnapshot(reviewed)).toEqual(reviewed);

    expect(
      createDepositPolicySnapshot({
        ...{
          depositPolicy: "FIXED",
          depositPurpose: "ADVANCE_PAYMENT",
          depositValue: "45",
          depositCurrency: "EUR",
          depositDueTiming: "AFTER_ACCEPTANCE",
          depositDueDaysBeforeCheckIn: null,
          depositReturnDaysAfterCheckout: null,
        },
        depositPolicyReviewedAt: null,
      }),
    ).toMatchObject({ version: 1, status: "UNANSWERED", policy: "NONE" });
  });
});

describe("deposit amount calculation", () => {
  it("uses decimal arithmetic and deterministic half-up currency rounding", () => {
    const percentage = validateDepositPolicy({
      policy: "PERCENTAGE",
      purpose: "ADVANCE_PAYMENT",
      value: "12.5",
      currency: "EUR",
      dueTiming: "AFTER_ACCEPTANCE",
      dueDaysBeforeCheckIn: null,
      returnDaysAfterCheckout: null,
    });
    expect(percentage).toMatchObject({ success: true });
    if (percentage.success) {
      expect(calculateDepositAmount(percentage.value, "99.99")).toBe("12.50");
    }
  });

  it("rounds fixed amounts to the policy currency's minor-unit precision", () => {
    const eur = validateDepositPolicy({
      ...fixedAdvance,
      dueDaysBeforeCheckIn: 7,
      value: "12.345",
    });
    const jpy = validateDepositPolicy({
      ...fixedAdvance,
      dueDaysBeforeCheckIn: 7,
      value: "149.5",
      currency: "JPY",
    });
    expect(eur.success && calculateDepositAmount(eur.value, "100")).toBe("12.35");
    expect(jpy.success && calculateDepositAmount(jpy.value, "100")).toBe("150");
  });
});
