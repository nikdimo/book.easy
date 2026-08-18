import "server-only";
import { db } from "@/lib/db";

/**
 * Everything the listings overview needs that a host cannot already know by heart.
 *
 * The old overview showed property type, city and base price — all of them set by the
 * host and unchanged since. What actually earns a row here is state that moves on its
 * own: a calendar feed that started failing, a listing that an admin suspended, a
 * CLOSED calendar that has run out of bookable windows. Those are the facts this query
 * exists to fetch; identity is already carried by the photo and the title.
 */

const PHOTO_TARGET = 5;
const UPCOMING_WINDOW_DAYS = 30;

export type HostListingOverviewItem = Awaited<
  ReturnType<typeof getHostListingsOverview>
>[number];

/** Midnight today in server time — bookings and windows are `@db.Date`, so comparing
 *  them against `new Date()` would drop anything checking out earlier the same day. */
function startOfToday() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

export async function getHostListingsOverview(hostId: string) {
  const today = startOfToday();
  const horizon = new Date(today);
  horizon.setDate(horizon.getDate() + UPCOMING_WINDOW_DAYS);

  const listings = await db.listing.findMany({
    where: { hostId },
    include: {
      property: { select: { city: true, country: true } },
      images: {
        where: { mediaType: "IMAGE" },
        orderBy: [{ isPrimary: "desc" }, { displayOrder: "asc" }],
        take: 1,
        select: { url: true },
      },
      pricingRule: { select: { baseNightlyRate: true, currency: true } },
      calendarFeeds: {
        select: { name: true, lastStatus: true, lastSyncedAt: true },
      },
      _count: {
        select: {
          bookings: true,
          images: { where: { mediaType: "IMAGE" } },
        },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  if (listings.length === 0) return [];

  const listingIds = listings.map((listing) => listing.id);
  // Only CLOSED listings can run out of bookable dates — an OPEN calendar is bookable
  // unless something blocks it, so asking the same question of it would be noise.
  const closedIds = listings
    .filter((listing) => listing.availabilityMode === "CLOSED")
    .map((listing) => listing.id);

  const [upcomingBookings, openWindows] = await Promise.all([
    db.booking.findMany({
      where: {
        listingId: { in: listingIds },
        status: "CONFIRMED",
        checkOut: { gte: today },
      },
      select: { listingId: true, checkIn: true, checkOut: true },
      orderBy: { checkIn: "asc" },
    }),
    closedIds.length
      ? db.listingAvailabilityWindow.findMany({
          where: { listingId: { in: closedIds }, endDate: { gte: today } },
          select: { listingId: true },
          distinct: ["listingId"],
        })
      : Promise.resolve([]),
  ]);

  const hasBookableWindow = new Set(openWindows.map((row) => row.listingId));
  const nextCheckIn = new Map<string, Date>();
  const upcomingNights = new Map<string, number>();

  for (const booking of upcomingBookings) {
    // Ordered by checkIn, so the first row per listing is the next arrival. A stay
    // already under way (checkIn in the past, checkOut ahead) is deliberately not one.
    if (booking.checkIn >= today && !nextCheckIn.has(booking.listingId)) {
      nextCheckIn.set(booking.listingId, booking.checkIn);
    }

    // Nights that fall inside the next 30 days, not the length of every stay that
    // touches it — a three-month booking contributes 30, not 90.
    const from = booking.checkIn > today ? booking.checkIn : today;
    const to = booking.checkOut < horizon ? booking.checkOut : horizon;
    const nights = Math.round((to.getTime() - from.getTime()) / 86_400_000);
    if (nights > 0) {
      upcomingNights.set(
        booking.listingId,
        (upcomingNights.get(booking.listingId) ?? 0) + nights
      );
    }
  }

  return listings.map((listing) => {
    const failingFeed = listing.calendarFeeds.find(
      (feed) => feed.lastStatus === "ERROR"
    );

    return {
      id: listing.id,
      slug: listing.slug,
      title: listing.title,
      status: listing.status,
      updatedAt: listing.updatedAt,
      createdAt: listing.createdAt,
      needsReview: listing.needsReview,
      moderationNote: listing.moderationNote,
      city: listing.property.city,
      // `.at(0)` rather than `[0]`: without `noUncheckedIndexedAccess` the index form is
      // typed as always present, so a listing with no photos would be typed `string`
      // while actually being null at runtime — and every consumer would trust the type.
      imageUrl: listing.images.at(0)?.url ?? null,
      photoCount: listing._count.images,
      photoTarget: PHOTO_TARGET,
      bookingCount: listing._count.bookings,
      baseNightlyRate: listing.pricingRule
        ? Number(listing.pricingRule.baseNightlyRate)
        : null,
      currency: listing.pricingRule?.currency ?? null,
      failingFeedName: failingFeed?.name ?? null,
      failingFeedSyncedAt: failingFeed?.lastSyncedAt ?? null,
      /** True only for a CLOSED calendar with nothing left to sell — an OPEN one is
       *  never "out of dates", so it reports false rather than a misleading warning. */
      outOfBookableDates:
        listing.availabilityMode === "CLOSED" &&
        !hasBookableWindow.has(listing.id),
      nextCheckIn: nextCheckIn.get(listing.id) ?? null,
      upcomingNights: upcomingNights.get(listing.id) ?? 0,
      upcomingWindowDays: UPCOMING_WINDOW_DAYS,
    };
  });
}
