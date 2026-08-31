/**
 * The payment, deposit and cancellation answers as the new-listing step holds them.
 *
 * Three questions are asked on one screen, and each has its own idea of what
 * "unanswered" means: a payment method is a selection that starts empty, a deposit is
 * two switched-off sections that look exactly like "I ask for neither", and a
 * cancellation deadline is a number where `0` is a real, common answer rather than a
 * blank. This module turns those three into one shape the screen can render, one list
 * of problems the screen can report, and one patch the draft can hold.
 *
 * Two rules run through all of it.
 *
 * The first is that a stored answer always wins. Anything the host has already said is
 * read back exactly as saved, and the safe defaults below are only ever the opening
 * state of a question nobody has answered yet — never written over an answer, and not
 * written at all until the host continues from the screen that shows them.
 *
 * The second is that nothing here decides whether the listing may be published.
 * `listing-publish-readiness.ts` and `submitNewListing` still do that, from the stored
 * draft, and they are unchanged: this module only decides what the host is shown, and
 * what the CTA does next.
 *
 * Free of React on purpose, so the step's rules can be tested without rendering it.
 */

import {
  depositPoliciesCurrency,
  depositPoliciesDraftIsValid,
  depositPoliciesDraftMatchesCurrency,
  emptyDepositPoliciesDraft,
  parseDepositPoliciesDraft,
  type DepositPoliciesDraft,
} from "@/lib/host/v2/listing-deposit-draft";
import {
  PAYMENT_METHOD_CODES,
  normalizePaymentArrangementsDraft,
  normalizePaymentMethodCodes,
  paymentDetailIssues,
  paymentMethodRowId,
  validateOtherPaymentLabel,
  type PaymentArrangementsDraft,
  type PaymentMethodCode,
} from "@/components/host/v2/editor/payment-arrangements/payment-arrangements-model";
import { validateCancellationPolicy } from "@/lib/payments/cancellation-policy";
import type { ListingDraftData } from "@/lib/types/listing-draft";

// ─── Cancellation ────────────────────────────────────────────────────────────────

/** The deadlines offered as cards, in whole days before check-in. */
export const FREE_CANCELLATION_PRESET_DAYS = [0, 3, 7, 14] as const;

export type FreeCancellationPresetDays =
  (typeof FREE_CANCELLATION_PRESET_DAYS)[number];

/** A preset is identified by its own day count, so the choice is the answer. */
export type CancellationChoice = `${FreeCancellationPresetDays}` | "CUSTOM";

/**
 * What a draft that has never been asked opens on: a full refund right up to check-in.
 *
 * The most generous deadline is the safe one to default to, because it is the only
 * value that cannot cost a guest money nobody told them about. A host who wants a
 * stricter deadline says so here; a host who says nothing gives away only flexibility.
 */
export const SAFE_DEFAULT_CANCELLATION_CHOICE: CancellationChoice = "0";

export interface CancellationAnswer {
  choice: CancellationChoice;
  /** Raw text of the Custom field, exactly as typed. Only read while `choice` is CUSTOM. */
  customDays: string;
}

const PRESET_SET = new Set<string>(
  FREE_CANCELLATION_PRESET_DAYS.map((days) => String(days)),
);

/**
 * The saved deadline as the two controls that edit it.
 *
 * A stored value that is not one of the presets opens the Custom field with that value
 * in it — including a value that does not validate. Replacing an unparseable answer
 * with the default would quietly throw away whatever the host meant by it; showing it
 * back, and refusing to continue until it is fixed, does not.
 */
export function cancellationAnswerFromDraft(
  raw: string | undefined,
): CancellationAnswer {
  const value = (raw ?? "").trim();
  // Only a genuinely absent answer takes the default. "" is how every draft that
  // predates this question stores it.
  if (value === "") {
    return { choice: SAFE_DEFAULT_CANCELLATION_CHOICE, customDays: "" };
  }
  const validated = validateCancellationPolicy(value);
  if (validated.success && PRESET_SET.has(String(validated.value))) {
    return { choice: String(validated.value) as CancellationChoice, customDays: "" };
  }
  return { choice: "CUSTOM", customDays: value };
}

/** The string the draft stores for this answer. */
export function cancellationDaysValue(answer: CancellationAnswer): string {
  return answer.choice === "CUSTOM" ? answer.customDays.trim() : answer.choice;
}

export function cancellationIsValid(answer: CancellationAnswer): boolean {
  return validateCancellationPolicy(cancellationDaysValue(answer)).success;
}

/** The deadline as a number for the summary line, or null while it is unusable. */
export function cancellationSummaryDays(answer: CancellationAnswer): number | null {
  const validated = validateCancellationPolicy(cancellationDaysValue(answer));
  return validated.success ? validated.value : null;
}

// ─── Deposits ────────────────────────────────────────────────────────────────────

export interface DepositAnswer {
  draft: DepositPoliciesDraft;
  /**
   * Whether the draft arrived carrying this answer.
   *
   * False is a draft opening on the safe defaults — both questions answered "no" in the
   * form, but not yet in the draft. The distinction is what keeps `depositPolicies`
   * absent until the host continues, which is the only thing that tells publishing the
   * question was actually put to them.
   */
  explicit: boolean;
  /**
   * The stored answer asks for money in a currency the listing no longer prices in.
   *
   * The amounts are still shown, and still the answer that was given: `100` typed
   * against EUR is not made meaningless by the listing moving to MKD, but it does mean
   * something different, so the screen says so and the host confirms or corrects it
   * before the new currency is stamped on.
   */
  currencyChanged: boolean;
}

/**
 * The draft's deposit answer as the form holds it.
 *
 * Unlike `depositPoliciesDraftFromListingDraft`, a currency mismatch does not empty the
 * form here. Emptying it is right for a caller that must not act on stale amounts; on
 * this screen it would show a host their own "20% advance" back as "Not required", and
 * one press of Continue would save that default over the answer they gave.
 */
export function depositAnswerFromDraft(data: ListingDraftData): DepositAnswer {
  const stored = parseDepositPoliciesDraft(data.depositPolicies);
  if (!stored) {
    return {
      draft: emptyDepositPoliciesDraft(),
      explicit: false,
      currencyChanged: false,
    };
  }
  return {
    draft: stored,
    explicit: true,
    currencyChanged: !depositPoliciesDraftMatchesCurrency(
      stored,
      depositPoliciesCurrency(data),
    ),
  };
}

// ─── Problems the screen reports ─────────────────────────────────────────────────

export type PaymentTermsIssueCode =
  | "PAYMENT_METHOD_REQUIRED"
  | "OTHER_METHOD_LABEL"
  | "PAYMENT_DETAILS_INVALID"
  | "ADVANCE_PAYMENT_INCOMPLETE"
  | "DAMAGE_DEPOSIT_INCOMPLETE"
  | "CANCELLATION_INVALID";

export interface PaymentTermsIssue {
  code: PaymentTermsIssueCode;
  /** The block scrolled into view. Never the bare control: a field on its own can land
   *  under the sticky footer with nothing around it to explain what went wrong. */
  anchorId: string;
  /** The control that takes keyboard focus once the block is in view. */
  focusId: string;
}

export const PAYMENT_METHODS_ANCHOR_ID = "payment-terms-methods";
export const DEPOSITS_ANCHOR_ID = "payment-terms-deposits";
export const CANCELLATION_ANCHOR_ID = "payment-terms-cancellation";
export const CUSTOM_CANCELLATION_FIELD_ID = "payment-terms-cancellation-custom";

export interface PaymentTermsAnswer {
  methods: PaymentArrangementsDraft;
  deposits: DepositPoliciesDraft;
  /** The listing's own pricing currency — what any enabled amount is quoted in. */
  currency: string;
  cancellation: CancellationAnswer;
}

/** One section judged on its own, so a problem in the other cannot be blamed on it. */
function sectionIsValid(
  deposits: DepositPoliciesDraft,
  currency: string,
  section: "advancePayment" | "damageDeposit",
): boolean {
  const other = section === "advancePayment" ? "damageDeposit" : "advancePayment";
  return depositPoliciesDraftIsValid(
    { ...deposits, [other]: { ...deposits[other], enabled: false } } as DepositPoliciesDraft,
    currency,
  );
}

/**
 * Everything standing between this screen and the next one, in the order the host
 * meets it on the page.
 *
 * Page order matters: the first entry is the one the CTA scrolls to and focuses, and
 * sending a host down to a cancellation field while an unanswered question sits above
 * it would make them scroll back up to find the rest.
 *
 * Details a host has not filled in are deliberately absent from this list. They are
 * optional, they are labelled optional, and they never hold up the flow. Details filled
 * in *wrongly* are a different thing and do appear: saving half an IBAN is not a
 * kindness to anyone.
 */
export function paymentTermsIssues(answer: PaymentTermsAnswer): PaymentTermsIssue[] {
  const issues: PaymentTermsIssue[] = [];
  const methodCodes = normalizePaymentMethodCodes(answer.methods.methodCodes);

  if (methodCodes.length === 0) {
    issues.push({
      code: "PAYMENT_METHOD_REQUIRED",
      anchorId: PAYMENT_METHODS_ANCHOR_ID,
      focusId: paymentMethodRowId(PAYMENT_METHOD_CODES[0]),
    });
  } else {
    if (
      methodCodes.includes("OTHER") &&
      validateOtherPaymentLabel(answer.methods.otherLabel ?? "") !== null
    ) {
      issues.push({
        code: "OTHER_METHOD_LABEL",
        anchorId: PAYMENT_METHODS_ANCHOR_ID,
        focusId: "other-payment-method",
      });
    }
    const [firstBrokenMethod] = Object.keys(
      paymentDetailIssues(normalizePaymentArrangementsDraft(answer.methods)),
    ) as PaymentMethodCode[];
    if (firstBrokenMethod) {
      issues.push({
        code: "PAYMENT_DETAILS_INVALID",
        anchorId: PAYMENT_METHODS_ANCHOR_ID,
        focusId: paymentMethodRowId(firstBrokenMethod),
      });
    }
  }

  if (
    answer.deposits.advancePayment.enabled &&
    !sectionIsValid(answer.deposits, answer.currency, "advancePayment")
  ) {
    issues.push({
      code: "ADVANCE_PAYMENT_INCOMPLETE",
      anchorId: DEPOSITS_ANCHOR_ID,
      focusId: "advance-payment-value",
    });
  }
  if (
    answer.deposits.damageDeposit.enabled &&
    !sectionIsValid(answer.deposits, answer.currency, "damageDeposit")
  ) {
    issues.push({
      code: "DAMAGE_DEPOSIT_INCOMPLETE",
      anchorId: DEPOSITS_ANCHOR_ID,
      focusId: "damage-deposit-value",
    });
  }

  if (!cancellationIsValid(answer.cancellation)) {
    issues.push({
      code: "CANCELLATION_INVALID",
      anchorId: CANCELLATION_ANCHOR_ID,
      focusId: CUSTOM_CANCELLATION_FIELD_ID,
    });
  }

  return issues;
}

/** The draft patch this screen writes when the host continues from it. */
export function paymentTermsDraftPatch(answer: PaymentTermsAnswer) {
  const normalized = normalizePaymentArrangementsDraft(answer.methods);
  return {
    acceptedPaymentMethods: normalized.methodCodes,
    paymentMethodOther: normalized.otherLabel,
    paymentInstructionTemplates: normalized.instructionTemplates ?? {},
    paymentDetails: normalized.details ?? {},
    // Written whole, both sections together, and only from here: the presence of this
    // field is what tells publishing the host was asked at all. Stamped with the
    // currency the amounts were just reviewed in, so a later currency change reopens
    // the question instead of silently turning 100 EUR into 100 MKD.
    depositPolicies: { ...answer.deposits, currency: answer.currency },
    freeCancellationDaysBeforeCheckIn: cancellationDaysValue(answer.cancellation),
  };
}
