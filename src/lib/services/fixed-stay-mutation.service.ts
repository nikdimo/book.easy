import "server-only";

import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { createAuditLog } from "@/lib/services/audit.service";
import {
  ACTIVE_FIXED_STAY_BOOKING_STATUSES,
  type FixedStayPeriodState,
} from "@/lib/services/fixed-stay.service";
import { compareYmd, dbDateToYmd, todayYmd, ymdToDbDate } from "@/lib/utils/date-only";
import { isUniqueConstraintError } from "@/lib/utils/db-errors";
import {
  checkOutForFixedStay,
  fixedStayNights,
  fixedStayPeriodKey,
  isFixedStayNights,
  overlappingFixedStays,
  sortFixedStayPeriods,
  validateFixedStayPeriod,
  type FixedStayNights,
  type FixedStayPeriodRange,
} from "@/lib/utils/fixed-stay-periods";
import {
  generateFixedStayPeriods,
  markExistingFixedStays,
  validateFixedStayQuickSetup,
  type FixedStayQuickSetup,
  type FixedStayQuickSetupIssue,
  type FixedStayQuickSetupRow,
} from "@/lib/utils/fixed-stay-quick-setup";

/**
 * Every write that touches a listing's fixed stays.
 *
 * Three rules hold across all of them, and they are the reason this is one module rather
 * than seven functions scattered about:
 *
 * 1. **The lock is the same lock.** Every write takes
 *    `pg_advisory_xact_lock(hashtext(listingId))` — the identical key `createBooking`,
 *    `blockDates` and the availability mutations take. A different key would be no lock
 *    at all: two transactions holding different keys for the same listing serialize
 *    against nobody.
 * 2. **Nothing is trusted across the lock.** The listing's booking mode and the period's
 *    own state are re-read *inside* the transaction, after the lock is held, immediately
 *    before writing. Anything read before that is a photograph of a moment that has
 *    already passed — a host can be mid-edit while a guest's booking commits.
 * 3. **The database has the last word.** The unique index on
 *    `(listingId, checkIn, checkOut)` is the final protection against a duplicate, and a
 *    violation is turned into a domain answer here rather than surfacing as a 500.
 *
 * What these writes never touch: availability windows, minimum-stay settings, prices,
 * promotions, blocks, and bookings. Switching a listing to FIXED_STAYS and back changes
 * one column and leaves everything else exactly as the host left it, which is what makes
 * the switch safe to try.
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

export interface FixedStayToggleSuccess {
  success: true;
  period: FixedStayPeriodResult;
  disabled: boolean;
}

export interface FixedStayPeriodResult {
  id: string;
  checkIn: string;
  checkOut: string;
  nights: number;
}

export interface FixedStayOverlapWarning {
  id: string;
  checkIn: string;
  checkOut: string;
}

export interface FixedStayWriteSuccess {
  success: true;
  period: FixedStayPeriodResult;
  /**
   * Periods this one shares nights with. Metadata, never a refusal: overlapping
   * alternatives are how a host offers "one week or two from the 1st", and whichever a
   * guest books withdraws the other through the ordinary block rules.
   */
  overlaps: FixedStayOverlapWarning[];
}

const NOT_FIXED_MODE_ERROR =
  "Switch this listing to fixed stays before changing its stays.";
const PERIOD_NOT_FOUND_ERROR = "Fixed stay not found.";
const DUPLICATE_ERROR = "This listing already offers exactly these dates.";
const LOCKED_BOOKED_ERROR = "A guest has booked this stay, so it cannot be changed.";
const LOCKED_PAST_ERROR = "This stay has already started, so it cannot be changed.";

/** Loaded rows a write decides from, all read after the advisory lock is held. */
interface LockedPeriod {
  id: string;
  checkIn: string;
  checkOut: string;
  disabledAt: Date | null;
  /** PAST or BOOKED — the two states that lock a period. Null when it is manageable. */
  lock: Extract<FixedStayPeriodState, "PAST" | "BOOKED"> | null;
}

type TransactionClient = Prisma.TransactionClient;

/** The one lock key, shared with booking and availability writes. */
async function lockListing(tx: TransactionClient, listingId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${listingId}))`;
}

/** The listing's booking mode as it stands *now*, inside the lock. */
async function currentBookingMode(
  tx: TransactionClient,
  listingId: string,
): Promise<ListingBookingModeValue | null> {
  const listing = await tx.listing.findUnique({
    where: { id: listingId },
    select: { bookingMode: true },
  });
  return listing?.bookingMode ?? null;
}

/**
 * One period, with the lock state that governs whether it may be written.
 *
 * Scoped by `listingId` as well as by id, so a period id belonging to another listing —
 * or to another host's listing — resolves to nothing. That is the second half of the IDOR
 * guard: the first half proved the caller manages *this* listing, and this proves the
 * period is *in* it.
 */
async function loadLockedPeriod(
  tx: TransactionClient,
  listingId: string,
  periodId: string,
  today: string,
): Promise<LockedPeriod | null> {
  const period = await tx.listingFixedStayPeriod.findFirst({
    where: { id: periodId, listingId },
    select: { id: true, checkIn: true, checkOut: true, disabledAt: true },
  });
  if (!period) return null;

  const checkIn = dbDateToYmd(period.checkIn);
  // Only PENDING and CONFIRMED hold a stay. A cancelled, rejected or expired booking
  // released its nights when it ended, and must not lock the period for ever.
  const activeBooking = await tx.booking.findFirst({
    where: {
      listingId,
      fixedStayPeriodId: periodId,
      status: { in: [...ACTIVE_FIXED_STAY_BOOKING_STATUSES] },
    },
    select: { id: true },
  });

  return {
    id: period.id,
    checkIn,
    checkOut: dbDateToYmd(period.checkOut),
    disabledAt: period.disabledAt,
    // Past first, matching the projection's priority: a stay that has started is beyond
    // changing whoever is or is not in it.
    lock:
      compareYmd(checkIn, today) < 0
        ? "PAST"
        : activeBooking
          ? "BOOKED"
          : null,
  };
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

function lockError(lock: LockedPeriod["lock"]): string | null {
  if (lock === "PAST") return LOCKED_PAST_ERROR;
  if (lock === "BOOKED") return LOCKED_BOOKED_ERROR;
  return null;
}

/** Every other period in the listing, as date pairs the domain rules can read. */
async function loadSiblingPeriods(
  tx: TransactionClient,
  listingId: string,
): Promise<(FixedStayPeriodRange & { id: string })[]> {
  const rows = await tx.listingFixedStayPeriod.findMany({
    where: { listingId },
    select: { id: true, checkIn: true, checkOut: true },
  });
  return rows.map((row) => ({
    id: row.id,
    checkIn: dbDateToYmd(row.checkIn),
    checkOut: dbDateToYmd(row.checkOut),
  }));
}

function overlapsFor(
  candidate: FixedStayPeriodRange,
  siblings: readonly (FixedStayPeriodRange & { id: string })[],
  ignoreId?: string,
): FixedStayOverlapWarning[] {
  return sortFixedStayPeriods(
    overlappingFixedStays(candidate, siblings, ignoreId),
  ).map((period) => ({
    id: period.id,
    checkIn: period.checkIn,
    checkOut: period.checkOut,
  }));
}

/**
 * A check-in and a length, turned into the pair of dates that will be stored.
 *
 * The checkout is *derived*, never accepted: a client that could send its own checkout
 * could send a 3-night or a 40-night stay past every length rule. So could a client
 * sending `nights`, which is why that is checked against the two the product sells
 * rather than trusted.
 */
function resolveRequestedPeriod(
  input: { checkIn: string; nights: number },
  today: string,
): { checkIn: string; checkOut: string; nights: FixedStayNights } | { error: string } {
  if (!isFixedStayNights(input.nights)) {
    return { error: "A fixed stay must be exactly 7 or 14 nights." };
  }
  let checkOut: string;
  try {
    checkOut = checkOutForFixedStay(input.checkIn, input.nights);
  } catch {
    return { error: "Enter a valid check-in date." };
  }

  const validation = validateFixedStayPeriod({ checkIn: input.checkIn, checkOut });
  if (!validation.ok) {
    return {
      error:
        validation.issue === "INVALID_DATE"
          ? "Enter a valid check-in date."
          : "A fixed stay must be exactly 7 or 14 nights.",
    };
  }
  if (compareYmd(input.checkIn, today) < 0) {
    return { error: "Choose a check-in date that has not already passed." };
  }
  return { checkIn: input.checkIn, checkOut, nights: validation.nights };
}

// ─── Booking mode ───────────────────────────────────────────────────────────────

/**
 * Switches how the listing sells, and changes nothing else.
 *
 * One column. No period is created, deleted, enabled or disabled; no availability window,
 * minimum-stay setting, price, promotion, block or booking is read or written. That is
 * the whole point of the switch being safe: a host may turn fixed stays on to look at
 * them, turn them off again, and find their flexible calendar exactly as it was — and
 * turning them back on restores the stays they had already built.
 *
 * A listing may switch to FIXED_STAYS with no periods at all. It then offers nothing
 * until the host adds one, which is a true statement about an empty season rather than
 * an error to refuse.
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
      // Mode changes share the listing lock too. Otherwise a switch to FLEXIBLE can
      // race a period write after that write has checked FIXED_STAYS but before it
      // commits.
      await lockListing(tx, listing.id);
      const current = await currentBookingMode(tx, listing.id);
      if (current === null) return { error: "Listing not found." };
      if (current === mode) {
        return { success: true, previous: current, changed: false };
      }

      await tx.listing.update({
        where: { id: listing.id },
        data: { bookingMode: mode },
      });
      return { success: true, previous: current, changed: true };
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

// ─── One period at a time ───────────────────────────────────────────────────────

/**
 * Adds one stay to the listing's offer.
 *
 * Refuses an exact duplicate — the one pair of dates a guest could not tell apart, and
 * the pair the unique index refuses anyway. Permits an overlap and reports it, because
 * two overlapping options is a thing hosts mean.
 */
export async function addFixedStayPeriodForManagedListing(
  listing: ManagedFixedStayListing,
  actorId: string,
  input: { checkIn: string; nights: number },
  today: string = todayYmd(),
): Promise<FixedStayMutationError | FixedStayWriteSuccess> {
  const requested = resolveRequestedPeriod(input, today);
  if ("error" in requested) return requested;

  let result: FixedStayMutationError | FixedStayWriteSuccess;
  try {
    result = await db.$transaction(async (tx) => {
      await lockListing(tx, listing.id);
      if ((await currentBookingMode(tx, listing.id)) !== "FIXED_STAYS") {
        return { error: NOT_FIXED_MODE_ERROR };
      }

      const siblings = await loadSiblingPeriods(tx, listing.id);
      if (
        siblings.some(
          (period) =>
            period.checkIn === requested.checkIn &&
            period.checkOut === requested.checkOut,
        )
      ) {
        return { error: DUPLICATE_ERROR };
      }

      const created = await tx.listingFixedStayPeriod.create({
        data: {
          listingId: listing.id,
          checkIn: ymdToDbDate(requested.checkIn),
          checkOut: ymdToDbDate(requested.checkOut),
        },
        select: { id: true },
      });
      return {
        success: true as const,
        period: {
          id: created.id,
          checkIn: requested.checkIn,
          checkOut: requested.checkOut,
          nights: requested.nights,
        },
        overlaps: overlapsFor(requested, siblings),
      };
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) return { error: DUPLICATE_ERROR };
    throw error;
  }

  if ("success" in result) {
    await recordFixedStayAudit(actorId, listing.id, "LISTING_FIXED_STAY_ADDED", {
      periodId: result.period.id,
      checkIn: result.period.checkIn,
      checkOut: result.period.checkOut,
      nights: result.period.nights,
    });
  }
  return result;
}

/**
 * Moves one stay to a new check-in or a new length.
 *
 * The checkout is re-derived from the new check-in and length, so an edit cannot smuggle
 * in a range the add path would have refused. A booked or already-started stay is not
 * editable at all: the dates a guest agreed to are not the host's to move.
 */
export async function updateFixedStayPeriodForManagedListing(
  listing: ManagedFixedStayListing,
  actorId: string,
  input: { periodId: string; checkIn: string; nights: number },
  today: string = todayYmd(),
): Promise<FixedStayMutationError | FixedStayWriteSuccess> {
  const requested = resolveRequestedPeriod(input, today);
  if ("error" in requested) return requested;

  let result: FixedStayMutationError | FixedStayWriteSuccess;
  try {
    result = await db.$transaction(async (tx) => {
      await lockListing(tx, listing.id);
      if ((await currentBookingMode(tx, listing.id)) !== "FIXED_STAYS") {
        return { error: NOT_FIXED_MODE_ERROR };
      }

      const period = await loadLockedPeriod(tx, listing.id, input.periodId, today);
      if (!period) return { error: PERIOD_NOT_FOUND_ERROR };
      const locked = lockError(period.lock);
      if (locked) return { error: locked };

      const siblings = await loadSiblingPeriods(tx, listing.id);
      if (
        siblings.some(
          (other) =>
            other.id !== period.id &&
            other.checkIn === requested.checkIn &&
            other.checkOut === requested.checkOut,
        )
      ) {
        return { error: DUPLICATE_ERROR };
      }

      await tx.listingFixedStayPeriod.update({
        where: { id: period.id },
        data: {
          checkIn: ymdToDbDate(requested.checkIn),
          checkOut: ymdToDbDate(requested.checkOut),
        },
      });
      return {
        success: true as const,
        period: {
          id: period.id,
          checkIn: requested.checkIn,
          checkOut: requested.checkOut,
          nights: requested.nights,
        },
        overlaps: overlapsFor(requested, siblings, period.id),
      };
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) return { error: DUPLICATE_ERROR };
    throw error;
  }

  if ("success" in result) {
    await recordFixedStayAudit(actorId, listing.id, "LISTING_FIXED_STAY_UPDATED", {
      periodId: result.period.id,
      checkIn: result.period.checkIn,
      checkOut: result.period.checkOut,
      nights: result.period.nights,
    });
  }
  return result;
}

/**
 * Switches one stay off, or back on.
 *
 * Off is not deletion: the row stays, a booking that already points at it stays readable,
 * and switching it on again restores exactly the option that was there. A booked or
 * already-started stay cannot be switched either way — hiding a stay a guest is holding
 * would not un-hold it, it would only make the host's list disagree with their calendar.
 */
export async function setFixedStayPeriodDisabledForManagedListing(
  listing: ManagedFixedStayListing,
  actorId: string,
  input: { periodId: string; disabled: boolean },
  today: string = todayYmd(),
): Promise<FixedStayMutationError | FixedStayToggleSuccess> {
  const result = await db.$transaction(
    async (tx): Promise<FixedStayMutationError | FixedStayToggleSuccess> => {
      await lockListing(tx, listing.id);
      if ((await currentBookingMode(tx, listing.id)) !== "FIXED_STAYS") {
        return { error: NOT_FIXED_MODE_ERROR };
      }

      const period = await loadLockedPeriod(tx, listing.id, input.periodId, today);
      if (!period) return { error: PERIOD_NOT_FOUND_ERROR };
      const locked = lockError(period.lock);
      if (locked) return { error: locked };

      await tx.listingFixedStayPeriod.update({
        where: { id: period.id },
        data: { disabledAt: input.disabled ? new Date() : null },
      });
      return {
        success: true as const,
        period: {
          id: period.id,
          checkIn: period.checkIn,
          checkOut: period.checkOut,
          nights: fixedStayNights(period),
        },
        disabled: input.disabled,
      };
    },
  );

  if ("success" in result) {
    await recordFixedStayAudit(
      actorId,
      listing.id,
      input.disabled ? "LISTING_FIXED_STAY_DISABLED" : "LISTING_FIXED_STAY_ENABLED",
      { periodId: result.period.id },
    );
  }
  return result;
}

/**
 * Removes one stay from the offer.
 *
 * Permitted while something *else* holds the nights — a neighbouring option, a manual
 * block, an imported calendar — because withdrawing an offer nobody took is exactly what
 * a host should be able to do. Refused only when this period is the one a guest actually
 * booked, or when it has already begun.
 */
export async function deleteFixedStayPeriodForManagedListing(
  listing: ManagedFixedStayListing,
  actorId: string,
  periodId: string,
  today: string = todayYmd(),
): Promise<
  | FixedStayMutationError
  | { success: true; deletedId: string; checkIn: string; checkOut: string }
> {
  const result = await db.$transaction(async (tx) => {
    await lockListing(tx, listing.id);
    if ((await currentBookingMode(tx, listing.id)) !== "FIXED_STAYS") {
      return { error: NOT_FIXED_MODE_ERROR };
    }

    const period = await loadLockedPeriod(tx, listing.id, periodId, today);
    if (!period) return { error: PERIOD_NOT_FOUND_ERROR };
    const locked = lockError(period.lock);
    if (locked) return { error: locked };

    await tx.listingFixedStayPeriod.delete({ where: { id: period.id } });
    return {
      success: true as const,
      deletedId: period.id,
      checkIn: period.checkIn,
      checkOut: period.checkOut,
    };
  });

  if ("success" in result) {
    await recordFixedStayAudit(actorId, listing.id, "LISTING_FIXED_STAY_DELETED", {
      periodId: result.deletedId,
      checkIn: result.checkIn,
      checkOut: result.checkOut,
    });
  }
  return result;
}

// ─── Quick setup ────────────────────────────────────────────────────────────────

export interface FixedStayQuickSetupPreview {
  rows: FixedStayQuickSetupRow[];
  generated: number;
  /** Rows that would be created — the ones the listing does not already offer. */
  newCount: number;
  /** Rows already offered, which a confirm would leave completely alone. */
  duplicateCount: number;
}

/**
 * What a Quick setup run *would* produce, without producing it.
 *
 * Writes nothing, reads two things: the listing's existing periods, so duplicates can be
 * marked, and nothing else. The rows are generated on the server from the four answers —
 * the client never sends a list of dates, here or at confirm — so the preview a host
 * approves and the rows a confirm creates come from the same function.
 *
 * Deliberately available in both booking modes. A host deciding whether to switch should
 * be able to see what a season would look like first; only the confirm, which writes,
 * requires the listing to be in FIXED_STAYS already.
 */
export async function previewFixedStayQuickSetupForManagedListing(
  listing: ManagedFixedStayListing,
  input: FixedStayQuickSetup,
): Promise<
  | { error: string; issue: FixedStayQuickSetupIssue }
  | ({ success: true } & FixedStayQuickSetupPreview)
> {
  const issue = validateFixedStayQuickSetup(input);
  if (issue) return { error: quickSetupIssueMessage(issue), issue };

  const generated = generateFixedStayPeriods(input);
  const existing = await db.listingFixedStayPeriod.findMany({
    where: { listingId: listing.id },
    select: { checkIn: true, checkOut: true },
  });
  const rows = markExistingFixedStays(
    generated,
    existing.map((period) => ({
      checkIn: dbDateToYmd(period.checkIn),
      checkOut: dbDateToYmd(period.checkOut),
    })),
  );

  const duplicateCount = rows.filter((row) => row.duplicate).length;
  return {
    success: true,
    rows,
    generated: rows.length,
    newCount: rows.length - duplicateCount,
    duplicateCount,
  };
}

export interface FixedStayQuickSetupResult {
  success: true;
  /** How many stays the four answers describe. */
  generated: number;
  /** How many rows this run actually wrote. */
  created: number;
  /** How many the listing already offered, and were therefore left untouched. */
  skipped: number;
}

/**
 * Applies a Quick setup run.
 *
 * Takes the four answers, never a list of periods: a client that could post its own rows
 * could post a 3-night stay, a stay in the past, or a stay on someone else's listing, so
 * the rows are regenerated here from the same generator the preview used and the client's
 * idea of the result is never consulted.
 *
 * Only ever creates. There is no update and no delete in this path, which is what makes
 * "never disturbs an existing period" true by construction rather than by a check someone
 * has to remember: a date the listing already offers is skipped, and whatever state that
 * period is in — booked, switched off, or open — it is left exactly as it stands.
 *
 * Re-running the same setup therefore writes nothing the second time. Two runs racing
 * each other cannot both write either: they serialize on the listing's advisory lock, the
 * second reads the first's rows, and `skipDuplicates` plus the unique index catch anything
 * that still slips between.
 */
export async function confirmFixedStayQuickSetupForManagedListing(
  listing: ManagedFixedStayListing,
  actorId: string,
  input: FixedStayQuickSetup,
): Promise<{ error: string; issue?: FixedStayQuickSetupIssue } | FixedStayQuickSetupResult> {
  const issue = validateFixedStayQuickSetup(input);
  if (issue) return { error: quickSetupIssueMessage(issue), issue };

  const result = await db.$transaction(
    async (tx): Promise<{ error: string } | FixedStayQuickSetupResult> => {
      await lockListing(tx, listing.id);
      if ((await currentBookingMode(tx, listing.id)) !== "FIXED_STAYS") {
        return { error: NOT_FIXED_MODE_ERROR };
      }

      // Regenerated on the server, and re-read after the lock: rows a concurrent run
      // committed a moment ago are already here, so this run has nothing to add for them.
      const generated = generateFixedStayPeriods(input);
      const existing = await loadSiblingPeriods(tx, listing.id);
      const offered = new Set(existing.map(fixedStayPeriodKey));
      const toCreate = generated.filter(
        (stay) => !offered.has(fixedStayPeriodKey(stay)),
      );

      const written =
        toCreate.length === 0
          ? { count: 0 }
          : await tx.listingFixedStayPeriod.createMany({
              data: toCreate.map((stay) => ({
                listingId: listing.id,
                checkIn: ymdToDbDate(stay.checkIn),
                checkOut: ymdToDbDate(stay.checkOut),
              })),
              // The database's own last word. The lock makes this unreachable in practice;
              // it is here so that if it ever is reached, the answer is "already offered"
              // rather than a failed transaction.
              skipDuplicates: true,
            });

      return {
        success: true as const,
        generated: generated.length,
        created: written.count,
        skipped: generated.length - written.count,
      };
    },
  );

  if ("success" in result && result.created > 0) {
    await recordFixedStayAudit(
      actorId,
      listing.id,
      "LISTING_FIXED_STAYS_QUICK_SETUP",
      {
        seasonStart: input.seasonStart,
        lastCheckOut: input.lastCheckOut,
        changeoverWeekday: input.changeoverWeekday,
        nights: [...input.nights],
        created: result.created,
        skipped: result.skipped,
      },
    );
  }
  return result;
}

/** Host-readable sentences for the generator's own refusals. */
export function quickSetupIssueMessage(issue: FixedStayQuickSetupIssue): string {
  switch (issue) {
    case "MISSING_START":
      return "Choose the date the season starts.";
    case "MISSING_LAST_CHECKOUT":
      return "Choose the last day a guest may check out.";
    case "INVALID_DATE":
      return "Enter valid season dates.";
    case "INVALID_CHANGEOVER_WEEKDAY":
      return "Choose a changeover day.";
    case "NO_LENGTHS":
      return "Choose one week, two weeks, or both.";
    case "UNSUPPORTED_LENGTH":
      return "A fixed stay must be exactly 7 or 14 nights.";
    case "SEASON_REVERSED":
      return "The last checkout must be after the season starts.";
    case "SEASON_TOO_LONG":
      return "Choose a shorter season.";
    case "TOO_MANY_PERIODS":
      return "That season would create too many stays. Choose a shorter one.";
    case "NOTHING_TO_GENERATE":
      return "No stays fit inside those dates.";
  }
}
