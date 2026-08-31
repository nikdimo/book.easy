import {
  paymentMethodCanNeedNoInstructions,
  type BookingPaymentDecision,
  type BookingPaymentObligationType,
} from "./booking-payment-request";
import {
  methodSupportsPaymentDetails,
  paymentDetailsAreComplete,
  validatePaymentMethodDetails,
  type PaymentDetailFieldValues,
} from "./payment-details";
import type { PaymentMethodCode } from "./payment-methods";

/**
 * The one rule that decides what a host may answer when accepting a request.
 *
 * Acceptance used to mean three different things depending on where the host tapped:
 * the web dialog forced a decision, while the mobile PATCH and the old
 * `confirmBookingAction` sent none and let `confirmBooking` guess one from the payment
 * method. Same booking, same host, three different resulting states — and on mobile a
 * `PENDING` instructions task nothing had asked for.
 *
 * The rule lives here, pure and transport-free, so the web dialog, the mobile sheet,
 * the acceptance workflow and the transaction that writes the row all read the same
 * answer. Nothing derives a decision; every path states one and this validates it.
 */

export const BOOKING_PAYMENT_DECISIONS = [
  "SEND_NOW",
  "SEND_LATER",
  "NO_INSTRUCTIONS",
] as const satisfies readonly BookingPaymentDecision[];

export function isBookingPaymentDecision(
  value: unknown,
): value is BookingPaymentDecision {
  return (
    typeof value === "string" &&
    (BOOKING_PAYMENT_DECISIONS as readonly string[]).includes(value)
  );
}

/** `paymentInstructionsStatus` for a decision. The only place the mapping exists. */
export function instructionsStatusForDecision(
  decision: BookingPaymentDecision,
): "PENDING" | "NOT_NEEDED" {
  return decision === "NO_INSTRUCTIONS" ? "NOT_NEEDED" : "PENDING";
}

export interface AcceptanceDecisionRule {
  /** Every decision this booking may legitimately be accepted with. Never empty. */
  allowed: BookingPaymentDecision[];
  /** True when "no instructions needed" would be a lie: money is owed by a method
   *  that needs private transfer coordinates. */
  instructionsRequired: boolean;
  /** True when acceptance opens no obligation at all — a zero-value booking, or one
   *  whose every track is already settled or NOT_REQUIRED. */
  nothingToCollect: boolean;
  /**
   * What a UI may preselect. A preselection is not a decision: the host still confirms
   * it and the server still requires it on the wire. It is only guaranteed to be one
   * of `allowed`, so no screen can offer an answer the service will refuse.
   */
  suggested: BookingPaymentDecision;
}

/**
 * `payableCount` is the number of obligations this acceptance would actually open:
 * amount above zero, on a track that is not already settled or NOT_REQUIRED. Counting
 * policy objects instead would reopen tracks the guest was told were not owed (M3).
 */
export function acceptanceDecisionRule(input: {
  method: PaymentMethodCode | null;
  payableCount: number;
  /** Frozen choices for a legacy booking whose guest recorded no selection. */
  availableMethods?: readonly PaymentMethodCode[];
}): AcceptanceDecisionRule {
  const nothingToCollect = input.payableCount <= 0;
  const methodNeedsNoInstructions = paymentMethodCanNeedNoInstructions(input.method);
  // A legacy booking with no configured method at all may explicitly record that there
  // are no instructions. Merely failing to record a choice is not enough when bank or
  // online methods are still available: those require a method decision first.
  const noMethodConfigured =
    input.method === null && (input.availableMethods?.length ?? 0) === 0;
  const allowed: BookingPaymentDecision[] = [];
  if (!nothingToCollect) allowed.push("SEND_NOW", "SEND_LATER");
  // Genuinely not required: either nothing is owed, or the method is one settled in
  // person — cash at the property, or an arrangement made directly.
  if (nothingToCollect || methodNeedsNoInstructions || noMethodConfigured) {
    allowed.push("NO_INSTRUCTIONS");
  }

  return {
    allowed,
    instructionsRequired: !allowed.includes("NO_INSTRUCTIONS"),
    nothingToCollect,
    suggested:
      allowed.includes("NO_INSTRUCTIONS") &&
      (methodNeedsNoInstructions || noMethodConfigured)
      ? "NO_INSTRUCTIONS"
      : allowed[0],
  };
}

/** Null when the decision may be applied; otherwise the reason it may not. */
export function acceptanceDecisionError(
  decision: unknown,
  rule: AcceptanceDecisionRule,
): string | null {
  if (!isBookingPaymentDecision(decision)) {
    return "Choose what happens with payment instructions before accepting.";
  }
  if (rule.allowed.includes(decision)) return null;
  if (decision === "NO_INSTRUCTIONS") {
    return "Choose send now or send later for this payment method.";
  }
  return "This booking has nothing left to collect, so accept it with no instructions.";
}

/** The tracks an obligation belongs to, for reading a post-acceptance status triple. */
export function obligationTrackIsOpen(
  type: BookingPaymentObligationType,
  state: {
    paymentStatus: string;
    advancePaymentStatus: string;
    damageDepositStatus: string;
  },
): boolean {
  if (type === "ADVANCE_PAYMENT") {
    return state.advancePaymentStatus !== "NOT_REQUIRED";
  }
  if (type === "DAMAGE_DEPOSIT") {
    return state.damageDepositStatus !== "NOT_REQUIRED";
  }
  return state.paymentStatus !== "NOT_REQUIRED";
}

/**
 * Which method this acceptance is actually for.
 *
 * A guest's recorded choice is returned unchanged and a posted `method` is ignored —
 * the host cannot silently swap it. Only a booking with no recorded choice consults the
 * posted value, and only if it is on that booking's own frozen list.
 */
export function resolveRequestMethod(
  booking: {
    selectedPaymentMethod: PaymentMethodCode | null;
    availableMethods: readonly PaymentMethodCode[];
  },
  posted: PaymentMethodCode | null | undefined,
): PaymentMethodCode | null {
  if (booking.selectedPaymentMethod) return booking.selectedPaymentMethod;
  if (!posted) return null;
  return booking.availableMethods.includes(posted) ? posted : null;
}

export type ResolvedStructuredDetails =
  | { fields: PaymentDetailFieldValues }
  | { error: string };

/**
 * Validates the structured fields the host reviewed, against the method in play.
 *
 * Returns null when the request carries no structured data at all, which is what routes
 * a legacy free-text send down the original path. Errors are generic on purpose: an
 * action's error string can be surfaced in a toast or a log, and payment values must
 * never reach either.
 */
export function resolveStructuredDetails(
  method: PaymentMethodCode,
  detailFields: Record<string, string> | undefined,
): ResolvedStructuredDetails | null {
  if (!detailFields) return null;
  const hasValue = Object.values(detailFields).some((value) => value.trim() !== "");
  if (!hasValue) return null;
  if (!methodSupportsPaymentDetails(method)) {
    return { error: "This payment method does not take saved details." };
  }

  const validated = validatePaymentMethodDetails(method, detailFields);
  if (!validated.success) {
    return { error: "Check the payment details and try again." };
  }
  if (!paymentDetailsAreComplete(method, validated.value)) {
    return { error: "Fill in every required payment detail before sending." };
  }
  return { fields: validated.value };
}
