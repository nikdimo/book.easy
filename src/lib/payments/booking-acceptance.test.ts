import { describe, expect, it } from "vitest";
import {
  acceptanceDecisionError,
  acceptanceDecisionRule,
  instructionsStatusForDecision,
  isBookingPaymentDecision,
  obligationTrackIsOpen,
  resolveRequestMethod,
  resolveStructuredDetails,
} from "./booking-acceptance";

/**
 * M1: one acceptance rule, read the same way everywhere.
 *
 * The web dialog, the mobile sheet, the acceptance workflow and the transaction that
 * writes the row all ask these functions the same question, which is what stops the
 * same booking from landing in three different payment states depending on where the
 * host happened to tap.
 */

const OPEN = {
  paymentStatus: "AWAITING_PAYMENT",
  advancePaymentStatus: "AWAITING_PAYMENT",
  damageDepositStatus: "AWAITING_DEPOSIT",
};

describe("acceptanceDecisionRule", () => {
  it("offers send-now and send-later, but not 'no instructions', for a bank transfer", () => {
    const rule = acceptanceDecisionRule({
      method: "BANK_TRANSFER_INTERNATIONAL",
      payableCount: 1,
    });

    expect(rule.allowed).toEqual(["SEND_NOW", "SEND_LATER"]);
    expect(rule.instructionsRequired).toBe(true);
    expect(rule.nothingToCollect).toBe(false);
    // A method that needs coordinates cannot answer "not needed", so the preselection
    // has to be the send.
    expect(rule.suggested).toBe("SEND_NOW");
  });

  it("allows 'no instructions' for money settled in person, and prefers it", () => {
    for (const method of ["CASH_AT_PROPERTY", "ARRANGE_DIRECTLY"] as const) {
      const rule = acceptanceDecisionRule({ method, payableCount: 2 });
      expect(rule.allowed, method).toEqual([
        "SEND_NOW",
        "SEND_LATER",
        "NO_INSTRUCTIONS",
      ]);
      expect(rule.instructionsRequired, method).toBe(false);
      expect(rule.suggested, method).toBe("NO_INSTRUCTIONS");
    }
  });

  it("leaves only 'no instructions' when there is nothing to collect", () => {
    // A zero-value stay, or one whose every track is already settled: there is no
    // request to send now and nothing to promise for later.
    const rule = acceptanceDecisionRule({
      method: "BANK_TRANSFER_INTERNATIONAL",
      payableCount: 0,
    });

    expect(rule.allowed).toEqual(["NO_INSTRUCTIONS"]);
    expect(rule.nothingToCollect).toBe(true);
    expect(rule.instructionsRequired).toBe(false);
    expect(rule.suggested).toBe("NO_INSTRUCTIONS");
  });

  it("does not treat a missing choice as proof that instructions are unnecessary", () => {
    const rule = acceptanceDecisionRule({
      method: null,
      payableCount: 1,
      availableMethods: ["BANK_TRANSFER_INTERNATIONAL", "CASH_AT_PROPERTY"],
    });

    expect(rule.allowed).toEqual(["SEND_NOW", "SEND_LATER"]);
    expect(rule.instructionsRequired).toBe(true);
  });

  it("keeps explicit no-instructions available for a legacy booking with no methods", () => {
    const rule = acceptanceDecisionRule({
      method: null,
      payableCount: 1,
      availableMethods: [],
    });

    expect(rule.allowed).toContain("NO_INSTRUCTIONS");
    expect(rule.suggested).toBe("NO_INSTRUCTIONS");
  });

  it("never proposes an answer it does not allow", () => {
    for (const method of [null, "CASH_AT_PROPERTY", "PAYPAL"] as const) {
      for (const payableCount of [0, 1]) {
        const rule = acceptanceDecisionRule({ method, payableCount });
        expect(rule.allowed.length, `${method}/${payableCount}`).toBeGreaterThan(0);
        expect(rule.allowed, `${method}/${payableCount}`).toContain(rule.suggested);
      }
    }
  });
});

describe("acceptanceDecisionError", () => {
  const bankRule = acceptanceDecisionRule({
    method: "BANK_TRANSFER_INTERNATIONAL",
    payableCount: 1,
  });

  it("rejects a missing decision rather than picking one", () => {
    for (const missing of [undefined, null, "", "MAYBE", 1, {}]) {
      expect(acceptanceDecisionError(missing, bankRule)).toMatch(/Choose what happens/);
    }
  });

  it("rejects 'no instructions' for a method that needs them", () => {
    expect(acceptanceDecisionError("NO_INSTRUCTIONS", bankRule)).toMatch(
      /send now or send later/,
    );
  });

  it("rejects a send when nothing is owed", () => {
    const empty = acceptanceDecisionRule({ method: "PAYPAL", payableCount: 0 });
    expect(acceptanceDecisionError("SEND_NOW", empty)).toMatch(/nothing left to collect/);
    expect(acceptanceDecisionError("SEND_LATER", empty)).toMatch(/nothing left to collect/);
    expect(acceptanceDecisionError("NO_INSTRUCTIONS", empty)).toBeNull();
  });

  it("accepts every decision the rule allows", () => {
    for (const decision of bankRule.allowed) {
      expect(acceptanceDecisionError(decision, bankRule), decision).toBeNull();
    }
  });
});

describe("instructionsStatusForDecision", () => {
  it("keeps a send-later visible and a no-instructions settled", () => {
    // PENDING is what puts SEND_PAYMENT_INSTRUCTIONS on the host's action queue.
    expect(instructionsStatusForDecision("SEND_NOW")).toBe("PENDING");
    expect(instructionsStatusForDecision("SEND_LATER")).toBe("PENDING");
    expect(instructionsStatusForDecision("NO_INSTRUCTIONS")).toBe("NOT_NEEDED");
  });
});

describe("isBookingPaymentDecision", () => {
  it("admits the three answers and nothing else", () => {
    expect(isBookingPaymentDecision("SEND_NOW")).toBe(true);
    expect(isBookingPaymentDecision("SEND_LATER")).toBe(true);
    expect(isBookingPaymentDecision("NO_INSTRUCTIONS")).toBe(true);
    expect(isBookingPaymentDecision("send_now")).toBe(false);
    expect(isBookingPaymentDecision(undefined)).toBe(false);
  });
});

describe("obligationTrackIsOpen", () => {
  it("reads each obligation against its own track", () => {
    expect(obligationTrackIsOpen("ADVANCE_PAYMENT", OPEN)).toBe(true);
    expect(obligationTrackIsOpen("DAMAGE_DEPOSIT", OPEN)).toBe(true);
    expect(obligationTrackIsOpen("ACCOMMODATION_BALANCE", OPEN)).toBe(true);
  });

  it("treats a NOT_REQUIRED track as closed without touching its neighbours", () => {
    const advanceWaived = { ...OPEN, advancePaymentStatus: "NOT_REQUIRED" };
    expect(obligationTrackIsOpen("ADVANCE_PAYMENT", advanceWaived)).toBe(false);
    expect(obligationTrackIsOpen("DAMAGE_DEPOSIT", advanceWaived)).toBe(true);
    expect(obligationTrackIsOpen("ACCOMMODATION_BALANCE", advanceWaived)).toBe(true);

    const depositSettled = { ...OPEN, damageDepositStatus: "NOT_REQUIRED" };
    expect(obligationTrackIsOpen("DAMAGE_DEPOSIT", depositSettled)).toBe(false);
    expect(obligationTrackIsOpen("ADVANCE_PAYMENT", depositSettled)).toBe(true);
  });

  it("keeps a reported track open — reported is not settled", () => {
    expect(
      obligationTrackIsOpen("ADVANCE_PAYMENT", {
        ...OPEN,
        advancePaymentStatus: "PAYMENT_REPORTED",
      }),
    ).toBe(true);
  });
});

describe("resolveRequestMethod", () => {
  it("keeps the guest's own choice and ignores a posted one", () => {
    expect(
      resolveRequestMethod(
        {
          selectedPaymentMethod: "PAYPAL",
          availableMethods: ["PAYPAL", "BANK_TRANSFER_INTERNATIONAL"],
        },
        "BANK_TRANSFER_INTERNATIONAL",
      ),
    ).toBe("PAYPAL");
  });

  it("consults a posted method only for a booking that recorded none", () => {
    const booking = {
      selectedPaymentMethod: null,
      availableMethods: ["PAYPAL"] as const,
    };
    expect(resolveRequestMethod(booking, "PAYPAL")).toBe("PAYPAL");
    // Not on this booking's own frozen list, so it is not a method it may use.
    expect(resolveRequestMethod(booking, "BITCOIN")).toBeNull();
    expect(resolveRequestMethod(booking, null)).toBeNull();
  });
});

describe("resolveStructuredDetails", () => {
  it("passes complete fields through for a method that takes them", () => {
    const resolved = resolveStructuredDetails("PAYPAL", {
      providerIdentifier: "host@example.test",
    });
    expect(resolved).toEqual({ fields: { providerIdentifier: "host@example.test" } });
  });

  it("reads blank fields as no structured data at all", () => {
    expect(resolveStructuredDetails("PAYPAL", { providerIdentifier: "  " })).toBeNull();
    expect(resolveStructuredDetails("PAYPAL", undefined)).toBeNull();
  });

  it("refuses details against a method that does not take them", () => {
    // ARRANGE_DIRECTLY carries no fields at all — it is the "we will sort this out"
    // answer, so anything posted against it is a client that has gone wrong.
    const resolved = resolveStructuredDetails("ARRANGE_DIRECTLY", {
      providerIdentifier: "host@example.test",
    });
    expect(resolved).toEqual({ error: expect.stringMatching(/does not take/) });
  });

  it("refuses an incomplete set for a method that requires more", () => {
    // Missing IBAN and bank name. Whichever guard catches it, the send does not
    // proceed on half a set of coordinates — and the message names no field value.
    const resolved = resolveStructuredDetails("BANK_TRANSFER_INTERNATIONAL", {
      accountHolder: "Test Host",
    });
    expect(resolved).toEqual({
      error: expect.stringMatching(/Check the payment details|every required/),
    });
    expect(JSON.stringify(resolved)).not.toContain("Test Host");
  });
});
