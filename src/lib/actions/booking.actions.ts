"use server";

import { auth } from "@/lib/auth";
import { createBookingSchema } from "@/lib/validations/booking.schema";
import { firstZodMessage } from "@/lib/utils/zod-error";
import {
  createBooking,
  cancelBooking,
  confirmBooking,
  rejectBooking,
} from "@/lib/services/booking.service";
import { createAuditLog } from "@/lib/services/audit.service";
import { getPriceFormatter } from "@/lib/currency/price";
import { getLocale } from "@/lib/i18n/t";
import { rateLimit } from "@/lib/rate-limit";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

export async function createBookingAction(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: "You must be logged in to book" };
  }

  const limit = rateLimit(`create-booking:${session.user.id}`, 20, 60 * 60 * 1000);
  if (!limit.success) {
    return { error: "Too many booking requests. Please wait a while and try again." };
  }

  const raw = {
    listingId: formData.get("listingId") as string,
    checkIn: formData.get("checkIn") as string,
    checkOut: formData.get("checkOut") as string,
    guestCount: formData.get("guestCount") as string,
    guestNote: (formData.get("guestNote") as string) || undefined,
    houseRulesAccepted: formData.get("houseRulesAccepted") as string,
    houseRulesVersion: formData.get("houseRulesVersion") as string,
  };

  const parsed = createBookingSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: firstZodMessage(parsed.error) };
  }

  let bookingId: string;
  try {
    const [formatter, guestLocale] = await Promise.all([
      getPriceFormatter(),
      getLocale(),
    ]);
    const booking = await createBooking({
      listingId: parsed.data.listingId,
      guestId: session.user.id,
      checkIn: new Date(parsed.data.checkIn),
      checkOut: new Date(parsed.data.checkOut),
      guestCount: parsed.data.guestCount,
      guestNote: parsed.data.guestNote,
      guestLocale,
      // The schema has already refused anything but an explicit "true", so reaching
      // this line *is* the acceptance. `createBooking` records the moment and takes the
      // rules snapshot itself, from the listing row it loads inside its transaction.
      houseRulesAcceptedAt: new Date(),
      expectedHouseRulesVersion: parsed.data.houseRulesVersion,
      // Recorded against the booking so the confirmation keeps showing the figure
      // this guest was actually looking at, whatever rates do afterwards.
      display: formatter.context,
    });
    bookingId = booking.id;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to create booking";
    return { error: message };
  }
  redirect(`/bookings/confirm?id=${bookingId}`);
}

export async function cancelBookingAction(bookingId: string) {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: "You must be logged in" };
  }

  try {
    await cancelBooking(bookingId, session.user.id, "guest");
    await createAuditLog({
      userId: session.user.id,
      action: "booking.cancel_by_guest",
      entityType: "Booking",
      entityId: bookingId,
    });
    return { success: true };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to cancel booking";
    return { error: message };
  }
}

export async function confirmBookingAction(bookingId: string) {
  const session = await auth();
  if (!session?.user?.id || !session.user.isHost) {
    return { error: "Not authorized" };
  }

  try {
    await confirmBooking(bookingId, session.user.id);
    await createAuditLog({
      userId: session.user.id,
      action: "booking.confirm",
      entityType: "Booking",
      entityId: bookingId,
      metadata: { confirmedBy: "host" },
    });
    revalidatePath("/host/bookings");
    revalidatePath("/host/reservations");
    revalidatePath(`/host/bookings/${bookingId}`);
    revalidatePath(`/host/reservations/${bookingId}`);
    revalidatePath(`/account/bookings/${bookingId}`);
    return { success: true };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to confirm";
    return { error: message };
  }
}

export async function rejectBookingAction(bookingId: string, reason?: string) {
  const session = await auth();
  if (!session?.user?.id || !session.user.isHost) {
    return { error: "Not authorized" };
  }
  if (!reason?.trim()) {
    return { error: "Please provide a brief reason for declining" };
  }

  try {
    await rejectBooking(bookingId, session.user.id, reason.trim());
    await createAuditLog({
      userId: session.user.id,
      action: "booking.reject",
      entityType: "Booking",
      entityId: bookingId,
      metadata: { rejectedBy: "host", reason },
    });
    revalidatePath("/host/bookings");
    revalidatePath("/host/reservations");
    revalidatePath(`/host/bookings/${bookingId}`);
    revalidatePath(`/host/reservations/${bookingId}`);
    revalidatePath(`/account/bookings/${bookingId}`);
    return { success: true };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to reject";
    return { error: message };
  }
}

export async function hostCancelBookingAction(bookingId: string, reason: string) {
  const session = await auth();
  if (!session?.user?.id || !session.user.isHost) {
    return { error: "Not authorized" };
  }
  if (!reason.trim()) {
    return { error: "Cancellation reason is required" };
  }

  try {
    await cancelBooking(bookingId, session.user.id, "host", reason);
    await createAuditLog({
      userId: session.user.id,
      action: "booking.cancel_by_host",
      entityType: "Booking",
      entityId: bookingId,
      metadata: { reason },
    });
    revalidatePath("/host/bookings");
    revalidatePath("/host/reservations");
    revalidatePath(`/host/bookings/${bookingId}`);
    revalidatePath(`/host/reservations/${bookingId}`);
    revalidatePath(`/account/bookings/${bookingId}`);
    return { success: true };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to cancel booking";
    return { error: message };
  }
}
