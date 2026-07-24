/**
 * Popularity scoring — pure math, no DB access, so it can be unit-tested and reasoned
 * about on its own. The DB side lives in lib/services/popularity.service.ts.
 *
 * The score answers "which listings are guests actually interested in right now",
 * from two signals:
 *   - views  — plentiful but weak, and self-reinforcing (whatever is shown on the home
 *              page gets clicked, which would keep it on the home page forever)
 *   - bookings — rare but the signal that actually matters
 *
 * so a booking is worth many views, and both decay exponentially with age. Decay
 * rather than a hard window means a listing's score drifts down smoothly instead of
 * jumping the day an old event falls out of range.
 */

/** Events older than this are ignored (and pruned from the DB). At the half-life below
 *  a 90-day-old event is worth ~5% of a fresh one, so the cutoff costs almost nothing
 *  in accuracy while keeping the events table small. */
export const POPULARITY_WINDOW_DAYS = 90;

/** How long it takes an event to lose half its weight. Three weeks is short enough to
 *  track a season turning over, long enough that one quiet week doesn't reshuffle the
 *  home page. */
export const POPULARITY_HALF_LIFE_DAYS = 21;

/** One booking request outweighs 25 deduped views. Views are cheap and noisy; a guest
 *  who fills in dates and asks to book is the strongest interest signal available. */
export const BOOKING_WEIGHT = 25;
export const VIEW_WEIGHT = 1;

/** A cancelled or rejected booking still means a guest wanted this listing on those
 *  dates, so it isn't discarded — but it's worth much less than one that stuck. */
export const CANCELLED_BOOKING_WEIGHT = 5;

export interface DailyCount {
  /** Local calendar day the events happened on. */
  day: Date;
  count: number;
}

export interface PopularityInput {
  views: DailyCount[];
  /** Bookings that were confirmed, completed, or are still pending a host decision. */
  bookings: DailyCount[];
  /** Bookings that were rejected or cancelled by anyone. */
  cancelledBookings?: DailyCount[];
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Whole and fractional days between two instants, floored at 0 so clock skew on a
 *  just-created row can't produce a >1 weight. */
export function ageInDays(day: Date, now: Date): number {
  return Math.max(0, (now.getTime() - day.getTime()) / MS_PER_DAY);
}

/** Exponential decay: 1 at age 0, 0.5 at one half-life, ~0 past the window. */
export function decayFactor(
  ageDays: number,
  halfLifeDays: number = POPULARITY_HALF_LIFE_DAYS
): number {
  if (ageDays >= POPULARITY_WINDOW_DAYS) return 0;
  return Math.pow(0.5, ageDays / halfLifeDays);
}

function weightedSum(entries: DailyCount[], weight: number, now: Date): number {
  return entries.reduce(
    (total, entry) => total + entry.count * weight * decayFactor(ageInDays(entry.day, now)),
    0
  );
}

/**
 * Combines a listing's decayed view and booking counts into a single score. Returns 0
 * when there is no signal at all — callers treat 0 as "unknown", not "unpopular", and
 * hide popularity-based UI rather than showing an arbitrary ordering.
 */
export function computePopularityScore(input: PopularityInput, now: Date = new Date()): number {
  const score =
    weightedSum(input.views, VIEW_WEIGHT, now) +
    weightedSum(input.bookings, BOOKING_WEIGHT, now) +
    weightedSum(input.cancelledBookings ?? [], CANCELLED_BOOKING_WEIGHT, now);

  // Four decimals is far finer than any ordering decision needs, and keeps the stored
  // float from carrying meaningless trailing noise when it shows up in admin tooling.
  return Math.round(score * 10_000) / 10_000;
}
