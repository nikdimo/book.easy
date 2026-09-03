import "server-only";

import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { createAuditLog } from "@/lib/services/audit.service";
import {
  isChangeoverWeekdayName,
  weeklyStayWeekRange,
  type ChangeoverWeekdayName,
} from "@/lib/utils/weekly-stay";

/**
 * Every write that touches a listing's weekly booking rules.
 *
 * Three rules hold across all of them, and they are the reason this is one module rather
 * than seven functions scattered about:
 *
 * 1. **The lock is the same lock.** Every write takes
 *    `pg_advisory_xact_lock(hashtext(listingId))` — the identical key `createBooking`,
 *    `blockDates` and the availability mutations take. A different key would be no lock
 *    at all: two transactions holding different keys for the same listing serialize
 *    against nobody.
 * 2. **Nothing is trusted across the lock.** Current values are re-read inside the
 *    transaction immediately before writing, so a host edit cannot race a booking.
 *
 * Switching booking mode never changes availability windows, stay limits, prices,
 * promotions, blocks or bookings, which makes the switch safe to try.
 *
 * There is no price field on any input or output in this file, and no quote is computed.
 */

export interface FixedStayActor {
  id: string;
  role: string;
}

export type ListingBookingModeValue = "FLEXIBLE" | "FIXED_STAYS";

export interface ManagedFixedStayListing {
  id: string;
  slug: string | null;
  status: string;
  bookingMode: ListingBookingModeValue;
}

/**
 * The listing this actor is allowed to manage, or null.
 *
 * Ownership is the query, exactly as in `verifyAvailabilityManager`: a host reaches only
 * rows whose `hostId` is theirs, so another host's listing id comes back as "not found"
 * rather than as a refusal that confirms it exists. Admins reach any listing, matching
 * every other host-managed surface in this repository.
 */
export async function verifyFixedStayManager(
  actor: FixedStayActor,
  listingId: string,
): Promise<ManagedFixedStayListing | null> {
  const listing = await db.listing.findFirst({
    where: {
      id: listingId,
      ...(actor.role === "ADMIN" ? {} : { hostId: actor.id }),
    },
    select: { id: true, slug: true, status: true, bookingMode: true },
  });
  return listing as ManagedFixedStayListing | null;
}

export type FixedStayMutationError = { error: string };

type TransactionClient = Prisma.TransactionClient;

/** The one lock key, shared with booking and availability writes. */
async function lockListing(tx: TransactionClient, listingId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${listingId}))`;
}

/**
 * Records a fixed-stay write, after its transaction has committed.
 *
 * Outside the transaction on purpose: the audit row is a record of what happened, so
 * writing it inside would either hold the listing's advisory lock for an extra write or
 * claim an event that then rolled back.
 */
async function recordFixedStayAudit(
  actorId: string,
  listingId: string,
  action: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  await createAuditLog({
    userId: actorId,
    action,
    entityType: "Listing",
    entityId: listingId,
    metadata,
  });
}

// ─── Booking mode ───────────────────────────────────────────────────────────────

/**
 * Switches how the listing sells, and changes nothing else.
 *
 * One column. Availability, stay limits, pricing and bookings remain untouched. A weekly
 * listing without a changeover weekday fails closed until the host chooses one.
 */
export async function setBookingModeForManagedListing(
  listing: ManagedFixedStayListing,
  actorId: string,
  mode: ListingBookingModeValue,
): Promise<FixedStayMutationError | { success: true; bookingMode: ListingBookingModeValue }> {
  if (mode !== "FLEXIBLE" && mode !== "FIXED_STAYS") {
    return { error: "Choose either flexible dates or fixed stays." };
  }
  const result = await db.$transaction(
    async (
      tx,
    ): Promise<
      | FixedStayMutationError
      | {
          success: true;
          previous: ListingBookingModeValue;
          changed: boolean;
        }
    > => {
      // Mode changes share the listing lock with bookings and calendar writes.
      await lockListing(tx, listing.id);
      const current = await tx.listing.findUnique({
        where: { id: listing.id },
        select: {
          bookingMode: true,
          changeoverWeekday: true,
          pricingRule: { select: { minNights: true, maxNights: true } },
        },
      });
      if (!current) return { error: "Listing not found." };
      if (mode === "FIXED_STAYS" && current.changeoverWeekday === null) {
        return { error: "Choose a changeover day before turning on weekly stays." };
      }
      if (
        mode === "FIXED_STAYS" &&
        current.pricingRule &&
        !weeklyStayWeekRange(current.pricingRule)
      ) {
        return {
          error: "Adjust the minimum and maximum so at least one whole week can be booked.",
        };
      }
      if (current.bookingMode === mode) {
        return { success: true, previous: current.bookingMode, changed: false };
      }

      await tx.listing.update({
        where: { id: listing.id },
        data: { bookingMode: mode },
      });
      return { success: true, previous: current.bookingMode, changed: true };
    },
  );
  if ("error" in result) return result;

  if (result.changed) {
    await recordFixedStayAudit(actorId, listing.id, "LISTING_BOOKING_MODE_CHANGED", {
      from: result.previous,
      to: mode,
    });
  }
  return { success: true, bookingMode: mode };
}

// ─── The weekly rule ────────────────────────────────────────────────────────────

/**
 * Sets the day a weekly listing changes over on.
 *
 * The one thing a weekly listing needs beyond its stay limits, and the only weekly
 * setting stored on the listing at all. Null clears it, which puts the listing back into
 * the state it fails closed in: it offers no dates until a day is chosen again.
 *
 * Takes the same per-listing advisory lock every other write here takes, so a host
 * changing the day cannot land between a guest's availability check and their booking.
 */
export async function setChangeoverWeekdayForManagedListing(
  listing: ManagedFixedStayListing,
  actorId: string,
  weekday: ChangeoverWeekdayName | null,
): Promise<
  FixedStayMutationError | { success: true; changeoverWeekday: ChangeoverWeekdayName | null }
> {
  if (weekday !== null && !isChangeoverWeekdayName(weekday)) {
    return { error: "Choose a changeover day." };
  }

  const result = await db.$transaction(
    async (
      tx,
    ): Promise<
      | FixedStayMutationError
      | { success: true; changeoverWeekday: ChangeoverWeekdayName | null }
    > => {
      await lockListing(tx, listing.id);
      const current = await tx.listing.findUnique({
        where: { id: listing.id },
        select: { bookingMode: true, changeoverWeekday: true },
      });
      if (!current) return { error: "Listing not found." };
      if (current.bookingMode === "FIXED_STAYS" && weekday === null) {
        return { error: "A weekly listing must have a changeover day." };
      }
      if (current.changeoverWeekday === weekday) {
        return { success: true as const, changeoverWeekday: weekday };
      }
      await tx.listing.update({
        where: { id: listing.id },
        data: { changeoverWeekday: weekday },
      });
      return { success: true as const, changeoverWeekday: weekday };
    },
  );

  if ("success" in result) {
    await recordFixedStayAudit(actorId, listing.id, "LISTING_CHANGEOVER_DAY_SET", {
      changeoverWeekday: weekday,
    });
  }
  return result;
}

/**
 * The listing's minimum and maximum stay.
 *
 * One pair of numbers, one place to set them, and they mean the same thing in both
 * booking modes: a flexible listing measures any range against them, and a weekly listing
 * measures its whole weeks against them. Written straight onto `PricingRule` — the
 * columns the quote engine, the search filter and `createBooking` already read — rather
 * than into weekly-specific copies that could drift.
 *
 * The base price and the cleaning fee are deliberately untouched. They live in Default
 * pricing, where changing them is weighed against every future night.
 */
export async function setStayLimitsForManagedListing(
  listing: ManagedFixedStayListing,
  actorId: string,
  input: { minNights: number; maxNights: number },
): Promise<FixedStayMutationError | { success: true; minNights: number; maxNights: number }> {
  const { minNights, maxNights } = input;
  if (!Number.isInteger(minNights) || minNights < 1 || minNights > 365) {
    return { error: "A minimum stay must be between 1 and 365 nights." };
  }
  // Zero is how "no maximum" is stored, and the rest of the product already reads it
  // that way — see `stayLengthCap`. Anything else has to be a real night count.
  if (!Number.isInteger(maxNights) || maxNights < 0 || maxNights > 365) {
    return { error: "A maximum stay must be between 1 and 365 nights." };
  }
  if (maxNights >= 1 && maxNights < minNights) {
    return { error: "The maximum stay cannot be shorter than the minimum stay." };
  }

  const result = (await db.$transaction(async (tx) => {
    await lockListing(tx, listing.id);
    const currentListing = await tx.listing.findUnique({
      where: { id: listing.id },
      select: {
        bookingMode: true,
        pricingRule: { select: { minNights: true, maxNights: true } },
      },
    });
    if (!currentListing) return { error: "Listing not found." } as const;
    if (!currentListing.pricingRule) {
      return { error: "Set this listing's nightly price first." } as const;
    }
    if (
      currentListing.bookingMode === "FIXED_STAYS" &&
      !weeklyStayWeekRange({ minNights, maxNights })
    ) {
      return {
        error: "Adjust the minimum and maximum so at least one whole week can be booked.",
      } as const;
    }
    const changed =
      currentListing.pricingRule.minNights !== minNights ||
      currentListing.pricingRule.maxNights !== maxNights;
    if (changed) {
      await tx.pricingRule.update({
        where: { listingId: listing.id },
        data: { minNights, maxNights },
      });
    }
    return { success: true as const, changed };
  })) as FixedStayMutationError | { success: true; changed: boolean };
  if ("error" in result) return result;
  if (result.changed) {
    await recordFixedStayAudit(actorId, listing.id, "LISTING_STAY_LIMITS_SET", {
      minNights,
      maxNights,
    });
  }
  return { success: true, minNights, maxNights };
}
