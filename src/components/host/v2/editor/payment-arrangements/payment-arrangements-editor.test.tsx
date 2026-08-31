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

  it("states the privacy rule once instead of warning under every method", () => {
    const html = renderEditor();

    expect(html).toContain(
      "Guests see only the payment method names while browsing. Private details are shared only after you accept a booking.",
    );
    // The old design repeated a standing warning under every field. One notice, once.
    expect(html).not.toContain("Guests see names, not details");
    expect(
      (html.match(/Private details are shared only after you accept a booking/g) ?? [])
        .length,
    ).toBe(1);
  });

  it("distinguishes an unanswered listing and shows the required public fallback", () => {
    const html = renderEditor();

    expect(html).toContain("Not answered yet");
    expect(html).toContain(
      "Payment is arranged directly with the host after the booking request is accepted.",
    );
    expect(html).toContain("Choose at least one way guests can pay.");
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

  it("collapses every method's details until one is opened", () => {
    const html = renderEditor({
      methodCodes: ["BANK_TRANSFER_INTERNATIONAL", "PAYPAL"],
      details: {
        BANK_TRANSFER_INTERNATIONAL: {
          accountHolder: "Nikola Dimovski",
          bankName: "Komercijalna Banka",
          accountIdentifier: "DK5000400440116243",
          swiftBic: "DABADKKK",
        },
      },
      reviewedAt: "2026-08-24T10:00:00.000Z",
    });

    // Both rows are collapsed on first paint, so no panel is expanded.
    expect(html).not.toContain('aria-expanded="true"');
    expect((html.match(/aria-expanded="false"/g) ?? []).length).toBe(2);
    // Every details panel is hidden, one per selected method that has fields.
    expect((html.match(/id="payment-details-[a-z-]+"/g) ?? []).length).toBe(2);
    expect((html.match(/hidden=""/g) ?? []).length).toBe(2);
    // What the collapsed row itself shows is masked down to a recognisable tail.
    expect(html).toContain("DK50 •••• 6243");
  });

  it("names saved details as saved and unsaved ones as optional, never as missing", () => {
    const html = renderEditor({
      methodCodes: ["BANK_TRANSFER_INTERNATIONAL", "PAYPAL"],
      details: {
        BANK_TRANSFER_INTERNATIONAL: {
          accountHolder: "Nikola Dimovski",
          bankName: "Komercijalna Banka",
          accountIdentifier: "DK5000400440116243",
          swiftBic: "DABADKKK",
        },
      },
      reviewedAt: "2026-08-24T10:00:00.000Z",
    });

    expect(html).toContain("Details saved");
    // "Missing details" read as a blocker on a screen where these are genuinely
    // optional, and sent hosts hunting for a Next that was never waiting on them.
    expect(html).toContain("Optional details");
    expect(html).not.toContain("Missing details");
    expect(html).toContain("Edit details");
    expect(html).toContain("Add details");
    expect(html).not.toContain("Not ready");
    // A selected method with no details yet is a normal state, not a validation
    // failure: nothing is flagged as an error and nothing demands a value.
    expect(html).not.toContain('role="alert"');
    expect(html).not.toContain("Fill this in");
  });

  it("holds back the required message and the guest preview when the wizard asks it to", () => {
    // The wizard opens this screen with nothing selected on purpose, and shows its own
    // summary above. Red text before the host has been asked anything, and a second
    // restatement of the same answer half way down, are both its to suppress.
    const html = renderEditor(
      {},
      { showRequiredError: false, showGuestPreview: false, showHeader: false },
    );

    expect(html).not.toContain("Choose at least one way guests can pay.");
    expect(html).not.toContain('id="payment-methods-error"');
    expect(html).not.toContain('aria-invalid="true"');
    expect(html).not.toContain("What guests will see");
    expect(html).not.toContain("Payment arrangements");
    // The methods themselves are untouched: only the commentary around them moved.
    expect(html).toContain('id="payment-method-cash-at-property"');
  });

  it("keeps the checkbox and the disclosure button as separate controls", () => {
    const html = renderEditor({
      methodCodes: ["PAYPAL"],
      reviewedAt: "2026-08-24T10:00:00.000Z",
    });

    // The label wraps text only — no button is nested inside it.
    expect(html).not.toMatch(/<label[^>]*>(?:(?!<\/label>)[\s\S])*<button/);
    expect(html).toContain('aria-controls="payment-details-paypal"');
    expect(html).toContain('for="payment-method-paypal"');
  });

  it("offers a legacy paragraph for deliberate conversion instead of parsing it", () => {
    const html = renderEditor({
      methodCodes: ["BANK_TRANSFER_INTERNATIONAL"],
      instructionTemplates: {
        BANK_TRANSFER_INTERNATIONAL: "IBAN DK5000400440116243\nSWIFT DABADKKK",
      },
      reviewedAt: "2026-08-24T10:00:00.000Z",
    });

    expect(html).toContain("Legacy saved instructions");
    expect(html).toContain("Convert to structured fields");
    // The legacy text is shown verbatim, never split across the structured fields.
    expect(html).toContain("IBAN DK5000400440116243");
    expect(html).not.toContain('value="DK5000400440116243"');
  });

  it("blocks unsafe saved credentials before they reach the server", () => {
    const html = renderEditor({
      methodCodes: ["BITCOIN"],
      details: {
        BITCOIN: {
          network: "BITCOIN",
          walletAddress: "Seed phrase: one two three four",
        },
      },
      reviewedAt: "2026-08-24T10:00:00.000Z",
    });

    expect(html).toContain("not a valid address for the network you chose");
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
