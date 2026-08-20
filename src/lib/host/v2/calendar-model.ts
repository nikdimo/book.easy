import type { CalendarPlatform } from "./calendar-feed-platform";
import {
  addDaysToYmd,
  compareYmd,
  eachYmdExclusive,
} from "@/lib/utils/date-only";
import type {
  HostCalendarBlock,
  HostCalendarDateCounts,
  HostCalendarListing,
  HostCalendarWorkspaceData,
} from "@/lib/host/v2/calendar-types";
import {
  listingCanSell,
  listingSaleBlockers,
  type ListingSaleBlocker,
} from "@/lib/host/v2/listing-status";

/**
 * What a single date is, in the guest's terms.
 *
 * `available` means a guest could book it. `open_not_bookable` is the state that used
 * to be wrongly folded into it: the host has not blocked the date, but the listing is
 * off the site or has no price, so nothing can be sold on it. They are separated
 * because a calendar full of green squares under "Pricing not set — nothing can be
 * booked" is a direct contradiction, and the green squares were the lie.
 *
 * All of it is derived from the same facts the booking path enforces — reservation
 * holds, imported blocks, the host's own manual blocks, and (in CLOSED mode) whether an
 * explicit availability window covers the date.
 */
export type HostCalendarDayState =
  | "past"
  | "booked"
  | "blocked"
  | "open_not_bookable"
  | "available";

/**
 * Why a date is in the state it is in. Needed because "blocked" has four causes with
 * different consequences: only `manual` and `closed_default` can be changed from here.
 */
export type HostCalendarDayReason =
  | "reservation"
  | "external"
  | "manual"
  | "closed_default"
  | null;

export interface HostCalendarDay {
  date: string;
  state: HostCalendarDayState;
  reason: HostCalendarDayReason;
  /** True when this host can change the date's availability from the calendar. */
  editable: boolean;
  /** True when the calendar leaves the date open, whether or not it can be sold. */
  open: boolean;
  /** Why an open date still cannot be sold. Empty unless `open_not_bookable`. */
  saleBlockers: ListingSaleBlocker[];
  /** Effective nightly rate before promotions, or null when pricing is unset. */
  price: number | null;
  /** The rate comes from a date override rather than the base price. */
  customPrice: boolean;
  guestName: string | null;
}

/**
 * One occupied date's place in the stay it belongs to.
 *
 * The grid draws a stay as separate cells, so the only continuity left is the shape of
 * its two ends — which means the ends have to be the stay's own, not the week row's. A
 * stay that crosses Sunday keeps one arrival and one departure; the Monday it resumes
 * on is neither, and marking it as an arrival would tell the host a guest checks in on
 * a day nobody does.
 *
 * `platform` names the connected calendar holding the date; `direct` marks a booking
 * taken here. Both are drawn the same weight — the colour answers "can I sell this
 * date", and only the mark says where it came from.
 */
export interface CalendarStayEdge {
  platform: CalendarPlatform | null;
  direct: boolean;
  arrival: boolean;
  departure: boolean;
}

export interface ListingCalendarIndex {
  reservationDates: Map<string, { guestName: string | null; status: string }>;
  externalDates: Set<string>;
  manualBlockDates: Set<string>;
  openWindowDates: Set<string>;
  priceByDate: Map<string, number>;
  /** Enabled date-specific promotions covering each night. */
  promotionCountByDate: Map<string, number>;
  /**
   * Which connected calendar is holding each imported date, so the grid can name it
   * without walking the block list per cell.
   */
  externalSourceByDate: Map<
    string,
    { name: string | null; platform: CalendarPlatform | null }
  >;
  /**
   * The host's own note on each manually blocked date, where one was written. Absent
   * rather than empty when there is none — the calendar draws a label only when there
   * are words to read, and a padlock already says who closed the date.
   */
  manualNoteByDate: Map<string, string>;
  /**
   * Where each occupied date sits inside its stay. Built from the stored blocks rather
   * than by walking the grid, so the two ends are the real check-in and checkout even
   * when the stay is drawn across two week rows or two months.
   */
  stayByDate: Map<string, CalendarStayEdge>;
}

function addRange(target: Set<string>, startDate: string, endDate: string) {
  for (const day of eachYmdExclusive(startDate, endDate)) target.add(day);
}

/**
 * Marks every night of one stay, with the first and last flagged.
 *
 * `endDate` is the exclusive checkout boundary, so the last covered day is the last
 * night — the day the guest leaves in the morning, and the day the host has to turn the
 * place around.
 */
function addStay(
  target: Map<string, CalendarStayEdge>,
  block: { startDate: string; endDate: string },
  edge: Pick<CalendarStayEdge, "platform" | "direct">,
) {
  const nights = [...eachYmdExclusive(block.startDate, block.endDate)];
  nights.forEach((day, position) => {
    target.set(day, {
      ...edge,
      arrival: position === 0,
      departure: position === nights.length - 1,
    });
  });
}

export function buildListingCalendarIndex(
  listing: HostCalendarListing,
): ListingCalendarIndex {
  const reservationDates = new Map<
    string,
    { guestName: string | null; status: string }
  >();
  const externalDates = new Set<string>();
  const manualBlockDates = new Set<string>();
  const openWindowDates = new Set<string>();
  const priceByDate = new Map<string, number>();
  const promotionCountByDate = new Map<string, number>();
  const externalSourceByDate = new Map<
    string,
    { name: string | null; platform: CalendarPlatform | null }
  >();
  const manualNoteByDate = new Map<string, string>();
  const stayByDate = new Map<string, CalendarStayEdge>();
  // Held for a second pass. A reservation outranks an imported hold on the same night
  // — the same precedence `resolveDay` applies — so bookings taken here are written
  // last and win the cell.
  const bookingHolds: HostCalendarBlock[] = [];

  for (const block of listing.blocks) {
    if (block.blockType === "BOOKING_HOLD") {
      bookingHolds.push(block);
      for (const day of eachYmdExclusive(block.startDate, block.endDate)) {
        reservationDates.set(day, {
          guestName: block.guestName,
          status: block.bookingStatus ?? "CONFIRMED",
        });
      }
      continue;
    }
    if (block.blockType === "EXTERNAL_SYNC") {
      addRange(externalDates, block.startDate, block.endDate);
      addStay(stayByDate, block, {
        platform: block.feedPlatform,
        direct: false,
      });
      for (const day of eachYmdExclusive(block.startDate, block.endDate)) {
        externalSourceByDate.set(day, {
          name: block.feedName,
          platform: block.feedPlatform,
        });
      }
      continue;
    }
    addRange(manualBlockDates, block.startDate, block.endDate);
    const note = block.reason?.trim();
    if (note) {
      for (const day of eachYmdExclusive(block.startDate, block.endDate)) {
        manualNoteByDate.set(day, note);
      }
    }
  }

  for (const block of bookingHolds) {
    addStay(stayByDate, block, { platform: null, direct: true });
  }

  for (const window of listing.availabilityWindows) {
    addRange(openWindowDates, window.startDate, window.endDate);
  }

  for (const row of listing.datePrices) {
    priceByDate.set(row.date, row.nightlyRate);
  }

  for (const promotion of listing.promotions) {
    if (!promotion.startDate || !promotion.endDate) continue;
    for (const day of eachYmdExclusive(
      promotion.startDate,
      promotion.endDate,
    )) {
      promotionCountByDate.set(
        day,
        (promotionCountByDate.get(day) ?? 0) + 1,
      );
    }
  }

  return {
    reservationDates,
    externalDates,
    manualBlockDates,
    externalSourceByDate,
    manualNoteByDate,
    stayByDate,
    openWindowDates,
    priceByDate,
    promotionCountByDate,
  };
}

/** Whether the calendar alone leaves a future date open, ignoring listing state. */
function calendarOpen(
  listing: HostCalendarListing,
  index: ListingCalendarIndex,
  date: string,
): boolean {
  if (index.reservationDates.has(date)) return false;
  if (index.externalDates.has(date)) return false;
  if (index.manualBlockDates.has(date)) return false;
  if (listing.availabilityMode === "CLOSED") {
    return index.openWindowDates.has(date);
  }
  return true;
}

/**
 * Precedence matters and is not arbitrary: a reservation is the reason a date cannot
 * be touched, an imported block is owned by the remote calendar that would only put it
 * back, and only after both of those does the host's own decision (a manual block, or
 * the absence of an open window on a closed-by-default listing) get to describe the
 * date. Listing-level sale blockers are applied last, because they change what an open
 * date *means* without changing whether it is open.
 */
export function resolveDay(
  listing: HostCalendarListing,
  index: ListingCalendarIndex,
  date: string,
  today: string,
): HostCalendarDay {
  const override = index.priceByDate.get(date);
  const price = override ?? listing.pricing?.baseNightlyRate ?? null;
  const base = {
    date,
    price,
    customPrice: override !== undefined,
    guestName: null,
    open: false,
    saleBlockers: [] as ListingSaleBlocker[],
  };

  if (compareYmd(date, today) < 0) {
    return { ...base, state: "past", reason: null, editable: false };
  }

  const reservation = index.reservationDates.get(date);
  if (reservation) {
    return {
      ...base,
      state: "booked",
      reason: "reservation",
      editable: false,
      guestName: reservation.guestName,
    };
  }
  if (index.externalDates.has(date)) {
    return { ...base, state: "blocked", reason: "external", editable: false };
  }
  if (index.manualBlockDates.has(date)) {
    return { ...base, state: "blocked", reason: "manual", editable: true };
  }
  if (
    listing.availabilityMode === "CLOSED" &&
    !index.openWindowDates.has(date)
  ) {
    return {
      ...base,
      state: "blocked",
      reason: "closed_default",
      editable: true,
    };
  }

  const saleBlockers = listingSaleBlockers(listing);
  return {
    ...base,
    open: true,
    saleBlockers,
    state: saleBlockers.length > 0 ? "open_not_bookable" : "available",
    reason: null,
    editable: true,
  };
}

/** A date a guest could actually complete a booking on, ignoring stay length. */
export function isBookableDate(
  listing: HostCalendarListing,
  index: ListingCalendarIndex,
  date: string,
  today: string,
): boolean {
  return resolveDay(listing, index, date, today).state === "available";
}

export type { HostCalendarDateCounts };

export function countDates(
  listing: HostCalendarListing,
  index: ListingCalendarIndex,
  today: string,
  horizonEnd: string,
): HostCalendarDateCounts {
  const counts: HostCalendarDateCounts = {
    total: 0,
    bookable: 0,
    openNotBookable: 0,
    blocked: 0,
    booked: 0,
  };
  for (const date of eachYmdExclusive(today, horizonEnd)) {
    counts.total += 1;
    const day = resolveDay(listing, index, date, today);
    if (day.state === "available") counts.bookable += 1;
    else if (day.state === "open_not_bookable") counts.openNotBookable += 1;
    else if (day.state === "booked") counts.booked += 1;
    else if (day.state === "blocked") counts.blocked += 1;
  }
  return counts;
}

/**
 * What switching the availability rule would actually do.
 *
 * Computed by walking the window and asking, for each date, what it is now and what it
 * would be afterwards — not by assuming the rule alone decides. Reservations, imported
 * blocks and the host's own manual blocks all survive a mode change, and a listing that
 * is off the site or unpriced cannot sell any date whatever the rule says, so the
 * "becomes bookable" and "merely becomes open" numbers are reported separately.
 */
export interface AvailabilityModeTransition {
  mode: "OPEN" | "CLOSED";
  /** Dates the calendar would newly leave open. */
  becomingOpen: number;
  /** Of those, the ones a guest could then actually book. */
  becomingBookable: number;
  /** Dates in the window a block or reservation keeps shut either way. */
  stayingBlocked: number;
  /** Dates that stop being open. */
  closing: number;
  /** Of those, the ones that were genuinely bookable until now. */
  losingBookability: number;
  /** Dates an explicit availability window keeps open after switching to CLOSED. */
  stayingOpenViaWindows: number;
  /** Why nothing becomes bookable regardless of the rule. */
  saleBlockers: ListingSaleBlocker[];
}

export function simulateAvailabilityModeChange(
  listing: HostCalendarListing,
  index: ListingCalendarIndex,
  mode: "OPEN" | "CLOSED",
  today: string,
  horizonEnd: string,
): AvailabilityModeTransition {
  const saleBlockers = listingSaleBlockers(listing);
  const canSell = saleBlockers.length === 0;
  const after: HostCalendarListing = { ...listing, availabilityMode: mode };

  const transition: AvailabilityModeTransition = {
    mode,
    becomingOpen: 0,
    becomingBookable: 0,
    stayingBlocked: 0,
    closing: 0,
    losingBookability: 0,
    stayingOpenViaWindows: 0,
    saleBlockers,
  };

  for (const date of eachYmdExclusive(today, horizonEnd)) {
    const openNow = calendarOpen(listing, index, date);
    const openAfter = calendarOpen(after, index, date);

    if (!openNow && !openAfter) {
      transition.stayingBlocked += 1;
      continue;
    }
    if (!openNow && openAfter) {
      transition.becomingOpen += 1;
      if (canSell) transition.becomingBookable += 1;
      continue;
    }
    if (openNow && !openAfter) {
      transition.closing += 1;
      if (canSell) transition.losingBookability += 1;
      continue;
    }
    if (mode === "CLOSED" && index.openWindowDates.has(date)) {
      transition.stayingOpenViaWindows += 1;
    }
  }

  return transition;
}

export interface SelectionAvailabilitySummary {
  dates: number;
  /** Open on the calendar and sellable. */
  available: number;
  /** Open on the calendar but the listing cannot sell it. */
  openNotBookable: number;
  blocked: number;
  booked: number;
  /** Blocked dates this host can reopen — manual blocks and closed-by-default days. */
  openable: number;
  /** Open dates this host can block. */
  blockable: number;
  /** Blocked dates that would stay blocked whatever the host does here. */
  locked: number;
  /** Why opening these dates would still not make them bookable. */
  saleBlockers: ListingSaleBlocker[];
}

export function summarizeSelectionAvailability(
  listing: HostCalendarListing,
  index: ListingCalendarIndex,
  dates: string[],
  today: string,
): SelectionAvailabilitySummary {
  const summary: SelectionAvailabilitySummary = {
    dates: dates.length,
    available: 0,
    openNotBookable: 0,
    blocked: 0,
    booked: 0,
    openable: 0,
    blockable: 0,
    locked: 0,
    saleBlockers: listingSaleBlockers(listing),
  };
  for (const date of dates) {
    const day = resolveDay(listing, index, date, today);
    if (day.open) {
      if (day.state === "available") summary.available += 1;
      else summary.openNotBookable += 1;
      summary.blockable += 1;
    } else if (day.state === "booked") {
      summary.booked += 1;
      summary.locked += 1;
    } else if (day.state === "blocked") {
      summary.blocked += 1;
      if (day.editable) summary.openable += 1;
      else summary.locked += 1;
    }
  }
  return summary;
}

/**
 * Whether the *stay* the host has selected is one a guest could book.
 *
 * Separate from whether its dates are available, because the two genuinely differ: one
 * free night on a listing with a two-night minimum is one available date and zero
 * bookable stays. Reporting only the date count let the workbench say "1 bookable"
 * directly above a quote explaining that nobody can book it.
 *
 * Precedence runs from the most fundamental obstacle outwards: a listing that cannot
 * sell at all, then dates that are not open, then the stay length.
 *
 * Stay length is checked at both ends. `booking.service` refuses a request longer than
 * `maxNights` with the same comparison used here, so a selection above the maximum is
 * exactly as unbookable as one below the minimum — and reporting it as bookable, with a
 * total no guest could ever be charged, was the half of that rule this workspace had
 * left unfinished.
 */
export type SelectionStayBookability =
  | { code: "BOOKABLE" }
  | { code: "LISTING_CANNOT_SELL"; saleBlockers: ListingSaleBlocker[] }
  | { code: "DATES_UNAVAILABLE"; blocked: number; booked: number }
  | { code: "BELOW_MINIMUM"; nights: number; minNights: number }
  | { code: "ABOVE_MAXIMUM"; nights: number; maxNights: number };

export function resolveSelectionStayBookability({
  listing,
  availability,
}: {
  listing: HostCalendarListing;
  availability: SelectionAvailabilitySummary;
}): SelectionStayBookability {
  if (availability.saleBlockers.length > 0) {
    return {
      code: "LISTING_CANNOT_SELL",
      saleBlockers: availability.saleBlockers,
    };
  }
  const unavailable = availability.blocked + availability.booked;
  if (unavailable > 0) {
    return {
      code: "DATES_UNAVAILABLE",
      blocked: availability.blocked,
      booked: availability.booked,
    };
  }
  const minNights = listing.pricing?.minNights ?? 1;
  if (availability.dates < minNights) {
    return { code: "BELOW_MINIMUM", nights: availability.dates, minNights };
  }
  // `pricing` is non-null by this point — a listing without it returned
  // LISTING_CANNOT_SELL above — but a stored maximum below one would mean "no stay is
  // ever bookable", which is not a rule this panel should invent, so it is ignored.
  const maxNights = listing.pricing?.maxNights ?? 0;
  if (maxNights >= 1 && availability.dates > maxNights) {
    return { code: "ABOVE_MAXIMUM", nights: availability.dates, maxNights };
  }
  return { code: "BOOKABLE" };
}

export function isSelectionStayBookable(
  stay: SelectionStayBookability,
): boolean {
  return stay.code === "BOOKABLE";
}

/**
 * The private note stored on the manual block that covers *exactly* these dates.
 *
 * Exactly, and only a manual block. A note is the host's own annotation of their own
 * block, so it is never read off a reservation or an imported block — those are not
 * this panel's to describe — and never off a block that merely overlaps the selection,
 * because showing one block's note against a different range would invite the host to
 * "edit" a note that belongs to dates they are not looking at.
 */
export function selectionExactManualBlock(
  listing: HostCalendarListing,
  selection: { start: string; end: string },
): HostCalendarListing["blocks"][number] | null {
  const endExclusive = addDaysToYmd(selection.end, 1);
  return (
    listing.blocks.find(
    (candidate) =>
      candidate.blockType === "MANUAL_BLOCK" &&
      candidate.startDate === selection.start &&
      candidate.endDate === endExclusive,
    ) ?? null
  );
}

export function selectionManualBlockNote(
  listing: HostCalendarListing,
  selection: { start: string; end: string },
): string | null {
  const block = selectionExactManualBlock(listing, selection);
  const note = block?.reason?.trim();
  return note ? note : null;
}

/** How many of these dates a manual block already covers. */
export function countManualBlockedDates(
  index: ListingCalendarIndex,
  dates: string[],
): number {
  return dates.filter((date) => index.manualBlockDates.has(date)).length;
}

export interface SelectionPriceSummary {
  min: number | null;
  max: number | null;
  mixed: boolean;
  customCount: number;
}

export function summarizeSelectionPrices(
  listing: HostCalendarListing,
  index: ListingCalendarIndex,
  dates: string[],
): SelectionPriceSummary {
  if (!listing.pricing || dates.length === 0) {
    return { min: null, max: null, mixed: false, customCount: 0 };
  }
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  let customCount = 0;
  for (const date of dates) {
    const override = index.priceByDate.get(date);
    if (override !== undefined) customCount += 1;
    const rate = override ?? listing.pricing.baseNightlyRate;
    if (rate < min) min = rate;
    if (rate > max) max = rate;
  }
  return { min, max, mixed: min !== max, customCount };
}

/** The workspace's default listing: the first one the host can actually work on. */
export function defaultListingId(
  data: HostCalendarWorkspaceData,
): string | null {
  const sellable = data.listings.find((listing) => listingCanSell(listing));
  return sellable?.id ?? data.listings[0]?.id ?? null;
}
