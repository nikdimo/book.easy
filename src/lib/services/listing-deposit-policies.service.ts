import "server-only";

import { db } from "@/lib/db";
import {
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
  pricingRule: { select: { currency: true } },
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
    policies: createDepositPoliciesSnapshot(listing),
    // What a new answer will be quoted in. The stored policy currency can lag behind a
    // listing whose pricing currency changed, so the editor is shown the live one.
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
