import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  ACCEPTED_PAYMENT_METHOD_CODES,
  AcceptedPaymentMethods,
  acceptedPaymentMethodsFromSnapshot,
  safeOtherPaymentMethodLabel,
  toAcceptedPaymentMethodsPresentation,
  type PaymentMethodLabelResolver,
} from "@/components/booking/accepted-payment-methods";

const t: PaymentMethodLabelResolver = {
  resolve: (_key, source) => ({ text: source, translated: false }),
};

function render(
  data: Parameters<typeof AcceptedPaymentMethods>[0]["data"],
  props: Partial<Parameters<typeof AcceptedPaymentMethods>[0]> = {},
) {
  return renderToStaticMarkup(
    <AcceptedPaymentMethods t={t} data={data} {...props} />,
  );
}

describe("AcceptedPaymentMethods", () => {
  it("exports and presents every Phase 2 method code as a friendly name", () => {
    expect(ACCEPTED_PAYMENT_METHOD_CODES).toEqual([
      "CASH_AT_PROPERTY",
      "BANK_TRANSFER_LOCAL_SEPA",
      "BANK_TRANSFER_INTERNATIONAL",
      "PAYPAL",
      "REVOLUT",
      "WISE",
      "BITCOIN",
      "HOST_SECURE_CARD_LINK",
      "OTHER",
      "ARRANGE_DIRECTLY",
    ]);

    const html = render({
      reviewedAt: "2026-08-25T10:00:00.000Z",
      methodCodes: ACCEPTED_PAYMENT_METHOD_CODES.filter(
        (code) => code !== "ARRANGE_DIRECTLY",
      ),
      otherLabel: "MobilePay",
    });

    expect(html).toContain("Accepted payment methods");
    expect(html).toContain("Cash at the property");
    expect(html).toContain("Local or SEPA bank transfer");
    expect(html).toContain("International bank transfer");
    expect(html).toContain("PayPal");
    expect(html).toContain("Revolut");
    expect(html).toContain("Wise");
    expect(html).toContain("Bitcoin");
    expect(html).toContain("Secure card payment link from the host");
    expect(html).toContain("Other payment method: <span");
    expect(html).toContain("MobilePay");
    expect(html).toContain(
      "The host will share payment instructions after accepting your request.",
    );
    expect(html).toContain('data-payment-method="CASH_AT_PROPERTY"');
    expect(html).not.toContain("href=");
  });

  it("uses the exact public fallback for an unanswered listing without an empty heading or list", () => {
    const html = render({
      reviewedAt: null,
      methodCodes: [],
      otherLabel: null,
    });

    expect(html).toContain('data-payment-methods-state="unanswered"');
    expect(html).toContain(
      "Payment is arranged directly with the host after the booking request is accepted.",
    );
    expect(html).not.toContain("Accepted payment methods");
    expect(html).not.toContain("<ul");
  });

  it("treats a null old-booking snapshot as unavailable without inventing an accepted method", () => {
    const html = render(null, { appearance: "card" });

    expect(html).toContain('data-payment-methods-state="snapshot-unavailable"');
    expect(html).toContain(
      "Accepted payment methods were not recorded for this booking. Confirm the payment arrangement with the host.",
    );
    expect(html).not.toContain("Cash at the property");
    expect(html).not.toContain("PayPal");
    expect(html).not.toContain("Accepted payment methods</");
    expect(html).not.toContain("<ul");
  });

  it("renders ARRANGE_DIRECTLY as a sentence and suppresses conflicting methods", () => {
    const html = render({
      reviewedAt: new Date("2026-08-25T10:00:00.000Z"),
      methodCodes: ["PAYPAL", "ARRANGE_DIRECTLY", "CASH_AT_PROPERTY"],
      otherLabel: null,
    });

    expect(html).toContain("Payment is arranged directly with the host.");
    expect(html).not.toContain("PayPal");
    expect(html).not.toContain("Cash at the property");
    expect(html).not.toContain("<ul");
  });

  it.each([
    "https://pay.example/guest",
    "guest@example.com",
    "+45 12 34 56 78",
    "DK5000400440116243",
    "DABADKKK",
    "0x52908400098527886E0F7030069857D2E4169EE7",
    "@guest-payments",
    "Send payment now",
    "Refund guaranteed",
    "Payment protected",
    "12345",
  ])("never renders an unsafe OTHER label: %s", (otherLabel) => {
    const html = render({
      reviewedAt: "2026-08-25T10:00:00.000Z",
      methodCodes: ["OTHER"],
      otherLabel,
    });

    expect(html).toContain("Other payment method");
    expect(html).not.toContain(otherLabel);
  });

  it("keeps a safe OTHER label as host-authored public copy", () => {
    const html = render({
      reviewedAt: "2026-08-25T10:00:00.000Z",
      methodCodes: ["OTHER"],
      otherLabel: "  MobilePay  ",
    });

    expect(html).toContain("MobilePay");
    expect(html).toContain("data-user-generated-content");
    expect(html).toContain('translate="yes"');
  });

  it("shows no empty heading or list for malformed reviewed data", () => {
    const data = toAcceptedPaymentMethodsPresentation({
      reviewedAt: "2026-08-25T10:00:00.000Z",
      methodCodes: ["NOT_A_PHASE_TWO_CODE", "PAYPAL", "PAYPAL"],
    });
    const html = render({ ...data, methodCodes: [] });

    expect(data.methodCodes).toEqual(["PAYPAL"]);
    expect(html).toContain(
      "The host will share payment instructions after accepting your request.",
    );
    expect(html).not.toContain("Accepted payment methods");
    expect(html).not.toContain("<ul");
  });

  it("treats a non-timestamp reviewed value as unanswered", () => {
    const html = render({
      reviewedAt: "reviewed",
      methodCodes: ["PAYPAL"],
    });

    expect(html).toContain('data-payment-methods-state="unanswered"');
    expect(html).not.toContain("PayPal");
  });

  it("has no channel for operational payment data on a malformed runtime object", () => {
    const html = render({
      reviewedAt: "2026-08-25T10:00:00.000Z",
      methodCodes: ["PAYPAL"],
      otherLabel: null,
      bankDetails: "DK5000400440116243",
      paymentHandle: "@guest-payments",
      paymentUrl: "https://pay.example/guest",
      deposit: "50%",
      paymentState: "paid",
      refundClaim: "guaranteed",
      protectionClaim: "platform protected",
    } as Parameters<typeof AcceptedPaymentMethods>[0]["data"]);

    expect(html).toContain("PayPal");
    expect(html).not.toContain("DK5000400440116243");
    expect(html).not.toContain("@guest-payments");
    expect(html).not.toContain("https://pay.example/guest");
    expect(html).not.toContain("50%");
    expect(html).not.toContain("guaranteed");
    expect(html).not.toContain("platform protected");
  });

  it("marks reviewed fixed translations once while leaving OTHER public copy translatable", () => {
    const translated: PaymentMethodLabelResolver = {
      resolve: (_key, source) => ({ text: `Превод: ${source}`, translated: true }),
    };
    const html = renderToStaticMarkup(
      <AcceptedPaymentMethods
        t={translated}
        data={{
          reviewedAt: "2026-08-25T10:00:00.000Z",
          methodCodes: ["OTHER"],
          otherLabel: "MobilePay",
        }}
        headingAs="h3"
      />,
    );

    expect(html).toContain("<h3");
    expect(html).toContain('class="notranslate" translate="no"');
    expect(html).toContain('<span data-user-generated-content="true" translate="yes">MobilePay</span>');
  });
});

describe("safeOtherPaymentMethodLabel", () => {
  it("accepts a short public provider name and enforces the 2-40 character boundary", () => {
    expect(safeOtherPaymentMethodLabel("Vipps")).toBe("Vipps");
    expect(safeOtherPaymentMethodLabel("X")).toBeNull();
    expect(safeOtherPaymentMethodLabel("A".repeat(40))).toBe("A".repeat(40));
    expect(safeOtherPaymentMethodLabel("A".repeat(41))).toBeNull();
  });

  it("adapts reviewed, unanswered, and missing booking snapshots safely", () => {
    expect(
      acceptedPaymentMethodsFromSnapshot(
        { version: 1, status: "REVIEWED", methods: ["PAYPAL"], otherLabel: null },
        "2026-08-25T10:00:00.000Z",
      ),
    ).toEqual({
      reviewedAt: "2026-08-25T10:00:00.000Z",
      methodCodes: ["PAYPAL"],
      otherLabel: null,
    });
    expect(
      acceptedPaymentMethodsFromSnapshot(
        { version: 1, status: "UNANSWERED", methods: [], otherLabel: null },
        "2026-08-25T10:00:00.000Z",
      )?.reviewedAt,
    ).toBeNull();
    expect(acceptedPaymentMethodsFromSnapshot(null, new Date())).toBeNull();
  });
});
