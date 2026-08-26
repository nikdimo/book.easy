import { describe, expect, it } from "vitest";
import {
  buildSavedPaymentInstructions,
  parsePaymentInstructionTemplates,
  paymentInstructionTemplatesSnapshot,
  validatePaymentInstructionTemplates,
} from "@/lib/payments/payment-instruction-templates";

describe("private payment instruction templates", () => {
  it("accepts reusable bank and public Bitcoin coordinates for selected methods", () => {
    const result = validatePaymentInstructionTemplates(
      {
        BANK_TRANSFER_INTERNATIONAL:
          "Account holder: Host\nIBAN: DK5000400440116243\nSWIFT: DABADKKK",
        BITCOIN: "Bitcoin mainnet\nbc1qar0srr7xfkvy5l643lydnw9re59gtzzwf5mdq",
      },
      ["BANK_TRANSFER_INTERNATIONAL", "BITCOIN"],
    );

    expect(result.success).toBe(true);
  });

  it("rejects recovery credentials and details for unselected methods", () => {
    expect(
      validatePaymentInstructionTemplates(
        { BITCOIN: "Seed phrase: one two three four" },
        ["BITCOIN"],
      ),
    ).toEqual({ success: false, issue: "UNSAFE_CREDENTIALS" });
    expect(
      validatePaymentInstructionTemplates(
        { PAYPAL: "paypal.me/example" },
        ["WISE"],
      ),
    ).toEqual({ success: false, issue: "METHOD_NOT_SELECTED" });
    expect(
      validatePaymentInstructionTemplates(
        { PAYPAL: "x".repeat(700), WISE: "y".repeat(700) },
        ["PAYPAL", "WISE"],
      ),
    ).toEqual({ success: false, issue: "TOTAL_TOO_LONG" });
  });

  it("round-trips versioned storage and builds an editable host prefill", () => {
    const snapshot = paymentInstructionTemplatesSnapshot({
      BANK_TRANSFER_LOCAL_SEPA: "IBAN: DK5000400440116243",
      BITCOIN: "bc1qar0srr7xfkvy5l643lydnw9re59gtzzwf5mdq",
    });
    const parsed = parsePaymentInstructionTemplates(snapshot);

    expect(parsed).toEqual(snapshot.templates);
    expect(buildSavedPaymentInstructions(parsed)).toBe(
      "Local or SEPA bank transfer\nIBAN: DK5000400440116243\n\n" +
        "Bitcoin\nbc1qar0srr7xfkvy5l643lydnw9re59gtzzwf5mdq",
    );
  });
});
