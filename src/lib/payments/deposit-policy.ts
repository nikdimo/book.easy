/**
 * Deposit-policy domain rules, deliberately independent of Prisma and transport
 * code. Linger Homes does not process money: this module describes a host's public
 * policy and the amount to record against a booking in that policy's currency.
 */

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

type DecimalLike = string | number | { toString(): string };

function normalizeCode(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== ""
    ? value.trim().toUpperCase()
    : null;
}

/** Converts harmless user/Prisma decimal representations to one stable string. */
export function normalizeDepositValue(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  const raw =
    typeof value === "string" || typeof value === "number"
      ? String(value).trim()
      : value && typeof (value as DecimalLike).toString === "function"
        ? (value as DecimalLike).toString().trim()
        : "";
  const match = raw.match(/^\+?(\d+)(?:\.(\d+))?$/);
  if (!match) return null;

  const whole = match[1].replace(/^0+(?=\d)/, "");
  const fraction = (match[2] ?? "").replace(/0+$/, "");
  return fraction === "" ? whole : `${whole}.${fraction}`;
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

function decimalIsPositive(value: string): boolean {
  return /[1-9]/.test(value);
}

function decimalAtMost(value: string, maximum: string): boolean {
  const [leftWhole, leftFraction = ""] = value.split(".");
  const [rightWhole, rightFraction = ""] = maximum.split(".");
  const scale = Math.max(leftFraction.length, rightFraction.length);
  const left = BigInt(`${leftWhole}${leftFraction.padEnd(scale, "0")}`);
  const right = BigInt(`${rightWhole}${rightFraction.padEnd(scale, "0")}`);
  return left <= right;
}

/**
 * Strictly validates a complete host policy. Conditional fields are forbidden when
 * inapplicable so a later policy switch cannot leave stale values in a snapshot.
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

export interface ListingDepositPolicyRow {
  depositPolicy: string;
  depositPurpose: string | null;
  depositValue: DecimalLike | null;
  depositCurrency: string | null;
  depositDueTiming: string;
  depositDueDaysBeforeCheckIn: number | null;
  depositReturnDaysAfterCheckout: number | null;
  depositPolicyReviewedAt: Date | null;
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

/** Builds a safe V1 JSON snapshot from a persisted Listing row. */
export function createDepositPolicySnapshot(
  row: ListingDepositPolicyRow,
): DepositPolicySnapshotV1 {
  const validation = validateDepositPolicy({
    policy: row.depositPolicy,
    purpose: row.depositPurpose,
    value: row.depositValue,
    currency: row.depositCurrency,
    dueTiming: row.depositDueTiming,
    dueDaysBeforeCheckIn: row.depositDueDaysBeforeCheckIn,
    returnDaysAfterCheckout: row.depositReturnDaysAfterCheckout,
  });
  if (row.depositPolicyReviewedAt === null || !validation.success) {
    return { version: 1, status: "UNANSWERED", ...UNANSWERED_DEPOSIT_POLICY };
  }
  return { version: 1, status: "REVIEWED", ...validation.value };
}

/** Safely reads a nullable, backwards-compatible booking snapshot. */
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

interface ParsedDecimal {
  coefficient: bigint;
  scale: number;
}

function parseNonNegativeDecimal(value: unknown): ParsedDecimal | null {
  const normalized = normalizeDepositValue(value);
  if (normalized === null) return null;
  const [whole, fraction = ""] = normalized.split(".");
  return { coefficient: BigInt(`${whole}${fraction}`), scale: fraction.length };
}

function currencyFractionDigits(currency: string): number {
  try {
    return (
      new Intl.NumberFormat("en", { style: "currency", currency })
        .resolvedOptions().maximumFractionDigits ?? 2
    );
  } catch {
    return 2;
  }
}

function powerOfTen(exponent: number): bigint {
  let result = BigInt(1);
  for (let index = 0; index < exponent; index += 1) result *= BigInt(10);
  return result;
}

function roundToCurrency(decimal: ParsedDecimal, fractionDigits: number): string {
  let coefficient = decimal.coefficient;
  if (decimal.scale > fractionDigits) {
    const divisor = powerOfTen(decimal.scale - fractionDigits);
    const quotient = coefficient / divisor;
    const remainder = coefficient % divisor;
    // Half-up is deterministic and matches the ordinary monetary expectation for
    // a positive amount; no binary floating-point value participates.
    coefficient =
      quotient +
      (remainder * BigInt(2) >= divisor ? BigInt(1) : BigInt(0));
  } else if (decimal.scale < fractionDigits) {
    coefficient *= powerOfTen(fractionDigits - decimal.scale);
  }

  if (fractionDigits === 0) return coefficient.toString();
  const digits = coefficient.toString().padStart(fractionDigits + 1, "0");
  return `${digits.slice(0, -fractionDigits)}.${digits.slice(-fractionDigits)}`;
}

/**
 * Computes the amount from an already validated, frozen policy and a booking total
 * in the policy's currency. The result is a Decimal-safe string, or null for NONE.
 */
export function calculateDepositAmount(
  policy: DepositPolicyConfig,
  bookingTotal: DecimalLike,
): string | null {
  if (policy.policy === "NONE") return null;
  if (policy.value === null || policy.currency === null) return null;
  const value = parseNonNegativeDecimal(policy.value);
  if (value === null) return null;

  const rawAmount =
    policy.policy === "FIXED"
      ? value
      : (() => {
          const total = parseNonNegativeDecimal(bookingTotal);
          if (total === null) return null;
          return {
            coefficient: total.coefficient * value.coefficient,
            scale: total.scale + value.scale + 2,
          };
        })();
  if (rawAmount === null) return null;
  return roundToCurrency(rawAmount, currencyFractionDigits(policy.currency));
}
