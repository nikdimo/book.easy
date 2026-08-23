"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireHost } from "@/lib/auth-helpers";
import { revalidatePublicListingCaches } from "@/lib/utils/revalidate-public-listing-caches";
import { LISTING_HOUSE_RULES_SELECT } from "@/lib/services/listing-house-rules.service";
import {
  houseRulesFromRow,
  houseRulesRowData,
  listingHouseRulesPayloadIssues,
  normalizeListingHouseRules,
  sameListingHouseRules,
  type ListingHouseRulesInput,
  type ListingHouseRulesSaveResult,
} from "@/lib/host/v2/listing-house-rules";

function refresh(listingId: string, slug: string, status: string) {
  revalidatePath(`/host/listings/${listingId}/house-rules`);
  revalidatePath(`/host/listings/${listingId}`);
  revalidatePath(`/host/listings/${listingId}/edit`);
  // Only a live listing has public pages worth rebuilding; a draft's rules are not on
  // any guest-facing surface yet.
  if (status === "APPROVED") {
    revalidatePath(`/properties/${slug}`);
    revalidatePublicListingCaches();
  }
}

/**
 * Saves the listing's house rules.
 *
 * All of them travel together on every save. They are one section to the host and one
 * debounce in the editor, so sending the state they are actually looking at makes the
 * stored result identical to what they saw — where a per-control stream would let two
 * coalesced saves land out of order.
 *
 * Refused rather than corrected. A guest count of 40, a time of "25:00" or a pet policy
 * of "MAYBE" can only come from a bypassed or stale client, and quietly clamping one
 * would leave the host looking at a listing that says something they never chose. The
 * classic form's transform does coerce, and stays that way: it is parsing one `FormData`
 * submission where a partial rejection would fail a publish, and nothing here changes it.
 *
 * Unanswered policies are accepted. Every listing published before these columns existed
 * has four of them, and the editor is not the place to make a host answer a question they
 * were never asked — the create flow, which does ask, is where `requireAnswers` lives.
 *
 * `maxGuests` is only ever lowered against future *requests* — the booking service checks
 * it when a party asks to book. Stays already accepted above the new limit are left alone,
 * which is why the editor warns about them instead of this refusing the write.
 *
 * The write always stamps `houseRulesReviewedAt`, including when nothing changed. A host
 * who opens the section, reads it and agrees with every answer has reviewed it just as
 * surely as one who changed something, and that is exactly the claim the editor's tick
 * makes. Nothing else on the listing is touched in that case.
 */
export async function updateListingHouseRules(
  listingId: string,
  input: ListingHouseRulesInput,
): Promise<ListingHouseRulesSaveResult> {
  const user = await requireHost();

  const listing = await db.listing.findFirst({
    where: { id: listingId, hostId: user.id },
    select: LISTING_HOUSE_RULES_SELECT,
  });
  if (!listing) return { error: "Listing not found." };

  // The payload check, not the normalising one: a policy this build does not recognise
  // is a bad request, and reading it as "unanswered" would store a change the host's
  // browser never asked for.
  const issues = listingHouseRulesPayloadIssues(input);
  if (Object.keys(issues).length > 0) return { issues };

  const rules = normalizeListingHouseRules(input);
  const stored = houseRulesFromRow(listing);
  const changed = !sameListingHouseRules(rules, stored);
  // Guest-facing copy in the host's own words, exactly like title and description: an
  // edit to it on a live listing goes back into the admin queue. Nothing here ever
  // writes a machine translation into the column — what the host typed is what is
  // stored, and translation happens at render time or not at all.
  const reviewedAt = new Date();

  await db.listing.update({
    where: { id: listingId },
    data: {
      ...(changed ? houseRulesRowData(rules) : {}),
      houseRulesReviewedAt: reviewedAt,
      // Editing a live listing stays live (listings publish immediately), but flags it
      // for admin re-review since guest-facing terms just changed post-approval. Same
      // rule the classic detail edit and the Title & description tab apply. Merely
      // reviewing without changing anything is not a content change, so it does not
      // put the listing back in the queue.
      ...(changed && listing.status === "APPROVED" ? { needsReview: true } : {}),
    },
  });

  if (changed) refresh(listing.id, listing.slug, listing.status);
  else revalidatePath(`/host/listings/${listingId}/house-rules`);

  return { rules, reviewedAt: reviewedAt.toISOString() };
}
