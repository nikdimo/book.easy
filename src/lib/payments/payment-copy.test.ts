import { describe, expect, it } from "vitest";
import {
  paymentCopyPayloadFromRow,
  paymentCopySourceFromRow,
  type PaymentCopyRow,
} from "@/lib/payments/payment-copy";
import { validatePaymentInstructionTemplates } from "@/lib/payments/payment-instruction-templates";

const REVIEWED_AT = new Date("2026-03-01T10:00:00.000Z");

function row(overrides: Partial<PaymentCopyRow> = {}): PaymentCopyRow {
  return {
    id: "listing-1",
    title: "Апартман Центар",
    acceptedPaymentMethods: ["CASH_AT_PROPERTY", "BANK_TRANSFER_LOCAL_SEPA"],
    paymentMethodOther: null,
    paymentMethodsReviewedAt: REVIEWED_AT,
    paymentInstructionTemplates: {
      version: 2,
      templates: {},
      details: {
        BANK_TRANSFER_LOCAL_SEPA: {
          version: 2,
          fields: {
            accountHolder: "Nikola Dimovski",
            bankName: "Komercijalna Banka",
            accountIdentifier: "MK07250120000058984",
          },
          updatedAt: REVIEWED_AT.toISOString(),
        },
      },
    },
    ...overrides,
  };
}

describe("payment answers offered as a copy source", () => {
  it("summarises a reviewed listing and counts the methods carrying details", () => {
    expect(paymentCopySourceFromRow(row())).toEqual({
      id: "listing-1",
      title: "Апартман Центар",
      methods: ["CASH_AT_PROPERTY", "BANK_TRANSFER_LOCAL_SEPA"],
      otherLabel: null,
      detailCount: 1,
      reviewedAt: REVIEWED_AT.toISOString(),
    });
  });

  it("counts a legacy free-text paragraph as details too", () => {
    const source = paymentCopySourceFromRow(
      row({
        paymentInstructionTemplates: {
          version: 1,
          templates: { CASH_AT_PROPERTY: "Pay me on arrival, exact change please." },
        },
      }),
    );

    expect(source?.detailCount).toBe(1);
  });

  it("offers nothing for a listing the host has never answered", () => {
    expect(paymentCopySourceFromRow(row({ paymentMethodsReviewedAt: null }))).toBeNull();
  });

  it("offers nothing when the stored methods do not survive review", () => {
    // OTHER without a usable label is dropped by `paymentMethodsFromRow`, which leaves
    // this listing with no answer at all rather than one the host could copy.
    expect(
      paymentCopySourceFromRow(
        row({ acceptedPaymentMethods: ["OTHER"], paymentMethodOther: null }),
      ),
    ).toBeNull();
  });
});

describe("the payload a copy hands to the target listing", () => {
  it("carries the methods and their private details across", () => {
    const payload = paymentCopyPayloadFromRow(row());

    expect(payload?.methods).toEqual([
      "CASH_AT_PROPERTY",
      "BANK_TRANSFER_LOCAL_SEPA",
    ]);
    expect(payload?.details.BANK_TRANSFER_LOCAL_SEPA?.fields).toEqual({
      accountHolder: "Nikola Dimovski",
      bankName: "Komercijalna Banka",
      accountIdentifier: "MK07250120000058984",
    });
  });

  it("drops stored text and details for methods the copy does not select", () => {
    // A source can hold both, because the editor keeps a method's text while the host
    // toggles it off and on. Carrying that across is what the save validator refuses.
    const payload = paymentCopyPayloadFromRow(
      row({
        acceptedPaymentMethods: ["CASH_AT_PROPERTY"],
        paymentInstructionTemplates: {
          version: 2,
          templates: { PAYPAL: "paypal.me/example" },
          details: {
            WISE: {
              version: 2,
              fields: { providerIdentifier: "wise.com/pay/example" },
              updatedAt: REVIEWED_AT.toISOString(),
            },
          },
        },
      }),
    );

    expect(payload?.instructionTemplates).toEqual({});
    expect(payload?.details).toEqual({});
  });

  it("produces templates the payment-methods save will accept", () => {
    const payload = paymentCopyPayloadFromRow(
      row({
        acceptedPaymentMethods: ["CASH_AT_PROPERTY", "PAYPAL"],
        paymentInstructionTemplates: {
          version: 1,
          templates: { PAYPAL: "paypal.me/example", WISE: "wise.com/pay/example" },
        },
      }),
    );

    expect(payload?.instructionTemplates).toEqual({ PAYPAL: "paypal.me/example" });
    expect(
      validatePaymentInstructionTemplates(
        payload?.instructionTemplates,
        payload?.methods ?? [],
      ).success,
    ).toBe(true);
  });

  it("refuses to copy from a listing with no reviewed answer", () => {
    expect(paymentCopyPayloadFromRow(row({ paymentMethodsReviewedAt: null }))).toBeNull();
  });
});
