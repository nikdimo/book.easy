import { paymentMethodSourceLabel, type PaymentMethodCode } from "./payment-methods";

export type BookingPaymentDecision =
  | "SEND_NOW"
  | "SEND_LATER"
  | "NO_INSTRUCTIONS";

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

export function paymentMethodCanNeedNoInstructions(
  method: PaymentMethodCode | null,
): boolean {
  return method === null || method === "CASH_AT_PROPERTY" || method === "ARRANGE_DIRECTLY";
}
