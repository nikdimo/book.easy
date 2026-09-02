import { describe, expect, it } from "vitest";
import {
  bookingPaymentDetailsSnapshot,
  buildStructuredBookingPaymentRequest,
  parseBookingPaymentDetailsSnapshot,
} from "./booking-payment-request";

const FIELDS = {
  accountHolder: "Nikola Dimovski",
  bankName: "Komercijalna Banka",
  accountIdentifier: "DK5000400440116243",
  swiftBic: "DABADKKK",
};

describe("frozen booking payment details", () => {
  it("round-trips the details a guest was actually sent", () => {
    const snapshot = bookingPaymentDetailsSnapshot({
      method: "BANK_TRANSFER_INTERNATIONAL",
      fields: FIELDS,
      sentAt: new Date("2026-08-27T10:00:00.000Z"),
    });

    expect(snapshot).toEqual({
      version: 2,
      method: "BANK_TRANSFER_INTERNATIONAL",
      otherLabel: null,
      fields: FIELDS,
      sentAt: "2026-08-27T10:00:00.000Z",
    });
    expect(parseBookingPaymentDetailsSnapshot(snapshot)).toEqual(snapshot);
  });

  it("carries the host's public label for an OTHER method", () => {
    const snapshot = bookingPaymentDetailsSnapshot({
      method: "OTHER",
      otherLabel: "MobilePay",
      fields: { value: "12345678" },
    });

    expect(parseBookingPaymentDetailsSnapshot(snapshot)?.otherLabel).toBe("MobilePay");
  });

  it("reads a booking with no snapshot as having none", () => {
    expect(parseBookingPaymentDetailsSnapshot(null)).toBeNull();
    expect(parseBookingPaymentDetailsSnapshot(undefined)).toBeNull();
    expect(parseBookingPaymentDetailsSnapshot({})).toBeNull();
    // A V1 blob is not a structured send; the conversation message stays the record.
    expect(
      parseBookingPaymentDetailsSnapshot({ version: 1, method: "PAYPAL", fields: {} }),
    ).toBeNull();
  });

  it("refuses a stored snapshot whose values no longer validate", () => {
    expect(
      parseBookingPaymentDetailsSnapshot({
        version: 2,
        method: "BANK_TRANSFER_INTERNATIONAL",
        otherLabel: null,
        fields: { ...FIELDS, accountIdentifier: "4111111111111111" },
        sentAt: "2026-08-27T10:00:00.000Z",
      }),
    ).toBeNull();
    expect(
      parseBookingPaymentDetailsSnapshot({
        version: 2,
        method: "NOT_A_METHOD",
        fields: FIELDS,
      }),
    ).toBeNull();
  });

  it("writes the same values into the private message body", () => {
    const body = buildStructuredBookingPaymentRequest({
      reference: "LH-ABC123",
      method: "BANK_TRANSFER_INTERNATIONAL",
      total: 320,
      currency: "EUR",
      dueDate: "2026-09-10",
      fields: FIELDS,
    });

    expect(body).toContain("Payment request for booking LH-ABC123");
    expect(body).toContain("Method: Bank transfer (other countries)");
    expect(body).toContain("Amount: 320.00 EUR");
    expect(body).toContain("Account holder: Nikola Dimovski");
    expect(body).toContain("IBAN or account number: DK5000400440116243");
    expect(body).toContain("SWIFT/BIC: DABADKKK");
    // The standing disclaimer travels with every request, structured or not.
    expect(body).toContain("Linger Homes has not collected or processed this payment.");
  });
});
