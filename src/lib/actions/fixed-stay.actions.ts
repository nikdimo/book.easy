"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import {
  addFixedStayPeriodForManagedListing,
  confirmFixedStayQuickSetupForManagedListing,
  deleteFixedStayPeriodForManagedListing,
  previewFixedStayQuickSetupForManagedListing,
  setBookingModeForManagedListing,
  setFixedStayPeriodDisabledForManagedListing,
  updateFixedStayPeriodForManagedListing,
  verifyFixedStayManager,
  type ManagedFixedStayListing,
} from "@/lib/services/fixed-stay-mutation.service";
import { revalidatePublicListingCaches } from "@/lib/utils/revalidate-public-listing-caches";
import type { Weekday } from "@/lib/utils/date-only";
import type { FixedStayNights } from "@/lib/utils/fixed-stay-periods";

/**
 * The fixed-stay write surface the host Calendar will call in Phase 3.
 *
 * Thin on purpose. Each entry point does four things and no more: prove there is a
 * session, prove this session may manage this listing, parse the untrusted payload into
 * the small shape the service accepts, and — after a write succeeds — refresh the caches
 * that were showing the old answer. Every product rule lives in the service, where it can
 * be re-checked inside the transaction that writes.
 *
 * Two things are deliberately *not* accepted from a client, anywhere in this file:
 *
 * - **A checkout date.** Add and edit take a check-in and a length; the checkout is
 *   derived on the server. A client that could send its own checkout could send a stay of
 *   any length past every rule that exists.
 * - **A list of generated periods.** Quick setup's confirm takes the same four answers
 *   the preview took and regenerates the rows itself, so an approved preview and a
 *   written season come from one function rather than from the browser's copy of one.
 *
 * There is no price parameter, and nothing here returns one: a fixed stay has no price of
 * its own, and Phase 2 does not quote.
 *
 * No UI strings are registered from this file — Phase 3 owns what the host reads.
 */

const listingIdSchema = z.string().min(1);
const ymdSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date.");
const nightsSchema = z.union([z.literal(7), z.literal(14)]);
const periodIdSchema = z.string().min(1);

const bookingModeSchema = z.union([
  z.literal("FLEXIBLE"),
  z.literal("FIXED_STAYS"),
]);

const periodInputSchema = z.object({
  checkIn: ymdSchema,
  nights: nightsSchema,
});

const updatePeriodInputSchema = periodInputSchema.extend({
  periodId: periodIdSchema,
});

const quickSetupSchema = z.object({
  seasonStart: ymdSchema,
  lastCheckOut: ymdSchema,
  // 0–6, Sunday first, matching `weekdayOfYmd`. A value outside the week is a bad
  // request, never a silently corrected one.
  changeoverWeekday: z.number().int().min(0).max(6),
  nights: z.array(nightsSchema).min(1).max(2),
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
  revalidatePath(`/host/listings/${listing.id}/availability`);
  revalidatePath(`/host/listings/${listing.id}/pricing`);
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
 * Switches the listing between flexible dates and fixed stays.
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

/** What a Quick setup run would produce. Reads only; nothing is written. */
export async function previewFixedStayQuickSetup(
  listingId: string,
  input: {
    seasonStart: string;
    lastCheckOut: string;
    changeoverWeekday: number;
    nights: number[];
  },
) {
  const parsed = quickSetupSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the season dates." };
  }

  const managed = await managedListing(listingId);
  if ("error" in managed) return { error: managed.error };

  return previewFixedStayQuickSetupForManagedListing(managed.listing, {
    seasonStart: parsed.data.seasonStart,
    lastCheckOut: parsed.data.lastCheckOut,
    changeoverWeekday: parsed.data.changeoverWeekday as Weekday,
    nights: parsed.data.nights as FixedStayNights[],
  });
}

/**
 * Applies a Quick setup run.
 *
 * Takes the four answers, not the previewed rows: the server regenerates the season and
 * creates only the stays the listing does not already offer, so re-running the same setup
 * writes nothing and disturbs no existing period.
 */
export async function confirmFixedStayQuickSetup(
  listingId: string,
  input: {
    seasonStart: string;
    lastCheckOut: string;
    changeoverWeekday: number;
    nights: number[];
  },
) {
  const parsed = quickSetupSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the season dates." };
  }

  const managed = await managedListing(listingId);
  if ("error" in managed) return { error: managed.error };

  const result = await confirmFixedStayQuickSetupForManagedListing(
    managed.listing,
    managed.actorId,
    {
      seasonStart: parsed.data.seasonStart,
      lastCheckOut: parsed.data.lastCheckOut,
      changeoverWeekday: parsed.data.changeoverWeekday as Weekday,
      nights: parsed.data.nights as FixedStayNights[],
    },
  );
  if ("error" in result) return result;

  revalidateFixedStayPaths(managed.listing);
  return result;
}

/** Adds one stay. The checkout is derived from the check-in and the chosen length. */
export async function addFixedStayPeriod(
  listingId: string,
  input: { checkIn: string; nights: number },
) {
  const parsed = periodInputSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the stay dates." };
  }

  const managed = await managedListing(listingId);
  if ("error" in managed) return { error: managed.error };

  const result = await addFixedStayPeriodForManagedListing(
    managed.listing,
    managed.actorId,
    parsed.data,
  );
  if ("error" in result) return result;

  revalidateFixedStayPaths(managed.listing);
  return result;
}

/** Moves one stay. The checkout is re-derived, never taken from the client. */
export async function updateFixedStayPeriod(
  listingId: string,
  input: { periodId: string; checkIn: string; nights: number },
) {
  const parsed = updatePeriodInputSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the stay dates." };
  }

  const managed = await managedListing(listingId);
  if ("error" in managed) return { error: managed.error };

  const result = await updateFixedStayPeriodForManagedListing(
    managed.listing,
    managed.actorId,
    parsed.data,
  );
  if ("error" in result) return result;

  revalidateFixedStayPaths(managed.listing);
  return result;
}

/** Switches one stay off, or back on. The row and any booking that names it survive. */
export async function setFixedStayPeriodEnabled(
  listingId: string,
  periodId: string,
  enabled: boolean,
) {
  const parsedPeriodId = periodIdSchema.safeParse(periodId);
  if (!parsedPeriodId.success) return { error: "Fixed stay not found." };
  if (typeof enabled !== "boolean") return { error: "Choose on or off." };

  const managed = await managedListing(listingId);
  if ("error" in managed) return { error: managed.error };

  const result = await setFixedStayPeriodDisabledForManagedListing(
    managed.listing,
    managed.actorId,
    { periodId: parsedPeriodId.data, disabled: !enabled },
  );
  if ("error" in result) return result;

  revalidateFixedStayPaths(managed.listing);
  return result;
}

/** Removes one stay from the offer. Refused for a booked or already-started stay. */
export async function deleteFixedStayPeriod(listingId: string, periodId: string) {
  const parsedPeriodId = periodIdSchema.safeParse(periodId);
  if (!parsedPeriodId.success) return { error: "Fixed stay not found." };

  const managed = await managedListing(listingId);
  if ("error" in managed) return { error: managed.error };

  const result = await deleteFixedStayPeriodForManagedListing(
    managed.listing,
    managed.actorId,
    parsedPeriodId.data,
  );
  if ("error" in result) return result;

  revalidateFixedStayPaths(managed.listing);
  return result;
}
