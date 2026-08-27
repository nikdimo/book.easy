import { describe, expect, it } from "vitest";
import {
  parseDepositPolicySnapshot,
  validateDepositPolicy,
} from "@/lib/payments/deposit-policy-v1";

/**
 * The V1 model is frozen, but it is still live code: it is the guard that decides
 * whether a historical booking's JSON may be shown to a guest at all. These cases keep
 * that guard honest — a snapshot that no longer validates must be refused, not
 * half-read.
 */

const fixedAdvance = {
  version: 1,
  status: "REVIEWED",
  policy: "FIXED",
  purpose: "ADVANCE_PAYMENT",
  value: " 125.500 ",
  currency: "eur",
  dueTiming: "DAYS_BEFORE_CHECK_IN",
  dueDaysBeforeCheckIn: "7",
  returnDaysAfterCheckout: null,
};

describe("frozen V1 deposit policy", () => {
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

  it("reads a well-formed snapshot and refuses everything else", () => {
    expect(parseDepositPolicySnapshot(fixedAdvance)).toMatchObject({
      version: 1,
      status: "REVIEWED",
      value: "125.5",
    });
    // A V2 snapshot is not V1 and must not be read as one.
    expect(parseDepositPolicySnapshot({ version: 2, status: "REVIEWED" })).toBeNull();
    expect(
      parseDepositPolicySnapshot({ ...fixedAdvance, status: "UNANSWERED" }),
    ).toBeNull();
  });

  it("accepts the unanswered marker only when it carries no terms", () => {
    const unanswered = {
      version: 1,
      status: "UNANSWERED",
      policy: "NONE",
      purpose: null,
      value: null,
      currency: null,
      dueTiming: "AFTER_ACCEPTANCE",
      dueDaysBeforeCheckIn: null,
      returnDaysAfterCheckout: null,
    };
    expect(parseDepositPolicySnapshot(unanswered)).toMatchObject({
      status: "UNANSWERED",
      policy: "NONE",
    });
  });
});
