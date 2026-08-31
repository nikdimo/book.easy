/**
 * The deposit answer as a form holds it, and how it becomes a validated policy.
 *
 * Two shapes meet here. The editor works in `DepositPoliciesDraft` — switches, typed
 * strings, a nullable day count — because that is what a half-filled form is.
 * `validateDepositPolicies` works in a payload where a switched-off section is
 * `{ enabled: false }` and nothing else. This module is the only place that converts
 * between them, so the wizard, the listing editor and the publish action cannot each
 * grow their own slightly different idea of what "no deposit" looks like.
 *
 * Free of React and Prisma on purpose: `submitNewListing` reads a draft's answer
 * through the same functions the client renders it with, and a client-only module
 * would force it to reimplement them.
 */

import { DEFAULT_CURRENCY } from "@/lib/constants";
import {
  DEPOSIT_AMOUNT_TYPE_CODES,
  DEPOSIT_DUE_TIMING_CODES,
  validateDepositPolicies,
  type DepositAmountType,
  type DepositDueTiming,
  type DepositPoliciesSnapshotV2,
} from "@/lib/payments/deposit-policies";
import type {
  ListingDraftData,
  ListingDraftDamageDepositSection,
  ListingDraftDepositPolicies,
  ListingDraftDepositSection,
} from "@/lib/types/listing-draft";

export type DepositSectionDraft = ListingDraftDepositSection;
export type DamageDepositSectionDraft = ListingDraftDamageDepositSection;
export type DepositPoliciesDraft = ListingDraftDepositPolicies;

/** A section nobody has touched: switched off, with the defaults its fields open at. */
export const EMPTY_DEPOSIT_SECTION: DepositSectionDraft = {
  enabled: false,
  amountType: "FIXED",
  value: "",
  dueTiming: "AFTER_ACCEPTANCE",
  dueDaysBeforeCheckIn: null,
};

/** Both questions, unanswered. Not the same thing as both answered "no". */
export function emptyDepositPoliciesDraft(): DepositPoliciesDraft {
  return {
    advancePayment: { ...EMPTY_DEPOSIT_SECTION },
    damageDeposit: { ...EMPTY_DEPOSIT_SECTION, returnDaysAfterCheckout: null },
  };
}

/**
 * The payload `validateDepositPolicies` takes.
 *
 * A switched-off section carries `enabled: false` and nothing else: leaving its stale
 * numbers in would make the validator judge fields the host just said do not apply.
 */
export function depositPoliciesPayload(
  draft: DepositPoliciesDraft,
  currency: string,
) {
  return {
    currency,
    advancePayment: draft.advancePayment.enabled
      ? {
          enabled: true,
          amountType: draft.advancePayment.amountType,
          value: draft.advancePayment.value,
          dueTiming: draft.advancePayment.dueTiming,
          dueDaysBeforeCheckIn: draft.advancePayment.dueDaysBeforeCheckIn,
        }
      : { enabled: false },
    damageDeposit: draft.damageDeposit.enabled
      ? {
          enabled: true,
          amountType: draft.damageDeposit.amountType,
          value: draft.damageDeposit.value,
          dueTiming: draft.damageDeposit.dueTiming,
          dueDaysBeforeCheckIn: draft.damageDeposit.dueDaysBeforeCheckIn,
          returnDaysAfterCheckout: draft.damageDeposit.returnDaysAfterCheckout,
        }
      : { enabled: false },
  };
}

/**
 * Whether this answer could be published as it stands.
 *
 * Both sections off is complete — it is how a host says "I ask for neither" — so this
 * measures the amounts and timings of the sections that *are* on, and nothing else.
 * Whether the host has actually been asked is a separate question, answered by the
 * presence of the draft field; see `hostAnsweredDepositPolicies`.
 */
export function depositPoliciesDraftIsValid(
  draft: DepositPoliciesDraft,
  currency: string,
): boolean {
  return validateDepositPolicies(depositPoliciesPayload(draft, currency)).success;
}

/** The editable form for a snapshot, with a switched-off section's fields left at their defaults. */
export function depositPoliciesDraftFromSnapshot(
  snapshot: DepositPoliciesSnapshotV2,
): DepositPoliciesDraft {
  const currency =
    snapshot.advancePayment?.currency ?? snapshot.damageDeposit?.currency ?? undefined;
  return {
    ...(currency ? { currency } : {}),
    advancePayment: snapshot.advancePayment
      ? {
          enabled: true,
          amountType: snapshot.advancePayment.amountType,
          value: snapshot.advancePayment.value,
          dueTiming: snapshot.advancePayment.dueTiming,
          dueDaysBeforeCheckIn: snapshot.advancePayment.dueDaysBeforeCheckIn,
        }
      : { ...EMPTY_DEPOSIT_SECTION },
    damageDeposit: snapshot.damageDeposit
      ? {
          enabled: true,
          amountType: snapshot.damageDeposit.amountType,
          value: snapshot.damageDeposit.value,
          dueTiming: snapshot.damageDeposit.dueTiming,
          dueDaysBeforeCheckIn: snapshot.damageDeposit.dueDaysBeforeCheckIn,
          returnDaysAfterCheckout: snapshot.damageDeposit.returnDaysAfterCheckout,
        }
      : { ...EMPTY_DEPOSIT_SECTION, returnDaysAfterCheckout: null },
  };
}

const AMOUNT_TYPES = new Set<string>(DEPOSIT_AMOUNT_TYPE_CODES);
const DUE_TIMINGS = new Set<string>(DEPOSIT_DUE_TIMING_CODES);

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function wholeNumberOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) {
    return value;
  }
  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    const parsed = Number(value.trim());
    if (Number.isSafeInteger(parsed)) return parsed;
  }
  return null;
}

function parseSection(raw: unknown): DepositSectionDraft {
  const section = asObject(raw) ?? {};
  const amountType =
    typeof section.amountType === "string" && AMOUNT_TYPES.has(section.amountType)
      ? (section.amountType as DepositAmountType)
      : EMPTY_DEPOSIT_SECTION.amountType;
  const dueTiming =
    typeof section.dueTiming === "string" && DUE_TIMINGS.has(section.dueTiming)
      ? (section.dueTiming as DepositDueTiming)
      : EMPTY_DEPOSIT_SECTION.dueTiming;
  return {
    // Anything but an explicit `true` reads as off. A stored section is only ever
    // written by this flow, but it round-trips through JSON and a mobile client's
    // patch, and a malformed value must not switch a charge *on*.
    enabled: section.enabled === true,
    amountType,
    value: typeof section.value === "string" ? section.value : "",
    dueTiming,
    dueDaysBeforeCheckIn: wholeNumberOrNull(section.dueDaysBeforeCheckIn),
  };
}

/**
 * Reads a stored or transported answer back into the form's shape.
 *
 * Returns null for anything that is not a two-section object, which is what keeps
 * "never asked" distinguishable from "asked and answered no" — the caller decides what
 * an absent answer means, and the wizard decides it means the question is still open.
 */
export function parseDepositPoliciesDraft(
  value: unknown,
): DepositPoliciesDraft | null {
  const raw = asObject(value);
  if (!raw) return null;
  const advance = asObject(raw.advancePayment);
  const damage = asObject(raw.damageDeposit);
  // Both questions are one reviewed decision. Filling a missing sibling with the
  // switched-off defaults would claim the host answered "no" to a question they were
  // never shown, and would incorrectly set depositPoliciesReviewedAt at publish time.
  if (!advance || !damage) return null;
  const currency =
    typeof raw.currency === "string" && /^[A-Za-z]{3}$/.test(raw.currency.trim())
      ? raw.currency.trim().toUpperCase()
      : undefined;
  return {
    ...(currency ? { currency } : {}),
    advancePayment: parseSection(advance),
    damageDeposit: {
      ...parseSection(damage),
      returnDaysAfterCheckout: wholeNumberOrNull(damage?.returnDaysAfterCheckout),
    },
  };
}

/**
 * Whether enabled monetary terms were reviewed in the draft's current pricing currency.
 *
 * An explicit "neither" has no monetary unit and remains valid across currency changes.
 * Enabled terms require the review-time stamp to match. Missing stamps belong to drafts
 * created before this invariant existed and must be reviewed once instead of guessed.
 */
export function depositPoliciesDraftMatchesCurrency(
  draft: DepositPoliciesDraft,
  currency: string,
): boolean {
  const asksForMoney = draft.advancePayment.enabled || draft.damageDeposit.enabled;
  if (!asksForMoney) return true;
  return (
    (draft.currency ?? "").trim().toUpperCase() === currency.trim().toUpperCase()
  );
}

/** True when the host has been through the deposit questions and given an answer. */
export function hostAnsweredDepositPolicies(data: ListingDraftData): boolean {
  const draft = parseDepositPoliciesDraft(data.depositPolicies);
  return Boolean(
    draft && depositPoliciesDraftMatchesCurrency(draft, depositPoliciesCurrency(data)),
  );
}

/** A draft's answer as an editable form — the empty form when it has none yet. */
export function depositPoliciesDraftFromListingDraft(
  data: ListingDraftData,
): DepositPoliciesDraft {
  const draft = parseDepositPoliciesDraft(data.depositPolicies);
  return draft && depositPoliciesDraftMatchesCurrency(draft, depositPoliciesCurrency(data))
    ? draft
    : emptyDepositPoliciesDraft();
}

/**
 * The draft's answer as the editor's `initialValue`.
 *
 * `REVIEWED` with two nulls and `UNANSWERED` render as the same empty form but mean
 * opposite things, which is exactly the distinction the wizard's own confirmation
 * checkbox needs in order to come back ticked.
 */
export function depositPoliciesSnapshotFromListingDraft(
  data: ListingDraftData,
): DepositPoliciesSnapshotV2 {
  const unanswered = {
    version: 2,
    status: "UNANSWERED",
    advancePayment: null,
    damageDeposit: null,
  } as const;
  const draft = parseDepositPoliciesDraft(data.depositPolicies);
  if (!draft) return unanswered;
  if (!depositPoliciesDraftMatchesCurrency(draft, depositPoliciesCurrency(data))) {
    return unanswered;
  }
  const validation = validateDepositPolicies(
    depositPoliciesPayload(draft, depositPoliciesCurrency(data)),
  );
  // A stored answer that no longer validates — a listing whose currency changed under
  // it, a hand-edited row — reopens the question rather than rendering as a confident
  // "neither". The empty form and "the host asked for nothing" look identical, and only
  // one of them may be published.
  if (!validation.success) return unanswered;
  return { version: 2, status: "REVIEWED", ...validation.value };
}

/** What a draft's deposits are quoted in: the listing's own currency, or the default. */
export function depositPoliciesCurrency(data: ListingDraftData): string {
  return (data.currency ?? "").trim().toUpperCase() || DEFAULT_CURRENCY;
}
