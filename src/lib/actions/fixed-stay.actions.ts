"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import {
  setBookingModeForManagedListing,
  setChangeoverWeekdayForManagedListing,
  setStayLimitsForManagedListing,
  verifyFixedStayManager,
  type ManagedFixedStayListing,
} from "@/lib/services/fixed-stay-mutation.service";
import { revalidatePublicListingCaches } from "@/lib/utils/revalidate-public-listing-caches";
import {
  CHANGEOVER_WEEKDAY_NAMES,
  type ChangeoverWeekdayName,
} from "@/lib/utils/weekly-stay";

/**
 * The weekly-booking write surface used by the host Calendar.
 *
 * Thin on purpose. Each entry point does four things and no more: prove there is a
 * session, prove this session may manage this listing, parse the untrusted payload into
 * the small shape the service accepts, and — after a write succeeds — refresh the caches
 * that were showing the old answer. Every product rule lives in the service, where it can
 * be re-checked inside the transaction that writes.
 *
 * No package dates or package prices are accepted. Weekly mode is a listing-wide rule:
 * booking mode, one changeover weekday, and the existing minimum/maximum stay.
 *
 * No UI strings are registered from this file — Phase 3 owns what the host reads.
 */

const listingIdSchema = z.string().min(1);

const bookingModeSchema = z.union([
  z.literal("FLEXIBLE"),
  z.literal("FIXED_STAYS"),
]);

/** One of the seven stored day names, and nothing else. */
const changeoverSchema = z.enum(
  CHANGEOVER_WEEKDAY_NAMES as unknown as [string, ...string[]],
);

const stayLimitsSchema = z.object({
  minNights: z.coerce
    .number()
    .int()
    .min(1, "A minimum stay must be at least 1 night.")
    .max(365),
  // Zero is the stored spelling of "no maximum", which is how every other surface in the
  // product already reads this column.
  maxNights: z.coerce
    .number()
    .int()
    .min(0, "A maximum stay must be at least 1 night.")
    .max(365),
});

/**
 * The listing this session may manage, and who is asking — or the refusal.
 *
 * One session read per call, and the actor it resolves travels with the listing so that
 * the write below cannot end up attributing an audit entry to a second, separately read
 * session.
 */
async function managedListing(
  listingId: unknown,
): Promise<
  { listing: ManagedFixedStayListing; actorId: string } | { error: string }
> {
  const parsedId = listingIdSchema.safeParse(listingId);
  if (!parsedId.success) return { error: "Listing not found." };

  const session = await auth();
  if (!session?.user?.id) return { error: "Not authorized." };

  const listing = await verifyFixedStayManager(
    { id: session.user.id, role: session.user.role },
    parsedId.data,
  );
  // Deliberately the same sentence for "no such listing" and "not yours": a different
  // answer for each would confirm that another host's listing id is real.
  return listing
    ? { listing, actorId: session.user.id }
    : { error: "Listing not found." };
}

/**
 * Everything that was showing this listing's stays.
 *
 * The host Calendar and the listing editor read them directly; the public page and the
 * marketplace read them through the listing, and only for a live listing — a draft has no
 * guest-facing surface worth rebuilding.
 */
function revalidateFixedStayPaths(listing: ManagedFixedStayListing): void {
  // Both spellings of the editor routes, deliberately. `next.config` rewrites
  // `/host/listings/:id/:section` onto `/host/v2/listings/:id/:section`, and
  // `revalidatePath` matches the *destination* — the route file's own path — not the
  // source the address bar shows. The `/host/listings/...` entries are what the rest of
  // this codebase passes; the `/host/v2/...` ones are the paths that actually clear.
  // Booking rules are read on the availability page, so this one has to land.
  revalidatePath(`/host/listings/${listing.id}/availability`);
  revalidatePath(`/host/listings/${listing.id}/pricing`);
  revalidatePath(`/host/v2/listings/${listing.id}/availability`);
  revalidatePath(`/host/v2/listings/${listing.id}/pricing`);
  revalidatePath(`/host/v2/listings/${listing.id}`);
  revalidatePath(`/host/listings/${listing.id}`);
  revalidatePath("/host/calendar");
  revalidatePath("/host/listings");
  revalidatePath(`/admin/listings/${listing.id}`);
  if (listing.slug && listing.status === "APPROVED") {
    revalidatePath(`/properties/${listing.slug}`);
    revalidatePublicListingCaches();
  }
}

/**
 * Switches the listing between flexible dates and weekly stays.
 *
 * Only `Listing.bookingMode` changes. Availability windows, the minimum stay, prices,
 * promotions, blocks, bookings and every stored period survive the switch untouched, so
 * switching back restores exactly what the host had.
 */
export async function setListingBookingMode(
  listingId: string,
  mode: "FLEXIBLE" | "FIXED_STAYS",
) {
  const parsedMode = bookingModeSchema.safeParse(mode);
  if (!parsedMode.success) {
    return { error: "Choose either flexible dates or fixed stays." };
  }

  const managed = await managedListing(listingId);
  if ("error" in managed) return { error: managed.error };

  const result = await setBookingModeForManagedListing(
    managed.listing,
    managed.actorId,
    parsedMode.data,
  );
  if ("error" in result) return result;

  revalidateFixedStayPaths(managed.listing);
  return result;
}

/**
 * Sets the day a weekly listing changes over on.
 *
 * The one weekly-specific setting there is. Everything else about how long a guest may
 * stay is the listing's ordinary minimum and maximum, set below and shared with the
 * flexible calendar.
 */
export async function setListingChangeoverWeekday(
  listingId: string,
  weekday: string | null,
) {
  const parsed =
    weekday === null ? { success: true as const, data: null } : changeoverSchema.safeParse(weekday);
  if (!parsed.success) return { error: "Choose a changeover day." };

  const managed = await managedListing(listingId);
  if ("error" in managed) return { error: managed.error };

  const result = await setChangeoverWeekdayForManagedListing(
    managed.listing,
    managed.actorId,
    parsed.data as ChangeoverWeekdayName | null,
  );
  if ("error" in result) return result;

  revalidateFixedStayPaths(managed.listing);
  return result;
}

/**
 * Sets the listing's minimum and maximum stay.
 *
 * One pair of numbers for both booking modes. On a flexible listing they bound any range
 * a guest picks; on a weekly one they bound how many whole weeks are offered — which is
 * how a host says "fortnights only" without a stay-length menu existing anywhere.
 */
export async function setListingStayLimits(
  listingId: string,
  input: { minNights: number; maxNights: number },
) {
  const parsed = stayLimitsSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the stay limits." };
  }

  const managed = await managedListing(listingId);
  if ("error" in managed) return { error: managed.error };

  const result = await setStayLimitsForManagedListing(
    managed.listing,
    managed.actorId,
    parsed.data,
  );
  if ("error" in result) return result;

  revalidateFixedStayPaths(managed.listing);
  return result;
}
