"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireHost } from "@/lib/auth-helpers";
import { revalidatePublicListingCaches } from "@/lib/utils/revalidate-public-listing-caches";
import { LISTING_ARRIVAL_GUIDE_SELECT } from "@/lib/services/listing-arrival-guide.service";
import { actionText } from "@/lib/actions/action-text";
import {
  ARRIVAL_FIELD_VISIBILITY,
  arrivalGuideFromRow,
  arrivalGuideRowData,
  listingArrivalGuidePayloadIssues,
  normalizeListingArrivalGuide,
  sameListingArrivalGuide,
  type ArrivalGuideField,
  type ListingArrivalGuideInput,
  type ListingArrivalGuideSaveResult,
} from "@/lib/host/v2/listing-arrival-guide";

function refresh(listingId: string, slug: string, status: string, publicChanged: boolean) {
  revalidatePath(`/host/listings/${listingId}/arrival-guide`);
  revalidatePath(`/host/listings/${listingId}`);
  // Only a live listing has public pages worth rebuilding, and only a change to a field a
  // stranger can read could have changed one. A new Wi-Fi password rebuilds nothing: it is
  // not on any public surface, by construction.
  if (status === "APPROVED" && publicChanged) {
    revalidatePath(`/properties/${slug}`);
    revalidatePublicListingCaches();
  }
}

/** Which of the changed fields are ones a stranger can read. Drives both the public cache
 *  rebuild and whether an approved listing goes back into the admin queue. */
function publicFieldChanged(
  next: ListingArrivalGuideInput,
  previous: ListingArrivalGuideInput,
): boolean {
  return (Object.keys(ARRIVAL_FIELD_VISIBILITY) as ArrivalGuideField[]).some((field) => {
    if (ARRIVAL_FIELD_VISIBILITY[field] !== "PUBLIC") return false;
    return JSON.stringify(next[field as keyof ListingArrivalGuideInput]) !==
      JSON.stringify(previous[field as keyof ListingArrivalGuideInput]);
  });
}

/**
 * Saves the listing's arrival guide.
 *
 * All nine cards' fields travel together on every save, for the same reason House rules
 * sends its whole rule set: they are one section to the host and one debounce in the
 * editor, so sending the state they are actually looking at makes the stored result
 * identical to what they saw — where a per-control stream would let two coalesced saves
 * land out of order.
 *
 * Refused rather than corrected. A check-in method of "FRONT_DESK" or six thousand
 * characters of house manual can only come from a bypassed or stale client, and quietly
 * trimming one would leave the host looking at a listing that says something they never
 * wrote.
 *
 * Two things here differ from every other section's writer, and both follow from these
 * fields being secrets:
 *
 *  * **`needsReview` is only set by a public change.** Editing guest-facing copy on a live
 *    listing puts it back in the admin queue, which is right for a description and wrong
 *    for a Wi-Fi password: it would put a door code in front of a moderator who has no
 *    business reading it, to re-approve a listing whose public content did not change.
 *  * **The public cache is only rebuilt by a public change**, for the same reason.
 *
 * The write always stamps `reviewedAt`, including when nothing changed — a host who opens
 * the section, reads it and has nothing to add has reviewed it just as surely as one who
 * typed something.
 */
export async function updateListingArrivalGuide(
  listingId: string,
  input: ListingArrivalGuideInput,
): Promise<ListingArrivalGuideSaveResult> {
  const user = await requireHost();

  const listing = await db.listing.findFirst({
    where: { id: listingId, hostId: user.id },
    select: {
      id: true,
      slug: true,
      status: true,
      arrivalGuide: { select: LISTING_ARRIVAL_GUIDE_SELECT },
    },
  });
  if (!listing)
    return {
      error: await actionText(
        "action.error.listing_not_found_sentence",
        "Listing not found.",
      ),
    };

  // The payload check, not the normalising one: a method this build does not recognise is
  // a bad request, and reading it as "unanswered" would store a change the host's browser
  // never asked for.
  const issues = listingArrivalGuidePayloadIssues(input);
  if (Object.keys(issues).length > 0) return { issues };

  const guide = normalizeListingArrivalGuide(input);
  const stored = arrivalGuideFromRow(listing.arrivalGuide);
  const changed = !sameListingArrivalGuide(guide, stored);
  const publicChanged = changed && publicFieldChanged(guide, stored);
  const reviewedAt = new Date();

  // `checkoutInstructions` is the one column Prisma types as JSON, and an array of
  // objects does not satisfy its `InputJsonObject` overload without being named as a
  // JSON value. The shape is guaranteed by `normalizeCheckoutInstructions` above.
  const { checkoutInstructions, ...columns } = arrivalGuideRowData(guide);
  const rowData = {
    ...columns,
    checkoutInstructions: checkoutInstructions as unknown as Prisma.InputJsonValue,
  };
  // Upsert rather than update: a host who has never opened this section has no row, and
  // creating one on read would mean a page view wrote to the database.
  await db.listingArrivalGuide.upsert({
    where: { listingId: listing.id },
    create: { listingId: listing.id, ...rowData, reviewedAt },
    update: { ...(changed ? rowData : {}), reviewedAt },
  });

  if (publicChanged && listing.status === "APPROVED") {
    await db.listing.update({ where: { id: listing.id }, data: { needsReview: true } });
  }

  if (changed) refresh(listing.id, listing.slug, listing.status, publicChanged);
  else revalidatePath(`/host/listings/${listingId}/arrival-guide`);

  return { guide, reviewedAt: reviewedAt.toISOString() };
}
