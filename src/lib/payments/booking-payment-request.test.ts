import { describe, expect, it } from "vitest";
import {
  buildBookingPaymentRequest,
  bookingPaymentObligations,
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
      "Payment request for booking LH-ABC123\nMethod: Bank transfer (other countries)\nAmount: 320.00 EUR\nPayment due: 2026-09-10",
    );
  });

  it("allows the no-instructions path only for direct or in-person methods", () => {
    expect(paymentMethodCanNeedNoInstructions("CASH_AT_PROPERTY")).toBe(true);
    expect(paymentMethodCanNeedNoInstructions("ARRANGE_DIRECTLY")).toBe(true);
    expect(paymentMethodCanNeedNoInstructions(null)).toBe(false);
    expect(paymentMethodCanNeedNoInstructions("PAYPAL")).toBe(false);
  });

  it("splits advance from accommodation balance and keeps damage separate", () => {
    expect(
      bookingPaymentObligations({
        total: 1000,
        advancePaymentAmount: 200,
        damageDepositAmount: 150,
        acceptedAt: "2026-08-28",
        checkIn: "2026-09-20",
        depositPolicySnapshot: {
          version: 2,
          status: "REVIEWED",
          advancePayment: {
            amountType: "FIXED",
            value: "200",
            currency: "EUR",
            dueTiming: "AFTER_ACCEPTANCE",
            dueDaysBeforeCheckIn: null,
          },
          damageDeposit: {
            amountType: "FIXED",
            value: "150",
            currency: "EUR",
            dueTiming: "DAYS_BEFORE_CHECK_IN",
            dueDaysBeforeCheckIn: 7,
            returnDaysAfterCheckout: 3,
          },
        },
      }),
    ).toEqual([
      { type: "ADVANCE_PAYMENT", amount: 200, dueDate: "2026-08-28" },
      { type: "ACCOMMODATION_BALANCE", amount: 800, dueDate: "2026-09-20" },
      { type: "DAMAGE_DEPOSIT", amount: 150, dueDate: "2026-09-13" },
    ]);
  });

  it("never creates zero-value requests", () => {
    expect(
      bookingPaymentObligations({
        total: 0,
        advancePaymentAmount: 0,
        damageDepositAmount: 0,
        acceptedAt: "2026-08-28",
        checkIn: "2026-09-20",
        depositPolicySnapshot: null,
      }),
    ).toEqual([]);
  });
});
