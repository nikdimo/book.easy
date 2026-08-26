"use server";

import { revalidatePath } from "next/cache";
import { requireHost } from "@/lib/auth-helpers";
import { saveListingDepositPolicy } from "@/lib/services/listing-deposit-policy.service";
import { revalidatePublicListingCaches } from "@/lib/utils/revalidate-public-listing-caches";

export async function updateListingDepositPolicy(listingId: string, input: unknown) {
  const host = await requireHost();
  const result = await saveListingDepositPolicy(listingId, host.id, input);
  if ("error" in result) return { error: result.error };
  if ("issues" in result) return { issues: result.issues };

  revalidatePath(`/host/listings/${listingId}/payment-arrangements`);
  revalidatePath(`/host/listings/${listingId}`);
  // The host dashboard derives its payment-arrangements task from this review marker.
  revalidatePath("/host");
  if (result.changed && result.listing.status === "APPROVED") {
    revalidatePath(`/properties/${result.listing.slug}`);
    revalidatePublicListingCaches();
  }
  return {
    policy: result.policy.policy,
    purpose: result.policy.purpose,
    value: result.policy.value,
    dueTiming: result.policy.dueTiming,
    dueDaysBeforeCheckIn: result.policy.dueDaysBeforeCheckIn,
    returnDaysAfterCheckout: result.policy.returnDaysAfterCheckout,
    reviewedAt: result.policy.reviewedAt.toISOString(),
  };
}
