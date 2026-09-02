import "server-only";
import { Prisma } from "@prisma/client";
import { platformFromFeedUrl } from "@/lib/host/v2/calendar-feed-platform";

import { db } from "@/lib/db";
import { PUBLIC_AVAILABILITY_HORIZON_MONTHS } from "@/lib/services/availability.service";
import {
  buildCalendarFormats,
  type DisplayMoneyContext,
} from "@/lib/host/v2/calendar-format";
import { getDisplayCurrency } from "@/lib/currency/server";
import { getExchangeRates } from "@/lib/currency/rates";
import { BASE_CURRENCY } from "@/lib/currency/currency-preference";
import type {
  HostCalendarBlockType,
  HostCalendarListing,
  HostCalendarListingContext,
  HostCalendarWorkspaceData,
} from "@/lib/host/v2/calendar-types";
import { dbDateToYmd, todayYmd, ymdToDbDate } from "@/lib/utils/date-only";
import {
  blockKindFromBlockType,
  projectHostFixedStayPeriods,
  ACTIVE_FIXED_STAY_BOOKING_STATUSES,
} from "@/lib/services/fixed-stay.service";

/**
 * Everything the v2 calendar workspace needs, for every listing the host owns.
 *
 * The window is the guest-facing availability horizon, not a shorter one of this
 * screen's own: a host reading "no open dates" while guests can still book month 14
 * would be a lie the panel told itself. It is loaded per host in one pass rather than
 * per listing on selection, because switching property has to feel instant and the
 * portfolio view needs all of them at once anyway.
 *
 * Authorization is the query: every row is reached through `hostId`, so a listing that
 * is not this host's cannot enter the payload. The mutations the client can trigger
 * re-check ownership server-side on their own — this is a read, and grants nothing.
 */
export const HOST_CALENDAR_HORIZON_MONTHS = PUBLIC_AVAILABILITY_HORIZON_MONTHS;

function horizonEndYmd(today: string): string {
  const end = ymdToDbDate(today);
  end.setUTCMonth(end.getUTCMonth() + HOST_CALENDAR_HORIZON_MONTHS);
  return dbDateToYmd(end);
}

export async function getHostCalendarWorkspace(
  hostId: string,
  /** The catalog locale the page is being rendered in. */
  locale: string,
): Promise<HostCalendarWorkspaceData> {
  const today = todayYmd();
  const horizonEnd = horizonEndYmd(today);
  const todayDate = ymdToDbDate(today);
  const horizonDate = ymdToDbDate(horizonEnd);

  const listings = await db.listing.findMany({
    where: { hostId, status: { not: "ARCHIVED" } },
    select: calendarListingSelect(todayDate, horizonDate),
    orderBy: { title: "asc" },
  });

  const mapped: HostCalendarListing[] = listings.map((listing) =>
    mapCalendarListing(listing, today),
  );

  return {
    today,
    horizonEnd,
    horizonMonths: HOST_CALENDAR_HORIZON_MONTHS,
    // Resolved here, with the server's full ICU data, and shipped as a pattern. The
    // browser this was verified in has no `mk` locale data and silently falls back to
    // its own default, so letting the client re-resolve the locale made every price
    // and date differ between the two renders.
    formats: buildCalendarFormats(
      locale,
      mapped.map((listing) => listing.pricing?.currency ?? BASE_CURRENCY),
      await displayMoneyContext(),
    ),
    listings: mapped,
  };
}

/**
 * The same payload, for exactly one listing.
 *
 * The listing editor's Availability and Pricing sections own the listing-wide defaults
 * now, and they reuse the calendar's review model to do it — which needs the listing's
 * blocks, windows, date prices and offers, not just its pricing rule. Loading eighteen
 * months of every other property the host owns to render one editor would be the wrong
 * trade, so this builds the identical shape from the identical select for one id.
 *
 * Authorization is the query, exactly as above: the row is reached through `hostId`, so
 * a listing that is not this host's comes back as `null` — "not found" — rather than
 * leaking that it exists. Every mutation these sections can trigger re-checks ownership
 * on the server on its own.
 */
export async function getHostCalendarListingContext(
  listingId: string,
  hostId: string,
  locale: string,
): Promise<HostCalendarListingContext | null> {
  const today = todayYmd();
  const horizonEnd = horizonEndYmd(today);
  const todayDate = ymdToDbDate(today);
  const horizonDate = ymdToDbDate(horizonEnd);

  const listing = await db.listing.findFirst({
    where: { id: listingId, hostId },
    select: calendarListingSelect(todayDate, horizonDate),
  });
  if (!listing) return null;

  const mapped = mapCalendarListing(listing, today);
  return {
    today,
    horizonEnd,
    horizonMonths: HOST_CALENDAR_HORIZON_MONTHS,
    formats: buildCalendarFormats(
      locale,
      [mapped.pricing?.currency ?? BASE_CURRENCY],
      await displayMoneyContext(),
    ),
    listing: mapped,
  };
}

/**
 * Everything both reads select, in one place.
 *
 * A second copy would be a second answer to "which blocks count", and the two screens
 * are meant to be looking at the same calendar.
 */
function calendarListingSelect(todayDate: Date, horizonDate: Date) {
  return {
    id: true,
    title: true,
    slug: true,
    status: true,
    availabilityMode: true,
    bookingMode: true,
    publishedAt: true,
    property: { select: { city: true } },
    images: {
      where: { mediaType: "IMAGE" },
      orderBy: [{ isPrimary: "desc" }, { displayOrder: "asc" }],
      take: 1,
      select: { url: true, alt: true },
    },
    // Publish readiness needs the real photo count, not just the cover image.
    _count: { select: { images: { where: { mediaType: "IMAGE" } } } },
    pricingRule: {
      select: {
        currency: true,
        baseNightlyRate: true,
        cleaningFee: true,
        minNights: true,
        maxNights: true,
      },
    },
    promotions: {
      where: { disabledAt: null },
      orderBy: [{ minimumNights: "asc" }, { createdAt: "asc" }],
    },
    // Anything still running today matters even if it started last week, so the
    // filter is on the exclusive end rather than the start.
    availabilityBlocks: {
      where: { endDate: { gt: todayDate }, startDate: { lt: horizonDate } },
      orderBy: { startDate: "asc" },
      select: {
        id: true,
        startDate: true,
        endDate: true,
        blockType: true,
        reason: true,
        booking: {
          // `fixedStayPeriodId` rides along on the hold the booking already owns, which
          // is why this needs no second query: a hold exists for exactly the PENDING and
          // CONFIRMED bookings, and it is deleted when one is cancelled, rejected or
          // expired. So the holds inside the horizon *are* the active bookings, and the
          // period each one was sold as is right here.
          select: {
            status: true,
            fixedStayPeriodId: true,
            guest: { select: { name: true } },
          },
        },
        // The URL is read here and resolved to a channel below; it is never put in
        // the payload, because it is the private token that reads the host's calendar.
        feed: { select: { name: true, url: true } },
      },
    },
    availabilityWindows: {
      where: { endDate: { gt: todayDate }, startDate: { lt: horizonDate } },
      orderBy: { startDate: "asc" },
      select: { id: true, startDate: true, endDate: true },
    },
    datePrices: {
      where: { date: { gte: todayDate, lt: horizonDate } },
      orderBy: { date: "asc" },
      select: { date: true, nightlyRate: true },
    },
    // Load the host's complete stay history. Past rows are deliberately visible and
    // locked in the editor, so filtering them out here would make the UI promise a
    // history it can never render. Loaded in both modes — a listing that switched back
    // to flexible still owns its stays, and switching forward again must restore them.
    fixedStayPeriods: {
      orderBy: [{ checkIn: "asc" }, { checkOut: "asc" }],
      select: { id: true, checkIn: true, checkOut: true, disabledAt: true },
    },
    bookings: {
      where: { status: "CONFIRMED", checkOut: { gt: todayDate } },
      orderBy: { checkIn: "asc" },
      take: 1,
      select: {
        id: true,
        checkIn: true,
        checkOut: true,
        status: true,
        guest: { select: { name: true } },
      },
    },
  } satisfies Prisma.ListingSelect;
}

type CalendarListingRow = Prisma.ListingGetPayload<{
  select: ReturnType<typeof calendarListingSelect>;
}>;

function mapCalendarListing(
  listing: CalendarListingRow,
  today: string,
): HostCalendarListing {
  const nextBooking = listing.bookings[0];
  const blocks = listing.availabilityBlocks.map((block) => ({
    id: block.id,
    startDate: dbDateToYmd(block.startDate),
    endDate: dbDateToYmd(block.endDate),
    blockType: block.blockType as HostCalendarBlockType,
    reason: block.reason,
    guestName: block.booking?.guest?.name ?? null,
    bookingStatus: block.booking?.status ?? null,
    feedName: block.feed?.name ?? null,
    feedPlatform: platformFromFeedUrl(block.feed?.url ?? null),
  }));

  /**
   * Which stays an active booking was sold as — read off the holds already loaded.
   *
   * A hold exists for exactly the PENDING and CONFIRMED bookings and is deleted the
   * moment one is cancelled, rejected or expired, so this is the same answer the host
   * projection's own query gives, at the cost of no extra round trip.
   */
  const activeStatuses = new Set<string>(ACTIVE_FIXED_STAY_BOOKING_STATUSES);
  const bookedPeriodIds = new Set<string>();
  for (const block of listing.availabilityBlocks) {
    const periodId = block.booking?.fixedStayPeriodId;
    if (periodId && activeStatuses.has(block.booking?.status ?? "")) {
      bookedPeriodIds.add(periodId);
    }
  }

  // The shared projection, so the panel's five states and its locked rows are the same
  // ones the host's own fixed-stay screen and every mutation's re-check already use.
  const fixedStayPeriods = projectHostFixedStayPeriods(
    listing.fixedStayPeriods.map((period) => ({
      id: period.id,
      checkIn: dbDateToYmd(period.checkIn),
      checkOut: dbDateToYmd(period.checkOut),
      disabledAt: period.disabledAt,
    })),
    {
      today,
      bookedPeriodIds,
      blocks: blocks.map((block) => ({
        start: block.startDate,
        end: block.endDate,
        kind: blockKindFromBlockType(block.blockType),
      })),
    },
  ).map((period) => ({
    id: period.id,
    checkIn: period.checkIn,
    checkOut: period.checkOut,
    nights: period.nights,
    state: period.state,
    manageable: period.manageable,
  }));

  return {
    id: listing.id,
    title: listing.title,
    slug: listing.slug,
    status: listing.status,
    availabilityMode: listing.availabilityMode,
    bookingMode: listing.bookingMode,
    photoUrl: listing.images[0]?.url ?? null,
    photoAlt: listing.images[0]?.alt ?? null,
    photoCount: listing._count.images,
    publishedAt: listing.publishedAt?.toISOString() ?? null,
    city: listing.property?.city ?? null,
    pricing: listing.pricingRule
      ? {
          currency: listing.pricingRule.currency,
          baseNightlyRate: Number(listing.pricingRule.baseNightlyRate),
          cleaningFee: Number(listing.pricingRule.cleaningFee),
          minNights: listing.pricingRule.minNights,
          maxNights: listing.pricingRule.maxNights,
        }
      : null,
    datePrices: listing.datePrices.map((row) => ({
      date: dbDateToYmd(row.date),
      nightlyRate: Number(row.nightlyRate),
    })),
    blocks,
    availabilityWindows: listing.availabilityWindows.map((window) => ({
      id: window.id,
      startDate: dbDateToYmd(window.startDate),
      endDate: dbDateToYmd(window.endDate),
    })),
    promotions: listing.promotions.map((promotion) => ({
      id: promotion.id,
      type: promotion.type,
      discountPercent: promotion.discountPercent,
      minimumNights: promotion.minimumNights,
      freeCleaning: promotion.freeCleaning,
      roundToWholeUnit: promotion.roundToWholeUnit,
      startDate: promotion.startDate
        ? dbDateToYmd(promotion.startDate)
        : null,
      endDate: promotion.endDate ? dbDateToYmd(promotion.endDate) : null,
      createdAt: promotion.createdAt.toISOString(),
    })),
    fixedStayPeriods,
    nextReservation: nextBooking
      ? {
          id: nextBooking.id,
          checkIn: dbDateToYmd(nextBooking.checkIn),
          checkOut: dbDateToYmd(nextBooking.checkOut),
          guestName: nextBooking.guest?.name ?? null,
          status: nextBooking.status,
        }
      : null,
  };
}

/**
 * The host's display currency plus the rates that reach it, or null when the provider
 * is unavailable. Display-only: it never touches what a listing is priced in, what a
 * guest is charged, or what a host is paid — see `formatDisplayMoney`.
 */
async function displayMoneyContext(): Promise<DisplayMoneyContext | null> {
  const [currency, table] = await Promise.all([getDisplayCurrency(), getExchangeRates()]);
  return table ? { currency, rates: table.rates } : null;
}
