import "server-only";

import { db } from "@/lib/db";
import { validateCancellationPolicy } from "@/lib/payments/cancellation-policy";

export async function getListingCancellationPolicyData(
  listingId: string,
  hostId: string,
) {
  return db.listing.findFirst({
    where: { id: listingId, hostId },
    select: {
      id: true,
      slug: true,
      status: true,
      freeCancellationDaysBeforeCheckIn: true,
      cancellationPolicyReviewedAt: true,
    },
  });
}

export async function saveListingCancellationPolicy(
  listingId: string,
  hostId: string,
  input: unknown,
) {
  const listing = await getListingCancellationPolicyData(listingId, hostId);
  if (!listing) return { error: "Listing not found." } as const;

  const raw =
    input && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>).freeCancellationDaysBeforeCheckIn
      : undefined;
  const validation = validateCancellationPolicy(raw);
  if (!validation.success) {
    return {
      issues: {
        freeCancellationDaysBeforeCheckIn:
          validation.issue === "REQUIRED" ? "required" : "invalid",
      },
    } as const;
  }

  const changed =
    listing.cancellationPolicyReviewedAt === null ||
    listing.freeCancellationDaysBeforeCheckIn !== validation.value;
  const reviewedAt = new Date();
  await db.listing.update({
    where: { id: listing.id },
    data: {
      freeCancellationDaysBeforeCheckIn: validation.value,
      cancellationPolicyReviewedAt: reviewedAt,
      ...(changed && listing.status === "APPROVED" ? { needsReview: true } : {}),
    },
  });
  return {
    listing: { id: listing.id, slug: listing.slug, status: listing.status },
    freeCancellationDaysBeforeCheckIn: validation.value,
    reviewedAt,
    changed,
  } as const;
}
