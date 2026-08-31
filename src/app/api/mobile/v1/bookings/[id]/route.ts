import { db } from "@/lib/db";
import { createAuditLog } from "@/lib/services/audit.service";
import {
  cancelBooking,
  getBookingAcceptancePaymentData,
  rejectBooking,
} from "@/lib/services/booking.service";
import {
  acceptBookingAsHost,
  savedInstructionsPreview,
} from "@/lib/services/booking-acceptance.service";
import { acceptBookingWithPaymentSchema } from "@/lib/validations/booking.schema";
import { firstZodMessage } from "@/lib/utils/zod-error";
import { resolveRequestMethod } from "@/lib/payments/booking-acceptance";
import { paymentMethodSourceLabel } from "@/lib/payments/payment-methods";
import { mobileJson, mobileOptions, requireMobileHost } from "@/lib/mobile-api";
import {
  bookingPartyPayload,
  resolveBookingParty,
} from "@/lib/booking-party";
import { resolveBookingPricing } from "@/lib/booking-pricing";

type BookingAction = "confirm" | "reject" | "cancel";

/**
 * What the phone needs to ask the host the payment question the web dialog asks.
 *
 * Host-only, and only for a request still awaiting an answer. Accepting used to mean
 * something different here than on the web — the app sent no decision at all and the
 * service guessed one from the payment method, leaving a `PENDING` instructions task
 * the host had never agreed to (M1). The app now renders these options and posts one
 * back, and the service refuses an acceptance that carries none.
 */
async function acceptanceBlock(bookingId: string, hostId: string) {
  const payment = await getBookingAcceptancePaymentData(bookingId, hostId).catch(
    () => null,
  );
  if (!payment || payment.status !== "PENDING") return null;

  const method = resolveRequestMethod(payment, null);
  const draft = payment.requests.find((request) => request.status === "DRAFT");
  // Only what this host already reviewed and saved can be sent from the phone: the
  // app has no composer, so an unsaved method is a send-later, not a blank send.
  const preview = savedInstructionsPreview(payment, method);

  return {
    allowedDecisions: payment.decisionRule.allowed,
    instructionsRequired: payment.decisionRule.instructionsRequired,
    nothingToCollect: payment.decisionRule.nothingToCollect,
    paymentMethod: method,
    paymentMethodLabel: method
      ? paymentMethodSourceLabel(method, payment.otherLabel)
      : null,
    currency: payment.currency,
    amountDue: draft?.amount ?? null,
    /** The deadline a SEND_NOW from the phone posts back. */
    dueDate: payment.checkIn,
    canSendNow: Boolean(
      payment.decisionRule.allowed.includes("SEND_NOW") && draft && preview,
    ),
    savedInstructionsPreview: preview,
  };
}

export async function OPTIONS(request: Request) {
  return mobileOptions(request);
}

/** One booking, scoped to a listing this host owns. The `listing: { hostId }` filter
 *  is the authorisation — a host must not be able to read someone else's booking by
 *  guessing an id, and requireMobileHost alone would not stop that. */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const access = await requireMobileHost(request);
  if ("response" in access) return access.response;
  const { id } = await context.params;

  const isAdmin = access.user.role === "ADMIN";

  const booking = await db.booking.findFirst({
    where: { id, ...(isAdmin ? {} : { listing: { hostId: access.user.id } }) },
    include: {
      listing: {
        select: {
          id: true,
          title: true,
          property: { select: { city: true, country: true } },
          images: {
            where: { isPrimary: true },
            orderBy: { displayOrder: "asc" },
            take: 1,
            select: { url: true },
          },
        },
      },
      guest: { select: { id: true, name: true, email: true } },
      conversation: { select: { id: true } },
    },
  });
  if (!booking) {
    return mobileJson(request, { error: "Booking not found" }, { status: 404 });
  }

  // Only the listing's own host is ever offered the acceptance question — an admin can
  // read this booking but cannot accept it, and `confirmBooking` would refuse them.
  const acceptance =
    booking.status === "PENDING"
      ? await acceptanceBlock(booking.id, access.user.id)
      : null;

  // One resolver for every price surface: the frozen `priceBreakdown` when it is there
  // and reconciles against `totalPrice`, the stored totals when it is not.
  const pricing = resolveBookingPricing(booking);

  return mobileJson(request, {
    booking: {
      id: booking.id,
      reference: booking.reference,
      status: booking.status,
      checkIn: booking.checkIn.toISOString(),
      checkOut: booking.checkOut.toISOString(),
      guestCount: booking.guestCount,
      // The party the guest actually chose, so a host on the phone sees the cot and
      // the dog too. `null` for a booking taken before it was recorded.
      party: bookingPartyPayload(resolveBookingParty(booking)),
      guestNote: booking.guestNote,
      // The price, named so the phone cannot guess wrong. `accommodationSubtotal +
      // cleaningFee + serviceFee === totalPrice` exactly, so no client ever has to
      // multiply or subtract anything to fill a receipt (audit L2).
      currency: pricing.currency,
      totalPrice: pricing.totalPrice,
      accommodationSubtotal: pricing.accommodationSubtotal,
      averageNightlyRate: pricing.averageNightlyRate,
      cleaningFee: pricing.cleaningFee,
      serviceFee: pricing.serviceFee,
      /**
       * @deprecated Compatibility only, for app builds shipped before the fields above
       * existed. A rounded effective average — `nightlyRate * nights` does not
       * reconstruct the accommodation subtotal. Read `averageNightlyRate` instead.
       */
      nightlyRate: Number(booking.nightlyRate),
      createdAt: booking.createdAt.toISOString(),
      responseDueAt: booking.responseDueAt?.toISOString() ?? null,
      cancellationReason: booking.cancellationReason,
      guest: booking.guest,
      listing: {
        id: booking.listing.id,
        title: booking.listing.title,
        city: booking.listing.property.city,
        country: booking.listing.property.country,
        imageUrl: booking.listing.images[0]?.url ?? null,
      },
      conversationId: booking.conversation?.id ?? null,
      acceptance,
    },
  });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const access = await requireMobileHost(request);
  if ("response" in access) return access.response;

  const { id } = await context.params;
  let input: Record<string, unknown> & { action?: BookingAction; reason?: string };
  try {
    input = await request.json();
  } catch {
    return mobileJson(request, { error: "Invalid JSON body" }, { status: 400 });
  }

  // Acceptance runs through the same workflow and the same payload schema as the web
  // dialog, so the phone cannot produce a payment state the web cannot, or skip the
  // decision the web forces. It also writes its own audit entry, which is why this
  // returns early rather than falling through to the generic one below.
  if (input.action === "confirm") {
    const parsed = acceptBookingWithPaymentSchema.safeParse({
      ...input,
      bookingId: id,
    });
    if (!parsed.success) {
      return mobileJson(
        request,
        { error: firstZodMessage(parsed.error) },
        { status: 400 },
      );
    }
    const result = await acceptBookingAsHost({
      ...parsed.data,
      hostId: access.user.id,
      source: "MOBILE",
    });
    if (!result.success) {
      return mobileJson(request, { error: result.error }, { status: 400 });
    }
    return mobileJson(request, {
      success: true,
      decision: result.decision,
      instructionsSent: result.instructionsSent,
      warning: result.warning ?? null,
    });
  }

  try {
    if (input.action === "reject") {
      if (!input.reason?.trim()) {
        return mobileJson(
          request,
          { error: "Decline reason is required" },
          { status: 400 }
        );
      }
      await rejectBooking(id, access.user.id, input.reason);
    } else if (input.action === "cancel") {
      if (!input.reason?.trim()) {
        return mobileJson(
          request,
          { error: "Cancellation reason is required" },
          { status: 400 }
        );
      }
      await cancelBooking(id, access.user.id, "host", input.reason);
    } else {
      return mobileJson(request, { error: "Unsupported booking action" }, { status: 400 });
    }

    await createAuditLog({
      userId: access.user.id,
      action: `booking.${input.action}_mobile`,
      entityType: "Booking",
      entityId: id,
      metadata: input.reason ? { reason: input.reason } : undefined,
    });

    return mobileJson(request, { success: true });
  } catch (error) {
    return mobileJson(
      request,
      { error: error instanceof Error ? error.message : "Booking update failed" },
      { status: 400 }
    );
  }
}
