import { compareYmd, ymdToDbDate } from "@/lib/utils/date-only";
import {
  buildHostActionQueue,
  type HostActionItem,
} from "@/lib/host/booking-action-queue";
import type { HostReservation } from "@/lib/host/v2/reservation-types";

/**
 * What the reservations stream shows, and in what order.
 *
 * Codes and arithmetic only — no prose, no React. The stream is the one screen where
 * getting the ordering wrong quietly costs the host a booking, so the rules live here
 * where they can be tested without a browser or a translator, exactly as the calendar's
 * model files do.
 */

/** A stay that has stopped being work: nobody is coming and nothing can be done. */
const TERMINAL_STATUSES = new Set([
  "REJECTED",
  "EXPIRED",
  "CANCELLED_BY_GUEST",
  "CANCELLED_BY_HOST",
  "CANCELLED_BY_ADMIN",
]);

export function isTerminal(status: string): boolean {
  return TERMINAL_STATUSES.has(status);
}

/** In display order — this array *is* the order of the filter chips. */
export const RESERVATION_FILTERS = [
  "action",
  "all",
  "upcoming",
  "staying",
  "completed",
  "cancelled",
] as const;

export type ReservationFilter = (typeof RESERVATION_FILTERS)[number];

/** In display order. The first entry is the default the screen opens on. */
export const RESERVATION_SORTS = [
  "priority",
  "soonest",
  "newest",
  "highest",
] as const;

export type ReservationSort = (typeof RESERVATION_SORTS)[number];

/**
 * The time buckets the stream is divided into.
 *
 * `action` is not a time — it is the queue, and it is drawn first. The other three are
 * the spine: what is happening now, what is coming, and what is done with.
 */
export type ReservationGroup = "action" | "today" | "upcoming" | "earlier";

const DAY_MS = 24 * 60 * 60 * 1000;

function dayNumber(ymd: string): number {
  return Math.round(ymdToDbDate(ymd).getTime() / DAY_MS);
}

/** Whole days from `today` to `ymd`; 0 = today, negative = past. */
export function daysFromToday(ymd: string, today: string): number {
  return dayNumber(ymd) - dayNumber(today);
}

/**
 * Which part of the stream a reservation belongs to.
 *
 * A cancelled or expired stay is history the moment it ends that way, whatever its
 * dates say — putting next month's cancellation under "Upcoming" would list a stay
 * nobody is coming for among the ones being prepared for. `groupReservations` orders
 * "Earlier" by most recent first, so a future cancellation still surfaces at the top of
 * the history rather than behind last winter's.
 */
export function groupOf(
  reservation: HostReservation,
  today: string,
): Exclude<ReservationGroup, "action"> {
  if (isTerminal(reservation.status) || reservation.status === "COMPLETED") {
    return "earlier";
  }
  // Check-out is exclusive: a stay ending today is over, and the date is sellable again.
  if (compareYmd(reservation.checkOut, today) <= 0) return "earlier";
  if (compareYmd(reservation.checkIn, today) <= 0) return "today";
  return "upcoming";
}

export function matchesFilter(
  reservation: HostReservation,
  filter: ReservationFilter,
  today: string,
  actionIds: ReadonlySet<string>,
): boolean {
  switch (filter) {
    case "all":
      return true;
    case "action":
      return actionIds.has(reservation.id);
    case "upcoming":
      return (
        !isTerminal(reservation.status) &&
        reservation.status !== "COMPLETED" &&
        compareYmd(reservation.checkIn, today) > 0
      );
    case "staying":
      return (
        reservation.status === "CONFIRMED" &&
        compareYmd(reservation.checkIn, today) <= 0 &&
        compareYmd(reservation.checkOut, today) > 0
      );
    case "completed":
      return reservation.status === "COMPLETED";
    case "cancelled":
      return isTerminal(reservation.status);
  }
}

/**
 * Free-text match across everything printed on the row.
 *
 * `extra` is whatever the caller has already translated — the status label, most of the
 * time. Searching for "cancelled" has to find cancelled stays in the language the host
 * is reading, and this module has no translator.
 */
export function matchesQuery(
  reservation: HostReservation,
  query: string,
  propertyTitle: string,
  extra = "",
): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  const haystack = [
    propertyTitle,
    reservation.guest.name ?? "",
    reservation.reference,
    reservation.status,
    reservation.guestNote ?? "",
    extra,
  ]
    .join(" ")
    .toLowerCase();
  // Every word has to appear somewhere, so "ana ohrid" narrows instead of widening.
  return needle.split(/\s+/).every((word) => haystack.includes(word));
}

/**
 * The sort key, ascending in every mode.
 *
 * "Priority" is the queue's own ranking — an expiring request, then a guest waiting on
 * a reply, then an arrival to prepare for — and everything with nothing to do about it
 * sorts behind the lot, by "soonest".
 *
 * "Soonest" is not a plain ascending check-in: that would open the screen on the oldest
 * booking in the account. It is the next arrival, then the one after, and only then the
 * recent past working backwards — the same rule the v1 bookings list sorted by.
 */
export function sortKey(
  reservation: HostReservation,
  sort: ReservationSort,
  today: string,
  actionRank?: ReadonlyMap<string, number>,
): number {
  if (sort === "priority") {
    return actionRank?.get(reservation.id) ?? Number.MAX_SAFE_INTEGER;
  }
  if (sort === "newest") return -Date.parse(reservation.createdAt);
  if (sort === "highest") return -reservation.total;
  const days = daysFromToday(reservation.checkIn, today);
  return days >= 0 ? days : 1_000_000 - days;
}

export function compareReservations(
  left: HostReservation,
  right: HostReservation,
  sort: ReservationSort,
  today: string,
  actionRank?: ReadonlyMap<string, number>,
): number {
  const byKey =
    sortKey(left, sort, today, actionRank) -
    sortKey(right, sort, today, actionRank);
  if (byKey !== 0) return byKey;
  // Everything outside the queue shares one priority key, so the tie is broken by the
  // question the host would ask next: what is happening soonest.
  if (sort === "priority") {
    const bySoonest =
      sortKey(left, "soonest", today) - sortKey(right, "soonest", today);
    if (bySoonest !== 0) return bySoonest;
  }
  const byDate = compareYmd(left.checkIn, right.checkIn);
  if (byDate !== 0) return byDate;
  // Ids break the last tie so a re-render can never reshuffle equal rows.
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}

export interface ReservationQuery {
  propertyId: string | null;
  filter: ReservationFilter;
  sort: ReservationSort;
  query: string;
  today: string;
  actionIds: ReadonlySet<string>;
  /** Queue position by reservation id — what "priority" sorts on. */
  actionRank?: ReadonlyMap<string, number>;
  /** Property titles by listing id, for search and for the row's heading. */
  propertyTitles: ReadonlyMap<string, string>;
  /** Already-translated status labels by reservation id, for search. */
  statusLabels?: ReadonlyMap<string, string>;
}

export function selectReservations(
  reservations: readonly HostReservation[],
  options: ReservationQuery,
): HostReservation[] {
  return reservations
    .filter((reservation) => {
      if (options.propertyId && reservation.listingId !== options.propertyId) {
        return false;
      }
      if (
        !matchesFilter(reservation, options.filter, options.today, options.actionIds)
      ) {
        return false;
      }
      return matchesQuery(
        reservation,
        options.query,
        options.propertyTitles.get(reservation.listingId) ?? "",
        options.statusLabels?.get(reservation.id) ?? "",
      );
    })
    .sort((left, right) =>
      compareReservations(
        left,
        right,
        options.sort,
        options.today,
        options.actionRank,
      ),
    );
}

export interface ReservationSection {
  group: Exclude<ReservationGroup, "action">;
  reservations: HostReservation[];
}

/**
 * Cuts an already-sorted list into its time sections, in stream order.
 *
 * History is reversed: within "Earlier" the most recent stay comes first, because a
 * host scrolling past the work is looking for what just happened, not for the first
 * booking they ever took.
 */
export function groupReservations(
  reservations: readonly HostReservation[],
  today: string,
): ReservationSection[] {
  const sections: ReservationSection[] = [
    { group: "today", reservations: [] },
    { group: "upcoming", reservations: [] },
    { group: "earlier", reservations: [] },
  ];

  for (const reservation of reservations) {
    const group = groupOf(reservation, today);
    sections.find((section) => section.group === group)!.reservations.push(
      reservation,
    );
  }

  const earlier = sections.find((section) => section.group === "earlier")!;
  earlier.reservations.sort((left, right) =>
    compareYmd(right.checkIn, left.checkIn),
  );

  return sections.filter((section) => section.reservations.length > 0);
}

export function countsByFilter(
  reservations: readonly HostReservation[],
  today: string,
  actionIds: ReadonlySet<string>,
): Record<ReservationFilter, number> {
  const counts = {} as Record<ReservationFilter, number>;
  for (const filter of RESERVATION_FILTERS) {
    counts[filter] = reservations.filter((reservation) =>
      matchesFilter(reservation, filter, today, actionIds),
    ).length;
  }
  return counts;
}

export interface PropertySummary {
  /** Everything on this property, however old. */
  total: number;
  /** How many of this property's reservations are in the action queue. */
  action: number;
  /** Confirmed or requested stays that have not started yet. */
  upcoming: number;
  /** The next arrival date, or null when nothing is coming. */
  nextCheckIn: string | null;
  /** Money from confirmed stays that have not started yet. */
  upcomingValue: number;
}

export function summarizeProperty(
  reservations: readonly HostReservation[],
  today: string,
  actionIds: ReadonlySet<string>,
): PropertySummary {
  let action = 0;
  let upcoming = 0;
  let upcomingValue = 0;
  let nextCheckIn: string | null = null;

  for (const reservation of reservations) {
    if (actionIds.has(reservation.id)) action += 1;
    if (!matchesFilter(reservation, "upcoming", today, actionIds)) continue;
    upcoming += 1;
    if (reservation.status === "CONFIRMED") upcomingValue += reservation.total;
    if (!nextCheckIn || compareYmd(reservation.checkIn, nextCheckIn) < 0) {
      nextCheckIn = reservation.checkIn;
    }
  }

  return {
    total: reservations.length,
    action,
    upcoming,
    nextCheckIn,
    upcomingValue,
  };
}

/**
 * Runs the shared action queue over this payload.
 *
 * The ranking itself is `booking-action-queue`, which the v1 bookings screen already
 * uses — deliberately not reimplemented here, so the two screens can never disagree
 * about which request is the most urgent.
 */
export function buildActionQueue(
  reservations: readonly HostReservation[],
  now: Date,
): HostActionItem[] {
  return buildHostActionQueue(
    reservations.map((reservation) => ({
      id: reservation.id,
      status: reservation.status,
      checkIn: ymdToDbDate(reservation.checkIn),
      responseDueAt: new Date(reservation.responseDueAt),
      unreadCount: reservation.unreadCount,
      paymentInstructionsStatus: reservation.paymentInstructionsStatus,
      ratingDueAt: reservation.ratingDueAt
        ? new Date(reservation.ratingDueAt)
        : null,
    })),
    now,
  );
}
