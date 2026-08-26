"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import {
  isBookingPaymentEvent,
  recordBookingPaymentEvent,
} from "@/lib/services/booking-payment-status.service";
import { createAuditLog } from "@/lib/services/audit.service";

export async function recordBookingPaymentEventAction(
  bookingId: string,
  event: unknown,
) {
  const session = await auth();
  if (!session?.user?.id) return { error: "Sign in to update payment progress" };
  if (!isBookingPaymentEvent(event)) return { error: "Invalid payment update" };

  try {
    const result = await recordBookingPaymentEvent({
      bookingId,
      actorId: session.user.id,
      event,
    });
    await createAuditLog({
      userId: session.user.id,
      action: "booking.payment_status.update",
      entityType: "Booking",
      entityId: bookingId,
      metadata: { event, changed: result.changed },
    });
    revalidatePath(`/account/bookings/${bookingId}`);
    revalidatePath(`/host/bookings/${bookingId}`);
    revalidatePath(`/host/reservations/${bookingId}`);
    revalidatePath("/host/reservations");
    return { success: true, changed: result.changed };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Could not update payment progress",
    };
  }
}
