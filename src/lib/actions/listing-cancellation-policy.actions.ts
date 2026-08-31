"use server";

import { revalidatePath } from "next/cache";
import { requireHost } from "@/lib/auth-helpers";
import { saveListingCancellationPolicy } from "@/lib/services/listing-cancellation-policy.service";
import { revalidatePublicListingCaches } from "@/lib/utils/revalidate-public-listing-caches";

export async function updateListingCancellationPolicy(
  listingId: string,
  input: unknown,
) {
  const host = await requireHost();
  const result = await saveListingCancellationPolicy(listingId, host.id, input);
  if ("error" in result || "issues" in result) return result;

  revalidatePath(`/host/listings/${listingId}/payment-arrangements`);
  revalidatePath(`/host/listings/${listingId}`);
  revalidatePath("/host");
  if (result.changed && result.listing.status === "APPROVED") {
    revalidatePath(`/properties/${result.listing.slug}`);
    revalidatePublicListingCaches();
  }
  return {
    freeCancellationDaysBeforeCheckIn:
      result.freeCancellationDaysBeforeCheckIn,
    reviewedAt: result.reviewedAt.toISOString(),
  };
}
