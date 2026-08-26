import { describe, expect, it } from "vitest";
import {
  PAYMENT_METHOD_CODES,
  REVIEWED_PAYMENT_METHODS_EXPLANATION,
  UNANSWERED_PAYMENT_METHODS_FALLBACK,
  otherPaymentMethodLabelIssue,
  parsePaymentMethodsSnapshot,
  paymentMethodsFromRow,
  paymentMethodsSnapshot,
  validateListingPaymentMethods,
} from "@/lib/payments/payment-methods";

describe("payment-method preference validation", () => {
  it("accepts only the contract codes and stores them in canonical order", () => {
    const result = validateListingPaymentMethods({
      methods: ["OTHER", "PAYPAL", "CASH_AT_PROPERTY"],
      otherLabel: "  MobilePay  ",
    });

    expect(result).toEqual({
      success: true,
      value: {
        methods: ["CASH_AT_PROPERTY", "PAYPAL", "OTHER"],
        otherLabel: "MobilePay",
      },
    });
    expect(PAYMENT_METHOD_CODES).toHaveLength(9);
  });

  it.each([
    [{ methods: [], otherLabel: null }, { methods: "REQUIRED" }],
    [{ methods: "PAYPAL", otherLabel: null }, { methods: "NOT_AN_ARRAY" }],
    [{ methods: ["CARD"], otherLabel: null }, { methods: "UNKNOWN_METHOD" }],
    [
      { methods: ["PAYPAL", "PAYPAL"], otherLabel: null },
      { methods: "DUPLICATE_METHOD" },
    ],
    [
      { methods: ["ARRANGE_DIRECTLY", "PAYPAL"], otherLabel: null },
      { methods: "ARRANGE_DIRECTLY_EXCLUSIVE" },
    ],
    [{ methods: ["OTHER"], otherLabel: null }, { otherLabel: "REQUIRED" }],
    [
      { methods: ["PAYPAL"], otherLabel: "PayPal account" },
      { otherLabel: "NOT_ALLOWED" },
    ],
  ])("rejects an invalid payload %#", (input, issues) => {
    expect(validateListingPaymentMethods(input)).toEqual({ success: false, issues });
  });

  it("keeps ARRANGE_DIRECTLY as a valid deliberate answer", () => {
    expect(
      validateListingPaymentMethods({
        methods: ["ARRANGE_DIRECTLY"],
        otherLabel: null,
      }),
    ).toEqual({
      success: true,
      value: { methods: ["ARRANGE_DIRECTLY"], otherLabel: null },
    });
  });

  it.each([
    "https://pay.example",
    "pay.example.com",
    "pay.example.mk/path",
    "host@example.com",
    "@host-payments",
    "+45 12 34 56 78",
    "IBAN DE89 3704 0044 0532 0130 00",
    "DEUTDEFF",
    "Bank DEUTDEFF",
    "Account number 123456",
    "4111 1111 1111 1111",
    "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7k",
    "0x1234567890abcdef1234",
    "Pay to reception",
    "Please pay later",
    "Bring cash",
    "Contact the host",
    "Pay when accepted",
    "Send via private message",
    "Cash on arrival",
    "Refund guaranteed",
    "Payment protected",
    "Already paid",
    "MobilePay ✅",
    "After booking transfer",
    "line one\nline two",
    "12/29",
  ])("rejects private or instructional OTHER content: %s", (label) => {
    expect(otherPaymentMethodLabelIssue(label)).toBe(
      "PRIVATE_OR_INSTRUCTIONAL_CONTENT",
    );
  });

  it.each(["MobilePay", "Vipps", "Apple Pay", "Local payment app"])(
    "accepts a short method name: %s",
    (label) => expect(otherPaymentMethodLabelIssue(label)).toBeUndefined(),
  );

  it("enforces the 2–40 character OTHER bounds", () => {
    expect(otherPaymentMethodLabelIssue("X")).toBe("TOO_SHORT");
    expect(otherPaymentMethodLabelIssue("X".repeat(41))).toBe("TOO_LONG");
  });

  it("normalizes harmless repeated spaces before storage", () => {
    expect(
      validateListingPaymentMethods({
        methods: ["OTHER"],
        otherLabel: "Local   payment app",
      }),
    ).toEqual({
      success: true,
      value: { methods: ["OTHER"], otherLabel: "Local payment app" },
    });
  });
});

describe("payment-method read and snapshot shapes", () => {
  it("distinguishes an unanswered listing and provides the exact public fallback", () => {
    const row = {
      acceptedPaymentMethods: ["PAYPAL"],
      paymentMethodOther: null,
      paymentMethodsReviewedAt: null,
    };

    expect(paymentMethodsFromRow(row)).toEqual({
      status: "UNANSWERED",
      methods: [],
      otherLabel: null,
      reviewedAt: null,
      explanation: UNANSWERED_PAYMENT_METHODS_FALLBACK,
    });
    expect(paymentMethodsSnapshot(row)).toEqual({
      version: 1,
      status: "UNANSWERED",
      methods: [],
      otherLabel: null,
    });
  });

  it("returns a reviewed DTO with the exact delayed-instructions explanation", () => {
    const reviewedAt = new Date("2026-08-25T12:00:00.000Z");
    expect(
      paymentMethodsFromRow({
        acceptedPaymentMethods: ["PAYPAL", "WISE"],
        paymentMethodOther: null,
        paymentMethodsReviewedAt: reviewedAt,
      }),
    ).toEqual({
      status: "REVIEWED",
      methods: ["PAYPAL", "WISE"],
      otherLabel: null,
      reviewedAt,
      explanation: REVIEWED_PAYMENT_METHODS_EXPLANATION,
    });
  });

  it("reads valid V1 JSON and treats old or malformed values as no snapshot", () => {
    const snapshot = {
      version: 1,
      status: "REVIEWED",
      methods: ["WISE", "OTHER"],
      otherLabel: "MobilePay",
    };
    expect(parsePaymentMethodsSnapshot(snapshot)).toEqual(snapshot);
    expect(parsePaymentMethodsSnapshot(null)).toBeNull();
    expect(parsePaymentMethodsSnapshot({ version: 2 })).toBeNull();
    expect(
      parsePaymentMethodsSnapshot({
        version: 1,
        status: "REVIEWED",
        methods: ["ARRANGE_DIRECTLY", "PAYPAL"],
        otherLabel: null,
      }),
    ).toBeNull();
  });
});
