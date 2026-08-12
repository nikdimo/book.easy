/**
 * Derives the "needs your action" queue for the host bookings screen.
 *
 * The host list is a mixture of things that are merely *history* (rejected, expired,
 * cancelled) and things that are *work* — and only the work has a clock on it. This
 * module pulls the work out of the pile and ranks it, so the screen can lead with it
 * instead of leaving a request with three hours left buried under last month's
 * rejections.
 *
 * Deliberately free of Prisma runtime imports (enums are type-only) so the countdown
 * formatter can be shared with the client components that tick it.
 */

/** Ranked most- to least-urgent. The array order *is* the priority order. */
export const HOST_ACTION_KINDS = [
  // A hard deadline the host cannot extend: unanswered requests auto-expire at
  // `responseDueAt` and the dates are released. Missing one costs a real booking.
  "RESPOND_TO_REQUEST",
  // No deadline, but a person is waiting on a reply and response time is a public
  // quality signal — it outranks anything the host can still do tomorrow.
  "REPLY_TO_GUEST",
  // Operational prep for an imminent arrival. Time-boxed but not lossy.
  "PREPARE_CHECK_IN",
  // Soft two-week window, and nothing breaks if it slips a day.
  "RATE_GUEST",
] as const;

export type HostActionKind = (typeof HOST_ACTION_KINDS)[number];

/** Drives the accent colour on the card: red / amber / blue. */
export type HostActionUrgency = "critical" | "soon" | "planned";

export type HostActionBooking = {
  id: string;
  status: string;
  checkIn: Date;
  responseDueAt: Date;
  /** Unread messages in this booking's conversation, from the host's side. */
  unreadCount: number;
  /** Deadline of an outstanding HOST_TO_GUEST review invitation, if one is open. */
  ratingDueAt: Date | null;
};

export type HostActionItem = {
  bookingId: string;
  kind: HostActionKind;
  urgency: HostActionUrgency;
  /** Null for kinds with no fixed deadline (an unread message). */
  dueAt: Date | null;
  /** Other things this same booking needs, shown as secondary chips on the card. */
  alsoNeeds: HostActionKind[];
};

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** A request with less than this left is shown as critical (red) rather than amber. */
const CRITICAL_HOURS = 6;
/** How far ahead a check-in counts as "prepare now". */
const CHECK_IN_HORIZON_DAYS = 1;

/** `checkIn` is a `@db.Date` (UTC midnight), so the comparison has to happen in UTC
 *  too — using local midnight would shift every date by a day for negative offsets. */
function utcDayStart(at: Date): number {
  return Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate());
}

/** Whole days from today to `date`; 0 = today, 1 = tomorrow, negative = past. */
export function daysUntil(date: Date, now: Date): number {
  return Math.round((utcDayStart(date) - utcDayStart(now)) / DAY_MS);
}

/** Every reason this one booking is asking for attention, already in priority order. */
function reasonsFor(booking: HostActionBooking, now: Date): HostActionKind[] {
  const reasons: HostActionKind[] = [];

  if (booking.status === "PENDING" && booking.responseDueAt.getTime() > now.getTime()) {
    reasons.push("RESPOND_TO_REQUEST");
  }
  if (booking.unreadCount > 0) {
    reasons.push("REPLY_TO_GUEST");
  }
  if (booking.status === "CONFIRMED") {
    const days = daysUntil(booking.checkIn, now);
    if (days >= 0 && days <= CHECK_IN_HORIZON_DAYS) reasons.push("PREPARE_CHECK_IN");
  }
  if (booking.ratingDueAt && booking.ratingDueAt.getTime() > now.getTime()) {
    reasons.push("RATE_GUEST");
  }

  return reasons;
}

function deadlineFor(
  kind: HostActionKind,
  booking: HostActionBooking,
): Date | null {
  if (kind === "RESPOND_TO_REQUEST") return booking.responseDueAt;
  if (kind === "PREPARE_CHECK_IN") return booking.checkIn;
  if (kind === "RATE_GUEST") return booking.ratingDueAt;
  return null;
}

function urgencyFor(
  kind: HostActionKind,
  booking: HostActionBooking,
  now: Date,
): HostActionUrgency {
  if (kind === "RESPOND_TO_REQUEST") {
    const hoursLeft = (booking.responseDueAt.getTime() - now.getTime()) / HOUR_MS;
    return hoursLeft <= CRITICAL_HOURS ? "critical" : "soon";
  }
  if (kind === "REPLY_TO_GUEST") return "soon";
  if (kind === "PREPARE_CHECK_IN") {
    return daysUntil(booking.checkIn, now) === 0 ? "soon" : "planned";
  }
  return "planned";
}

/**
 * One card per booking, at its most urgent reason — a booking that is both awaiting a
 * response *and* has an unread message should not occupy two slots in a queue whose
 * whole value is being short.
 *
 * Ordered by priority kind first, then soonest deadline. Deadline-less items sort last
 * within their kind.
 */
export function buildHostActionQueue(
  bookings: HostActionBooking[],
  now: Date = new Date(),
): HostActionItem[] {
  const items: HostActionItem[] = [];

  for (const booking of bookings) {
    const [primary, ...alsoNeeds] = reasonsFor(booking, now);
    if (!primary) continue;
    items.push({
      bookingId: booking.id,
      kind: primary,
      urgency: urgencyFor(primary, booking, now),
      dueAt: deadlineFor(primary, booking),
      alsoNeeds,
    });
  }

  return items.sort((a, b) => {
    const byKind =
      HOST_ACTION_KINDS.indexOf(a.kind) - HOST_ACTION_KINDS.indexOf(b.kind);
    if (byKind !== 0) return byKind;
    if (a.dueAt && b.dueAt) return a.dueAt.getTime() - b.dueAt.getTime();
    if (a.dueAt) return -1;
    if (b.dueAt) return 1;
    return 0;
  });
}

/**
 * Coarse, monotonically shrinking countdown: "3d", "19h", "3h 12m", "42m".
 *
 * Minutes only appear under an hour of granularity so the label doesn't churn on every
 * tick for a deadline two days out, and it never reads "0m" — a deadline that has
 * technically passed but hasn't been swept yet still says something is left to do.
 */
export function formatCountdown(msRemaining: number): string {
  if (msRemaining <= 0) return "any moment";
  const minutes = Math.floor(msRemaining / 60_000);
  if (minutes < 60) return `${Math.max(minutes, 1)}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 6) return `${hours}h ${minutes % 60}m`;
  if (hours < 48) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}
