import { describe, expect, it } from "vitest";
import {
  PAYMENT_DETAIL_FIELDS,
  formatPaymentDetailsAsText,
  maskPaymentDetailValue,
  maskedPaymentDetailsSummary,
  methodRequiresPaymentDetails,
  methodSupportsPaymentDetails,
  parsePaymentMethodDetails,
  parsePaymentMethodDetailsMap,
  paymentDetailRows,
  paymentDetailsAreComplete,
  samePaymentMethodDetailsMap,
  validatePaymentMethodDetails,
} from "./payment-details";

const BANK = {
  accountHolder: "Nikola Dimovski",
  bankName: "Komercijalna Banka",
  accountIdentifier: "MK07 2501 2000 0058 984",
  swiftBic: "kobsmk2x",
  reference: "Booking BE-4417",
};

describe("field definitions", () => {
  it("gives Arrange directly no fields at all", () => {
    expect(PAYMENT_DETAIL_FIELDS.ARRANGE_DIRECTLY).toEqual([]);
    expect(methodSupportsPaymentDetails("ARRANGE_DIRECTLY")).toBe(false);
    expect(validatePaymentMethodDetails("ARRANGE_DIRECTLY", { note: "x" })).toEqual({
      success: false,
      issues: { _: "NOT_ALLOWED" },
    });
  });

  it("gives Cash a note and no account coordinates", () => {
    expect(PAYMENT_DETAIL_FIELDS.CASH_AT_PROPERTY.map((f) => f.key)).toEqual(["note"]);
    expect(methodRequiresPaymentDetails("CASH_AT_PROPERTY")).toBe(false);
  });

  it("marks SWIFT/BIC required internationally and optional locally", () => {
    const local = PAYMENT_DETAIL_FIELDS.BANK_TRANSFER_LOCAL_SEPA.find(
      (f) => f.key === "swiftBic",
    );
    const international = PAYMENT_DETAIL_FIELDS.BANK_TRANSFER_INTERNATIONAL.find(
      (f) => f.key === "swiftBic",
    );
    expect(local?.required).toBe(false);
    expect(international?.required).toBe(true);
  });

  it("gives every method with fields exactly one summary field", () => {
    for (const [code, fields] of Object.entries(PAYMENT_DETAIL_FIELDS)) {
      if (fields.length === 0) continue;
      const summaries = fields.filter((field) => field.summary);
      expect(summaries.length, code).toBeLessThanOrEqual(1);
    }
  });
});

describe("validation and normalization", () => {
  it("normalizes an IBAN and uppercases a BIC on the way in", () => {
    const result = validatePaymentMethodDetails("BANK_TRANSFER_INTERNATIONAL", BANK);
    expect(result).toMatchObject({ success: true });
    if (!result.success) throw new Error("expected success");
    expect(result.value.accountIdentifier).toBe("MK07250120000058984");
    expect(result.value.swiftBic).toBe("KOBSMK2X");
  });

  it("treats a wholly empty method as valid — details can come later", () => {
    expect(
      validatePaymentMethodDetails("BANK_TRANSFER_INTERNATIONAL", {
        accountHolder: "",
        bankName: "   ",
      }),
    ).toEqual({ success: true, value: {} });
  });

  it("demands the required fields as soon as one value is filled in", () => {
    const result = validatePaymentMethodDetails("BANK_TRANSFER_INTERNATIONAL", {
      accountHolder: "Nikola Dimovski",
    });
    expect(result).toMatchObject({
      success: false,
      issues: {
        bankName: "REQUIRED",
        accountIdentifier: "REQUIRED",
        swiftBic: "REQUIRED",
      },
    });
  });

  it("rejects a failed IBAN checksum with its own message", () => {
    const result = validatePaymentMethodDetails("BANK_TRANSFER_LOCAL_SEPA", {
      ...BANK,
      accountIdentifier: "DK5000400440116244",
    });
    expect(result).toMatchObject({
      success: false,
      issues: { accountIdentifier: "IBAN_CHECKSUM" },
    });
  });

  it("rejects a card number in the account field, however it is spaced", () => {
    for (const pan of ["4111111111111111", "4111 1111 1111 1111", "4111-1111-1111-1111"]) {
      const result = validatePaymentMethodDetails("BANK_TRANSFER_LOCAL_SEPA", {
        ...BANK,
        accountIdentifier: pan,
      });
      expect(result, pan).toMatchObject({
        success: false,
        issues: { accountIdentifier: "LOOKS_LIKE_CARD" },
      });
    }
  });

  it("accepts a domestic account number where no IBAN exists", () => {
    const result = validatePaymentMethodDetails("BANK_TRANSFER_LOCAL_SEPA", {
      accountHolder: "Nikola Dimovski",
      bankName: "Komercijalna Banka",
      accountIdentifier: "300-0000000-33",
    });
    expect(result).toMatchObject({ success: true });
    if (!result.success) throw new Error("expected success");
    expect(result.value.accountIdentifier).toBe("300-0000000-33");
  });

  it("runs the credential scanner on notes and generic fields", () => {
    expect(
      validatePaymentMethodDetails("CASH_AT_PROPERTY", {
        note: "My card CVV is 123",
      }),
    ).toMatchObject({ success: false, issues: { note: "UNSAFE_CREDENTIALS" } });

    expect(
      validatePaymentMethodDetails("OTHER", {
        value: "seed phrase: abandon abandon",
      }),
    ).toMatchObject({ success: false, issues: { value: "UNSAFE_CREDENTIALS" } });

    expect(
      validatePaymentMethodDetails("OTHER", { value: "4111 1111 1111 1111" }),
    ).toMatchObject({ success: false, issues: { value: "LOOKS_LIKE_CARD" } });

    expect(
      validatePaymentMethodDetails("BANK_TRANSFER_LOCAL_SEPA", {
        ...BANK,
        reference: "PIN 4432",
      }),
    ).toMatchObject({ success: false, issues: { reference: "UNSAFE_CREDENTIALS" } });
  });

  it("requires HTTPS for a payment link", () => {
    expect(
      validatePaymentMethodDetails("HOST_SECURE_CARD_LINK", {
        paymentUrl: "http://pay.example.com/abc",
      }),
    ).toMatchObject({ success: false, issues: { paymentUrl: "NOT_HTTPS" } });

    expect(
      validatePaymentMethodDetails("HOST_SECURE_CARD_LINK", {
        paymentUrl: "https://pay.example.com/abc",
      }),
    ).toMatchObject({ success: true });
  });

  it("holds a provider link to the same HTTPS rule as a dedicated link field", () => {
    expect(
      validatePaymentMethodDetails("PAYPAL", {
        providerIdentifier: "http://paypal.me/nikola",
      }),
    ).toMatchObject({ success: false, issues: { providerIdentifier: "NOT_HTTPS" } });

    expect(
      validatePaymentMethodDetails("PAYPAL", { providerIdentifier: "host@example.com" }),
    ).toMatchObject({ success: true });
  });

  it("validates a wallet address against the chosen network", () => {
    expect(
      validatePaymentMethodDetails("BITCOIN", {
        network: "BITCOIN",
        walletAddress: "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq",
      }),
    ).toMatchObject({ success: true });

    expect(
      validatePaymentMethodDetails("BITCOIN", {
        network: "LIGHTNING",
        walletAddress: "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq",
      }),
    ).toMatchObject({ success: false, issues: { walletAddress: "INVALID_ADDRESS" } });

    expect(
      validatePaymentMethodDetails("BITCOIN", {
        network: "DOGECOIN",
        walletAddress: "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq",
      }),
    ).toMatchObject({ success: false, issues: { network: "UNKNOWN_OPTION" } });
  });

  it("refuses a seed phrase in the wallet field", () => {
    expect(
      validatePaymentMethodDetails("BITCOIN", {
        network: "BITCOIN",
        walletAddress:
          "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about",
      }),
    ).toMatchObject({ success: false, issues: { walletAddress: "LOOKS_LIKE_SECRET" } });
  });

  it("drops keys the method does not define instead of storing them", () => {
    const result = validatePaymentMethodDetails("PAYPAL", {
      providerIdentifier: "host@example.com",
      somethingElse: "4111111111111111",
    });
    expect(result).toMatchObject({ success: true });
    if (!result.success) throw new Error("expected success");
    expect(result.value).toEqual({ providerIdentifier: "host@example.com" });
  });

  it("collapses line breaks in single-line fields and keeps them in notes", () => {
    const result = validatePaymentMethodDetails("CASH_AT_PROPERTY", {
      note: "Ring the bell.\nSecond floor.",
    });
    expect(result).toMatchObject({ success: true });
    if (!result.success) throw new Error("expected success");
    expect(result.value.note).toBe("Ring the bell.\nSecond floor.");

    const name = validatePaymentMethodDetails("BANK_TRANSFER_LOCAL_SEPA", {
      ...BANK,
      accountHolder: "Nikola\nDimovski",
    });
    expect(name).toMatchObject({ success: true });
    if (!name.success) throw new Error("expected success");
    expect(name.value.accountHolder).toBe("Nikola Dimovski");
  });
});

describe("completeness", () => {
  it("is complete only when every required field has a value", () => {
    expect(paymentDetailsAreComplete("BANK_TRANSFER_INTERNATIONAL", BANK)).toBe(true);
    expect(
      paymentDetailsAreComplete("BANK_TRANSFER_INTERNATIONAL", {
        accountHolder: "Nikola Dimovski",
      }),
    ).toBe(false);
    expect(paymentDetailsAreComplete("BANK_TRANSFER_INTERNATIONAL", {})).toBe(false);
  });

  it("counts a note-only method as complete once the note is written", () => {
    expect(paymentDetailsAreComplete("CASH_AT_PROPERTY", { note: "Pay on arrival" })).toBe(
      true,
    );
    expect(paymentDetailsAreComplete("CASH_AT_PROPERTY", {})).toBe(false);
  });
});

describe("masking", () => {
  it("keeps only enough of an IBAN to recognise it", () => {
    expect(maskPaymentDetailValue("MK07 2501 2000 0058 984", "IBAN")).toBe(
      "MK07 •••• 8984",
    );
    expect(maskPaymentDetailValue("DK5000400440116243", "IBAN")).toBe("DK50 •••• 6243");
  });

  it("hides the local part of an email but keeps the domain recognisable", () => {
    expect(maskPaymentDetailValue("nikola@example.com", "EMAIL")).toBe(
      "n•••••@example.com",
    );
  });

  it("leaves a short handle alone and shortens a wallet address", () => {
    expect(maskPaymentDetailValue("@nikolad", "HANDLE")).toBe("@nikolad");
    expect(
      maskPaymentDetailValue("bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq", "ADDRESS"),
    ).toBe("bc1qar…5mdq");
  });

  it("reduces a payment link to its host", () => {
    expect(maskPaymentDetailValue("https://pay.example.com/abc", "URL")).toBe(
      "pay.example.com/…",
    );
  });

  it("summarises a saved method by its identifying field", () => {
    expect(
      maskedPaymentDetailsSummary("BANK_TRANSFER_INTERNATIONAL", {
        ...BANK,
        accountIdentifier: "DK5000400440116243",
      }),
    ).toBe("DK50 •••• 6243");
    expect(
      maskedPaymentDetailsSummary("PAYPAL", { providerIdentifier: "@nikolad" }),
    ).toBe("@nikolad");
    expect(maskedPaymentDetailsSummary("PAYPAL", {})).toBeNull();
    expect(maskedPaymentDetailsSummary("PAYPAL", undefined)).toBeNull();
  });
});

describe("rendering for the guest and the message", () => {
  it("returns only non-empty rows, in definition order", () => {
    const rows = paymentDetailRows("BANK_TRANSFER_INTERNATIONAL", {
      accountHolder: "Nikola Dimovski",
      accountIdentifier: "DK5000400440116243",
      swiftBic: "DABADKKK",
    });
    expect(rows.map((row) => row.key)).toEqual([
      "accountHolder",
      "accountIdentifier",
      "swiftBic",
    ]);
    expect(rows.every((row) => row.value.trim() !== "")).toBe(true);
  });

  it("marks which values a guest can copy", () => {
    const rows = paymentDetailRows("BANK_TRANSFER_INTERNATIONAL", {
      bankName: "Komercijalna Banka",
      accountIdentifier: "DK5000400440116243",
    });
    expect(rows.find((row) => row.key === "accountIdentifier")?.copyable).toBe(true);
    expect(rows.find((row) => row.key === "bankName")?.copyable).toBe(false);
  });

  it("renders a network code as a readable name", () => {
    const rows = paymentDetailRows("BITCOIN", {
      network: "LIGHTNING",
      walletAddress: "nikola@getalby.com",
    });
    expect(rows[0].value).toBe("Lightning");
  });

  it("formats the same fields as the private message body", () => {
    expect(
      formatPaymentDetailsAsText("PAYPAL", { providerIdentifier: "host@example.com" }),
    ).toBe("PayPal email, handle, or link: host@example.com");
  });
});

describe("stored shape", () => {
  it("reads back a well-formed V2 entry", () => {
    const parsed = parsePaymentMethodDetails("PAYPAL", {
      version: 2,
      fields: { providerIdentifier: "host@example.com" },
      updatedAt: "2026-08-27T10:00:00.000Z",
    });
    expect(parsed).toEqual({
      version: 2,
      fields: { providerIdentifier: "host@example.com" },
      updatedAt: "2026-08-27T10:00:00.000Z",
    });
  });

  it("refuses anything that is not a valid V2 entry", () => {
    expect(parsePaymentMethodDetails("PAYPAL", null)).toBeNull();
    expect(parsePaymentMethodDetails("PAYPAL", { version: 1, fields: {} })).toBeNull();
    expect(
      parsePaymentMethodDetails("PAYPAL", { version: 2, fields: {} }),
    ).toBeNull();
    expect(
      parsePaymentMethodDetails("PAYPAL", {
        version: 2,
        fields: { providerIdentifier: "4111111111111111" },
      }),
    ).toBeNull();
  });

  it("parses a map and drops unknown methods", () => {
    const map = parsePaymentMethodDetailsMap({
      PAYPAL: {
        version: 2,
        fields: { providerIdentifier: "host@example.com" },
        updatedAt: "2026-08-27T10:00:00.000Z",
      },
      NOT_A_METHOD: { version: 2, fields: { x: "y" } },
    });
    expect(Object.keys(map)).toEqual(["PAYPAL"]);
  });

  it("compares maps by their field values", () => {
    const left = parsePaymentMethodDetailsMap({
      PAYPAL: { version: 2, fields: { providerIdentifier: "a@b.com" }, updatedAt: "x" },
    });
    const right = parsePaymentMethodDetailsMap({
      PAYPAL: {
        version: 2,
        fields: { providerIdentifier: "a@b.com" },
        updatedAt: "2026-08-27T10:00:00.000Z",
      },
    });
    expect(samePaymentMethodDetailsMap(left, right)).toBe(true);
    expect(samePaymentMethodDetailsMap(left, {})).toBe(false);
  });
});
