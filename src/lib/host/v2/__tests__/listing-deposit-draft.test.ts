import { describe, expect, it } from "vitest";
import {
  depositPoliciesCurrency,
  depositPoliciesDraftFromListingDraft,
  depositPoliciesDraftFromSnapshot,
  depositPoliciesDraftIsValid,
  depositPoliciesPayload,
  depositPoliciesSnapshotFromListingDraft,
  emptyDepositPoliciesDraft,
  hostAnsweredDepositPolicies,
  parseDepositPoliciesDraft,
  type DepositPoliciesDraft,
} from "@/lib/host/v2/listing-deposit-draft";
import type { ListingDraftData } from "@/lib/types/listing-draft";

/** The answer a host gives by switching the advance-payment section on. */
function withAdvancePayment(
  overrides: Partial<DepositPoliciesDraft["advancePayment"]> = {},
): DepositPoliciesDraft {
  const draft = emptyDepositPoliciesDraft();
  draft.currency = "EUR";
  return {
    ...draft,
    advancePayment: {
      enabled: true,
      amountType: "PERCENTAGE",
      value: "20",
      dueTiming: "AFTER_ACCEPTANCE",
      dueDaysBeforeCheckIn: null,
      ...overrides,
    },
  };
}

describe("an answer that asks for something", () => {
  it("carries both sections' terms through the payload", () => {
    const draft: DepositPoliciesDraft = {
      advancePayment: {
        enabled: true,
        amountType: "PERCENTAGE",
        value: "20",
        dueTiming: "DAYS_BEFORE_CHECK_IN",
        dueDaysBeforeCheckIn: 7,
      },
      damageDeposit: {
        enabled: true,
        amountType: "FIXED",
        value: "200",
        dueTiming: "AT_CHECK_IN",
        dueDaysBeforeCheckIn: null,
        returnDaysAfterCheckout: 7,
      },
    };

    expect(depositPoliciesPayload(draft, "EUR")).toEqual({
      currency: "EUR",
      advancePayment: {
        enabled: true,
        amountType: "PERCENTAGE",
        value: "20",
        dueTiming: "DAYS_BEFORE_CHECK_IN",
        dueDaysBeforeCheckIn: 7,
      },
      damageDeposit: {
        enabled: true,
        amountType: "FIXED",
        value: "200",
        dueTiming: "AT_CHECK_IN",
        dueDaysBeforeCheckIn: null,
        returnDaysAfterCheckout: 7,
      },
    });
    expect(depositPoliciesDraftIsValid(draft, "EUR")).toBe(true);
  });

  it("sends only the flag for a section the host switched back off", () => {
    // The numbers stay on the draft so switching the section on again returns them —
    // but a validator handed them would judge fields the host just said do not apply.
    const draft = withAdvancePayment();
    draft.advancePayment.enabled = false;

    expect(depositPoliciesPayload(draft, "EUR").advancePayment).toEqual({
      enabled: false,
    });
  });

  it("survives a round trip through the draft's JSON", () => {
    const draft = withAdvancePayment({ dueTiming: "DAYS_BEFORE_CHECK_IN", dueDaysBeforeCheckIn: 14 });

    expect(parseDepositPoliciesDraft(JSON.parse(JSON.stringify(draft)))).toEqual(draft);
  });
});

describe("explicitly asking for neither", () => {
  const answered: ListingDraftData = { depositPolicies: emptyDepositPoliciesDraft() };

  it("is a complete answer, not a missing one", () => {
    expect(depositPoliciesDraftIsValid(emptyDepositPoliciesDraft(), "EUR")).toBe(true);
    expect(hostAnsweredDepositPolicies(answered)).toBe(true);
  });

  it("reads back as REVIEWED with no terms, so the confirmation returns ticked", () => {
    expect(depositPoliciesSnapshotFromListingDraft(answered)).toEqual({
      version: 2,
      status: "REVIEWED",
      advancePayment: null,
      damageDeposit: null,
    });
  });

  it("is not the same state as never having been asked", () => {
    // Both render as an empty form. Only one of them may be published: the other
    // freezes UNANSWERED terms onto every booking the listing takes.
    expect(hostAnsweredDepositPolicies({})).toBe(false);
    expect(depositPoliciesSnapshotFromListingDraft({}).status).toBe("UNANSWERED");
  });
});

describe("an incomplete answer", () => {
  it("is refused when a switched-on section has no amount", () => {
    expect(depositPoliciesDraftIsValid(withAdvancePayment({ value: "" }), "EUR")).toBe(false);
  });

  it("is refused when a percentage is above 100", () => {
    expect(depositPoliciesDraftIsValid(withAdvancePayment({ value: "120" }), "EUR")).toBe(false);
  });

  it("is refused when days-before-check-in carries no day count", () => {
    expect(
      depositPoliciesDraftIsValid(
        withAdvancePayment({ dueTiming: "DAYS_BEFORE_CHECK_IN", dueDaysBeforeCheckIn: null }),
        "EUR",
      ),
    ).toBe(false);
  });

  it("reopens the question rather than reading as a confident 'neither'", () => {
    // A stored answer that no longer validates renders as the same empty form as
    // "the host asked for nothing", so it must not come back marked as reviewed.
    const data: ListingDraftData = {
      currency: "EUR",
      depositPolicies: withAdvancePayment({ value: "" }),
    };

    expect(depositPoliciesSnapshotFromListingDraft(data).status).toBe("UNANSWERED");
  });
});

describe("older drafts, and anything else that is not an answer", () => {
  it("treats a draft written before the question existed as unanswered", () => {
    const legacy: ListingDraftData = {
      title: "Sunny loft",
      currentStepId: "specialOffer",
      acceptedPaymentMethods: ["PAYPAL"],
    };

    expect(hostAnsweredDepositPolicies(legacy)).toBe(false);
    expect(depositPoliciesDraftFromListingDraft(legacy)).toEqual(emptyDepositPoliciesDraft());
  });

  it.each([
    ["absent", undefined],
    ["null", null],
    ["a string", "yes"],
    ["an array", []],
    ["an object with neither section", { reviewed: true }],
  ])("reads %s as no answer at all", (_label, value) => {
    expect(parseDepositPoliciesDraft(value)).toBeNull();
  });

  it("never switches a charge on from a malformed stored value", () => {
    const parsed = parseDepositPoliciesDraft({
      advancePayment: { enabled: "true", amountType: "GIFT", value: 20, dueTiming: "SOON" },
      damageDeposit: { enabled: true, returnDaysAfterCheckout: "-3" },
    });

    expect(parsed?.advancePayment).toEqual({
      enabled: false,
      amountType: "FIXED",
      value: "",
      dueTiming: "AFTER_ACCEPTANCE",
      dueDaysBeforeCheckIn: null,
    });
    expect(parsed?.damageDeposit.returnDaysAfterCheckout).toBeNull();
  });

  it("does not turn a half-answer into a reviewed no for the missing question", () => {
    const parsed = parseDepositPoliciesDraft({
      advancePayment: {
        enabled: true,
        amountType: "FIXED",
        value: "50",
        dueTiming: "AT_CHECK_IN",
        dueDaysBeforeCheckIn: null,
      },
    });

    expect(parsed).toBeNull();
  });
});

describe("the currency the answer is quoted in", () => {
  it("is the listing's own", () => {
    expect(depositPoliciesCurrency({ currency: "mkd" })).toBe("MKD");
  });

  it("falls back to the platform default when the draft carries none", () => {
    expect(depositPoliciesCurrency({})).toBe("EUR");
    expect(depositPoliciesCurrency({ currency: "  " })).toBe("EUR");
  });

  it("reopens monetary terms when the pricing currency changed", () => {
    const depositPolicies = withAdvancePayment({ amountType: "FIXED", value: "100" });
    const changed: ListingDraftData = { currency: "MKD", depositPolicies };

    expect(hostAnsweredDepositPolicies(changed)).toBe(false);
    expect(depositPoliciesSnapshotFromListingDraft(changed).status).toBe("UNANSWERED");
    expect(depositPoliciesDraftFromListingDraft(changed)).toEqual(
      emptyDepositPoliciesDraft(),
    );
  });

  it("keeps an explicit neither valid across a currency change", () => {
    const depositPolicies = emptyDepositPoliciesDraft();
    depositPolicies.currency = "EUR";
    const changed: ListingDraftData = { currency: "MKD", depositPolicies };

    expect(hostAnsweredDepositPolicies(changed)).toBe(true);
    expect(depositPoliciesSnapshotFromListingDraft(changed).status).toBe("REVIEWED");
  });
});

describe("the snapshot the editor opens with", () => {
  it("returns a switched-on section's stored terms to its fields", () => {
    const draft = depositPoliciesDraftFromSnapshot({
      version: 2,
      status: "REVIEWED",
      advancePayment: {
        amountType: "FIXED",
        value: "100",
        currency: "EUR",
        dueTiming: "AFTER_ACCEPTANCE",
        dueDaysBeforeCheckIn: null,
      },
      damageDeposit: null,
    });

    expect(draft.advancePayment).toMatchObject({ enabled: true, value: "100" });
    expect(draft.damageDeposit.enabled).toBe(false);
  });
});
