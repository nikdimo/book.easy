import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { PaymentArrangementsEditor } from "./payment-arrangements-editor";
import {
  PAYMENT_METHOD_CODES,
  paymentArrangementsAreComplete,
  togglePaymentMethod,
  validateOtherPaymentLabel,
  type PaymentArrangementsValue,
} from "./payment-arrangements-model";

function renderEditor(
  value: Partial<PaymentArrangementsValue> = {},
  props: Partial<React.ComponentProps<typeof PaymentArrangementsEditor>> = {},
) {
  return renderToStaticMarkup(
    <PaymentArrangementsEditor
      initialValue={{
        methodCodes: [],
        otherLabel: null,
        reviewedAt: null,
        ...value,
      }}
      onSave={vi.fn()}
      {...props}
    />,
  );
}

describe("payment arrangement selection model", () => {
  it("exposes exactly the shared Phase 2 method codes", () => {
    expect(PAYMENT_METHOD_CODES).toEqual([
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
  });

  it("makes arrange directly exclusive in both directions", () => {
    expect(
      togglePaymentMethod(["CASH_AT_PROPERTY", "PAYPAL"], "ARRANGE_DIRECTLY", true),
    ).toEqual(["ARRANGE_DIRECTLY"]);
    expect(togglePaymentMethod(["ARRANGE_DIRECTLY"], "WISE", true)).toEqual(["WISE"]);
    expect(togglePaymentMethod(["ARRANGE_DIRECTLY"], "ARRANGE_DIRECTLY", false)).toEqual(
      [],
    );
  });

  it("treats every valid selection, including arrange directly alone, as complete", () => {
    expect(
      paymentArrangementsAreComplete({
        methodCodes: ["ARRANGE_DIRECTLY"],
        otherLabel: null,
      }),
    ).toBe(true);
    expect(
      paymentArrangementsAreComplete({
        methodCodes: ["CASH_AT_PROPERTY", "WISE"],
        otherLabel: null,
      }),
    ).toBe(true);
    expect(paymentArrangementsAreComplete({ methodCodes: [], otherLabel: null })).toBe(
      false,
    );
  });
});

describe("OTHER public label guidance", () => {
  it("accepts short method names", () => {
    for (const label of ["MobilePay", "Apple Pay", "M-Pesa", "Invoice"]) {
      expect(validateOtherPaymentLabel(label)).toBeNull();
    }
  });

  it("requires a trimmed 2–40 character label", () => {
    expect(validateOtherPaymentLabel("  ")).toBe("required");
    expect(validateOtherPaymentLabel("A")).toBe("too_short");
    expect(validateOtherPaymentLabel("x".repeat(41))).toBe("too_long");
  });

  it.each([
    "https://pay.example.com/host",
    "pay.example.dk/host",
    "host@example.com",
    "+45 12 34 56 78",
    "@host-payments",
    "IBAN DK5000400440116243",
    "SWIFT DABADKKK",
    "Account number 1234 5678",
    "bc1qar0srr7xfkvy5l643lydnw9re59gtzzwf5mdq",
  ])("blocks obvious contact or payment details: %s", (label) => {
    expect(validateOtherPaymentLabel(label)).not.toBeNull();
  });

  it.each(["Send to the host", "Pay at reception", "Contact me on arrival"])(
    "blocks instruction-like copy: %s",
    (label) => {
      expect(validateOtherPaymentLabel(label)).toBe("payment_instructions");
    },
  );

  it("makes OTHER incomplete until its label is safe", () => {
    expect(
      paymentArrangementsAreComplete({ methodCodes: ["OTHER"], otherLabel: "" }),
    ).toBe(false);
    expect(
      paymentArrangementsAreComplete({
        methodCodes: ["CASH_AT_PROPERTY", "OTHER"],
        otherLabel: "pay me at reception",
      }),
    ).toBe(false);
    expect(
      paymentArrangementsAreComplete({
        methodCodes: ["OTHER"],
        otherLabel: "MobilePay",
      }),
    ).toBe(true);
  });
});

describe("PaymentArrangementsEditor", () => {
  it("renders every method as a keyboard-operable native checkbox", () => {
    const html = renderEditor();

    expect((html.match(/type="checkbox"/g) ?? []).length).toBe(PAYMENT_METHOD_CODES.length);
    for (const code of PAYMENT_METHOD_CODES) {
      expect(html).toContain(`value="${code}"`);
    }
    expect(html).toContain("Cash at the property");
    expect(html).toContain("Local or SEPA bank transfer");
    expect(html).toContain("International bank transfer");
    expect(html).toContain("Secure card payment link from host");
    expect(html).toContain("Arrange directly after the booking request");
  });

  it("plainly limits public content and warns against sensitive details", () => {
    const html = renderEditor();

    expect(html).toContain("Guests see names, not details");
    expect(html).toContain("Only selected method names appear publicly.");
    expect(html).toContain("Saved account or wallet details stay private");
    expect(html).toContain("Never enter card numbers, CVV, PIN, passwords");
    expect(html).toContain("seed phrases, private keys, or recovery information");
  });

  it("distinguishes an unanswered listing and shows the required public fallback", () => {
    const html = renderEditor();

    expect(html).toContain("Not answered yet");
    expect(html).toContain(
      "Payment is arranged directly with the host after the booking request is accepted.",
    );
    expect(html).toContain("Choose at least one payment method to complete this section.");
  });

  it("shows an existing reviewed answer and the reviewed public explanation", () => {
    const html = renderEditor({
      methodCodes: ["CASH_AT_PROPERTY", "PAYPAL"],
      reviewedAt: "2026-08-24T10:00:00.000Z",
    });

    expect(html).toContain("Payment methods saved");
    expect(html).toContain("checked");
    expect(html).toContain(
      "The host will share payment instructions after accepting your request.",
    );
    expect(html).not.toContain(
      "Payment is arranged directly with the host after the booking request is accepted.",
    );
  });

  it("lets a host deliberately confirm a valid legacy answer with no reviewed timestamp", () => {
    const html = renderEditor({
      methodCodes: ["ARRANGE_DIRECTLY"],
      reviewedAt: null,
    });

    expect(html).toContain("Not answered yet");
    expect(html).not.toMatch(/type="submit"[^>]*disabled/);
  });

  it("shows the constrained public label field only when OTHER is selected", () => {
    const withoutOther = renderEditor({
      methodCodes: ["WISE"],
      reviewedAt: "2026-08-24T10:00:00.000Z",
    });
    const withOther = renderEditor({
      methodCodes: ["OTHER"],
      otherLabel: "MobilePay",
      reviewedAt: "2026-08-24T10:00:00.000Z",
    });

    expect(withoutOther).not.toContain('id="other-payment-method"');
    expect(withOther).toContain('id="other-payment-method"');
    expect(withOther).toContain('minLength="2"');
    expect(withOther).toContain('maxLength="40"');
    expect(withOther).toContain('value="MobilePay"');
  });

  it("shows and preserves private reusable instructions for selected methods", () => {
    const html = renderEditor({
      methodCodes: ["BANK_TRANSFER_INTERNATIONAL", "BITCOIN"],
      instructionTemplates: {
        BANK_TRANSFER_INTERNATIONAL: "IBAN DK5000400440116243\nSWIFT DABADKKK",
        BITCOIN: "bc1qar0srr7xfkvy5l643lydnw9re59gtzzwf5mdq",
      },
      reviewedAt: "2026-08-24T10:00:00.000Z",
    });

    expect(html).toContain("Saved private payment instructions");
    expect(html).toContain("IBAN DK5000400440116243");
    expect(html).toContain("SWIFT DABADKKK");
    expect(html).toContain("bc1qar0srr7xfkvy5l643lydnw9re59gtzzwf5mdq");
    expect(html).toContain("Guests cannot see this while browsing");
  });

  it("blocks unsafe saved credentials before they reach the server", () => {
    const html = renderEditor({
      methodCodes: ["BITCOIN"],
      instructionTemplates: { BITCOIN: "Seed phrase: one two three four" },
      reviewedAt: "2026-08-24T10:00:00.000Z",
    });

    expect(html).toContain("Remove card details, passwords, PINs, seed phrases");
    expect(html).toMatch(/type="submit"[^>]*disabled/);
  });

  it("visibly blocks a sensitive OTHER label and disables saving", () => {
    const html = renderEditor({
      methodCodes: ["OTHER"],
      otherLabel: "host@example.com",
      reviewedAt: "2026-08-24T10:00:00.000Z",
    });

    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain("That looks like contact or payment details.");
    expect(html).toMatch(/type="submit"[^>]*disabled/);
  });

  it.each([
    ["pending", "Changes ready to save"],
    ["saving", "Saving payment methods…"],
    ["saved", "Payment methods saved"],
    ["error", "Not saved. Check your connection and try again."],
  ] as const)("renders the %s save state accessibly", (saveState, copy) => {
    const html = renderEditor(
      { methodCodes: ["WISE"], reviewedAt: "2026-08-24T10:00:00.000Z" },
      { saveState },
    );

    expect(html).toContain(copy);
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
  });

  it("disables all controls while saving", () => {
    const html = renderEditor(
      { methodCodes: ["WISE"], reviewedAt: "2026-08-24T10:00:00.000Z" },
      { saveState: "saving" },
    );

    expect(html).toContain("<fieldset disabled=\"\"");
    expect(html).toMatch(/type="submit"[^>]*disabled/);
  });
});
