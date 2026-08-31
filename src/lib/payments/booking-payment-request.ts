import {
  isPaymentMethodCode,
  paymentMethodSourceLabel,
  type PaymentMethodCode,
} from "./payment-methods";
import {
  formatPaymentDetailsAsText,
  validatePaymentMethodDetails,
  type PaymentDetailFieldValues,
} from "./payment-details";
import { parseDepositPoliciesSnapshot } from "./deposit-policies";
import {
  addDaysToYmd,
  dbDateToYmd,
  isValidYmd,
  marketplaceYmd,
} from "@/lib/utils/date-only";

export type BookingPaymentObligationType =
  | "ADVANCE_PAYMENT"
  | "ACCOMMODATION_BALANCE"
  | "DAMAGE_DEPOSIT";

export interface BookingPaymentObligation {
  type: BookingPaymentObligationType;
  amount: number;
  dueDate: string;
}

function policyDueDate(
  policy: { dueTiming: string; dueDaysBeforeCheckIn: number | null },
  acceptedOn: string,
  checkIn: string,
) {
  if (policy.dueTiming === "AFTER_ACCEPTANCE") return acceptedOn;
  if (policy.dueTiming === "DAYS_BEFORE_CHECK_IN") {
    return addDaysToYmd(checkIn, -(policy.dueDaysBeforeCheckIn ?? 0));
  }
  return checkIn;
}

/**
 * Builds the three possible requests without ever charging the advance twice.
 * The accommodation balance is always total minus advance; damage security stays
 * separate from the accommodation price.
 */
export function bookingPaymentObligations(input: {
  total: number;
  advancePaymentAmount: number;
  damageDepositAmount: number;
  depositPolicySnapshot: unknown;
  acceptedAt: Date | string;
  checkIn: Date | string;
}): BookingPaymentObligation[] {
  const total = Math.max(0, input.total);
  const advance = Math.min(total, Math.max(0, input.advancePaymentAmount));
  const balance = Math.max(0, total - advance);
  const damage = Math.max(0, input.damageDepositAmount);
  // Two different columns, so two different readings. `acceptedAt` is a *timestamp*:
  // its civil day is the marketplace's, and reading its UTC fields instead put every
  // acceptance made between local midnight and 02:00 on the previous day — an
  // AFTER_ACCEPTANCE deadline that was already overdue when it was created (M6).
  // `checkIn` is `@db.Date`, whose UTC fields *are* the stored day. A caller that
  // already holds a calendar date is taken at its word rather than re-read through a
  // zone it was never in.
  const acceptedOn = isValidYmd(input.acceptedAt)
    ? input.acceptedAt
    : marketplaceYmd(new Date(input.acceptedAt));
  const checkIn = dbDateToYmd(input.checkIn);
  const policies = parseDepositPoliciesSnapshot(input.depositPolicySnapshot);
  const obligations: BookingPaymentObligation[] = [];

  if (advance > 0) {
    obligations.push({
      type: "ADVANCE_PAYMENT",
      amount: advance,
      dueDate: policies?.advancePayment
        ? policyDueDate(policies.advancePayment, acceptedOn, checkIn)
        : acceptedOn,
    });
  }
  if (balance > 0) {
    obligations.push({
      type: "ACCOMMODATION_BALANCE",
      amount: balance,
      dueDate: checkIn,
    });
  }
  if (damage > 0) {
    obligations.push({
      type: "DAMAGE_DEPOSIT",
      amount: damage,
      dueDate: policies?.damageDeposit
        ? policyDueDate(policies.damageDeposit, acceptedOn, checkIn)
        : checkIn,
    });
  }
  return obligations;
}

export type BookingPaymentDecision =
  | "SEND_NOW"
  | "SEND_LATER"
  | "NO_INSTRUCTIONS";

/**
 * The structured details one guest was actually sent, frozen on their booking.
 *
 * This is a record of a past act, not a pointer at the host's current templates: it is
 * built from what the host reviewed and sent, and nothing rewrites it afterwards. A
 * booking that received free text has no snapshot at all and keeps rendering from the
 * private conversation message, which is how every pre-V2 booking stays intact.
 */
export interface BookingPaymentDetailsSnapshotV2 {
  version: 2;
  method: PaymentMethodCode;
  otherLabel: string | null;
  fields: PaymentDetailFieldValues;
  sentAt: string;
}

export function bookingPaymentDetailsSnapshot(input: {
  method: PaymentMethodCode;
  otherLabel?: string | null;
  fields: PaymentDetailFieldValues;
  sentAt?: Date;
}): BookingPaymentDetailsSnapshotV2 {
  return {
    version: 2,
    method: input.method,
    otherLabel: input.otherLabel ?? null,
    fields: input.fields,
    sentAt: (input.sentAt ?? new Date()).toISOString(),
  };
}

/**
 * Everything the host's send form needs to open already filled in.
 *
 * Host-only. It carries the saved details for exactly one method — the one this booking
 * uses — and never the host's other templates, so a guest-facing DTO can never be built
 * from it by accident.
 */
export interface BookingPaymentRequestPrefill {
  method: PaymentMethodCode | null;
  /** Whether the method above is the guest's recorded choice or still to be chosen. */
  methodSource: "GUEST" | "HOST_FALLBACK";
  /** Only consulted when the guest never chose; the host picks from these. */
  availableMethods: PaymentMethodCode[];
  otherLabel: string | null;
  savedDetailsKind: "STRUCTURED" | "LEGACY_TEXT" | "NONE";
  savedDetailFields: PaymentDetailFieldValues;
  savedInstructions: string;
}

/** Reads a stored snapshot defensively; anything unrecognised reads as "no snapshot". */
export function parseBookingPaymentDetailsSnapshot(
  value: unknown,
): BookingPaymentDetailsSnapshotV2 | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (raw.version !== 2) return null;
  if (!isPaymentMethodCode(raw.method)) return null;

  const validated = validatePaymentMethodDetails(raw.method, raw.fields);
  if (!validated.success) return null;
  if (Object.keys(validated.value).length === 0) return null;

  const otherLabel =
    typeof raw.otherLabel === "string" && raw.otherLabel.trim()
      ? raw.otherLabel.trim()
      : null;
  const sentAt =
    typeof raw.sentAt === "string" && !Number.isNaN(Date.parse(raw.sentAt))
      ? raw.sentAt
      : new Date(0).toISOString();

  return {
    version: 2,
    method: raw.method,
    otherLabel,
    fields: validated.value,
    sentAt,
  };
}

/** A frozen decision that this request needs no private transfer coordinates. */
export function isNoInstructionsPaymentRequestSnapshot(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const raw = value as Record<string, unknown>;
  return raw.version === 1 && raw.kind === "NO_INSTRUCTIONS";
}

function stableAmount(value: number, currency: string): string {
  const amount = Number.isInteger(value) ? value.toFixed(2) : String(value);
  return `${amount} ${currency.toUpperCase()}`;
}

/** Builds the private booking-specific message. Only `instructions` is reusable;
 * amount, reference and deadline always come from this booking. */
export function buildBookingPaymentRequest(input: {
  reference: string;
  method: PaymentMethodCode;
  otherLabel?: string | null;
  total: number;
  currency: string;
  dueDate: string;
  instructions: string;
}): string {
  return [
    `Payment request for booking ${input.reference}`,
    `Method: ${paymentMethodSourceLabel(input.method, input.otherLabel)}`,
    `Amount: ${stableAmount(input.total, input.currency)}`,
    `Payment due: ${input.dueDate}`,
    "",
    input.instructions.trim(),
    "",
    "Linger Homes has not collected or processed this payment.",
  ].join("\n");
}

/**
 * The same private message, written from structured fields instead of a paragraph.
 *
 * The conversation message stays the readable record of what was sent, so a guest whose
 * client cannot render the structured card still sees every value. The card and the
 * message are generated from one set of fields and cannot disagree.
 */
export function buildStructuredBookingPaymentRequest(input: {
  reference: string;
  method: PaymentMethodCode;
  otherLabel?: string | null;
  total: number;
  currency: string;
  dueDate: string;
  fields: PaymentDetailFieldValues;
}): string {
  return buildBookingPaymentRequest({
    ...input,
    instructions: formatPaymentDetailsAsText(input.method, input.fields),
  });
}

export function paymentMethodCanNeedNoInstructions(
  method: PaymentMethodCode | null,
): boolean {
  // An unrecorded method is unknown, not proof that transfer coordinates are
  // unnecessary. Acceptance handles the separate legacy case where the booking has no
  // payment methods at all; a booking that still offers bank/online methods must first
  // resolve one of them.
  return method === "CASH_AT_PROPERTY" || method === "ARRANGE_DIRECTLY";
}
