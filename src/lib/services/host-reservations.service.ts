import "server-only";

import { ReviewDirection } from "@prisma/client";
import { db } from "@/lib/db";
import {
  completePastBookings,
  expirePendingBookings,
} from "@/lib/services/booking.service";
import { buildCalendarFormats } from "@/lib/host/v2/calendar-format";
import type {
  HostReservation,
  HostReservationProperty,
  HostReservationsData,
} from "@/lib/host/v2/reservation-types";
import { dbDateToYmd, todayYmd } from "@/lib/utils/date-only";

/**
 * Everything the v2 reservations panel shows, for every property the host owns.
 *
 * Authorization is the query: both reads are reached through `hostId`, so a booking on
 * somebody else's listing cannot enter the payload. The actions the panel can trigger —
 * confirm, reject, cancel — re-check ownership on the server themselves; this is a read
 * and grants nothing.
 *
 * The two sweeps run first for the same reason the v1 list runs them: a request whose
 * deadline passed an hour ago is `PENDING` in the table until something expires it, and
 * a screen whose whole job is ranking work by deadline must not lead with a countdown
 * that has already run out.
 *
 * Properties are loaded separately rather than derived from the bookings, so a property
 * with no reservations still appears in the rail — "nothing booked here yet" is a fact
 * the host came to find out, not a row to omit.
 */
export async function getHostReservations(
  hostId: string,
  /** The catalog locale the page is being rendered in. */
  locale: string,
): Promise<HostReservationsData> {
  await expirePendingBookings();
  await completePastBookings();

  const [listings, bookings] = await Promise.all([
    db.listing.findMany({
      where: { hostId, status: { not: "ARCHIVED" } },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        title: true,
        checkInTime: true,
        checkOutTime: true,
        property: { select: { city: true } },
        images: {
          where: { mediaType: "IMAGE" },
          orderBy: [{ isPrimary: "desc" }, { displayOrder: "asc" }],
          take: 1,
          select: { url: true, alt: true },
        },
      },
    }),
    db.booking.findMany({
      where: { listing: { hostId } },
      orderBy: { checkIn: "desc" },
      select: {
        id: true,
        reference: true,
        status: true,
        listingId: true,
        checkIn: true,
        checkOut: true,
        numberOfNights: true,
        guestCount: true,
        currency: true,
        nightlyRate: true,
        cleaningFee: true,
        serviceFee: true,
        discountAmount: true,
        totalPrice: true,
        guestNote: true,
        cancellationReason: true,
        createdAt: true,
        respondedAt: true,
        responseDueAt: true,
        guest: { select: { id: true, name: true, image: true } },
        // The three below feed the action queue: an unanswered guest message, and an
        // outstanding invitation to rate the guest. Scoped to this host, so the counts
        // are never another participant's.
        conversation: {
          select: {
            id: true,
            participants: {
              where: { userId: hostId },
              select: { unreadCount: true },
            },
          },
        },
        reviewInvitations: {
          where: { direction: ReviewDirection.HOST_TO_GUEST, recipientId: hostId },
          select: { deadline: true },
        },
        reviews: {
          where: { direction: ReviewDirection.HOST_TO_GUEST },
          select: { id: true },
        },
      },
    }),
  ]);

  const houseTimes = new Map(
    listings.map((listing) => [
      listing.id,
      { checkIn: listing.checkInTime, checkOut: listing.checkOutTime },
    ]),
  );

  const properties: HostReservationProperty[] = listings.map((listing) => ({
    id: listing.id,
    title: listing.title,
    photoUrl: listing.images[0]?.url ?? null,
    photoAlt: listing.images[0]?.alt ?? null,
    city: listing.property?.city ?? null,
  }));

  const reservations: HostReservation[] = bookings.map((booking) => {
    const times = houseTimes.get(booking.listingId);
    return {
      id: booking.id,
      reference: booking.reference,
      status: booking.status,
      listingId: booking.listingId,
      guest: booking.guest,
      checkIn: dbDateToYmd(booking.checkIn),
      checkOut: dbDateToYmd(booking.checkOut),
      nights: booking.numberOfNights,
      guestCount: booking.guestCount,
      currency: booking.currency,
      // Decimal crosses the server/client boundary as a plain number, the same way the
      // inbox service hands the reservation rail its total.
      nightlyRate: Number(booking.nightlyRate),
      cleaningFee: Number(booking.cleaningFee),
      serviceFee: Number(booking.serviceFee),
      discountAmount: Number(booking.discountAmount),
      total: Number(booking.totalPrice),
      guestNote: booking.guestNote,
      cancellationReason: booking.cancellationReason,
      createdAt: booking.createdAt.toISOString(),
      respondedAt: booking.respondedAt?.toISOString() ?? null,
      responseDueAt: booking.responseDueAt.toISOString(),
      // An invitation counts as outstanding only while no rating has been left yet.
      ratingDueAt:
        booking.reviews.length > 0
          ? null
          : (booking.reviewInvitations[0]?.deadline?.toISOString() ?? null),
      unreadCount: booking.conversation?.participants[0]?.unreadCount ?? 0,
      conversationId: booking.conversation?.id ?? null,
      checkInTime: times?.checkIn ?? null,
      checkOutTime: times?.checkOut ?? null,
    };
  });

  return {
    today: todayYmd(),
    now: new Date().toISOString(),
    formats: buildCalendarFormats(
      locale,
      // Only the currencies actually present, plus a fallback so an account with no
      // bookings still has a pattern to format a zero total with.
      reservations.map((reservation) => reservation.currency).concat("EUR"),
    ),
    properties,
    reservations,
  };
}
