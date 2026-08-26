import "server-only";

import { db } from "@/lib/db";
import {
  createDepositPolicySnapshot,
  validateDepositPolicy,
  type DepositPolicyConfig,
  type DepositPolicyIssues,
} from "@/lib/payments/deposit-policy";

const SELECT = {
  id: true,
  slug: true,
  status: true,
  depositPolicy: true,
  depositPurpose: true,
  depositValue: true,
  depositCurrency: true,
  depositDueTiming: true,
  depositDueDaysBeforeCheckIn: true,
  depositReturnDaysAfterCheckout: true,
  depositPolicyReviewedAt: true,
  pricingRule: { select: { currency: true } },
} as const;

export async function getListingDepositPolicyData(listingId: string, hostId: string) {
  const listing = await db.listing.findFirst({
    where: { id: listingId, hostId },
    select: SELECT,
  });
  if (!listing) return null;
  return {
    listing: { id: listing.id, slug: listing.slug, status: listing.status },
    policy: createDepositPolicySnapshot(listing),
    listingCurrency: listing.pricingRule?.currency ?? "EUR",
  };
}

export type SaveListingDepositPolicyResult =
  | { error: string }
  | { issues: DepositPolicyIssues }
  | {
      listing: { id: string; slug: string; status: string };
      policy: DepositPolicyConfig & { reviewedAt: Date };
      changed: boolean;
    };

function rawObject(input: unknown): Record<string, unknown> {
  return input && typeof input === "object" && !Array.isArray(input)
    ? (input as Record<string, unknown>)
    : {};
}

export async function saveListingDepositPolicy(
  listingId: string,
  hostId: string,
  input: unknown,
): Promise<SaveListingDepositPolicyResult> {
  const listing = await db.listing.findFirst({
    where: { id: listingId, hostId },
    select: SELECT,
  });
  if (!listing) return { error: "Listing not found." };

  const raw = rawObject(input);
  const policyCode = typeof raw.policy === "string" ? raw.policy.toUpperCase() : "";
  if (policyCode !== "NONE" && !listing.pricingRule?.currency) {
    return { error: "Set the listing currency before requiring a deposit." };
  }
  const validation = validateDepositPolicy({
    ...raw,
    currency: policyCode === "NONE" ? null : listing.pricingRule!.currency,
  });
  if (!validation.success) return { issues: validation.issues };

  const current = createDepositPolicySnapshot(listing);
  const next = validation.value;
  const changed =
    current.status !== "REVIEWED" ||
    current.policy !== next.policy ||
    current.purpose !== next.purpose ||
    current.value !== next.value ||
    current.currency !== next.currency ||
    current.dueTiming !== next.dueTiming ||
    current.dueDaysBeforeCheckIn !== next.dueDaysBeforeCheckIn ||
    current.returnDaysAfterCheckout !== next.returnDaysAfterCheckout;
  const reviewedAt = new Date();

  await db.listing.update({
    where: { id: listing.id },
    data: {
      depositPolicy: next.policy,
      depositPurpose: next.purpose,
      depositValue: next.value,
      depositCurrency: next.currency,
      depositDueTiming: next.dueTiming,
      depositDueDaysBeforeCheckIn: next.dueDaysBeforeCheckIn,
      depositReturnDaysAfterCheckout: next.returnDaysAfterCheckout,
      depositPolicyReviewedAt: reviewedAt,
      ...(changed && listing.status === "APPROVED" ? { needsReview: true } : {}),
    },
  });

  return {
    listing: { id: listing.id, slug: listing.slug, status: listing.status },
    policy: { ...next, reviewedAt },
    changed,
  };
}
