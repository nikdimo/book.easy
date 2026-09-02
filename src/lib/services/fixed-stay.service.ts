import "server-only";

import { BookingStatus, BlockType, type Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import {
  compareYmd,
  dbDateToYmd,
  todayYmd,
  ymdToDbDate,
} from "@/lib/utils/date-only";
import {
  fixedStayNights,
  fixedStaysOverlap,
  sortFixedStayPeriods,
} from "@/lib/utils/fixed-stay-periods";

/**
 * What a listing's fixed stays look like to the two people who read them.
 *
 * A period is stored as two dates and a switch, and everything else about it — how many
 * nights it is, whether it has gone by, whether anyone is in it — is derived here, on
 * every read, from rows that already exist. Nothing in this module writes, and nothing it
 * returns is stored: a `state` column would be a second opinion about occupancy that
 * could drift from `AvailabilityBlock`, which is the only opinion that counts.
 *
 * Occupancy comes from the same negative records every other availability answer in this
 * product uses — booking holds, manual blocks and imported calendar blocks — so a fixed
 * stay disappears the moment its nights are taken, including when they are taken by an
 * *overlapping* alternative rather than by itself. Nothing here consults availability
 * windows or minimum-stay settings: in FIXED_STAYS mode the host's offer is the list of
 * periods, and those flexible settings stay stored, untouched and unread.
 *
 * There is no price anywhere in this file. A period contributes two dates to the
 * listing's existing quote engine and no money of its own, and Phase 2 does not quote.
 */

export type FixedStayPeriodState =
  /** Its check-in has gone by. */
  | "PAST"
  /** The host switched it off without deleting it. */
  | "DISABLED"
  /** An active booking was sold as exactly this period. */
  | "BOOKED"
  /** Something else holds its nights — a neighbouring stay, a block, an import. */
  | "DATES_TAKEN"
  /** Bookable. */
  | "AVAILABLE";

/**
 * The order the answers are asked in, and the reason for it.
 *
 * Past first, because a stay that has started is not something the host can act on or a
 * guest can buy, whatever else is true of it. Then the host's own switch, because a
 * period they turned off is off regardless of who is in it. Then the two occupancy
 * answers, most specific first: "a guest booked this" before "these nights are taken",
 * since the second is true whenever the first is and is the less useful sentence.
 *
 * This mirrors the approved mockup's priority exactly. The mockup is the behavioural
 * reference and is deliberately not imported — it is a dev-lab prototype with its own
 * fixtures, and production must not depend on it.
 */
export const FIXED_STAY_STATE_PRIORITY: readonly FixedStayPeriodState[] = [
  "PAST",
  "DISABLED",
  "BOOKED",
  "DATES_TAKEN",
  "AVAILABLE",
];

/** Why a period's nights are unavailable, in the host's terms. */
export type FixedStayBlockKind = "BOOKING" | "MANUAL" | "IMPORTED";

/**
 * A negative record overlapping a period, as the host projection reports it.
 *
 * Dates and a kind, and nothing else. The block's private note and the booking's guest
 * are the host's to read, but they belong to the reservation and calendar surfaces that
 * already show them — repeating them here would put guest data in a payload whose job is
 * to say whether a date is free.
 */
export interface FixedStayBlockSummary {
  kind: FixedStayBlockKind;
  /** `YYYY-MM-DD`. */
  start: string;
  /** `YYYY-MM-DD`, exclusive. */
  end: string;
}

/** A stored period in the shape the projections resolve from. */
export interface FixedStayPeriodRow {
  id: string;
  checkIn: string;
  checkOut: string;
  disabledAt: Date | null;
}

/** A negative record in the shape the projections resolve from. */
export interface FixedStayBlockRow {
  start: string;
  /** Exclusive. */
  end: string;
  kind: FixedStayBlockKind;
}

export interface HostFixedStayPeriodView {
  id: string;
  /** `YYYY-MM-DD`. */
  checkIn: string;
  /** `YYYY-MM-DD`, exclusive. */
  checkOut: string;
  /** Derived from the dates on every read; never stored. */
  nights: number;
  state: FixedStayPeriodState;
  /** Whatever holds the nights, so a row can say why it is not available. */
  blockedBy: FixedStayBlockSummary | null;
  /**
   * Whether the host may edit, enable, disable or delete this period.
   *
   * Advisory only — it exists so Phase 3 can grey a row without guessing the rule. Every
   * mutation re-derives it inside its own transaction immediately before writing, which
   * is the answer that actually governs.
   */
  manageable: boolean;
}

export interface GuestFixedStayPeriodView {
  id: string;
  /** `YYYY-MM-DD`. */
  checkIn: string;
  /** `YYYY-MM-DD`, exclusive. */
  checkOut: string;
  nights: number;
  /** False when the nights are already held. The reason is deliberately not said. */
  selectable: boolean;
}

/** A period a host may still change. Booked and past stays are locked; see the states. */
export function isManageableFixedStayState(state: FixedStayPeriodState): boolean {
  // DATES_TAKEN is deliberately manageable: something *else* holds those nights, and
  // withdrawing an option nobody bought is exactly what a host should be able to do.
  // DISABLED is manageable too, or a host could never switch a period back on.
  return state !== "BOOKED" && state !== "PAST";
}

export function blockKindFromBlockType(blockType: string): FixedStayBlockKind {
  if (blockType === BlockType.BOOKING_HOLD) return "BOOKING";
  if (blockType === BlockType.EXTERNAL_SYNC) return "IMPORTED";
  return "MANUAL";
}

/**
 * One period's state and the record that explains it.
 *
 * Pure, so the priority above can be tested without a database, and so the host and
 * guest projections cannot answer it differently.
 */
export function resolveFixedStayPeriod(
  period: FixedStayPeriodRow,
  input: {
    today: string;
    /** Ids of periods an active PENDING or CONFIRMED booking was sold as. */
    bookedPeriodIds: ReadonlySet<string>;
    blocks: readonly FixedStayBlockRow[];
  },
): HostFixedStayPeriodView {
  const nights = fixedStayNights(period);
  const overlapping = input.blocks.filter((block) =>
    fixedStaysOverlap(period, { checkIn: block.start, checkOut: block.end }),
  );
  const summarize = (block: FixedStayBlockRow | undefined): FixedStayBlockSummary | null =>
    block ? { kind: block.kind, start: block.start, end: block.end } : null;

  const view = (
    state: FixedStayPeriodState,
    blockedBy: FixedStayBlockSummary | null,
  ): HostFixedStayPeriodView => ({
    id: period.id,
    checkIn: period.checkIn,
    checkOut: period.checkOut,
    nights,
    state,
    blockedBy,
    // State priority remains PAST → DISABLED → BOOKED, but an active booking is an
    // independent write lock. A defensive/legacy row can be both disabled and booked;
    // it should still render as DISABLED while correctly withholding edit controls.
    manageable:
      isManageableFixedStayState(state) && !input.bookedPeriodIds.has(period.id),
  });

  if (compareYmd(period.checkIn, input.today) < 0) {
    return view("PAST", summarize(overlapping[0]));
  }
  if (period.disabledAt !== null) return view("DISABLED", null);
  if (input.bookedPeriodIds.has(period.id)) {
    return view(
      "BOOKED",
      summarize(overlapping.find((block) => block.kind === "BOOKING")),
    );
  }
  if (overlapping.length > 0) return view("DATES_TAKEN", summarize(overlapping[0]));
  return view("AVAILABLE", null);
}

/**
 * Everything the host owns, including what no guest will ever be shown.
 *
 * Sorted chronologically then shortest-first, so two options from one changeover day read
 * as a ladder rather than arriving in whatever order the rows came back in.
 */
export function projectHostFixedStayPeriods(
  periods: readonly FixedStayPeriodRow[],
  input: {
    today: string;
    bookedPeriodIds: ReadonlySet<string>;
    blocks: readonly FixedStayBlockRow[];
  },
): HostFixedStayPeriodView[] {
  return sortFixedStayPeriods(periods).map((period) =>
    resolveFixedStayPeriod(period, input),
  );
}

/**
 * What a guest may see.
 *
 * Past and switched-off periods are dropped entirely rather than returned with a reason:
 * they are not options, and a payload that carried them would be telling the browser
 * about dates the host withdrew. Booked and taken periods stay, marked unselectable —
 * they are the shape of the season, and a list that closed up around them would tell a
 * guest the host has less to offer than they do.
 *
 * Deliberately narrow: an id, two dates, a length and one boolean. No host note, no
 * guest, no block reason, no `state` naming which of the two unavailable reasons applies,
 * and no price — Phase 2 does not quote.
 */
export function projectGuestFixedStayPeriods(
  periods: readonly FixedStayPeriodRow[],
  input: {
    today: string;
    bookedPeriodIds: ReadonlySet<string>;
    blocks: readonly FixedStayBlockRow[];
  },
): GuestFixedStayPeriodView[] {
  return projectHostFixedStayPeriods(periods, input)
    .filter((period) => period.state !== "PAST" && period.state !== "DISABLED")
    .map((period) => ({
      id: period.id,
      checkIn: period.checkIn,
      checkOut: period.checkOut,
      nights: period.nights,
      selectable: period.state === "AVAILABLE",
    }));
}

/** Active means the nights are held: a request awaiting an answer, or a confirmed stay. */
export const ACTIVE_FIXED_STAY_BOOKING_STATUSES = [
  BookingStatus.PENDING,
  BookingStatus.CONFIRMED,
] as const;

interface LoadedFixedStayRows {
  bookingMode: string;
  periods: FixedStayPeriodRow[];
  bookedPeriodIds: Set<string>;
  blocks: FixedStayBlockRow[];
}

/**
 * The one query both projections read from.
 *
 * Every period is loaded, past ones included, because the host list shows them and
 * dropping them here would make the two projections disagree about what exists. Blocks
 * are narrowed to the ones that could still matter — anything ending after the earliest
 * period — rather than the listing's whole history.
 */
async function loadFixedStayRows(
  listingId: string,
): Promise<LoadedFixedStayRows | null> {
  const listing = await db.listing.findUnique({
    where: { id: listingId },
    select: {
      bookingMode: true,
      fixedStayPeriods: {
        select: { id: true, checkIn: true, checkOut: true, disabledAt: true },
      },
      bookings: {
        where: {
          status: { in: [...ACTIVE_FIXED_STAY_BOOKING_STATUSES] },
          fixedStayPeriodId: { not: null },
        },
        select: { fixedStayPeriodId: true },
      },
    },
  });
  if (!listing) return null;

  const periods = listing.fixedStayPeriods.map((period) => ({
    id: period.id,
    checkIn: dbDateToYmd(period.checkIn),
    checkOut: dbDateToYmd(period.checkOut),
    disabledAt: period.disabledAt,
  }));

  const earliest = periods.reduce<string | null>(
    (found, period) =>
      found === null || compareYmd(period.checkIn, found) < 0
        ? period.checkIn
        : found,
    null,
  );
  const blocks =
    earliest === null
      ? []
      : (
          await db.availabilityBlock.findMany({
            where: { listingId, endDate: { gt: ymdToDbDate(earliest) } },
            select: { startDate: true, endDate: true, blockType: true },
          })
        ).map((block) => ({
          start: dbDateToYmd(block.startDate),
          end: dbDateToYmd(block.endDate),
          kind: blockKindFromBlockType(block.blockType),
        }));

  return {
    bookingMode: listing.bookingMode,
    periods,
    bookedPeriodIds: new Set(
      listing.bookings
        .map((booking) => booking.fixedStayPeriodId)
        .filter((id): id is string => id !== null),
    ),
    blocks,
  };
}

export interface HostFixedStayOverview {
  bookingMode: string;
  periods: HostFixedStayPeriodView[];
}

/**
 * The host's own list, for the listing they own.
 *
 * Authorization is the query: a listing that is not this host's comes back as `null` —
 * "not found" — rather than leaking that it exists. Admins read any listing, matching
 * `verifyAvailabilityManager` beside it.
 *
 * Returned in both booking modes on purpose. A FLEXIBLE listing that once sold fixed
 * stays still owns its periods, and the host has to be able to see what switching back
 * would restore.
 */
export async function getHostFixedStayPeriods(
  actor: { id: string; role: string },
  listingId: string,
  today: string = todayYmd(),
): Promise<HostFixedStayOverview | null> {
  const owned = await db.listing.findFirst({
    where: {
      id: listingId,
      ...(actor.role === "ADMIN" ? {} : { hostId: actor.id }),
    },
    select: { id: true },
  });
  if (!owned) return null;

  const rows = await loadFixedStayRows(listingId);
  if (!rows) return null;
  return {
    bookingMode: rows.bookingMode,
    periods: projectHostFixedStayPeriods(rows.periods, {
      today,
      bookedPeriodIds: rows.bookedPeriodIds,
      blocks: rows.blocks,
    }),
  };
}

export interface GuestFixedStayOffer {
  bookingMode: string;
  periods: GuestFixedStayPeriodView[];
}

/**
 * What this listing offers a guest.
 *
 * A FLEXIBLE listing offers no fixed stays at all — its stored periods, if it has any,
 * are not on sale — so the list comes back empty rather than as options the calendar
 * would then have to know to ignore.
 */
export async function getGuestFixedStayPeriods(
  listingId: string,
  today: string = todayYmd(),
): Promise<GuestFixedStayOffer | null> {
  const rows = await loadFixedStayRows(listingId);
  if (!rows) return null;
  if (rows.bookingMode !== "FIXED_STAYS") {
    return { bookingMode: rows.bookingMode, periods: [] };
  }
  return {
    bookingMode: rows.bookingMode,
    periods: projectGuestFixedStayPeriods(rows.periods, {
      today,
      bookedPeriodIds: rows.bookedPeriodIds,
      blocks: rows.blocks,
    }),
  };
}

// ─── Search ─────────────────────────────────────────────────────────────────────

/**
 * The relation filter that matches a listing offering *exactly* these dates.
 *
 * Exact on both ends, and that is the whole rule: a stay one night shorter than an
 * offered fortnight is not a smaller version of it, two back-to-back weeks are not the
 * fortnight that spans them, and a range that merely overlaps one is not it either. The
 * unique index on `(listingId, checkIn, checkOut)` means at most one row can match, so a
 * `some` here is really a "the one".
 *
 * Switched-off stays are excluded here. Booked and blocked ones are not, and must not be:
 * they are excluded by the same `AvailabilityBlock` clause every flexible listing goes
 * through, which is what keeps one answer to "are these nights free" rather than two.
 *
 * Past stays are not excluded here either — a search whose check-in has already gone by
 * is refused before this is reached, since the requested date *is* the period's date.
 */
export function fixedStayExactMatchFilter(
  checkIn: Date,
  checkOut: Date,
): Prisma.ListingFixedStayPeriodWhereInput {
  return { checkIn, checkOut, disabledAt: null };
}

/**
 * Which of these listings offer exactly this stay, and under which period id.
 *
 * One query for a whole page of cards rather than one per card: the search already knows
 * the listing ids it is about to render, and the answer for all of them is a single
 * indexed read. A per-card lookup here would be an N+1 on the hottest page in the
 * product.
 *
 * Returns only the listings that match, so a caller can read "is this a matched fixed
 * stay" and "which one" from the same map without a second question.
 */
export async function getMatchedFixedStayPeriodIds(
  listingIds: readonly string[],
  checkIn: Date,
  checkOut: Date,
): Promise<Map<string, string>> {
  if (listingIds.length === 0) return new Map();
  const rows = await db.listingFixedStayPeriod.findMany({
    where: {
      listingId: { in: [...listingIds] },
      ...fixedStayExactMatchFilter(checkIn, checkOut),
    },
    select: { id: true, listingId: true },
  });
  return new Map(rows.map((row) => [row.listingId, row.id]));
}
