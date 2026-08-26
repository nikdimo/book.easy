import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BookingReviewPaymentTerms } from "@/components/booking/booking-review-payment-terms";

const t = {
  resolve: (_key: string, source: string) => ({ text: source, translated: false }),
};

describe("BookingReviewPaymentTerms", () => {
  it("shows public methods, complete deposit terms, and the direct-payment disclaimer only", () => {
    const html = renderToStaticMarkup(
      <BookingReviewPaymentTerms
        t={t}
        selectedPaymentMethod={null}
        onSelectedPaymentMethodChange={() => {}}
        acceptedPaymentMethods={{
          reviewedAt: "2026-08-25T10:00:00.000Z",
          methodCodes: ["PAYPAL", "OTHER"],
          otherLabel: "MobilePay",
        }}
        depositPolicy={{
          version: 1,
          status: "REVIEWED",
          policy: "FIXED",
          purpose: "DAMAGE_SECURITY",
          value: "125.50",
          currency: "EUR",
          dueTiming: "DAYS_BEFORE_CHECK_IN",
          dueDaysBeforeCheckIn: 7,
          returnDaysAfterCheckout: 14,
        }}
      />,
    );

    expect(html).toContain("How would you like to pay?");
    expect(html).toContain("PayPal");
    expect(html).toContain("MobilePay");
    expect(html).toContain("Deposit policy");
    expect(html).toContain("Required deposit: €125.50.");
    expect(html).toContain("Purpose: refundable damage/security deposit.");
    expect(html).toContain("Due 7 days before check-in.");
    expect(html).toContain("returned within 14 days after check-out");
    expect(html).toContain(
      "Guests pay the host directly. Linger Homes does not collect, hold, verify, protect, or refund this payment.",
    );
  });

  it("does not render private payment details even when a malformed object carries them", () => {
    const html = renderToStaticMarkup(
      <BookingReviewPaymentTerms
        t={t}
        selectedPaymentMethod={null}
        onSelectedPaymentMethodChange={() => {}}
        acceptedPaymentMethods={{
          reviewedAt: "2026-08-25T10:00:00.000Z",
          methodCodes: ["PAYPAL"],
          otherLabel: null,
          accountNumber: "DK5000400440116243",
          paymentHandle: "@host-payments",
          paymentUrl: "https://pay.example/private",
        } as Parameters<typeof BookingReviewPaymentTerms>[0]["acceptedPaymentMethods"]}
        depositPolicy={{
          version: 1,
          status: "REVIEWED",
          policy: "PERCENTAGE",
          purpose: "ADVANCE_PAYMENT",
          value: "25",
          currency: "EUR",
          dueTiming: "AFTER_ACCEPTANCE",
          dueDaysBeforeCheckIn: null,
          returnDaysAfterCheckout: null,
          bankDetails: "DK5000400440116243",
          paymentLink: "https://pay.example/private",
        } as Parameters<typeof BookingReviewPaymentTerms>[0]["depositPolicy"]}
      />,
    );

    expect(html).toContain("Required deposit: 25% of the stay price.");
    expect(html).not.toContain("DK5000400440116243");
    expect(html).not.toContain("@host-payments");
    expect(html).not.toContain("https://pay.example/private");
    expect(html).not.toContain("href=");
  });

  it("formats a non-EUR fixed deposit with the reading locale's own separators and symbol placement", () => {
    const de = {
      resolve: (_key: string, source: string) => ({ text: source, translated: false }),
      locale: "de",
    };
    const html = renderToStaticMarkup(
      <BookingReviewPaymentTerms
        t={de}
        selectedPaymentMethod={null}
        onSelectedPaymentMethodChange={() => {}}
        acceptedPaymentMethods={{
          reviewedAt: "2026-08-25T10:00:00.000Z",
          methodCodes: ["CASH_AT_PROPERTY"],
          otherLabel: null,
        }}
        depositPolicy={{
          version: 1,
          status: "REVIEWED",
          policy: "FIXED",
          purpose: "ADVANCE_PAYMENT",
          value: "1250",
          currency: "MKD",
          dueTiming: "AFTER_ACCEPTANCE",
          dueDaysBeforeCheckIn: null,
          returnDaysAfterCheckout: null,
        }}
      />,
    );

    // German grouping conventions ("1.250") applied to the booking's own official
    // currency (MKD) — never converted, never defaulted to EUR.
    expect(html).toContain("1.250");
    expect(html).not.toMatch(/Required deposit: 1250 MKD/);
  });
});
