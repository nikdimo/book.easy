import type { CalendarPlatform } from "./calendar-feed-platform";

/**
 * The serialized shape the v2 host calendar workspace runs on.
 *
 * Every date here is a civil `YYYY-MM-DD` string rather than a `Date`: the payload
 * crosses the server/client boundary, and a `Date` would be re-read against the
 * browser's own midnight instead of the marketplace's — the same reason the rest of
 * the calendar code normalizes through `date-only`.
 *
 * Ranges keep the storage convention used everywhere else in this codebase:
 * `startDate` is the first covered day, `endDate` is the exclusive checkout boundary.
 */

import type { CalendarFormats } from "@/lib/host/v2/calendar-format";

export type HostCalendarBlockType =
  | "MANUAL_BLOCK"
  | "BOOKING_HOLD"
  | "EXTERNAL_SYNC";

export interface HostCalendarBlock {
  id: string;
  /** Inclusive first blocked day. */
  startDate: string;
  /** Exclusive checkout boundary. */
  endDate: string;
  blockType: HostCalendarBlockType;
  reason: string | null;
  guestName: string | null;
  bookingStatus: string | null;
  /**
   * The connected calendar that put this block here, on `EXTERNAL_SYNC` rows only.
   *
   * `feedName` is what the host called it and is shown verbatim. `feedPlatform` is
   * resolved on the server from the feed's URL, which never crosses to the browser —
   * it carries the private token that reads the host's real calendar.
   */
  feedName: string | null;
  feedPlatform: CalendarPlatform | null;
}

export interface HostCalendarDatePrice {
  date: string;
  nightlyRate: number;
}

export interface HostCalendarWindow {
  id: string;
  startDate: string;
  /** Exclusive. */
  endDate: string;
}

export interface HostCalendarPromotion {
  id: string;
  type: "PERCENT_DISCOUNT" | "FREE_CLEANING";
  discountPercent: number;
  minimumNights: number | null;
  freeCleaning: boolean;
  roundToWholeUnit: boolean;
  startDate: string | null;
  /** Exclusive, matching how promotions are stored and priced. */
  endDate: string | null;
  createdAt: string;
}

export interface HostCalendarReservation {
  id: string;
  checkIn: string;
  /** Exclusive checkout day. */
  checkOut: string;
  guestName: string | null;
  status: string;
}

export interface HostCalendarPricing {
  currency: string;
  baseNightlyRate: number;
  cleaningFee: number;
  minNights: number;
  maxNights: number;
}

/**
 * One stay the host offers, as the calendar needs it.
 *
 * The state and the manageability are derived on the server by the same projection the
 * rest of the product reads (`projectHostFixedStayPeriods`), so the panel cannot invent a
 * fifth state or disagree about which rows a host may still touch. Deliberately narrower
 * than the host projection: no `blockedBy`, because the editor never says *why* a stay's
 * nights are taken — that is the calendar grid's job, and a guest's name has no business
 * in a settings panel.
 */
export interface HostCalendarFixedStay {
  id: string;
  /** `YYYY-MM-DD`. */
  checkIn: string;
  /** `YYYY-MM-DD`, exclusive. */
  checkOut: string;
  /** Derived from the dates; 7 or 14 for every stay this product can create. */
  nights: number;
  state: "PAST" | "DISABLED" | "BOOKED" | "DATES_TAKEN" | "AVAILABLE";
  /** False for booked and past stays, which no host action may change. */
  manageable: boolean;
}

export interface HostCalendarListing {
  id: string;
  title: string;
  slug: string | null;
  status: string;
  availabilityMode: "OPEN" | "CLOSED";
  /**
   * How the listing sells its dates.
   *
   * FIXED_STAYS makes `fixedStayPeriods` the only thing that opens a night, and makes
   * `availabilityMode`, the windows and the stay-length rule stored-but-unread — the
   * same split every other surface applies.
   */
  bookingMode: "FLEXIBLE" | "FIXED_STAYS";
  photoUrl: string | null;
  photoAlt: string | null;
  city: string | null;
  /** Photos of type IMAGE. `submitForReview` refuses to publish below three. */
  photoCount: number;
  /** Null until the listing has been live once — the availability check reads it. */
  publishedAt: string | null;
  /** Null when the host has not configured pricing yet — nothing can be quoted. */
  pricing: HostCalendarPricing | null;
  datePrices: HostCalendarDatePrice[];
  blocks: HostCalendarBlock[];
  availabilityWindows: HostCalendarWindow[];
  promotions: HostCalendarPromotion[];
  /**
   * Every whole stay this listing owns, including locked past rows kept for history.
   *
   * Loaded in both modes, because a listing that switched back to flexible still owns
   * them and switching forward again must restore exactly what the host built. Empty for
   * a listing that has never sold this way.
   */
  fixedStayPeriods: HostCalendarFixedStay[];
  nextReservation: HostCalendarReservation | null;
}

export interface HostCalendarDateCounts {
  /** Days inside the analysed window, from today to the horizon. */
  total: number;
  /** Open on the calendar *and* sellable — what a guest could actually book. */
  bookable: number;
  /**
   * Open on the calendar but not sellable, because the listing itself is off the site
   * or has no price. Counted apart from `bookable` so no screen can present an open
   * date as a date a guest could book.
   */
  openNotBookable: number;
  blocked: number;
  booked: number;
}

/**
 * One listing's calendar facts, for a screen that only ever shows one.
 *
 * The listing editor's Availability and Pricing sections reuse the calendar's review
 * model, which reasons over blocks, windows, date prices and offers rather than over a
 * pricing rule alone. This is the same payload the workspace carries, minus the other
 * properties the host owns and the rail that would let them switch.
 */
export interface HostCalendarListingContext {
  today: string;
  horizonEnd: string;
  horizonMonths: number;
  formats: CalendarFormats;
  listing: HostCalendarListing;
}

export interface HostCalendarWorkspaceData {
  /** Today as a civil date in the marketplace time zone. */
  today: string;
  /** Exclusive end of the analysed window — `today` plus `horizonMonths`. */
  horizonEnd: string;
  /** Stated in every count so a number is never presented without its window. */
  horizonMonths: number;
  /** Resolved on the server so the client never asks `Intl` for locale data. */
  formats: CalendarFormats;
  listings: HostCalendarListing[];
}
