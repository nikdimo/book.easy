import "server-only";
import { platformFromFeedUrl } from "@/lib/host/v2/calendar-feed-platform";

import { db } from "@/lib/db";
import { PUBLIC_AVAILABILITY_HORIZON_MONTHS } from "@/lib/services/availability.service";
import { buildCalendarFormats } from "@/lib/host/v2/calendar-format";
import type {
  HostCalendarBlockType,
  HostCalendarListing,
  HostCalendarWorkspaceData,
} from "@/lib/host/v2/calendar-types";
import { dbDateToYmd, todayYmd, ymdToDbDate } from "@/lib/utils/date-only";

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
    select: {
      id: true,
      title: true,
      slug: true,
      status: true,
      availabilityMode: true,
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
            select: { status: true, guest: { select: { name: true } } },
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
    },
    orderBy: { title: "asc" },
  });

  const mapped: HostCalendarListing[] = listings.map((listing) => {
    const nextBooking = listing.bookings[0];
    return {
      id: listing.id,
      title: listing.title,
      slug: listing.slug,
      status: listing.status,
      availabilityMode: listing.availabilityMode,
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
      blocks: listing.availabilityBlocks.map((block) => ({
        id: block.id,
        startDate: dbDateToYmd(block.startDate),
        endDate: dbDateToYmd(block.endDate),
        blockType: block.blockType as HostCalendarBlockType,
        reason: block.reason,
        guestName: block.booking?.guest?.name ?? null,
        bookingStatus: block.booking?.status ?? null,
        feedName: block.feed?.name ?? null,
        feedPlatform: platformFromFeedUrl(block.feed?.url ?? null),
      })),
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
  });

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
      mapped.map((listing) => listing.pricing?.currency ?? "EUR"),
    ),
    listings: mapped,
  };
}
