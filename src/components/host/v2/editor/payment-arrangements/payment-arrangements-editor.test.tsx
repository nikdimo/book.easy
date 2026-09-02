import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { PaymentArrangementsEditor } from "./payment-arrangements-editor";
import {
  PAYMENT_METHOD_CODES,
  paymentArrangementsAreComplete,
  paymentMethodDetailState,
  togglePaymentMethod,
  validateOtherPaymentLabel,
  type PaymentArrangementsDraft,
  type PaymentArrangementsValue,
} from "./payment-arrangements-model";

const BANK_DETAILS = {
  accountHolder: "Nikola Dimovski",
  bankName: "Komercijalna Banka",
  accountIdentifier: "DK5000400440116243",
  swiftBic: "DABADKKK",
};

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
    expect(html).toContain("Bank transfer (local or Europe)");
    expect(html).toContain("Bank transfer (other countries)");
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

  it("keeps every method's details out of the page until a drawer is opened", () => {
    const html = renderEditor({
      methodCodes: ["BANK_TRANSFER_INTERNATIONAL", "PAYPAL"],
      details: { BANK_TRANSFER_INTERNATIONAL: BANK_DETAILS },
      reviewedAt: "2026-08-24T10:00:00.000Z",
    });

    // No dialog, and no detail field anywhere in the list. The old inline panels
    // opened between the rows and pushed everything below them down the page.
    expect(html).not.toContain('role="dialog"');
    expect(html).not.toContain('id="payment-field-');
    expect(html).not.toContain("IBAN or account number");
    // What the row itself shows is masked down to a recognisable tail.
    expect(html).toContain("DK50 •••• 6243");
    expect(html).not.toContain("DK5000400440116243");
  });

  it("names details in the draft as added, never as saved, and empty ones as optional", () => {
    const html = renderEditor({
      methodCodes: ["BANK_TRANSFER_INTERNATIONAL", "PAYPAL"],
      details: { BANK_TRANSFER_INTERNATIONAL: BANK_DETAILS },
      reviewedAt: "2026-08-24T10:00:00.000Z",
    });

    // "Details added" and not "Details saved": this screen holds a local draft, and
    // only the section's own Save writes it. Calling a typed-but-unsaved IBAN saved is
    // a claim about the database that a host has no way to check.
    expect(html).toContain("Details added");
    expect(html).not.toContain("Details saved");
    // "Optional", because on this screen they genuinely are — never "Missing".
    expect(html).toContain("Optional");
    expect(html).not.toContain("Missing details");
    expect(html).toContain("Edit details");
    expect(html).toContain("Add details");
    // A selected method with no details yet is a normal state, not a validation
    // failure: nothing is flagged as an error and nothing demands a value.
    expect(html).not.toContain('role="alert"');
    expect(html).not.toContain("Fill this in");
    expect(html).not.toContain("Needs attention");
  });

  it("marks a method whose entered details do not validate as needing attention", () => {
    const draft: PaymentArrangementsDraft = {
      methodCodes: ["BANK_TRANSFER_INTERNATIONAL"],
      otherLabel: null,
      details: {
        // The check digits are wrong by one, which the existing IBAN validation catches.
        BANK_TRANSFER_INTERNATIONAL: {
          ...BANK_DETAILS,
          accountIdentifier: "DK5100400440116243",
        },
      },
    };

    expect(paymentMethodDetailState(draft, "BANK_TRANSFER_INTERNATIONAL")).toBe(
      "ATTENTION",
    );
    const html = renderEditor({ ...draft, reviewedAt: "2026-08-24T10:00:00.000Z" });
    expect(html).toContain("Needs attention");
    // The row says which method needs it; the reason stays behind the drawer, with the
    // field it belongs to.
    expect(html).not.toContain("fails its check digits");
    expect(html).toMatch(/type="submit"[^>]*disabled/);
  });

  it.each([
    ["NONE", {}],
    ["NONE", { BANK_TRANSFER_INTERNATIONAL: { accountHolder: "   " } }],
    ["ADDED", { BANK_TRANSFER_INTERNATIONAL: BANK_DETAILS }],
    // Started but unfinished is the existing rule's "not saveable yet": required fields
    // bite once anything is filled in, and the row must say so rather than imply it is
    // done. Clearing the method's fields entirely puts it back to Optional.
    ["ATTENTION", { BANK_TRANSFER_INTERNATIONAL: { accountHolder: "Nikola" } }],
  ] as const)("reports %s for the details a draft actually holds", (state, details) => {
    expect(
      paymentMethodDetailState(
        {
          methodCodes: ["BANK_TRANSFER_INTERNATIONAL"],
          otherLabel: null,
          details,
        },
        "BANK_TRANSFER_INTERNATIONAL",
      ),
    ).toBe(state);
  });

  it("counts a legacy paragraph as details the host already has", () => {
    expect(
      paymentMethodDetailState(
        {
          methodCodes: ["BANK_TRANSFER_INTERNATIONAL"],
          otherLabel: null,
          instructionTemplates: { BANK_TRANSFER_INTERNATIONAL: "IBAN DK50…" },
        },
        "BANK_TRANSFER_INTERNATIONAL",
      ),
    ).toBe("ADDED");
  });

  it("says nothing about details for a method that has none to give", () => {
    expect(
      paymentMethodDetailState(
        { methodCodes: ["ARRANGE_DIRECTLY"], otherLabel: null },
        "ARRANGE_DIRECTLY",
      ),
    ).toBe("NOT_APPLICABLE");
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

  it("keeps selecting a method and editing its details as two separate controls", () => {
    const html = renderEditor({
      methodCodes: ["PAYPAL"],
      reviewedAt: "2026-08-24T10:00:00.000Z",
    });

    // The label wraps text only — no button is nested inside it, so clicking the
    // method's name ticks the box and competes with nothing.
    expect(html).not.toMatch(/<label[^>]*>(?:(?!<\/label>)[\s\S])*<button/);
    expect(html).toContain('for="payment-method-paypal"');
    // The detail action is its own button, and announces that it opens a dialog.
    expect(html).toContain('aria-haspopup="dialog"');
    // The checkbox is described by its status, so a screen reader can tell selecting a
    // method apart from what its details currently are.
    expect(html).toContain('aria-describedby="payment-status-paypal"');
    expect(html).toContain('id="payment-status-paypal"');
    // And the button names its method, so ten "Edit details" are not indistinguishable.
    expect(html).toContain("PayPal</span>");
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

    // The row says so and the section's Save refuses, with the drawer still closed.
    expect(html).toContain("Needs attention");
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
