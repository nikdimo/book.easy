import { describe, expect, it } from "vitest";
import {
  buildBookingPaymentRequest,
  paymentMethodCanNeedNoInstructions,
} from "./booking-payment-request";

describe("booking payment request", () => {
  it("combines reusable details with booking-specific facts", () => {
    expect(
      buildBookingPaymentRequest({
        reference: "LH-ABC123",
        method: "BANK_TRANSFER_INTERNATIONAL",
        total: 320,
        currency: "EUR",
        dueDate: "2026-09-10",
        instructions: "Account holder: Example Host\nIBAN: MK00 1234",
      }),
    ).toContain(
      "Payment request for booking LH-ABC123\nMethod: International bank transfer\nAmount: 320.00 EUR\nPayment due: 2026-09-10",
    );
  });

  it("allows the no-instructions path only for direct or in-person methods", () => {
    expect(paymentMethodCanNeedNoInstructions("CASH_AT_PROPERTY")).toBe(true);
    expect(paymentMethodCanNeedNoInstructions("ARRANGE_DIRECTLY")).toBe(true);
    expect(paymentMethodCanNeedNoInstructions("PAYPAL")).toBe(false);
  });
});
