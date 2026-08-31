/**
 * The live deposit model: two independent host policies, deliberately kept free of
 * Prisma and transport code.
 *
 * A host may ask for an advance payment toward the stay, a refundable damage deposit,
 * both, or neither. The two are never added together and never share a status, because
 * they are not the same kind of money:
 *
 *   - The advance payment is *part of the booking price*. Paying it reduces what is
 *     still owed for the stay. It is not refundable security.
 *   - The damage deposit is *additional* to the booking price. It is security against
 *     damage and the host is expected to give it back.
 *
 * Conflating them is the exact mistake the single-`purpose` V1 model made possible, so
 * every type here keeps them apart by construction rather than by discipline.
 *
 * Linger Homes records these terms and the participants' own manual status reports. It
 * never collects, holds, processes, verifies or refunds any of this money.
 *
 * ## The currency invariant
 *
 * **Every amount this module calculates or freezes onto a booking is denominated in the
 * booking's pricing currency** — the listing's `pricingRule.currency`, which is what
 * `Booking.currency`, `Booking.totalPrice` and `priceBreakdown` are all quoted in.
 *
 * A listing carries a *second* currency label, `depositPoliciesCurrency`, stamped when
 * the host last reviewed the payment-arrangements screen. It can lag: it is a record of
 * what the host was quoted in at review time, not a live read of the listing's price.
 * The two are therefore reconciled at exactly two points, and never by relabelling:
 *
 *   - `createDepositPoliciesSnapshot` refuses to produce REVIEWED terms when the stored
 *     label disagrees with the live pricing currency (or when either is missing while a
 *     policy asks for money). The listing reads as UNANSWERED, which is what the host's
 *     own editor shows as "needs review" and what a guest is told plainly. A `FIXED 100`
 *     saved under EUR is never re-served as `100 MKD`.
 *   - `calculateDepositAmounts` takes the booking currency explicitly and drops any
 *     policy that does not match it. Unreachable once the snapshot has been checked; it
 *     is the second lock on the same door, on the path that writes money columns.
 *
 * The advance payment is additionally bounded: it is *part of* the booking total, so it
 * can never exceed it. The damage deposit is separate money on top of the total and is
 * deliberately left unbounded — no business rule caps security against damage.
 */

import {
  decimalAtMost,
  decimalIsPositive,
  normalizeDepositValue,
  resolveDeclaredAmount,
  toCurrencyAmount,
  type DecimalLike,
} from "@/lib/payments/deposit-money";
import {
  parseDepositPolicySnapshot,
  type DepositPolicySnapshotV1,
} from "@/lib/payments/deposit-policy-v1";

export const DEPOSIT_AMOUNT_TYPE_CODES = ["FIXED", "PERCENTAGE"] as const;
export const DEPOSIT_DUE_TIMING_CODES = [
  "AFTER_ACCEPTANCE",
  "DAYS_BEFORE_CHECK_IN",
  "AT_CHECK_IN",
] as const;

export type DepositAmountType = (typeof DEPOSIT_AMOUNT_TYPE_CODES)[number];
export type DepositDueTiming = (typeof DEPOSIT_DUE_TIMING_CODES)[number];

/** The two independent policy slots, in the order a guest reads them. */
export const DEPOSIT_POLICY_KINDS = ["advancePayment", "damageDeposit"] as const;
export type DepositPolicyKind = (typeof DEPOSIT_POLICY_KINDS)[number];

/** An advance payment counted toward the booking total. */
export interface AdvancePaymentPolicy {
  amountType: DepositAmountType;
  /** Canonical base-10 decimal; never a binary floating-point amount. */
  value: string;
  currency: string;
  dueTiming: DepositDueTiming;
  dueDaysBeforeCheckIn: number | null;
}

/** Refundable security, additional to the booking total. */
export interface DamageDepositPolicy extends AdvancePaymentPolicy {
  /** Null means the host stated no return period, not that it is never returned. */
  returnDaysAfterCheckout: number | null;
}

export interface DepositPoliciesConfig {
  /** Null means this policy is switched off, which is a complete answer in itself. */
  advancePayment: AdvancePaymentPolicy | null;
  damageDeposit: DamageDepositPolicy | null;
}

/**
 * A booking's frozen terms.
 *
 * `UNANSWERED` is not the same answer as both policies being null: it means the host
 * never went to the payment-arrangements screen at all, which the guest is told plainly
 * rather than being shown a confident "no deposit required".
 */
export interface DepositPoliciesSnapshotV2 extends DepositPoliciesConfig {
  version: 2;
  status: "REVIEWED" | "UNANSWERED";
}

export type DepositPolicyIssue =
  | "AMOUNT_TYPE_REQUIRED"
  | "UNKNOWN_AMOUNT_TYPE"
  | "VALUE_REQUIRED"
  | "INVALID_VALUE"
  | "VALUE_MUST_BE_POSITIVE"
  | "PERCENTAGE_TOO_HIGH"
  | "ADVANCE_EXCEEDS_STAY_TOTAL"
  | "CURRENCY_REQUIRED"
  | "INVALID_CURRENCY"
  | "DUE_TIMING_REQUIRED"
  | "UNKNOWN_DUE_TIMING"
  | "DUE_DAYS_REQUIRED"
  | "DUE_DAYS_NOT_ALLOWED"
  | "INVALID_DUE_DAYS"
  | "INVALID_RETURN_DAYS";

/** Field-level problems within one policy section. */
export interface DepositSectionIssues {
  amountType?: DepositPolicyIssue;
  value?: DepositPolicyIssue;
  currency?: DepositPolicyIssue;
  dueTiming?: DepositPolicyIssue;
  dueDaysBeforeCheckIn?: DepositPolicyIssue;
  returnDaysAfterCheckout?: DepositPolicyIssue;
}

/** Sections are reported independently so one bad section cannot blank the other. */
export interface DepositPoliciesIssues {
  advancePayment?: DepositSectionIssues;
  damageDeposit?: DepositSectionIssues;
}

export type DepositPoliciesValidation =
  | { success: true; value: DepositPoliciesConfig }
  | { success: false; issues: DepositPoliciesIssues };

const AMOUNT_TYPE_SET = new Set<string>(DEPOSIT_AMOUNT_TYPE_CODES);
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

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * True when the host has switched a section on.
 *
 * A section is off when it is absent, null, or carries `enabled: false`. An object
 * present without an explicit `enabled` flag counts as on, so a caller that simply omits
 * the disabled section reads the same as one that sends `{ enabled: false }`.
 */
function sectionIsEnabled(raw: unknown): boolean {
  const section = asObject(raw);
  if (!section) return false;
  return section.enabled === undefined || section.enabled === true;
}

interface SectionValidation {
  policy: AdvancePaymentPolicy | null;
  returnDaysAfterCheckout: number | null;
  issues: DepositSectionIssues;
}

function validateSection(
  raw: unknown,
  currency: string | null,
  allowReturnDays: boolean,
): SectionValidation {
  const issues: DepositSectionIssues = {};
  const section = asObject(raw) ?? {};
  const amountType = normalizeCode(section.amountType);
  const value = normalizeDepositValue(section.value);
  const dueTiming = normalizeCode(section.dueTiming);
  const dueDaysBeforeCheckIn = normalizeNullableWholeNumber(
    section.dueDaysBeforeCheckIn,
  );
  const returnDaysAfterCheckout = allowReturnDays
    ? normalizeNullableWholeNumber(section.returnDaysAfterCheckout)
    : null;

  if (amountType === null) issues.amountType = "AMOUNT_TYPE_REQUIRED";
  else if (!AMOUNT_TYPE_SET.has(amountType)) issues.amountType = "UNKNOWN_AMOUNT_TYPE";

  if (value === null) {
    issues.value = isSupplied(section.value) ? "INVALID_VALUE" : "VALUE_REQUIRED";
  } else if (!decimalIsPositive(value)) {
    issues.value = "VALUE_MUST_BE_POSITIVE";
  } else if (amountType === "PERCENTAGE" && !decimalAtMost(value, "100")) {
    issues.value = "PERCENTAGE_TOO_HIGH";
  }

  const normalizedCurrency = normalizeCode(currency);
  if (normalizedCurrency === null) issues.currency = "CURRENCY_REQUIRED";
  else if (!/^[A-Z]{3}$/.test(normalizedCurrency)) issues.currency = "INVALID_CURRENCY";

  if (dueTiming === null) issues.dueTiming = "DUE_TIMING_REQUIRED";
  else if (!DUE_TIMING_SET.has(dueTiming)) issues.dueTiming = "UNKNOWN_DUE_TIMING";
  else if (dueTiming === "DAYS_BEFORE_CHECK_IN") {
    if (dueDaysBeforeCheckIn === null) {
      issues.dueDaysBeforeCheckIn = isSupplied(section.dueDaysBeforeCheckIn)
        ? "INVALID_DUE_DAYS"
        : "DUE_DAYS_REQUIRED";
    } else if (dueDaysBeforeCheckIn < 1) {
      issues.dueDaysBeforeCheckIn = "INVALID_DUE_DAYS";
    }
  } else if (dueDaysBeforeCheckIn !== null) {
    // A stale day count left behind by a timing change must not survive into a
    // snapshot that no longer displays it.
    issues.dueDaysBeforeCheckIn = "DUE_DAYS_NOT_ALLOWED";
  } else if (isSupplied(section.dueDaysBeforeCheckIn)) {
    issues.dueDaysBeforeCheckIn = "INVALID_DUE_DAYS";
  }

  if (allowReturnDays && isSupplied(section.returnDaysAfterCheckout)) {
    if (returnDaysAfterCheckout === null || returnDaysAfterCheckout < 1) {
      issues.returnDaysAfterCheckout = "INVALID_RETURN_DAYS";
    }
  }

  if (Object.keys(issues).length > 0) {
    return { policy: null, returnDaysAfterCheckout: null, issues };
  }
  return {
    policy: {
      amountType: amountType as DepositAmountType,
      value: value as string,
      currency: normalizedCurrency as string,
      dueTiming: dueTiming as DepositDueTiming,
      dueDaysBeforeCheckIn:
        dueTiming === "DAYS_BEFORE_CHECK_IN" ? dueDaysBeforeCheckIn : null,
    },
    returnDaysAfterCheckout,
    issues,
  };
}

/**
 * Validates a complete two-section answer.
 *
 * Both sections off is a valid, complete answer — it is how a host says "neither" — so
 * this succeeds with two nulls rather than demanding at least one policy.
 */
export function validateDepositPolicies(input: unknown): DepositPoliciesValidation {
  const raw = asObject(input) ?? {};
  const currency = typeof raw.currency === "string" ? raw.currency : null;
  const issues: DepositPoliciesIssues = {};

  let advancePayment: AdvancePaymentPolicy | null = null;
  if (sectionIsEnabled(raw.advancePayment)) {
    const result = validateSection(raw.advancePayment, currency, false);
    if (result.policy) advancePayment = result.policy;
    else issues.advancePayment = result.issues;
  }

  let damageDeposit: DamageDepositPolicy | null = null;
  if (sectionIsEnabled(raw.damageDeposit)) {
    const result = validateSection(raw.damageDeposit, currency, true);
    if (result.policy) {
      damageDeposit = {
        ...result.policy,
        returnDaysAfterCheckout: result.returnDaysAfterCheckout,
      };
    } else issues.damageDeposit = result.issues;
  }

  if (Object.keys(issues).length > 0) return { success: false, issues };
  return { success: true, value: { advancePayment, damageDeposit } };
}

/** The listing columns this module reads. Kept structural so tests need no Prisma row. */
export interface ListingDepositPoliciesRow {
  advancePaymentEnabled: boolean;
  advancePaymentType: string | null;
  advancePaymentValue: DecimalLike | null;
  advancePaymentDueTiming: string;
  advancePaymentDueDaysBeforeCheckIn: number | null;
  damageDepositEnabled: boolean;
  damageDepositType: string | null;
  damageDepositValue: DecimalLike | null;
  damageDepositDueTiming: string;
  damageDepositDueDaysBeforeCheckIn: number | null;
  damageDepositReturnDaysAfterCheckout: number | null;
  depositPoliciesCurrency: string | null;
  depositPoliciesReviewedAt: Date | null;
  /**
   * The listing's live pricing currency, which is the only currency a booking made from
   * this listing is ever quoted in.
   *
   * Structural rather than a bare string so it reads as what it is — the pricing rule
   * relation — and so a caller that forgot to select it fails to typecheck instead of
   * silently passing the stored label off as the live one. Null is a real state: a draft
   * listing has no pricing rule yet.
   */
  pricingRule: { currency: string } | null;
}

const UNANSWERED: DepositPoliciesConfig = {
  advancePayment: null,
  damageDeposit: null,
};

/**
 * Builds the V2 snapshot frozen onto a booking request, from a persisted Listing row.
 *
 * A row that fails validation degrades to UNANSWERED rather than to a partially-read
 * policy: telling a guest nothing is honest, telling them half a term is not.
 *
 * A row whose stored policy currency no longer matches the listing's pricing currency
 * degrades the same way, and for the same reason. Those amounts were quoted in a
 * currency this listing no longer prices in; re-serving them under the new label would
 * turn `100 EUR` into `100 MKD` without anyone deciding to. The host's own editor reads
 * this snapshot, so the listing shows as needing review and the next save re-stamps both
 * the amounts and the currency together. Nothing in the database is rewritten here, and
 * bookings that already froze terms keep them untouched.
 *
 * Currency is only consulted when a section actually asks for money: a listing that asks
 * for neither is a complete answer that no currency can spoil, including on a draft with
 * no pricing rule at all.
 */
export function createDepositPoliciesSnapshot(
  row: ListingDepositPoliciesRow,
): DepositPoliciesSnapshotV2 {
  const wantsMoney = row.advancePaymentEnabled || row.damageDepositEnabled;
  const pricingCurrency = normalizeCode(row.pricingRule?.currency);
  const storedCurrency = normalizeCode(row.depositPoliciesCurrency);
  if (wantsMoney && (pricingCurrency === null || storedCurrency !== pricingCurrency)) {
    return { version: 2, status: "UNANSWERED", ...UNANSWERED };
  }

  const validation = validateDepositPolicies({
    currency: row.depositPoliciesCurrency,
    advancePayment: row.advancePaymentEnabled
      ? {
          enabled: true,
          amountType: row.advancePaymentType,
          value: row.advancePaymentValue,
          dueTiming: row.advancePaymentDueTiming,
          dueDaysBeforeCheckIn: row.advancePaymentDueDaysBeforeCheckIn,
        }
      : null,
    damageDeposit: row.damageDepositEnabled
      ? {
          enabled: true,
          amountType: row.damageDepositType,
          value: row.damageDepositValue,
          dueTiming: row.damageDepositDueTiming,
          dueDaysBeforeCheckIn: row.damageDepositDueDaysBeforeCheckIn,
          returnDaysAfterCheckout: row.damageDepositReturnDaysAfterCheckout,
        }
      : null,
  });
  if (row.depositPoliciesReviewedAt === null || !validation.success) {
    return { version: 2, status: "UNANSWERED", ...UNANSWERED };
  }
  return { version: 2, status: "REVIEWED", ...validation.value };
}

/**
 * Maps a frozen V1 snapshot onto the V2 shape without changing what it says.
 *
 * V1's `purpose` decided which of the two slots the single policy occupied, so the
 * mapping is total and lossless: ADVANCE_PAYMENT fills the advance slot, DAMAGE_SECURITY
 * the damage slot, and the other slot stays null because V1 could not express it. This
 * is a read-time projection — the stored booking JSON is never rewritten.
 */
export function depositPoliciesFromV1(
  snapshot: DepositPolicySnapshotV1,
): DepositPoliciesSnapshotV2 {
  if (
    snapshot.status !== "REVIEWED" ||
    snapshot.policy === "NONE" ||
    snapshot.value === null ||
    snapshot.currency === null
  ) {
    return {
      version: 2,
      status: snapshot.status === "REVIEWED" ? "REVIEWED" : "UNANSWERED",
      ...UNANSWERED,
    };
  }

  const shared = {
    amountType: snapshot.policy satisfies DepositAmountType,
    value: snapshot.value,
    currency: snapshot.currency,
    dueTiming: snapshot.dueTiming,
    dueDaysBeforeCheckIn: snapshot.dueDaysBeforeCheckIn,
  };
  return snapshot.purpose === "DAMAGE_SECURITY"
    ? {
        version: 2,
        status: "REVIEWED",
        advancePayment: null,
        damageDeposit: {
          ...shared,
          returnDaysAfterCheckout: snapshot.returnDaysAfterCheckout,
        },
      }
    : {
        version: 2,
        status: "REVIEWED",
        advancePayment: shared,
        damageDeposit: null,
      };
}

/**
 * Reads a booking's frozen terms, whichever version froze them.
 *
 * V2 is read directly; V1 is projected through `depositPoliciesFromV1`. Anything else —
 * null, a malformed object, an unknown version, extra keys carrying payment details —
 * returns null so no caller can render an unvalidated field.
 */
export function parseDepositPoliciesSnapshot(
  value: unknown,
): DepositPoliciesSnapshotV2 | null {
  const raw = asObject(value);
  if (!raw) return null;

  if (raw.version === 1) {
    const v1 = parseDepositPolicySnapshot(raw);
    return v1 ? depositPoliciesFromV1(v1) : null;
  }
  if (raw.version !== 2) return null;
  if (raw.status !== "REVIEWED" && raw.status !== "UNANSWERED") return null;

  // A V2 snapshot stores the currency on each policy; validation takes one shared
  // currency because a listing cannot quote two. Two sections that disagree are refused
  // rather than reconciled — picking one would silently restate the other's terms.
  const advanceCurrency = normalizeCode(asObject(raw.advancePayment)?.currency);
  const damageCurrency = normalizeCode(asObject(raw.damageDeposit)?.currency);
  if (advanceCurrency && damageCurrency && advanceCurrency !== damageCurrency) {
    return null;
  }

  const validation = validateDepositPolicies({
    currency: advanceCurrency ?? damageCurrency,
    advancePayment: asObject(raw.advancePayment),
    damageDeposit: asObject(raw.damageDeposit),
  });
  if (!validation.success) return null;

  if (raw.status === "UNANSWERED") {
    // An unanswered snapshot that somehow carries terms is self-contradictory; refusing
    // it is safer than picking whichever half to believe.
    if (validation.value.advancePayment || validation.value.damageDeposit) return null;
    return { version: 2, status: "UNANSWERED", ...UNANSWERED };
  }
  return { version: 2, status: "REVIEWED", ...validation.value };
}

/**
 * The two amounts a booking freezes, each in the policy's own currency.
 *
 * They are returned separately and never summed. The advance payment is part of
 * `bookingTotal`; the damage deposit is money on top of it. A caller that adds them is
 * telling the guest a price that does not exist.
 */
export interface FrozenDepositAmounts {
  advancePaymentAmount: string | null;
  damageDepositAmount: string | null;
}

/**
 * Resolves one policy against a booking total, refusing any policy not denominated in
 * the booking's own currency.
 *
 * `PERCENTAGE` is a share *of this booking total*, so a policy carrying a different
 * currency label would be resolving a share of one currency and printing it as another.
 * `FIXED` is worse still — a flat number relabelled outright. Neither is reconcilable
 * without an exchange rate this product deliberately does not apply to payable amounts,
 * so both return null and the track opens as NOT_REQUIRED.
 */
function resolveAgainstBooking(
  policy: AdvancePaymentPolicy,
  bookingTotal: DecimalLike,
  bookingCurrency: string,
): string | null {
  if (normalizeCode(policy.currency) !== bookingCurrency) return null;
  return resolveDeclaredAmount(
    policy.amountType,
    policy.value,
    bookingCurrency,
    bookingTotal,
  );
}

export function calculateDepositAmounts(
  policies: DepositPoliciesConfig,
  bookingTotal: DecimalLike,
  /** The booking's pricing currency — `Booking.currency`, the unit of `bookingTotal`. */
  bookingCurrency: string,
): FrozenDepositAmounts {
  const currency = normalizeCode(bookingCurrency);
  if (currency === null) {
    return { advancePaymentAmount: null, damageDepositAmount: null };
  }

  let advancePaymentAmount = policies.advancePayment
    ? resolveAgainstBooking(policies.advancePayment, bookingTotal, currency)
    : null;

  // The advance payment is part of the booking total, so asking for more than the total
  // is not a bigger advance — it is a figure that cannot mean anything. A `PERCENTAGE`
  // is already bounded at save time (`PERCENTAGE_TOO_HIGH`); a `FIXED` value knows
  // nothing about the stay it lands on, and a short stay can cost less than it. Capping
  // at the total reads as "pay the stay in full up front", which is the only sound
  // reading, and it keeps the guest from ever being quoted more than they owe. The
  // frozen policy still records what the host declared, so the cap stays legible.
  //
  // The damage deposit is deliberately not capped: it is security *on top of* the total,
  // and no rule in this product ties its size to the price of the stay.
  const totalInBookingCurrency = toCurrencyAmount(bookingTotal, currency);
  if (
    advancePaymentAmount !== null &&
    totalInBookingCurrency !== null &&
    !decimalAtMost(advancePaymentAmount, totalInBookingCurrency)
  ) {
    advancePaymentAmount = totalInBookingCurrency;
  }

  return {
    advancePaymentAmount,
    damageDepositAmount: policies.damageDeposit
      ? resolveAgainstBooking(policies.damageDeposit, bookingTotal, currency)
      : null,
  };
}

/**
 * The dearest stay this listing could sell at its own base rate: every night it allows,
 * plus the cleaning fee. Null when the pricing rule is not usable.
 */
export function maximumStayTotalAtBaseRate(pricing: {
  baseNightlyRate: DecimalLike;
  cleaningFee: DecimalLike;
  maxNights: number;
  currency: string;
}): string | null {
  const nightly = normalizeDepositValue(pricing.baseNightlyRate);
  const cleaning = normalizeDepositValue(pricing.cleaningFee);
  if (nightly === null || cleaning === null) return null;
  if (!Number.isSafeInteger(pricing.maxNights) || pricing.maxNights < 1) return null;

  // Percentage arithmetic in reverse: `maxNights * 100%` of the nightly rate, so the
  // multiplication stays on the same integer-coefficient path every other amount uses.
  const nights = resolveDeclaredAmount(
    "PERCENTAGE",
    String(pricing.maxNights * 100),
    pricing.currency,
    nightly,
  );
  if (nights === null) return null;
  const total = addDecimals(nights, cleaning);
  return toCurrencyAmount(total, pricing.currency);
}

function addDecimals(left: string, right: string): string {
  const [leftWhole, leftFraction = ""] = left.split(".");
  const [rightWhole, rightFraction = ""] = right.split(".");
  const scale = Math.max(leftFraction.length, rightFraction.length);
  const sum =
    BigInt(`${leftWhole}${leftFraction.padEnd(scale, "0")}`) +
    BigInt(`${rightWhole}${rightFraction.padEnd(scale, "0")}`);
  if (scale === 0) return sum.toString();
  const digits = sum.toString().padStart(scale + 1, "0");
  return `${digits.slice(0, -scale)}.${digits.slice(-scale)}`;
}

/**
 * Whether a declared advance payment could never be collected in full.
 *
 * The real bound is the booking total, which no listing screen can know — a stay's price
 * depends on its dates, its per-night overrides and whatever promotion applies. What a
 * listing *can* prove is that a flat advance larger than its dearest permitted stay at
 * its own base rate would be capped for every booking it ever takes, which makes it a
 * typo rather than a policy. Per-night overrides can price a stay above the base rate,
 * so this is a floor on wrongness and not a substitute for the cap in
 * `calculateDepositAmounts`; it exists to tell the host at the moment they can fix it.
 *
 * A `PERCENTAGE` advance needs none of this: it is bounded at 100% by validation, and
 * 100% of the total is exactly the cap.
 */
export function advanceExceedsEveryStay(
  advancePayment: AdvancePaymentPolicy | null,
  pricing: {
    baseNightlyRate: DecimalLike;
    cleaningFee: DecimalLike;
    maxNights: number;
    currency: string;
  } | null,
): boolean {
  if (!advancePayment || advancePayment.amountType !== "FIXED" || !pricing) return false;
  if (normalizeCode(advancePayment.currency) !== normalizeCode(pricing.currency)) {
    return false;
  }
  const ceiling = maximumStayTotalAtBaseRate(pricing);
  if (ceiling === null) return false;
  const declared = toCurrencyAmount(advancePayment.value, pricing.currency);
  if (declared === null) return false;
  return !decimalAtMost(declared, ceiling);
}

/** Whether the host answered the question at all and asked for anything. */
export function hasAnyDepositPolicy(
  policies: DepositPoliciesConfig | null | undefined,
): boolean {
  return Boolean(policies?.advancePayment || policies?.damageDeposit);
}

export type { DecimalLike, DepositPolicySnapshotV1 };
