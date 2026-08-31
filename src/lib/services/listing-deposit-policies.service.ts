import "server-only";

import { db } from "@/lib/db";
import {
  advanceExceedsEveryStay,
  createDepositPoliciesSnapshot,
  validateDepositPolicies,
  type AdvancePaymentPolicy,
  type DamageDepositPolicy,
  type DepositPoliciesConfig,
  type DepositPoliciesIssues,
} from "@/lib/payments/deposit-policies";

const SELECT = {
  id: true,
  slug: true,
  status: true,
  advancePaymentEnabled: true,
  advancePaymentType: true,
  advancePaymentValue: true,
  advancePaymentDueTiming: true,
  advancePaymentDueDaysBeforeCheckIn: true,
  damageDepositEnabled: true,
  damageDepositType: true,
  damageDepositValue: true,
  damageDepositDueTiming: true,
  damageDepositDueDaysBeforeCheckIn: true,
  damageDepositReturnDaysAfterCheckout: true,
  depositPoliciesCurrency: true,
  depositPoliciesReviewedAt: true,
  // The live pricing currency is what every booking from this listing is quoted in, and
  // `createDepositPoliciesSnapshot` reconciles the stored policy label against it. The
  // rate, fee and ceiling beside it are what bound a fixed advance payment at save time.
  pricingRule: {
    select: {
      currency: true,
      baseNightlyRate: true,
      cleaningFee: true,
      maxNights: true,
    },
  },
} as const;

export async function getListingDepositPoliciesData(
  listingId: string,
  hostId: string,
) {
  const listing = await db.listing.findFirst({
    where: { id: listingId, hostId },
    select: SELECT,
  });
  if (!listing) return null;
  return {
    listing: { id: listing.id, slug: listing.slug, status: listing.status },
    // Reads UNANSWERED when the stored policy currency has drifted from the live pricing
    // currency, which is how the editor asks the host to restate the amounts rather than
    // re-offering figures under a label they were never quoted in.
    policies: createDepositPoliciesSnapshot(listing),
    // What a new answer will be quoted in: always the live pricing currency, never the
    // stored policy label.
    listingCurrency: listing.pricingRule?.currency ?? "EUR",
  };
}

export type SaveListingDepositPoliciesResult =
  | { error: string }
  | { issues: DepositPoliciesIssues }
  | {
      listing: { id: string; slug: string; status: string };
      policies: DepositPoliciesConfig & { reviewedAt: Date };
      changed: boolean;
    };

function rawObject(input: unknown): Record<string, unknown> {
  return input && typeof input === "object" && !Array.isArray(input)
    ? (input as Record<string, unknown>)
    : {};
}

function sectionRequested(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const section = value as Record<string, unknown>;
  return section.enabled === undefined || section.enabled === true;
}

function sameSection(
  left: DamageDepositPolicy | AdvancePaymentPolicy | null,
  right: DamageDepositPolicy | AdvancePaymentPolicy | null,
): boolean {
  if (left === null || right === null) return left === right;
  return (
    left.amountType === right.amountType &&
    left.value === right.value &&
    left.currency === right.currency &&
    left.dueTiming === right.dueTiming &&
    left.dueDaysBeforeCheckIn === right.dueDaysBeforeCheckIn &&
    returnDays(left) === returnDays(right)
  );
}

function returnDays(
  policy: DamageDepositPolicy | AdvancePaymentPolicy,
): number | null {
  return "returnDaysAfterCheckout" in policy
    ? policy.returnDaysAfterCheckout
    : null;
}

/**
 * Saves both policy sections as one host answer.
 *
 * The currency is taken from the listing's pricing rule rather than from the submitted
 * payload: a host quotes their own listing's currency, and a client that says otherwise
 * is either stale or lying. Both sections share it because a listing has one price.
 *
 * This is also the only place a currency drift is resolved. A listing whose pricing
 * currency changed after its last review reads as UNANSWERED everywhere until the host
 * comes back here and restates the amounts; that save re-stamps the amounts and the
 * label together, which is the deliberate correction the drift is waiting for. Nothing
 * is ever converted, and no stored figure is relabelled on the way through.
 */
export async function saveListingDepositPolicies(
  listingId: string,
  hostId: string,
  input: unknown,
): Promise<SaveListingDepositPoliciesResult> {
  const listing = await db.listing.findFirst({
    where: { id: listingId, hostId },
    select: SELECT,
  });
  if (!listing) return { error: "Listing not found." };

  const raw = rawObject(input);
  const wantsPolicy =
    sectionRequested(raw.advancePayment) || sectionRequested(raw.damageDeposit);
  if (wantsPolicy && !listing.pricingRule?.currency) {
    return {
      error: "Set the listing currency before requiring a payment or deposit.",
    };
  }
  const currency = listing.pricingRule?.currency ?? null;
  const validation = validateDepositPolicies({ ...raw, currency });
  if (!validation.success) return { issues: validation.issues };

  // The advance payment is part of the booking total, so it can never exceed it. A
  // percentage is already bounded at 100% by validation above; a fixed amount is bounded
  // for real at booking creation, where the stay's actual total is known. The one thing
  // provable here is that a flat advance larger than the dearest stay this listing
  // permits at its own base rate would be capped for every booking it ever takes — a
  // typo, not a policy — and this is the screen on which the host can still fix it.
  if (advanceExceedsEveryStay(validation.value.advancePayment, listing.pricingRule)) {
    return { issues: { advancePayment: { value: "ADVANCE_EXCEEDS_STAY_TOTAL" } } };
  }

  const current = createDepositPoliciesSnapshot(listing);
  const next = validation.value;
  const changed =
    current.status !== "REVIEWED" ||
    !sameSection(current.advancePayment, next.advancePayment) ||
    !sameSection(current.damageDeposit, next.damageDeposit);
  const reviewedAt = new Date();

  await db.listing.update({
    where: { id: listing.id },
    data: {
      advancePaymentEnabled: next.advancePayment !== null,
      advancePaymentType: next.advancePayment?.amountType ?? null,
      advancePaymentValue: next.advancePayment?.value ?? null,
      advancePaymentDueTiming: next.advancePayment?.dueTiming ?? "AFTER_ACCEPTANCE",
      advancePaymentDueDaysBeforeCheckIn:
        next.advancePayment?.dueDaysBeforeCheckIn ?? null,
      damageDepositEnabled: next.damageDeposit !== null,
      damageDepositType: next.damageDeposit?.amountType ?? null,
      damageDepositValue: next.damageDeposit?.value ?? null,
      damageDepositDueTiming: next.damageDeposit?.dueTiming ?? "AFTER_ACCEPTANCE",
      damageDepositDueDaysBeforeCheckIn:
        next.damageDeposit?.dueDaysBeforeCheckIn ?? null,
      damageDepositReturnDaysAfterCheckout:
        next.damageDeposit?.returnDaysAfterCheckout ?? null,
      // Cleared along with the policies so a switched-off listing keeps no stale quote.
      depositPoliciesCurrency:
        next.advancePayment || next.damageDeposit ? currency : null,
      depositPoliciesReviewedAt: reviewedAt,
      ...(changed && listing.status === "APPROVED" ? { needsReview: true } : {}),
    },
  });

  return {
    listing: { id: listing.id, slug: listing.slug, status: listing.status },
    policies: { ...next, reviewedAt },
    changed,
  };
}
