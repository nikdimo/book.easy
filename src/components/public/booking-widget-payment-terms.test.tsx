import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BookingReviewPaymentTerms } from "@/components/booking/booking-review-payment-terms";
import type { DepositPoliciesSnapshotV2 } from "@/lib/payments/deposit-policies";

const t = {
  resolve: (_key: string, source: string) => ({ text: source, translated: false }),
};

const methods = {
  reviewedAt: "2026-08-25T10:00:00.000Z",
  methodCodes: ["PAYPAL", "OTHER"] as const,
  otherLabel: "MobilePay",
};

function render(depositPolicies: DepositPoliciesSnapshotV2, resolver = t) {
  return renderToStaticMarkup(
    <BookingReviewPaymentTerms
      t={resolver}
      selectedPaymentMethod={null}
      onSelectedPaymentMethodChange={() => {}}
      acceptedPaymentMethods={{
        reviewedAt: methods.reviewedAt,
        methodCodes: [...methods.methodCodes],
        otherLabel: methods.otherLabel,
      }}
      depositPolicies={depositPolicies}
    />,
  );
}

describe("BookingReviewPaymentTerms", () => {
  it("shows a damage deposit as separate, refundable security money", () => {
    const html = render({
      version: 2,
      status: "REVIEWED",
      advancePayment: null,
      damageDeposit: {
        amountType: "FIXED",
        value: "125.50",
        currency: "EUR",
        dueTiming: "DAYS_BEFORE_CHECK_IN",
        dueDaysBeforeCheckIn: 7,
        returnDaysAfterCheckout: 14,
      },
    });

    expect(html).toContain("How would you like to pay?");
    expect(html).toContain("PayPal");
    expect(html).toContain("MobilePay");
    expect(html).toContain("Refundable damage deposit");
    expect(html).toContain("Damage deposit: €125.50.");
    expect(html).toContain("Due 7 days before check-in.");
    expect(html).toContain("return it within 14 days after check-out");
    expect(html).toContain("separate from the price of your stay");
    expect(html).toContain(
      "Guests pay the host directly. Linger Homes does not collect, hold, verify, protect, or refund this payment.",
    );
    // The advance-payment block is absent entirely, not shown as empty.
    expect(html).not.toContain('data-deposit-policy="advance-payment"');
  });

  it("shows an advance payment as part of the booking price, not a damage deposit", () => {
    const html = render({
      version: 2,
      status: "REVIEWED",
      advancePayment: {
        amountType: "PERCENTAGE",
        value: "25",
        currency: "EUR",
        dueTiming: "AFTER_ACCEPTANCE",
        dueDaysBeforeCheckIn: null,
      },
      damageDeposit: null,
    });

    expect(html).toContain("Advance payment: 25% of the booking total.");
    expect(html).toContain("counts toward the price of your stay");
    expect(html).toContain("Due after the booking request is accepted.");
    expect(html).not.toContain('data-deposit-policy="damage-deposit"');
    // It must never be described as refundable security.
    expect(html).not.toMatch(/Advance payment[^<]*refundable damage/i);
  });

  it("keeps the two apart when a host asks for both", () => {
    const html = render({
      version: 2,
      status: "REVIEWED",
      advancePayment: {
        amountType: "PERCENTAGE",
        value: "25",
        currency: "EUR",
        dueTiming: "AFTER_ACCEPTANCE",
        dueDaysBeforeCheckIn: null,
      },
      damageDeposit: {
        amountType: "FIXED",
        value: "200",
        currency: "EUR",
        dueTiming: "AT_CHECK_IN",
        dueDaysBeforeCheckIn: null,
        returnDaysAfterCheckout: 10,
      },
    });

    expect(html).toContain('data-deposit-policy="advance-payment"');
    expect(html).toContain('data-deposit-policy="damage-deposit"');
    expect(html).toContain("Advance payment: 25% of the booking total.");
    expect(html).toContain("Damage deposit: €200.00.");
    expect(html).toContain("Due after the booking request is accepted.");
    expect(html).toContain("Due at check-in.");
    expect(html).toContain("data-deposit-policies-separate-note");
    expect(html).toContain("not added together");
  });

  it("says plainly when the host asks for neither, and when they never answered", () => {
    const neither = render({
      version: 2,
      status: "REVIEWED",
      advancePayment: null,
      damageDeposit: null,
    });
    expect(neither).toContain(
      "The host does not ask for an advance payment or a refundable damage deposit.",
    );
    expect(neither).toContain('data-deposit-policies-state="none"');

    const unanswered = render({
      version: 2,
      status: "UNANSWERED",
      advancePayment: null,
      damageDeposit: null,
    });
    expect(unanswered).toContain("has not said whether they ask for");
    expect(unanswered).toContain('data-deposit-policies-state="unanswered"');
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
        depositPolicies={{
          version: 2,
          status: "REVIEWED",
          advancePayment: {
            amountType: "PERCENTAGE",
            value: "25",
            currency: "EUR",
            dueTiming: "AFTER_ACCEPTANCE",
            dueDaysBeforeCheckIn: null,
            bankDetails: "DK5000400440116243",
            paymentLink: "https://pay.example/private",
          },
          damageDeposit: null,
        } as unknown as Parameters<typeof BookingReviewPaymentTerms>[0]["depositPolicies"]}
      />,
    );

    expect(html).toContain("Advance payment: 25% of the booking total.");
    expect(html).not.toContain("DK5000400440116243");
    expect(html).not.toContain("@host-payments");
    expect(html).not.toContain("https://pay.example/private");
    expect(html).not.toContain("href=");
  });

  it("formats a non-EUR fixed amount with the reading locale's own separators", () => {
    const de = {
      resolve: (_key: string, source: string) => ({ text: source, translated: false }),
      locale: "de",
    };
    const html = render(
      {
        version: 2,
        status: "REVIEWED",
        advancePayment: {
          amountType: "FIXED",
          value: "1250",
          currency: "MKD",
          dueTiming: "AFTER_ACCEPTANCE",
          dueDaysBeforeCheckIn: null,
        },
        damageDeposit: null,
      },
      de,
    );

    // German grouping conventions ("1.250") applied to the booking's own official
    // currency (MKD) — never converted, never defaulted to EUR.
    expect(html).toContain("1.250");
    expect(html).not.toMatch(/Advance payment: 1250 MKD/);
  });
});
