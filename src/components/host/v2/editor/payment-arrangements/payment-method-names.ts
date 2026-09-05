import type { useI18n } from "@/lib/i18n/client";
import type { PaymentMethodCode } from "./payment-arrangements-model";

/**
 * Plain-text method names, for an accessible label, an `aria-label`, or a summary line.
 *
 * Its own module because two components need it — the editor that renders the rows, and
 * the "copy from another listing" sheet that summarises a *different* listing's answer.
 * Leaving it inside the editor would have made the sheet import the component that
 * imports the sheet.
 */
export function methodSourceName(
  code: PaymentMethodCode,
  otherLabel: string | null,
  resolve: ReturnType<typeof useI18n>["resolve"],
): string {
  switch (code) {
    case "CASH_AT_PROPERTY":
      return resolve("host.editor.payment_arrangements.cash", "Cash at the property").text;
    case "BANK_TRANSFER_LOCAL_SEPA":
      return resolve("host.editor.payment_arrangements.bank_local", "Bank transfer (local or Europe)").text;
    case "BANK_TRANSFER_INTERNATIONAL":
      return resolve("host.editor.payment_arrangements.bank_international", "Bank transfer (other countries)").text;
    case "PAYPAL":
      return resolve("host.editor.payment_arrangements.paypal", "PayPal").text;
    case "REVOLUT":
      return resolve("host.editor.payment_arrangements.revolut", "Revolut").text;
    case "WISE":
      return resolve("host.editor.payment_arrangements.wise", "Wise").text;
    case "BITCOIN":
      return resolve("host.editor.payment_arrangements.bitcoin", "Bitcoin").text;
    case "HOST_SECURE_CARD_LINK":
      return resolve("host.editor.payment_arrangements.secure_card_link", "Secure card payment link from host").text;
    case "OTHER":
      return (
        (otherLabel ?? "").trim() ||
        resolve("host.editor.payment_arrangements.other", "Another payment method").text
      );
    case "ARRANGE_DIRECTLY":
      return resolve("host.editor.payment_arrangements.arrange_directly", "Arrange directly after the booking request").text;
  }
}
