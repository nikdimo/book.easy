import { describe, expect, it } from "vitest";
import {
  buildSavedPaymentInstructions,
  parsePaymentInstructionStore,
  parsePaymentInstructionTemplates,
  paymentInstructionStoreSnapshot,
  paymentMethodDetailsReady,
  resolvePaymentInstructionsForMethod,
  validatePaymentMethodDetailsMap,
} from "@/lib/payments/payment-instruction-templates";

/**
 * V1 free text and V2 structured details share one stored blob.
 *
 * These tests pin the compatibility contract: a host who wrote a paragraph years ago
 * keeps it, a host who fills in fields gets checked values, and neither one's data is
 * ever silently rewritten into the other's shape.
 */
const LEGACY_V1 = {
  version: 1,
  templates: {
    BANK_TRANSFER_INTERNATIONAL: "IBAN DK5000400440116243\nSWIFT DABADKKK",
    PAYPAL: "PayPal: host@example.com",
  },
};

describe("V1 free text and V2 structured details side by side", () => {
  it("keeps reading a V1 blob exactly as it was written", () => {
    const store = parsePaymentInstructionStore(LEGACY_V1);

    expect(store.templates).toEqual(LEGACY_V1.templates);
    expect(store.details).toEqual({});
    // The original reader is unchanged for a V1 blob, so nothing that already
    // consumed it has to learn that V2 exists.
    expect(parsePaymentInstructionTemplates(LEGACY_V1)).toEqual(LEGACY_V1.templates);
  });

  it("reads free text out of a V2 blob through the same V1 reader", () => {
    const snapshot = paymentInstructionStoreSnapshot({
      templates: { PAYPAL: "PayPal: host@example.com" },
      details: {},
    });

    expect(snapshot.version).toBe(2);
    expect(parsePaymentInstructionTemplates(snapshot)).toEqual({
      PAYPAL: "PayPal: host@example.com",
    });
  });

  it("round-trips structured details without disturbing legacy text", () => {
    const details = validatePaymentMethodDetailsMap(
      {
        BANK_TRANSFER_INTERNATIONAL: {
          fields: {
            accountHolder: "Nikola Dimovski",
            bankName: "Komercijalna Banka",
            accountIdentifier: "DK5000400440116243",
            swiftBic: "DABADKKK",
          },
        },
      },
      ["BANK_TRANSFER_INTERNATIONAL", "PAYPAL"],
    );
    expect(details).toMatchObject({ success: true });
    if (!details.success) throw new Error("expected success");

    const snapshot = paymentInstructionStoreSnapshot({
      templates: { PAYPAL: "PayPal: host@example.com" },
      details: details.value,
    });
    const parsed = parsePaymentInstructionStore(snapshot);

    expect(parsed.templates).toEqual({ PAYPAL: "PayPal: host@example.com" });
    expect(parsed.details.BANK_TRANSFER_INTERNATIONAL?.fields).toEqual({
      accountHolder: "Nikola Dimovski",
      bankName: "Komercijalna Banka",
      accountIdentifier: "DK5000400440116243",
      swiftBic: "DABADKKK",
    });
  });

  it("prefers structured details over the same method's legacy text", () => {
    const store = parsePaymentInstructionStore({
      version: 2,
      templates: { PAYPAL: "PayPal: old@example.com" },
      details: {
        PAYPAL: {
          version: 2,
          fields: { providerIdentifier: "new@example.com" },
          updatedAt: "2026-08-27T10:00:00.000Z",
        },
      },
    });

    const resolved = resolvePaymentInstructionsForMethod(store, "PAYPAL");
    expect(resolved.kind).toBe("STRUCTURED");
    expect(resolved.kind === "STRUCTURED" && resolved.text).toBe(
      "PayPal email, handle, or link: new@example.com",
    );
  });

  it("falls back to legacy text for a method with no structured details", () => {
    const store = parsePaymentInstructionStore(LEGACY_V1);

    expect(resolvePaymentInstructionsForMethod(store, "PAYPAL")).toEqual({
      kind: "LEGACY_TEXT",
      text: "PayPal: host@example.com",
    });
    expect(resolvePaymentInstructionsForMethod(store, "WISE")).toEqual({ kind: "NONE" });
  });

  it("counts either format as ready to send", () => {
    const store = parsePaymentInstructionStore({
      version: 2,
      templates: { PAYPAL: "PayPal: host@example.com" },
      details: {
        BANK_TRANSFER_LOCAL_SEPA: {
          version: 2,
          fields: {
            accountHolder: "Nikola Dimovski",
            bankName: "Komercijalna Banka",
            accountIdentifier: "DK5000400440116243",
          },
          updatedAt: "2026-08-27T10:00:00.000Z",
        },
      },
    });

    expect(paymentMethodDetailsReady(store, "PAYPAL")).toBe(true);
    expect(paymentMethodDetailsReady(store, "BANK_TRANSFER_LOCAL_SEPA")).toBe(true);
    expect(paymentMethodDetailsReady(store, "WISE")).toBe(false);
  });

  it("never lets one method's details overwrite another's", () => {
    const previous = parsePaymentInstructionStore({
      version: 2,
      templates: { PAYPAL: "PayPal: host@example.com" },
      details: {
        WISE: {
          version: 2,
          fields: { providerIdentifier: "wise@example.com" },
          updatedAt: "2026-08-01T10:00:00.000Z",
        },
      },
    });

    // A save that only touches PayPal must carry Wise through untouched.
    const next = validatePaymentMethodDetailsMap(
      {
        ...previous.details,
        PAYPAL: { fields: { providerIdentifier: "paypal@example.com" } },
      },
      ["PAYPAL", "WISE"],
      previous.details,
    );
    expect(next).toMatchObject({ success: true });
    if (!next.success) throw new Error("expected success");

    expect(next.value.WISE?.fields).toEqual({ providerIdentifier: "wise@example.com" });
    // An untouched method keeps its timestamp, so nothing looks freshly edited.
    expect(next.value.WISE?.updatedAt).toBe("2026-08-01T10:00:00.000Z");
    expect(next.value.PAYPAL?.fields).toEqual({
      providerIdentifier: "paypal@example.com",
    });
  });

  it("refuses details for a method the listing does not accept", () => {
    expect(
      validatePaymentMethodDetailsMap(
        { WISE: { fields: { providerIdentifier: "wise@example.com" } } },
        ["PAYPAL"],
      ),
    ).toEqual({ success: false, issue: "METHOD_NOT_SELECTED" });
  });

  it("reports per-field problems so the editor can render them in place", () => {
    const result = validatePaymentMethodDetailsMap(
      {
        BANK_TRANSFER_LOCAL_SEPA: {
          fields: {
            accountHolder: "Nikola Dimovski",
            bankName: "Komercijalna Banka",
            accountIdentifier: "DK5000400440116244",
          },
        },
      },
      ["BANK_TRANSFER_LOCAL_SEPA"],
    );

    expect(result).toEqual({
      success: false,
      fieldIssues: {
        BANK_TRANSFER_LOCAL_SEPA: { accountIdentifier: "IBAN_CHECKSUM" },
      },
    });
  });

  it("builds one private message body from both formats", () => {
    const store = parsePaymentInstructionStore({
      version: 2,
      templates: { PAYPAL: "PayPal: host@example.com" },
      details: {
        BITCOIN: {
          version: 2,
          fields: {
            network: "BITCOIN",
            walletAddress: "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq",
          },
          updatedAt: "2026-08-27T10:00:00.000Z",
        },
      },
    });

    expect(buildSavedPaymentInstructions(store.templates, store.details)).toBe(
      [
        "PayPal",
        "PayPal: host@example.com",
        "",
        "Bitcoin",
        "Network: Bitcoin (on-chain)",
        "Public wallet address: bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq",
      ].join("\n"),
    );
  });
});
