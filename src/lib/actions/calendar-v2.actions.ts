"use server";

import { auth } from "@/lib/auth";
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
  if (!session?.user?.id) return { error: "Not authorized" as const };
  const listing = await verifyAvailabilityManager(
    { id: session.user.id, role: session.user.role },
    listingId,
  );
  return listing ? { listing } : { error: "Listing not found" as const };
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
