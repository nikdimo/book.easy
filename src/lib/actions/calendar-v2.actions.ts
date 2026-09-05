"use server";

import { auth } from "@/lib/auth";
import { actionText } from "@/lib/actions/action-text";
import {
  blockRangeForManagedListing,
  openWindowForManagedListing,
  removeManualBlocksForManagedListing,
  verifyAvailabilityManager,
} from "@/lib/services/availability-mutation.service";

/**
 * Availability writes for the v2 calendar only.
 *
 * The shared `blockCalendarRange` / `openCalendarRange` pair routes through
 * `resolveAvailabilityCoreOperation`, which redefines what "block" *means* on a
 * closed-by-default listing: it deletes the availability window instead of writing a
 * block. That produced the bug this module exists to fix — a host who blocked two open
 * dates got no record of the decision, no place for a private note, and a grid where
 * their choice was indistinguishable from dates they had never touched.
 *
 * Here the availability mode governs only what happens to dates the host has *not*
 * touched. Blocking always writes a MANUAL_BLOCK, in both modes, so "blocked" means
 * one thing and "closed" means one thing:
 *
 * - **Closed** — never opened. An absence, on a closed-by-default listing.
 * - **Blocked** — the host decided. A row, with an optional private note.
 *
 * The current `/host` panel keeps the old behaviour and is deliberately not touched.
 *
 * Both entry points re-check the session and ownership through the same
 * `verifyAvailabilityManager` the shared actions use; nothing here widens access.
 */

function normalizedResult(
  result: { error?: string; success?: boolean | string } | undefined,
  success: string,
): { error?: string; success?: string } {
  if (result?.error) return { error: result.error };
  return {
    success: typeof result?.success === "string" ? result.success : success,
  };
}

async function managedCalendarListing(listingId: string) {
  const session = await auth();
  if (!session?.user?.id) return { error: await actionText("action.error.not_authorized", "Not authorized") };
  const listing = await verifyAvailabilityManager(
    { id: session.user.id, role: session.user.role },
    listingId,
  );
  return listing
    ? { listing }
    : { error: await actionText("action.error.listing_not_found", "Listing not found") };
}

/** Blocking is one operation in both modes: write the block, keep the note. */
export async function blockCalendarDatesForV2(
  listingId: string,
  input: { startDate: string; endDate: string; reason?: string | null },
) {
  const managed = await managedCalendarListing(listingId);
  if ("error" in managed) return { error: managed.error };
  const result = await blockRangeForManagedListing(managed.listing, {
    startDate: input.startDate,
    endDate: input.endDate,
    reason: input.reason ?? undefined,
  });
  return normalizedResult(result, "Dates blocked.");
}

/**
 * Opening has to undo both reasons a date can be unavailable by the host's own hand.
 *
 * On a closed-by-default listing a manual block outranks an availability window — the
 * booking path requires a window *and* no overlapping block — so widening the window
 * alone would leave the dates blocked and the button would look broken. The window is
 * opened first: if the second step fails the dates stay unavailable, which is the safe
 * direction to fail in.
 */
export async function openCalendarDatesForV2(
  listingId: string,
  input: { startDate: string; endDate: string },
) {
  const managed = await managedCalendarListing(listingId);
  if ("error" in managed) return { error: managed.error };

  if (managed.listing.availabilityMode === "CLOSED") {
    const opened = await openWindowForManagedListing(managed.listing, input);
    if (opened?.error) return { error: opened.error };
  }

  const unblocked = await removeManualBlocksForManagedListing(
    managed.listing,
    input,
  );
  return normalizedResult(unblocked, "Dates are open for booking.");
}

/** One property's ranges, already narrowed to nights that can really move. */
export interface ListingAvailabilityRanges {
  listingId: string;
  ranges: { startDate: string; endDate: string }[];
}

export interface ListingAvailabilityOutcome {
  listingId: string;
  /** Set when this property was not written. The others still were. */
  error?: string;
}

/**
 * The same availability act, across several properties, in one round trip.
 *
 * Blocking dates for a private stay is one decision about a portfolio, and looping the
 * single-property action from the browser would turn it into N requests, N sessions and
 * N chances to half-succeed without anyone noticing. This is that loop moved to where
 * it can be reported honestly.
 *
 * Three things it deliberately does *not* do:
 *
 * 1. **Decide which nights may move.** The caller sends ranges already narrowed by
 *    `buildAvailabilityAction`, exactly as the single-property path does. Re-deriving
 *    them here from a different snapshot is how the two paths would drift apart.
 * 2. **Trust the list of properties.** Ownership is re-checked per listing through the
 *    same `verifyAvailabilityManager` every other action uses. A property the host does
 *    not manage fails on its own and cannot be smuggled in beside ones they do.
 * 3. **Stop at the first failure.** Each property is independent, so one that fails is
 *    reported as failed and the rest are still written. A caller that abandoned the
 *    remainder would leave the host with a partial result *and* no record of which part.
 */
export async function applyAvailabilityToListings(input: {
  listings: ListingAvailabilityRanges[];
  direction: "BLOCK" | "OPEN";
  reason?: string | null;
}): Promise<{ error?: string; results: ListingAvailabilityOutcome[] }> {
  const session = await auth();
  if (!session?.user?.id) {
    return {
      error: await actionText("action.error.not_authorized", "Not authorized"),
      results: [],
    };
  }
  const actor = { id: session.user.id, role: session.user.role };
  const notFound = await actionText(
    "action.error.listing_not_found",
    "Listing not found",
  );

  const results: ListingAvailabilityOutcome[] = [];
  // Sequential on purpose. A portfolio here is a handful of properties, and each write
  // takes an advisory lock on its own listing; running them in parallel would buy
  // nothing measurable and make the failure report harder to reason about.
  for (const entry of input.listings) {
    if (entry.ranges.length === 0) continue;
    const listing = await verifyAvailabilityManager(actor, entry.listingId);
    if (!listing) {
      results.push({ listingId: entry.listingId, error: notFound });
      continue;
    }

    let failure: string | undefined;
    for (const range of entry.ranges) {
      const outcome =
        input.direction === "BLOCK"
          ? await blockRangeForManagedListing(listing, {
              startDate: range.startDate,
              endDate: range.endDate,
              reason: input.reason ?? undefined,
            })
          : await openRangeForManagedListing(listing, range);
      if (outcome?.error) {
        failure = outcome.error;
        break;
      }
    }
    results.push(
      failure
        ? { listingId: entry.listingId, error: failure }
        : { listingId: entry.listingId },
    );
  }

  return { results };
}

/**
 * `openCalendarDatesForV2`'s body, without the per-call session lookup.
 *
 * Takes a listing the caller has already verified, so there is no not-found branch here
 * to answer — and therefore no English sentence for this module to hand back untranslated.
 */
async function openRangeForManagedListing(
  listing: NonNullable<Awaited<ReturnType<typeof verifyAvailabilityManager>>>,
  range: { startDate: string; endDate: string },
) {
  if (listing.availabilityMode === "CLOSED") {
    const opened = await openWindowForManagedListing(listing, range);
    if (opened?.error) return { error: opened.error };
  }
  return removeManualBlocksForManagedListing(listing, range);
}
