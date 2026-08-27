"use server";

import { revalidatePath } from "next/cache";
import { requireHost } from "@/lib/auth-helpers";
import { saveListingDepositPolicies } from "@/lib/services/listing-deposit-policies.service";
import { revalidatePublicListingCaches } from "@/lib/utils/revalidate-public-listing-caches";

export async function updateListingDepositPolicies(
  listingId: string,
  input: unknown,
) {
  const host = await requireHost();
  const result = await saveListingDepositPolicies(listingId, host.id, input);
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
    advancePayment: result.policies.advancePayment,
    damageDeposit: result.policies.damageDeposit,
    reviewedAt: result.policies.reviewedAt.toISOString(),
  };
}
