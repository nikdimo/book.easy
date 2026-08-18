import type { CalendarFormats } from "@/lib/host/v2/calendar-format";

/**
 * The reservations panel's payload, as plain JSON.
 *
 * Every date that names a *day* is a `YYYY-MM-DD` civil date, and every field that
 * names an *instant* is an ISO string — the same split the calendar makes, and for the
 * same reason: a check-in is a day in the marketplace's time zone, while a response
 * deadline is a moment on a clock. Decimals arrive as numbers; the server is the only
 * side that ever touches Prisma's `Decimal`.
 */

export interface HostReservationProperty {
  id: string;
  title: string;
  photoUrl: string | null;
  photoAlt: string | null;
  city: string | null;
}

export interface HostReservationGuest {
  id: string;
  name: string | null;
  image: string | null;
}

export interface HostReservation {
  id: string;
  reference: string;
  /** `BookingStatus`, carried as a string so the client bundle needs no Prisma enum. */
  status: string;
  listingId: string;
  guest: HostReservationGuest;
  checkIn: string;
  checkOut: string;
  nights: number;
  guestCount: number;
  currency: string;
  nightlyRate: number;
  cleaningFee: number;
  serviceFee: number;
  discountAmount: number;
  total: number;
  guestNote: string | null;
  cancellationReason: string | null;
  createdAt: string;
  respondedAt: string | null;
  /** When an unanswered request expires on its own and releases the dates. */
  responseDueAt: string;
  /** Deadline of an open invitation to rate the guest; null once rated or never sent. */
  ratingDueAt: string | null;
  unreadCount: number;
  conversationId: string | null;
  /** The listing's house times, shown beside the dates. */
  checkInTime: string | null;
  checkOutTime: string | null;
}

export interface HostReservationsData {
  /** Today in the marketplace time zone, which is what "upcoming" is measured from. */
  today: string;
  /**
   * The server's clock at render. Countdowns start from this so the first client paint
   * matches the server's markup instead of flashing a different number.
   */
  now: string;
  formats: CalendarFormats;
  properties: HostReservationProperty[];
  reservations: HostReservation[];
}
