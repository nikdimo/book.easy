"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireHost } from "@/lib/auth-helpers";
import { revalidatePublicListingCaches } from "@/lib/utils/revalidate-public-listing-caches";
import { actionText } from "@/lib/actions/action-text";
import {
  listingBasicsComplete,
  listingBasicsIssues,
  normalizeListingBasics,
  type ListingBasicsSaveResult,
} from "@/lib/host/v2/listing-basics";

function refresh(listingId: string, slug: string, status: string) {
  revalidatePath(`/host/listings/${listingId}/basics`);
  revalidatePath(`/host/listings/${listingId}`);
  revalidatePath(`/host/listings/${listingId}/edit`);
  // The overview shows the title, so it is stale the moment this saves — on any status.
  revalidatePath("/host/listings");
  revalidatePath("/host/listings");
  // Only a live listing has public pages worth rebuilding; a draft's copy is not on any
  // guest-facing surface yet.
  if (status === "APPROVED") {
    revalidatePath(`/properties/${slug}`);
    revalidatePublicListingCaches();
  }
}

/**
 * Saves the listing's title and description.
 *
 * Both fields travel together on every save. They are one section to the host and one
 * autosave debounce in the editor, so sending the state they are actually looking at
 * makes the stored result identical to what they saw — where a per-field stream would
 * let two coalesced saves land out of order.
 *
 * The text is stored exactly as the host typed it, minus surrounding whitespace. Guests
 * reading in another language get the runtime translation of *this* text; nothing
 * machine-translated is ever written back here, or the host's own words would be
 * replaced by a round-trip through a translator the first time they edited from a
 * non-English session.
 */
export async function updateListingBasics(
  listingId: string,
  input: { title: string; description: string },
): Promise<ListingBasicsSaveResult> {
  const user = await requireHost();

  const listing = await db.listing.findFirst({
    where: { id: listingId, hostId: user.id },
    select: { id: true, slug: true, status: true, title: true, description: true },
  });
  if (!listing) return { error: await actionText("action.error.listing_not_found_sentence", "Listing not found.") };

  // The client validates too, so this is the case where it was bypassed or is stale.
  // Rejecting rather than truncating: a description cut at 5000 characters mid-sentence
  // is not what the host wrote, and they would not be told it happened.
  const issues = listingBasicsIssues(input);
  if (Object.keys(issues).length > 0) return { issues };

  const { title, description } = normalizeListingBasics(input);

  if (title !== listing.title || description !== listing.description) {
    await db.listing.update({
      where: { id: listingId },
      data: {
        title,
        description,
        // Editing a live listing stays live (listings publish immediately), but flags it
        // for admin re-review since guest-facing copy just changed post-approval. Same
        // rule the classic detail edit applies.
        ...(listing.status === "APPROVED" ? { needsReview: true } : {}),
      },
    });
    refresh(listing.id, listing.slug, listing.status);
  }

  return {
    title,
    description,
    complete: listingBasicsComplete({ title, description }),
  };
}
