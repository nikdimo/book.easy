import "server-only";
import { cache } from "react";
import { db } from "@/lib/db";
import { BookingStatus, ListingStatus } from "@prisma/client";
import { todayYmd, ymdToDbDate } from "@/lib/utils/date-only";

/**
 * Request-scoped memoization, not a cross-request cache: the listing detail route
 * calls this twice per request — once in `generateMetadata` and once in the page
 * itself — and this is the heaviest query on that page. `cache()` collapses those to
 * one fetch without any staleness risk, since the memo lives only for the request.
 */
export const getListingBySlug = cache(async (slug: string) => {
  return db.listing.findFirst({
    where: { slug, status: ListingStatus.APPROVED },
    include: {
      property: true,
      host: {
        include: { profile: true },
      },
      images: { orderBy: { displayOrder: "asc" } },
      pricingRule: true,
      promotions: {
        where: { disabledAt: null },
        orderBy: { createdAt: "desc" },
      },
      amenities: {
        include: { amenity: { include: { category: true } } },
        orderBy: [
          { amenity: { category: { sortOrder: "asc" } } },
          { amenity: { sortOrder: "asc" } },
        ],
      },
    },
  });
});

/**
 * The listing behind one booking, for the two people who are in that booking.
 *
 * Deliberately a second function rather than an option on `getListingBySlug`.
 *
 * `getListingBySlug` is the public, `cache()`-memoised read behind `/properties/[slug]`,
 * and it filters on `status: APPROVED`. Teaching it to relax that filter for a signed-in
 * participant would make a *public* render authentication-dependent — and a listing that
 * is not approved is very often one that was suspended precisely so the public cannot see
 * it. The safety case is the one where a leak matters most.
 *
 * So the public read stays public and unchanged, and access for participants is granted
 * here instead, on the only thing that actually justifies it: an accepted stay.
 * A host can already reach their own listing through the host panel; this covers the
 * guest, whose booking page links to the photo of the place they are staying in and, for
 * an unpublished or suspended listing, used to land them on a 404.
 *
 * **What this is not.** It reads the listing as it stands *today*, not as it was sold.
 * A guest therefore sees the host's current photos and description rather than the ones
 * they booked. Fixing that properly needs a booking-time listing snapshot — the booking
 * already freezes house rules, payment methods, deposit and cancellation policies, but
 * not the listing's own content — and that is a schema change with its own migration.
 * The page built on this says as much rather than implying otherwise.
 *
 * Not `cache()`-wrapped: the memo would be keyed on the arguments, which include the
 * viewer, so it would be safe — but there is one caller per request and a request-scoped
 * memo on an authorised read is a foot-gun the next caller does not need.
 */
export async function getBookingParticipantListing(
  bookingId: string,
  userId: string,
) {
  const booking = await db.booking.findFirst({
    // Either side of an accepted booking, and nobody else. Mere membership is not
    // enough: a rejected, expired or still-pending requester must not gain a durable
    // route around an admin safety suspension. CONFIRMED covers a stay that is still
    // going ahead; COMPLETED covers a stay that actually happened. A cancelled stay no
    // longer justifies exposing current property details or an address.
    where: {
      id: bookingId,
      AND: [
        { OR: [{ guestId: userId }, { listing: { hostId: userId } }] },
        {
          status: {
            in: [BookingStatus.CONFIRMED, BookingStatus.COMPLETED],
          },
        },
      ],
    },
    select: {
      id: true,
      status: true,
      houseRulesSnapshot: true,
      listing: {
        // `include` would return every scalar, and one of them is the host's private
        // reusable payment details. Same reason `getGuestBookingWithHost` omits it: a
        // participant is entitled to the listing, never to coordinates their host saved
        // for other bookings.
        omit: { paymentInstructionTemplates: true },
        include: {
          property: true,
          host: { include: { profile: true } },
          images: { orderBy: { displayOrder: "asc" } },
          amenities: {
            include: { amenity: { include: { category: true } } },
            orderBy: [
              { amenity: { category: { sortOrder: "asc" } } },
              { amenity: { sortOrder: "asc" } },
            ],
          },
        },
      },
    },
  });
  return booking;
}

/**
 * Every approved listing, with just enough to build the sitemap: the slug for the
 * two public URLs it owns, `updatedAt` for `lastmod`, and its photos so the tour
 * page can be submitted as an image sitemap rather than left for a crawler to
 * find on its own. Ordered oldest-first so entries keep a stable position between
 * regenerations instead of reshuffling whenever a host edits something.
 */
export async function getListingsForSitemap() {
  return db.listing.findMany({
    where: { status: ListingStatus.APPROVED },
    select: {
      slug: true,
      updatedAt: true,
      images: {
        where: { mediaType: "IMAGE" },
        select: { url: true },
        orderBy: { displayOrder: "asc" },
      },
    },
    orderBy: { createdAt: "asc" },
  });
}

export async function getListingAvailabilityBlocks(listingId: string) {
  return db.availabilityBlock.findMany({
    where: {
      listingId,
      // `endDate` is `@db.Date`, so this is a calendar comparison: against a raw
      // instant, a block ending today dropped out of the list part-way through it.
      endDate: { gte: ymdToDbDate(todayYmd()) },
    },
    select: {
      startDate: true,
      endDate: true,
      blockType: true,
    },
  });
}
