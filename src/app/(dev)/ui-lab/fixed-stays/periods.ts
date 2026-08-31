import {
  addDaysToYmd,
  compareYmd,
  isValidYmd,
  nightsBetweenYmd,
} from "@/lib/utils/date-only";
import {
  computeStayQuote,
  parseLocalYmd,
  type StayPromotion,
} from "@/lib/utils/stay-pricing";

/**
 * Fixed stay periods — the pure half of the mockup.
 *
 * Nothing here touches React, the database or the booking service. A period is a pair
 * of civil dates, and every question the two mockup screens ask about one ("how long is
 * it", "can a guest pick it", "may the host add this", "what would it cost") is
 * answered here so both screens answer it the same way.
 *
 * Two things this module deliberately does **not** own:
 *
 * - **Price.** A period says *when* a guest may check in and out. What that stay costs
 *   is the listing's existing nightly rate, date overrides, cleaning fee and
 *   promotions, and it is computed by the product's own `computeStayQuote` — the same
 *   function a flexible booking of those dates goes through. Two places that can each
 *   name a price for one stay is how a receipt stops adding up, so there is only one.
 * - **Booked-ness.** A period carries no `booked` flag. Whether it can be taken is
 *   derived from the listing's blocks — bookings, holds, manual blocks and imported
 *   calendars alike — which is the same source every other availability question in the
 *   product is answered from, and is what makes an overlapping alternative disappear
 *   the moment its neighbour is booked.
 *
 * Dates are `YYYY-MM-DD` throughout and are only ever moved with the repository's
 * date-only helpers, so a period cannot slide a day across a timezone boundary.
 */

/** The two lengths version one offers. Adjacent periods never combine into a third. */
export const FIXED_STAY_LENGTHS = [7, 14] as const;
export type FixedStayLength = (typeof FIXED_STAY_LENGTHS)[number];

/** A stay the host permits, stored as the two dates and nothing else. */
export interface FixedStayPeriod {
  id: string;
  /** `YYYY-MM-DD`. */
  checkIn: string;
  /** `YYYY-MM-DD`, exclusive — the day the guest leaves. */
  checkOut: string;
  /** The host switched it off without deleting it. */
  disabled: boolean;
}

export type CalendarBlockKind =
  /** A guest holds these nights — a request awaiting an answer, or a confirmed stay. */
  | "BOOKING"
  /** The host blocked them by hand. */
  | "MANUAL"
  /** Mirrored in from a connected calendar. */
  | "IMPORTED";

/**
 * A run of nights the listing cannot sell, `[start, end)`.
 *
 * The one negative-availability record, exactly as in the product: a booking, a manual
 * block and an imported event are three reasons for the same fact, and none of them is
 * special to fixed stays.
 */
export interface CalendarBlock {
  id: string;
  start: string;
  /** Exclusive. */
  end: string;
  kind: CalendarBlockKind;
  /** `BOOKING` only: which option the guest actually chose, when they chose one. */
  periodId?: string;
  /** The guest's name, or the channel this was imported from. */
  label?: string;
}

export type FixedStayPeriodState =
  /** Bookable. */
  | "AVAILABLE"
  /** A guest booked this exact option. */
  | "BOOKED"
  /** Something overlapping holds the nights — a neighbouring option, a manual block,
   *  or an imported calendar. */
  | "DATES_TAKEN"
  /** The host switched it off. */
  | "DISABLED"
  /** Its check-in has already gone by. */
  | "PAST";

export interface ResolvedFixedStayPeriod extends FixedStayPeriod {
  nights: number;
  state: FixedStayPeriodState;
  /** Whatever made this `BOOKED` or `DATES_TAKEN`, so a row can say why. */
  blockedBy: CalendarBlock | null;
}

/** Checkout is never typed — it is always the check-in plus the chosen length. */
export function checkOutFor(checkIn: string, nights: FixedStayLength): string {
  return addDaysToYmd(checkIn, nights);
}

/** Length is derived, never stored, so the two can never disagree. */
export function periodNights(period: {
  checkIn: string;
  checkOut: string;
}): number {
  return nightsBetweenYmd(period.checkIn, period.checkOut);
}

/** Whether a length is one version one offers. */
export function isOfferedLength(nights: number): nights is FixedStayLength {
  return (FIXED_STAY_LENGTHS as readonly number[]).includes(nights);
}

/** Stay nights are `[checkIn, checkOut)`, the same half-open interval the rest of the
 *  app uses, so back-to-back periods share a date without sharing a night. */
export function periodsOverlap(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string,
): boolean {
  return compareYmd(aStart, bEnd) < 0 && compareYmd(bStart, aEnd) < 0;
}

/** Every block sharing a night with this period, in the order they were given. */
export function blocksOverlapping(
  period: FixedStayPeriod,
  blocks: readonly CalendarBlock[],
): CalendarBlock[] {
  return blocks.filter((block) =>
    periodsOverlap(period.checkIn, period.checkOut, block.start, block.end),
  );
}

/**
 * One period's state, in the order the answers matter.
 *
 * Past first, because a stay that has started is not a thing the host can act on and
 * not a thing a guest can buy. Then the host's own switch, then what the calendar says.
 * `BOOKED` and `DATES_TAKEN` are the same fact seen from two distances — the nights are
 * held either way — but they are different sentences to a host, so they are told apart
 * by whether the holding booking names this option.
 */
export function resolvePeriod(
  period: FixedStayPeriod,
  blocks: readonly CalendarBlock[],
  todayYmdValue: string,
): ResolvedFixedStayPeriod {
  const nights = periodNights(period);
  const overlapping = blocksOverlapping(period, blocks);
  const ownBooking =
    overlapping.find(
      (block) => block.kind === "BOOKING" && block.periodId === period.id,
    ) ?? null;

  if (compareYmd(period.checkIn, todayYmdValue) < 0) {
    return { ...period, nights, state: "PAST", blockedBy: ownBooking };
  }
  if (period.disabled) {
    return { ...period, nights, state: "DISABLED", blockedBy: null };
  }
  if (ownBooking) {
    return { ...period, nights, state: "BOOKED", blockedBy: ownBooking };
  }
  if (overlapping.length > 0) {
    return {
      ...period,
      nights,
      state: "DATES_TAKEN",
      blockedBy: overlapping[0],
    };
  }
  return { ...period, nights, state: "AVAILABLE", blockedBy: null };
}

/** Chronological, then shortest first, so two options from one date read as a ladder. */
export function sortPeriods<T extends { checkIn: string; checkOut: string }>(
  periods: readonly T[],
): T[] {
  return [...periods].sort(
    (left, right) =>
      compareYmd(left.checkIn, right.checkIn) ||
      compareYmd(left.checkOut, right.checkOut),
  );
}

/** Everything the host owns, including what no guest will ever be shown. */
export function resolvePeriodsForHost(
  periods: readonly FixedStayPeriod[],
  blocks: readonly CalendarBlock[],
  todayYmdValue: string,
): ResolvedFixedStayPeriod[] {
  return sortPeriods(
    periods.map((period) => resolvePeriod(period, blocks, todayYmdValue)),
  );
}

/**
 * What a guest may see.
 *
 * A period the host switched off, and one whose check-in has gone by, are not options
 * with a reason attached — they are not options. Filtering them here rather than in the
 * screen is the point: in the real thing this is the server's projection, and a dropped
 * row is one whose dates never reach the browser at all.
 *
 * Booked and taken options do stay, greyed. They are the shape of the season, and a
 * list that silently closed up around them would tell a guest the host had less to
 * offer than they do.
 */
export function resolvePeriodsForGuest(
  periods: readonly FixedStayPeriod[],
  blocks: readonly CalendarBlock[],
  todayYmdValue: string,
): ResolvedFixedStayPeriod[] {
  return resolvePeriodsForHost(periods, blocks, todayYmdValue).filter(
    (period) => period.state !== "DISABLED" && period.state !== "PAST",
  );
}

/** Only an available option can be picked. */
export function isSelectable(period: ResolvedFixedStayPeriod): boolean {
  return period.state === "AVAILABLE";
}

// ─── Pricing ────────────────────────────────────────────────────────────────────

/**
 * The listing's existing pricing, unchanged and un-extended.
 *
 * There is no fixed-stay price of any kind in here, and that is the whole point: a
 * period contributes two dates to `computeStayQuote` and nothing else.
 */
export interface NightlyPricing {
  baseNightlyRate: number;
  /** Per-date overrides, keyed `YYYY-MM-DD`. */
  overrides: Record<string, number>;
  cleaningFee: number;
  currency: string;
  /** The listing's live offers. They apply to a fixed stay exactly as they apply to
   *  any other — a fortnight qualifying for a "14 nights or more" offer is the host's
   *  own rule doing its job, not a fixed-stay rule. */
  promotions: StayPromotion[];
}

/**
 * What a stay costs, from the product's own quote engine.
 *
 * Deliberately the real `computeStayQuote` rather than arithmetic of this module's own.
 * It is what the booking transaction runs, so a total shown here is a total the server
 * would agree with — and calling it unchanged is the demonstration that fixed stays
 * need no pricing work at all.
 */
export function quoteStay(
  checkIn: string,
  checkOut: string,
  pricing: NightlyPricing,
) {
  return computeStayQuote({
    baseNightly: pricing.baseNightlyRate,
    cleaningFee: pricing.cleaningFee,
    checkIn: parseLocalYmd(checkIn),
    checkOut: parseLocalYmd(checkOut),
    overrides: new Map(Object.entries(pricing.overrides)),
    promotions: pricing.promotions,
  });
}

export function quoteForPeriod(
  period: { checkIn: string; checkOut: string },
  pricing: NightlyPricing,
) {
  return quoteStay(period.checkIn, period.checkOut, pricing);
}

// ─── The host's add/edit form ───────────────────────────────────────────────────

/** What the host is typing into the add/edit form. No price field: there is no price
 *  on a period to type. */
export interface FixedStayPeriodDraft {
  checkIn: string;
  nights: FixedStayLength;
}

export type FixedStayDraftIssue =
  | "MISSING_DATE"
  | "INVALID_DATE"
  | "PAST_DATE"
  | "DUPLICATE";

/**
 * The one blocking check on the add/edit form.
 *
 * Two periods sharing a check-in date is explicitly allowed — a week and a fortnight
 * from the same Saturday are two real options. Only the exact same check-in *and*
 * checkout is a duplicate, because that is the one pair a guest could never tell apart,
 * and it is the pair the stored unique index refuses.
 */
export function draftIssue(
  draft: FixedStayPeriodDraft,
  periods: readonly FixedStayPeriod[],
  todayYmdValue: string,
  editingId?: string,
): FixedStayDraftIssue | null {
  if (draft.checkIn.trim() === "") return "MISSING_DATE";
  if (!isValidYmd(draft.checkIn)) return "INVALID_DATE";
  if (compareYmd(draft.checkIn, todayYmdValue) < 0) return "PAST_DATE";

  const checkOut = checkOutFor(draft.checkIn, draft.nights);
  const duplicate = periods.some(
    (period) =>
      period.id !== editingId &&
      period.checkIn === draft.checkIn &&
      period.checkOut === checkOut,
  );
  return duplicate ? "DUPLICATE" : null;
}

/**
 * Periods the draft would share nights with. A warning, never a refusal: overlapping
 * options are how a host offers "one week or two from the 1st", and the host is the one
 * who decides whether two overlapping options is what they meant.
 */
export function overlappingPeriods(
  draft: FixedStayPeriodDraft,
  periods: readonly FixedStayPeriod[],
  editingId?: string,
): FixedStayPeriod[] {
  if (!isValidYmd(draft.checkIn)) return [];
  const draftCheckOut = checkOutFor(draft.checkIn, draft.nights);

  return periods.filter((period) => {
    if (period.id === editingId) return false;
    if (period.checkIn === draft.checkIn && period.checkOut === draftCheckOut) {
      return false;
    }
    return periodsOverlap(
      draft.checkIn,
      draftCheckOut,
      period.checkIn,
      period.checkOut,
    );
  });
}

// ─── Grouping ───────────────────────────────────────────────────────────────────

export interface MonthGroup<T> {
  /** `YYYY-MM`, for a stable key and for ordering. */
  month: string;
  items: T[];
}

/**
 * Stays split into the months they start in.
 *
 * A season is fifteen to thirty dated rows, and an undivided list of them is a wall:
 * every line begins with a weekday and a month, so nothing tells the eye where July
 * ends. Grouping is what makes "have I covered August?" answerable by looking rather
 * than by reading. Order is preserved from the input, so a sorted list stays sorted.
 */
export function groupByMonth<T extends { checkIn: string }>(
  items: readonly T[],
): MonthGroup<T>[] {
  const groups: MonthGroup<T>[] = [];
  for (const item of items) {
    const month = item.checkIn.slice(0, 7);
    const last = groups[groups.length - 1];
    if (last && last.month === month) {
      last.items.push(item);
      continue;
    }
    groups.push({ month, items: [item] });
  }
  return groups;
}
