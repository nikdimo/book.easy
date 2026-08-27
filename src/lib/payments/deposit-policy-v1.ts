/**
 * The frozen V1 deposit model.
 *
 * V1 allowed a host exactly one deposit with a `purpose` discriminator: either an
 * ADVANCE_PAYMENT toward the stay or a refundable DAMAGE_SECURITY deposit, never both.
 * The live model (`deposit-policies.ts`) replaced it with two independent policies.
 *
 * Nothing writes V1 any more. This module exists so bookings frozen under V1 stay
 * readable exactly as they were agreed: a host who reconfigures their listing today
 * changes terms for their next guest, not for a guest who already sent a request.
 * Treat everything here as immutable history — extend `deposit-policies.ts` instead.
 */

import {
  decimalAtMost,
  decimalIsPositive,
  normalizeDepositValue,
  type DecimalLike,
} from "@/lib/payments/deposit-money";

export const DEPOSIT_POLICY_CODES = ["NONE", "FIXED", "PERCENTAGE"] as const;
export const DEPOSIT_PURPOSE_CODES = [
  "ADVANCE_PAYMENT",
  "DAMAGE_SECURITY",
] as const;
export const DEPOSIT_DUE_TIMING_CODES = [
  "AFTER_ACCEPTANCE",
  "DAYS_BEFORE_CHECK_IN",
  "AT_CHECK_IN",
] as const;

export type DepositPolicyCode = (typeof DEPOSIT_POLICY_CODES)[number];
export type DepositPurpose = (typeof DEPOSIT_PURPOSE_CODES)[number];
export type DepositDueTiming = (typeof DEPOSIT_DUE_TIMING_CODES)[number];

export interface DepositPolicyConfig {
  policy: DepositPolicyCode;
  purpose: DepositPurpose | null;
  /** Canonical base-10 decimal; never a binary floating-point amount. */
  value: string | null;
  currency: string | null;
  dueTiming: DepositDueTiming;
  dueDaysBeforeCheckIn: number | null;
  /** Null means no stated return period. Only DAMAGE_SECURITY may set one. */
  returnDaysAfterCheckout: number | null;
}

export type DepositPolicyIssue =
  | "POLICY_REQUIRED"
  | "UNKNOWN_POLICY"
  | "PURPOSE_REQUIRED"
  | "UNKNOWN_PURPOSE"
  | "PURPOSE_NOT_ALLOWED"
  | "VALUE_REQUIRED"
  | "VALUE_NOT_ALLOWED"
  | "INVALID_VALUE"
  | "VALUE_MUST_BE_POSITIVE"
  | "PERCENTAGE_TOO_HIGH"
  | "CURRENCY_REQUIRED"
  | "CURRENCY_NOT_ALLOWED"
  | "INVALID_CURRENCY"
  | "DUE_TIMING_REQUIRED"
  | "UNKNOWN_DUE_TIMING"
  | "DUE_DAYS_REQUIRED"
  | "DUE_DAYS_NOT_ALLOWED"
  | "INVALID_DUE_DAYS"
  | "RETURN_DAYS_NOT_ALLOWED"
  | "INVALID_RETURN_DAYS";

export interface DepositPolicyIssues {
  policy?: DepositPolicyIssue;
  purpose?: DepositPolicyIssue;
  value?: DepositPolicyIssue;
  currency?: DepositPolicyIssue;
  dueTiming?: DepositPolicyIssue;
  dueDaysBeforeCheckIn?: DepositPolicyIssue;
  returnDaysAfterCheckout?: DepositPolicyIssue;
}

export type DepositPolicyValidation =
  | { success: true; value: DepositPolicyConfig }
  | { success: false; issues: DepositPolicyIssues };

const POLICY_SET = new Set<string>(DEPOSIT_POLICY_CODES);
const PURPOSE_SET = new Set<string>(DEPOSIT_PURPOSE_CODES);
const DUE_TIMING_SET = new Set<string>(DEPOSIT_DUE_TIMING_CODES);

function normalizeCode(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== ""
    ? value.trim().toUpperCase()
    : null;
}

function normalizeNullableWholeNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) {
    return value;
  }
  if (typeof value !== "string" || !/^\d+$/.test(value.trim())) return null;
  const normalized = Number(value.trim());
  return Number.isSafeInteger(normalized) ? normalized : null;
}

function isSupplied(value: unknown): boolean {
  return value !== null && value !== undefined && value !== "";
}

/**
 * Strictly validates a complete V1 policy. Conditional fields are forbidden when
 * inapplicable so a historical snapshot carrying a stale value is rejected rather than
 * half-read, and so no extra key on the JSON can smuggle itself into a rendered term.
 */
export function validateDepositPolicy(input: unknown): DepositPolicyValidation {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { success: false, issues: { policy: "POLICY_REQUIRED" } };
  }
  const raw = input as Record<string, unknown>;
  const issues: DepositPolicyIssues = {};
  const policy = normalizeCode(raw.policy);
  const purpose = normalizeCode(raw.purpose);
  const value = normalizeDepositValue(raw.value);
  const currency = normalizeCode(raw.currency);
  const dueTiming = normalizeCode(raw.dueTiming);
  const dueDaysBeforeCheckIn = normalizeNullableWholeNumber(
    raw.dueDaysBeforeCheckIn,
  );
  const returnDaysAfterCheckout = normalizeNullableWholeNumber(
    raw.returnDaysAfterCheckout,
  );

  if (policy === null) issues.policy = "POLICY_REQUIRED";
  else if (!POLICY_SET.has(policy)) issues.policy = "UNKNOWN_POLICY";

  if (dueTiming === null) issues.dueTiming = "DUE_TIMING_REQUIRED";
  else if (!DUE_TIMING_SET.has(dueTiming)) issues.dueTiming = "UNKNOWN_DUE_TIMING";

  if (policy === "NONE") {
    if (purpose !== null) issues.purpose = "PURPOSE_NOT_ALLOWED";
    if (value !== null || isSupplied(raw.value)) issues.value = "VALUE_NOT_ALLOWED";
    if (currency !== null) issues.currency = "CURRENCY_NOT_ALLOWED";
    if (dueDaysBeforeCheckIn !== null || isSupplied(raw.dueDaysBeforeCheckIn)) {
      issues.dueDaysBeforeCheckIn = "DUE_DAYS_NOT_ALLOWED";
    }
    if (returnDaysAfterCheckout !== null || isSupplied(raw.returnDaysAfterCheckout)) {
      issues.returnDaysAfterCheckout = "RETURN_DAYS_NOT_ALLOWED";
    }
  } else if (policy && POLICY_SET.has(policy)) {
    if (purpose === null) issues.purpose = "PURPOSE_REQUIRED";
    else if (!PURPOSE_SET.has(purpose)) issues.purpose = "UNKNOWN_PURPOSE";

    if (value === null) {
      issues.value = isSupplied(raw.value) ? "INVALID_VALUE" : "VALUE_REQUIRED";
    } else if (!decimalIsPositive(value)) {
      issues.value = "VALUE_MUST_BE_POSITIVE";
    } else if (policy === "PERCENTAGE" && !decimalAtMost(value, "100")) {
      issues.value = "PERCENTAGE_TOO_HIGH";
    }

    if (currency === null) issues.currency = "CURRENCY_REQUIRED";
    else if (!/^[A-Z]{3}$/.test(currency)) issues.currency = "INVALID_CURRENCY";

    if (dueTiming === "DAYS_BEFORE_CHECK_IN") {
      if (dueDaysBeforeCheckIn === null) {
        issues.dueDaysBeforeCheckIn = isSupplied(raw.dueDaysBeforeCheckIn)
          ? "INVALID_DUE_DAYS"
          : "DUE_DAYS_REQUIRED";
      } else if (dueDaysBeforeCheckIn < 1) {
        issues.dueDaysBeforeCheckIn = "INVALID_DUE_DAYS";
      }
    } else if (
      dueTiming &&
      dueDaysBeforeCheckIn !== null
    ) {
      issues.dueDaysBeforeCheckIn = "DUE_DAYS_NOT_ALLOWED";
    } else if (isSupplied(raw.dueDaysBeforeCheckIn)) {
      issues.dueDaysBeforeCheckIn = "INVALID_DUE_DAYS";
    }

    if (purpose !== "DAMAGE_SECURITY" && returnDaysAfterCheckout !== null) {
      issues.returnDaysAfterCheckout = "RETURN_DAYS_NOT_ALLOWED";
    } else if (purpose !== "DAMAGE_SECURITY" && isSupplied(raw.returnDaysAfterCheckout)) {
      issues.returnDaysAfterCheckout = "INVALID_RETURN_DAYS";
    } else if (
      purpose === "DAMAGE_SECURITY" &&
      isSupplied(raw.returnDaysAfterCheckout) &&
      (returnDaysAfterCheckout === null || returnDaysAfterCheckout < 1)
    ) {
      issues.returnDaysAfterCheckout = "INVALID_RETURN_DAYS";
    }
  }

  if (Object.keys(issues).length > 0) return { success: false, issues };
  return {
    success: true,
    value: {
      policy: policy as DepositPolicyCode,
      purpose: purpose as DepositPurpose | null,
      value,
      currency,
      dueTiming: dueTiming as DepositDueTiming,
      dueDaysBeforeCheckIn,
      returnDaysAfterCheckout,
    },
  };
}

export interface DepositPolicySnapshotV1 extends DepositPolicyConfig {
  version: 1;
  status: "REVIEWED" | "UNANSWERED";
}

const UNANSWERED_DEPOSIT_POLICY: DepositPolicyConfig = {
  policy: "NONE",
  purpose: null,
  value: null,
  currency: null,
  dueTiming: "AFTER_ACCEPTANCE",
  dueDaysBeforeCheckIn: null,
  returnDaysAfterCheckout: null,
};

/**
 * Safely reads a historical V1 booking snapshot. Returns null for anything that is not
 * a well-formed V1 object, including a V2 snapshot, so callers can try each version in
 * turn rather than guessing from a partially-read object.
 */
export function parseDepositPolicySnapshot(
  value: unknown,
): DepositPolicySnapshotV1 | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (raw.version !== 1) return null;
  const validation = validateDepositPolicy(raw);
  if (!validation.success) return null;
  if (raw.status === "REVIEWED") {
    return { version: 1, status: "REVIEWED", ...validation.value };
  }
  if (
    raw.status === "UNANSWERED" &&
    validation.value.policy === "NONE" &&
    validation.value.purpose === null &&
    validation.value.value === null &&
    validation.value.currency === null &&
    validation.value.dueDaysBeforeCheckIn === null &&
    validation.value.returnDaysAfterCheckout === null
  ) {
    return { version: 1, status: "UNANSWERED", ...UNANSWERED_DEPOSIT_POLICY };
  }
  return null;
}

export type { DecimalLike };
