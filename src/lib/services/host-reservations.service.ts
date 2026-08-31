import "server-only";

import { ReviewDirection } from "@prisma/client";
import { db } from "@/lib/db";
import {
  completePastBookings,
  expirePendingBookings,
} from "@/lib/services/booking.service";
import {
  buildCalendarFormats,
  type DisplayMoneyContext,
} from "@/lib/host/v2/calendar-format";
import { getDisplayCurrency } from "@/lib/currency/server";
import { getExchangeRates } from "@/lib/currency/rates";
import { BASE_CURRENCY } from "@/lib/currency/currency-preference";
import { parseDepositPoliciesSnapshot } from "@/lib/payments/deposit-policies";
import {
  parseCancellationPolicySnapshot,
  parseCancellationSettlementSnapshot,
} from "@/lib/payments/cancellation-policy";
import {
  parsePaymentInstructionStore,
  parsePaymentInstructionTemplates,
  resolvePaymentInstructionsForMethod,
  savedPaymentInstructionTemplateEntries,
} from "@/lib/payments/payment-instruction-templates";
import {
  isNoInstructionsPaymentRequestSnapshot,
  parseBookingPaymentDetailsSnapshot,
  type BookingPaymentRequestPrefill,
} from "@/lib/payments/booking-payment-request";
import type {
  HostReservation,
  HostReservationProperty,
  HostReservationsData,
} from "@/lib/host/v2/reservation-types";
import { resolveBookingPricing } from "@/lib/booking-pricing";
import { dbDateToYmd, todayYmd } from "@/lib/utils/date-only";
import {
  bookingPartyPayload,
  resolveBookingParty,
} from "@/lib/booking-party";
import {
  isPaymentMethodCode,
  parsePaymentMethodsSnapshot,
  type PaymentMethodCode,
} from "@/lib/payments/payment-methods";

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
        acceptedPaymentMethods: true,
        paymentInstructionTemplates: true,
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
        adults: true,
        children: true,
        infants: true,
        pets: true,
        currency: true,
        nightlyRate: true,
        cleaningFee: true,
        serviceFee: true,
        discountAmount: true,
        totalPrice: true,
        // The frozen quote. Read for one reason: `nightlyRate` is a rounded average and
        // multiplying it by the nights does not reconstruct the accommodation subtotal
        // (audit L2), so the panel's first price row comes from here instead.
        priceBreakdown: true,
        paymentStatus: true,
        paymentInstructionsStatus: true,
        paymentInstructionsSnapshot: true,
        selectedPaymentMethod: true,
        paymentMethodsSnapshot: true,
        advancePaymentStatus: true,
        damageDepositStatus: true,
        accommodationRefundStatus: true,
        accommodationRefundAmount: true,
        advancePaymentAmount: true,
        damageDepositAmount: true,
        depositPolicySnapshot: true,
        cancellationPolicySnapshot: true,
        cancellationSettlementSnapshot: true,
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
        paymentStatusEvents: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            actorId: true,
            eventType: true,
            createdAt: true,
          },
        },
        paymentRequests: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            type: true,
            amount: true,
            currency: true,
            dueAt: true,
            status: true,
            instructionsSnapshot: true,
            reminders: {
              orderBy: { sentAt: "desc" },
              select: { kind: true, sentAt: true },
            },
          },
        },
        paymentPrivateRecords: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            track: true,
            reporterId: true,
            amount: true,
            currency: true,
            transactionDate: true,
            reference: true,
            note: true,
            retainedReason: true,
          },
        },
      },
    }),
  ]);

  const listingDetails = new Map(
    listings.map((listing) => [
      listing.id,
      {
        checkIn: listing.checkInTime,
        checkOut: listing.checkOutTime,
        savedPaymentInstructionTemplates: savedPaymentInstructionTemplateEntries(
          parsePaymentInstructionTemplates(listing.paymentInstructionTemplates),
        ),
        acceptedPaymentMethods:
          listing.acceptedPaymentMethods.filter(isPaymentMethodCode),
        instructionStore: parsePaymentInstructionStore(
          listing.paymentInstructionTemplates,
        ),
      },
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
    const details = listingDetails.get(booking.listingId);
    const pricing = resolveBookingPricing(booking);
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
      // The party alongside the count rather than folded into it. `null` for a booking
      // taken before the columns existed, which is the difference between "no infants"
      // and "never recorded" — the panel prints the plain count for those.
      party: bookingPartyPayload(resolveBookingParty(booking)),
      currency: pricing.currency,
      // Decimal crosses the server/client boundary as a plain number, the same way the
      // inbox service hands the reservation rail its total.
      nightlyRate: Number(booking.nightlyRate),
      cleaningFee: pricing.cleaningFee,
      serviceFee: pricing.serviceFee,
      discountAmount: pricing.discountAmount,
      total: pricing.totalPrice,
      // Resolved on the server, once, so the panel prints price rows rather than
      // computing them. `originalAccommodationSubtotal` and `originalCleaningFee` are
      // the gross pair the panel needs, because it itemises the promotion on its own
      // line — the net figures beside a discount row would subtract it twice.
      accommodationSubtotal: pricing.accommodationSubtotal,
      originalAccommodationSubtotal: pricing.originalAccommodationSubtotal,
      originalCleaningFee: pricing.originalCleaningFee,
      averageNightlyRate: pricing.averageNightlyRate,
      paymentStatus: booking.paymentStatus,
      paymentInstructionsStatus: booking.paymentInstructionsStatus,
      selectedPaymentMethod: isPaymentMethodCode(booking.selectedPaymentMethod)
        ? booking.selectedPaymentMethod
        : null,
      paymentMethodOtherLabel:
        parsePaymentMethodsSnapshot(booking.paymentMethodsSnapshot)?.otherLabel ??
        null,
      advancePaymentStatus: booking.advancePaymentStatus,
      damageDepositStatus: booking.damageDepositStatus,
      accommodationRefundStatus: booking.accommodationRefundStatus,
      accommodationRefundAmount:
        booking.accommodationRefundAmount === null
          ? null
          : Number(booking.accommodationRefundAmount),
      advancePaymentAmount:
        booking.advancePaymentAmount === null
          ? null
          : Number(booking.advancePaymentAmount),
      damageDepositAmount:
        booking.damageDepositAmount === null
          ? null
          : Number(booking.damageDepositAmount),
      depositPolicies: parseDepositPoliciesSnapshot(booking.depositPolicySnapshot),
      cancellationPolicy: parseCancellationPolicySnapshot(
        booking.cancellationPolicySnapshot,
      ),
      cancellationSettlement: parseCancellationSettlementSnapshot(
        booking.cancellationSettlementSnapshot,
      ),
      paymentStatusEvents: booking.paymentStatusEvents.map((event) => ({
        id: event.id,
        actor:
          event.actorId === booking.guest.id
            ? "GUEST"
            : event.actorId === hostId
              ? "HOST"
              : event.actorId
                ? "ADMIN"
                : event.eventType.startsWith("GUEST_")
                  ? "GUEST"
                  : event.eventType.startsWith("HOST_")
                    ? "HOST"
                    : "SYSTEM",
        eventType: event.eventType,
        createdAt: event.createdAt.toISOString(),
      })),
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
      checkInTime: details?.checkIn ?? null,
      checkOutTime: details?.checkOut ?? null,
      savedPaymentInstructionTemplates:
        booking.status === "CONFIRMED"
          ? (details?.savedPaymentInstructionTemplates ?? []).filter(
              (template) =>
                template.methodCode === booking.selectedPaymentMethod,
            )
          : [],
      // Prefill is built only for a booking the host can actually send against, and
      // only for that booking's own method.
      paymentRequestPrefill:
        booking.status === "CONFIRMED" && details
          ? buildPrefill(booking, details)
          : undefined,
      sentPaymentDetails: parseBookingPaymentDetailsSnapshot(
        booking.paymentInstructionsSnapshot,
      ),
      paymentRequests: (booking.paymentRequests ?? []).map((request) => ({
        id: request.id,
        type: request.type,
        amount: Number(request.amount),
        currency: request.currency,
        dueAt: request.dueAt.toISOString(),
        status: request.status,
        sentPaymentDetails: parseBookingPaymentDetailsSnapshot(
          request.instructionsSnapshot,
        ),
        instructionsNotRequired: isNoInstructionsPaymentRequestSnapshot(
          request.instructionsSnapshot,
        ),
        reminders: request.reminders.map((reminder) => ({
          kind: reminder.kind,
          sentAt: reminder.sentAt.toISOString(),
        })),
      })),
      transactionReports: (booking.paymentPrivateRecords ?? []).map((report) => ({
        id: report.id,
        track: report.track,
        reporter:
          report.reporterId === null
            ? "REDACTED"
            : report.reporterId === booking.guest.id
              ? "GUEST"
              : "HOST",
        amount: Number(report.amount),
        currency: report.currency,
        transactionDate: report.transactionDate.toISOString(),
        reference: report.reference,
        note: report.note,
        retainedReason: report.retainedReason,
      })),
    };
  });

  return {
    today: todayYmd(),
    now: new Date().toISOString(),
    formats: buildCalendarFormats(
      locale,
      // Only the currencies actually present, plus a fallback so an account with no
      // bookings still has a pattern to format a zero total with.
      reservations.map((reservation) => reservation.currency).concat(BASE_CURRENCY),
      await displayMoneyContext(),
    ),
    properties,
    reservations,
  };
}

/**
 * The saved details for one booking's method, ready to open a prefilled send form.
 *
 * The guest's recorded choice decides the method. When a booking has none — it predates
 * the choice — the host is offered the listing's own accepted methods and picks one
 * explicitly; nothing is guessed on their behalf.
 */
function buildPrefill(
  booking: {
    selectedPaymentMethod: string | null;
    paymentMethodsSnapshot: unknown;
  },
  details: {
    acceptedPaymentMethods: PaymentMethodCode[];
    instructionStore: ReturnType<typeof parsePaymentInstructionStore>;
  },
): BookingPaymentRequestPrefill {
  const snapshot = parsePaymentMethodsSnapshot(booking.paymentMethodsSnapshot);
  const method = isPaymentMethodCode(booking.selectedPaymentMethod)
    ? booking.selectedPaymentMethod
    : null;
  const availableMethods =
    snapshot?.status === "REVIEWED" && snapshot.methods.length > 0
      ? snapshot.methods
      : details.acceptedPaymentMethods;
  const resolved = method
    ? resolvePaymentInstructionsForMethod(details.instructionStore, method)
    : ({ kind: "NONE" } as const);

  return {
    method,
    methodSource: method ? "GUEST" : "HOST_FALLBACK",
    availableMethods,
    otherLabel: snapshot?.otherLabel ?? null,
    savedDetailsKind: resolved.kind,
    savedDetailFields: resolved.kind === "STRUCTURED" ? resolved.details.fields : {},
    savedInstructions: resolved.kind === "LEGACY_TEXT" ? resolved.text : "",
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
