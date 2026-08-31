"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import {
  isBookingPaymentEvent,
  paymentEventNeedsPrivateRecord,
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
  if (paymentEventNeedsPrivateRecord(event)) {
    return { error: "Add the transaction amount and date before reporting it." };
  }

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

export async function reportBookingTransactionAction(input: unknown) {
  const session = await auth();
  if (!session?.user?.id) return { error: "Sign in to report a transaction" };
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { error: "Invalid transaction report" };
  }
  const raw = input as Record<string, unknown>;
  if (
    typeof raw.bookingId !== "string" ||
    !isBookingPaymentEvent(raw.event) ||
    !paymentEventNeedsPrivateRecord(raw.event)
  ) {
    return { error: "Invalid transaction report" };
  }

  try {
    const result = await recordBookingPaymentEvent({
      bookingId: raw.bookingId,
      actorId: session.user.id,
      event: raw.event,
      privateRecord: {
        amount: Number(raw.amount),
        transactionDate: String(raw.transactionDate ?? ""),
        reference: typeof raw.reference === "string" ? raw.reference : null,
        note: typeof raw.note === "string" ? raw.note : null,
        retainedReason:
          typeof raw.retainedReason === "string" ? raw.retainedReason : null,
      },
    });
    await createAuditLog({
      userId: session.user.id,
      action: "booking.transaction.report",
      entityType: "Booking",
      entityId: raw.bookingId,
      metadata: { event: raw.event, changed: result.changed },
    });
    revalidatePath(`/account/bookings/${raw.bookingId}`);
    revalidatePath(`/host/bookings/${raw.bookingId}`);
    revalidatePath(`/host/reservations/${raw.bookingId}`);
    revalidatePath("/host/reservations");
    return { success: true, changed: result.changed };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Could not report transaction",
    };
  }
}
