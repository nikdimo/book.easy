import { db } from "@/lib/db";
import { createAuditLog } from "@/lib/services/audit.service";
import {
  cancelBooking,
  confirmBooking,
  rejectBooking,
} from "@/lib/services/booking.service";
import { mobileJson, mobileOptions, requireMobileHost } from "@/lib/mobile-api";

type BookingAction = "confirm" | "reject" | "cancel";

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

  const isAdmin =
    access.user.role === "ADMIN" || access.user.role === "SUPERADMIN";

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

  return mobileJson(request, {
    booking: {
      id: booking.id,
      reference: booking.reference,
      status: booking.status,
      checkIn: booking.checkIn.toISOString(),
      checkOut: booking.checkOut.toISOString(),
      guestCount: booking.guestCount,
      guestNote: booking.guestNote,
      totalPrice: Number(booking.totalPrice),
      nightlyRate: Number(booking.nightlyRate),
      cleaningFee: Number(booking.cleaningFee),
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
  let input: { action?: BookingAction; reason?: string };
  try {
    input = await request.json();
  } catch {
    return mobileJson(request, { error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    if (input.action === "confirm") {
      await confirmBooking(id, access.user.id);
    } else if (input.action === "reject") {
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
