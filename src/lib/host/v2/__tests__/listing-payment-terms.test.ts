import { describe, expect, it } from "vitest";
import {
  CANCELLATION_ANCHOR_ID,
  CUSTOM_CANCELLATION_FIELD_ID,
  DEPOSITS_ANCHOR_ID,
  FREE_CANCELLATION_PRESET_DAYS,
  PAYMENT_METHODS_ANCHOR_ID,
  SAFE_DEFAULT_CANCELLATION_CHOICE,
  cancellationAnswerFromDraft,
  cancellationDaysValue,
  cancellationIsValid,
  cancellationSummaryDays,
  depositAnswerFromDraft,
  paymentTermsDraftPatch,
  paymentTermsIssues,
  type CancellationAnswer,
  type PaymentTermsAnswer,
} from "@/lib/host/v2/listing-payment-terms";
import { emptyDepositPoliciesDraft } from "@/lib/host/v2/listing-deposit-draft";
import type { ListingDraftData } from "@/lib/types/listing-draft";

/** A complete advance-payment answer, in the currency the draft prices in. */
function advanceAnswer(currency = "EUR") {
  const deposits = emptyDepositPoliciesDraft();
  deposits.currency = currency;
  deposits.advancePayment = {
    enabled: true,
    amountType: "PERCENTAGE",
    value: "20",
    dueTiming: "AFTER_ACCEPTANCE",
    dueDaysBeforeCheckIn: null,
  };
  return deposits;
}

/** A complete damage-deposit answer. */
function damageAnswer(currency = "EUR") {
  const deposits = emptyDepositPoliciesDraft();
  deposits.currency = currency;
  deposits.damageDeposit = {
    enabled: true,
    amountType: "FIXED",
    value: "200",
    dueTiming: "AT_CHECK_IN",
    dueDaysBeforeCheckIn: null,
    returnDaysAfterCheckout: 7,
  };
  return deposits;
}

/** Both questions answered yes, in one currency. */
function bothAnswers(currency = "EUR") {
  return {
    currency,
    advancePayment: advanceAnswer(currency).advancePayment,
    damageDeposit: damageAnswer(currency).damageDeposit,
  };
}

function answer(overrides: Partial<PaymentTermsAnswer> = {}): PaymentTermsAnswer {
  return {
    methods: { methodCodes: ["PAYPAL"], otherLabel: null },
    deposits: emptyDepositPoliciesDraft(),
    currency: "EUR",
    cancellation: { choice: "0", customDays: "" },
    ...overrides,
  };
}

describe("the safe defaults a never-asked draft opens on", () => {
  it("offers a full refund right up to check-in", () => {
    expect(SAFE_DEFAULT_CANCELLATION_CHOICE).toBe("0");
    expect(cancellationAnswerFromDraft(undefined)).toEqual({
      choice: "0",
      customDays: "",
    });
    // "" is how every draft created before this question existed stores it.
    expect(cancellationAnswerFromDraft("")).toEqual({ choice: "0", customDays: "" });
    expect(cancellationAnswerFromDraft("   ")).toEqual({ choice: "0", customDays: "" });
  });

  it("asks for neither an advance payment nor a damage deposit", () => {
    const { draft, explicit, currencyChanged } = depositAnswerFromDraft({});

    expect(draft.advancePayment.enabled).toBe(false);
    expect(draft.damageDeposit.enabled).toBe(false);
    // The form shows "no" while the draft still says nothing. Only continuing from the
    // screen writes it, which is what keeps publishing able to tell the two apart.
    expect(explicit).toBe(false);
    expect(currencyChanged).toBe(false);
  });

  it("lets a fresh draft continue on nothing but a payment method", () => {
    expect(paymentTermsIssues(answer())).toEqual([]);
  });
});

describe("answers an existing draft already carries", () => {
  it("keeps an explicit 'neither' rather than re-asking", () => {
    const data = { depositPolicies: emptyDepositPoliciesDraft() } as ListingDraftData;
    const stored = depositAnswerFromDraft(data);

    expect(stored.explicit).toBe(true);
    expect(stored.draft.advancePayment.enabled).toBe(false);
    expect(stored.draft.damageDeposit.enabled).toBe(false);
  });

  it("renders a saved advance payment exactly as it was saved", () => {
    const depositPolicies = advanceAnswer();
    const stored = depositAnswerFromDraft({
      currency: "EUR",
      depositPolicies,
    } as ListingDraftData);

    expect(stored.draft.advancePayment).toEqual(depositPolicies.advancePayment);
    expect(stored.draft.damageDeposit.enabled).toBe(false);
    expect(stored.currencyChanged).toBe(false);
  });

  it("renders a saved damage deposit exactly as it was saved", () => {
    const depositPolicies = damageAnswer();
    const stored = depositAnswerFromDraft({
      currency: "EUR",
      depositPolicies,
    } as ListingDraftData);

    expect(stored.draft.damageDeposit).toEqual(depositPolicies.damageDeposit);
    expect(stored.draft.advancePayment.enabled).toBe(false);
  });

  it("renders both together", () => {
    const depositPolicies = bothAnswers();
    const stored = depositAnswerFromDraft({
      currency: "EUR",
      depositPolicies,
    } as ListingDraftData);

    expect(stored.draft.advancePayment.enabled).toBe(true);
    expect(stored.draft.damageDeposit.enabled).toBe(true);
    expect(paymentTermsIssues(answer({ deposits: stored.draft }))).toEqual([]);
  });

  it("never replaces a saved amount with the default when the currency moved", () => {
    // The old behaviour emptied the form here, so the screen showed a host their own
    // "20% advance" back as "Not required" — and one press of Continue saved that.
    const stored = depositAnswerFromDraft({
      currency: "MKD",
      depositPolicies: advanceAnswer("EUR"),
    } as ListingDraftData);

    expect(stored.draft.advancePayment.enabled).toBe(true);
    expect(stored.draft.advancePayment.value).toBe("20");
    // Flagged instead, so the screen can say what changed before the host continues.
    expect(stored.currencyChanged).toBe(true);
  });

  it("re-stamps the reviewed currency when the host continues", () => {
    const stored = depositAnswerFromDraft({
      currency: "MKD",
      depositPolicies: advanceAnswer("EUR"),
    } as ListingDraftData);

    const patch = paymentTermsDraftPatch(
      answer({ deposits: stored.draft, currency: "MKD" }),
    );

    expect(patch.depositPolicies.currency).toBe("MKD");
    expect(patch.depositPolicies.advancePayment.value).toBe("20");
  });
});

describe("the cancellation deadline", () => {
  it("offers the four presets the cards are built from", () => {
    expect(FREE_CANCELLATION_PRESET_DAYS).toEqual([0, 3, 7, 14]);
  });

  it.each(FREE_CANCELLATION_PRESET_DAYS)("reads %s back as its own card", (days) => {
    const parsed = cancellationAnswerFromDraft(String(days));

    expect(parsed).toEqual({ choice: String(days), customDays: "" });
    expect(cancellationDaysValue(parsed)).toBe(String(days));
    expect(cancellationSummaryDays(parsed)).toBe(days);
    expect(paymentTermsIssues(answer({ cancellation: parsed }))).toEqual([]);
  });

  it("puts a value that is not a preset into the custom field", () => {
    const parsed = cancellationAnswerFromDraft("30");

    expect(parsed).toEqual({ choice: "CUSTOM", customDays: "30" });
    expect(cancellationIsValid(parsed)).toBe(true);
    expect(cancellationSummaryDays(parsed)).toBe(30);
  });

  it("accepts the extremes of the range", () => {
    expect(cancellationIsValid({ choice: "CUSTOM", customDays: "0" })).toBe(true);
    expect(cancellationIsValid({ choice: "CUSTOM", customDays: "3650" })).toBe(true);
  });

  it.each(["", "  ", "-1", "3651", "7.5", "seven"])(
    "refuses %o as a custom deadline",
    (customDays) => {
      const cancellation: CancellationAnswer = { choice: "CUSTOM", customDays };

      expect(cancellationIsValid(cancellation)).toBe(false);
      expect(cancellationSummaryDays(cancellation)).toBeNull();
      expect(paymentTermsIssues(answer({ cancellation }))).toEqual([
        {
          code: "CANCELLATION_INVALID",
          anchorId: CANCELLATION_ANCHOR_ID,
          focusId: CUSTOM_CANCELLATION_FIELD_ID,
        },
      ]);
    },
  );

  it("shows an unusable stored value back rather than silently defaulting it", () => {
    // Replacing it with 0 would throw away whatever the host meant, and quietly widen
    // the refund window on a listing that may already be taking bookings.
    expect(cancellationAnswerFromDraft("9999")).toEqual({
      choice: "CUSTOM",
      customDays: "9999",
    });
  });
});

describe("what stops the host continuing", () => {
  it("requires a payment method, and points at the first checkbox", () => {
    expect(paymentTermsIssues(answer({ methods: { methodCodes: [], otherLabel: null } })))
      .toEqual([
        {
          code: "PAYMENT_METHOD_REQUIRED",
          anchorId: PAYMENT_METHODS_ANCHOR_ID,
          focusId: "payment-method-cash-at-property",
        },
      ]);
  });

  it("accepts cash on its own, with no guest note attached", () => {
    expect(
      paymentTermsIssues(
        answer({ methods: { methodCodes: ["CASH_AT_PROPERTY"], otherLabel: null } }),
      ),
    ).toEqual([]);
  });

  it("accepts arrange directly on its own", () => {
    expect(
      paymentTermsIssues(
        answer({ methods: { methodCodes: ["ARRANGE_DIRECTLY"], otherLabel: null } }),
      ),
    ).toEqual([]);
  });

  it("never blocks on private details a host has not filled in", () => {
    // They are optional, they are labelled optional, and a host may deliberately share
    // them only after accepting a booking.
    expect(
      paymentTermsIssues(
        answer({
          methods: {
            methodCodes: ["BANK_TRANSFER_INTERNATIONAL", "PAYPAL"],
            otherLabel: null,
            details: {},
          },
        }),
      ),
    ).toEqual([]);
  });

  it("does block on details that were filled in wrongly", () => {
    // Half an IBAN is not the same as no IBAN. Saving it would carry a wrong account
    // number all the way to the message a guest is asked to pay against.
    const issues = paymentTermsIssues(
      answer({
        methods: {
          methodCodes: ["BANK_TRANSFER_INTERNATIONAL"],
          otherLabel: null,
          details: {
            BANK_TRANSFER_INTERNATIONAL: {
              accountHolder: "Nikola Dimovski",
              accountIdentifier: "DK50 not an iban",
            },
          },
        },
      }),
    );

    expect(issues).toEqual([
      {
        code: "PAYMENT_DETAILS_INVALID",
        anchorId: PAYMENT_METHODS_ANCHOR_ID,
        focusId: "payment-method-bank-transfer-international",
      },
    ]);
  });

  it("asks for a public name once another method is selected", () => {
    expect(
      paymentTermsIssues(
        answer({ methods: { methodCodes: ["OTHER"], otherLabel: "" } }),
      ),
    ).toEqual([
      {
        code: "OTHER_METHOD_LABEL",
        anchorId: PAYMENT_METHODS_ANCHOR_ID,
        focusId: "other-payment-method",
      },
    ]);
  });

  it("names a switched-on section with no amount, and focuses its amount field", () => {
    const deposits = advanceAnswer();
    deposits.advancePayment.value = "";

    expect(paymentTermsIssues(answer({ deposits }))).toEqual([
      {
        code: "ADVANCE_PAYMENT_INCOMPLETE",
        anchorId: DEPOSITS_ANCHOR_ID,
        focusId: "advance-payment-value",
      },
    ]);
  });

  it("refuses a percentage above 100", () => {
    const deposits = advanceAnswer();
    deposits.advancePayment.value = "120";

    expect(paymentTermsIssues(answer({ deposits })).map((issue) => issue.code)).toEqual([
      "ADVANCE_PAYMENT_INCOMPLETE",
    ]);
  });

  it("blames each section for its own amount and not for the other one", () => {
    const deposits = bothAnswers();
    deposits.damageDeposit = { ...deposits.damageDeposit, value: "" };

    expect(paymentTermsIssues(answer({ deposits })).map((issue) => issue.code)).toEqual([
      "DAMAGE_DEPOSIT_INCOMPLETE",
    ]);
  });

  it("lists problems in the order the host meets them reading down the page", () => {
    const deposits = advanceAnswer();
    deposits.advancePayment.value = "";

    const issues = paymentTermsIssues(
      answer({
        methods: { methodCodes: [], otherLabel: null },
        deposits,
        cancellation: { choice: "CUSTOM", customDays: "nope" },
      }),
    );

    expect(issues.map((issue) => issue.code)).toEqual([
      "PAYMENT_METHOD_REQUIRED",
      "ADVANCE_PAYMENT_INCOMPLETE",
      "CANCELLATION_INVALID",
    ]);
  });
});

describe("the patch the screen writes", () => {
  it("records both deposit sections and the deadline together", () => {
    const patch = paymentTermsDraftPatch(answer());

    expect(patch).toMatchObject({
      acceptedPaymentMethods: ["PAYPAL"],
      paymentMethodOther: null,
      freeCancellationDaysBeforeCheckIn: "0",
      depositPolicies: {
        currency: "EUR",
        advancePayment: { enabled: false },
        damageDeposit: { enabled: false },
      },
    });
  });

  it("saves a custom deadline as the number, trimmed", () => {
    expect(
      paymentTermsDraftPatch(
        answer({ cancellation: { choice: "CUSTOM", customDays: " 30 " } }),
      ).freeCancellationDaysBeforeCheckIn,
    ).toBe("30");
  });

  it("drops a stale other-method label when the method is deselected", () => {
    expect(
      paymentTermsDraftPatch(
        answer({ methods: { methodCodes: ["PAYPAL"], otherLabel: "MobilePay" } }),
      ).paymentMethodOther,
    ).toBeNull();
  });
});
