"use server";

import { auth } from "@/lib/auth";
import {
  acceptBookingWithPaymentSchema,
  createBookingSchema,
  sendBookingPaymentRequestSchema,
} from "@/lib/validations/booking.schema";
import { firstZodMessage } from "@/lib/utils/zod-error";
import {
  createBooking,
  cancelBooking,
  confirmBooking,
  getBookingAcceptancePaymentData,
  rejectBooking,
  saveBookingPaymentInstructionTemplate,
} from "@/lib/services/booking.service";
import { createAuditLog } from "@/lib/services/audit.service";
import { getPriceFormatter } from "@/lib/currency/price";
import { getLocale } from "@/lib/i18n/t";
import { rateLimit } from "@/lib/rate-limit";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  buildBookingPaymentRequest,
  paymentMethodCanNeedNoInstructions,
} from "@/lib/payments/booking-payment-request";
import {
  ensureBookingConversation,
  shareBookingPaymentInstructions,
} from "@/lib/services/chat.service";
import { assertSafePaymentInstructions } from "@/lib/services/payment-instructions";

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
    selectedPaymentMethod:
      (formData.get("selectedPaymentMethod") as string) || undefined,
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
      selectedPaymentMethod: parsed.data.selectedPaymentMethod,
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

export async function getBookingAcceptancePaymentDataAction(bookingId: string) {
  const session = await auth();
  if (!session?.user?.id || !session.user.isHost) {
    return { error: "Not authorized" } as const;
  }
  try {
    return {
      data: await getBookingAcceptancePaymentData(bookingId, session.user.id),
    } as const;
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Could not load booking details",
    } as const;
  }
}

function revalidateAcceptedBooking(bookingId: string) {
  revalidatePath("/host");
  revalidatePath("/host/bookings");
  revalidatePath("/host/reservations");
  revalidatePath(`/host/bookings/${bookingId}`);
  revalidatePath(`/host/reservations/${bookingId}`);
  revalidatePath(`/account/bookings/${bookingId}`);
}

/** One deliberate host decision: accept, then either send reviewed private instructions,
 * keep a visible send-later task, or record that no instructions are needed. */
export async function acceptBookingWithPaymentAction(input: unknown) {
  const session = await auth();
  if (!session?.user?.id || !session.user.isHost) {
    return { error: "Not authorized" } as const;
  }
  const parsed = acceptBookingWithPaymentSchema.safeParse(input);
  if (!parsed.success) {
    return { error: firstZodMessage(parsed.error) } as const;
  }

  const { bookingId, decision, dueDate, saveForFuture } = parsed.data;
  const instructions = parsed.data.instructions?.trim() ?? "";
  try {
    const payment = await getBookingAcceptancePaymentData(
      bookingId,
      session.user.id,
    );
    if (payment.status !== "PENDING") {
      return { error: "Only pending bookings can be accepted." } as const;
    }
    if (decision === "NO_INSTRUCTIONS" &&
        !paymentMethodCanNeedNoInstructions(payment.selectedPaymentMethod)) {
      return {
        error: "Choose send now or send later for this payment method.",
      } as const;
    }
    if (decision === "SEND_NOW") {
      if (!payment.selectedPaymentMethod) {
        return { error: "The guest's payment method was not recorded." } as const;
      }
      if (!instructions) {
        return { error: "Add the payment details before accepting and sending." } as const;
      }
      if (!dueDate) {
        return { error: "Choose when payment is due." } as const;
      }
      const today = new Date().toISOString().slice(0, 10);
      if (dueDate < today || dueDate > payment.checkIn) {
        return {
          error: "Choose a payment deadline between today and check-in.",
        } as const;
      }
      assertSafePaymentInstructions(instructions);
    }

    await confirmBooking(bookingId, session.user.id, {
      paymentInstructionsStatus:
        decision === "NO_INSTRUCTIONS" ? "NOT_NEEDED" : "PENDING",
    });

    let instructionsSent = false;
    let warning: string | undefined;
    if (decision === "SEND_NOW" && payment.selectedPaymentMethod && dueDate) {
      try {
        await ensureBookingConversation(bookingId);
        const message = await shareBookingPaymentInstructions({
          bookingId,
          hostId: session.user.id,
          body: buildBookingPaymentRequest({
            reference: payment.reference,
            method: payment.selectedPaymentMethod,
            otherLabel: payment.otherLabel,
            total: payment.total,
            currency: payment.currency,
            dueDate,
            instructions,
          }),
          dueAt: new Date(`${dueDate}T00:00:00.000Z`),
        });
        instructionsSent = true;
        await createAuditLog({
          userId: session.user.id,
          action: "booking.payment_instructions_shared",
          entityType: "Message",
          entityId: message.id,
          metadata: { kind: "PAYMENT_INSTRUCTIONS", duringAcceptance: true },
        });
        if (saveForFuture) {
          try {
            await saveBookingPaymentInstructionTemplate({
              bookingId,
              hostId: session.user.id,
              method: payment.selectedPaymentMethod,
              body: instructions,
            });
          } catch {
            warning =
              "Booking accepted and instructions sent, but the reusable copy was not saved.";
          }
        }
      } catch {
        warning =
          "Booking accepted, but the payment instructions were not sent. They remain in your action list.";
      }
    }

    await createAuditLog({
      userId: session.user.id,
      action: "booking.confirm",
      entityType: "Booking",
      entityId: bookingId,
      metadata: {
        confirmedBy: "host",
        paymentDecision: decision,
        instructionsSent,
      },
    });
    revalidateAcceptedBooking(bookingId);
    return { success: true, instructionsSent, warning } as const;
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Failed to confirm booking",
    } as const;
  }
}

export async function sendBookingPaymentRequestAction(input: unknown) {
  const session = await auth();
  if (!session?.user?.id || !session.user.isHost) {
    return { error: "Not authorized" } as const;
  }
  const parsed = sendBookingPaymentRequestSchema.safeParse(input);
  if (!parsed.success) {
    return { error: firstZodMessage(parsed.error) } as const;
  }
  try {
    const payment = await getBookingAcceptancePaymentData(
      parsed.data.bookingId,
      session.user.id,
    );
    if (payment.status !== "CONFIRMED" || !payment.selectedPaymentMethod) {
      return {
        error: "Payment instructions can only be sent for an accepted booking with a recorded payment method.",
      } as const;
    }
    const today = new Date().toISOString().slice(0, 10);
    if (parsed.data.dueDate < today || parsed.data.dueDate > payment.checkIn) {
      return {
        error: "Choose a payment deadline between today and check-in.",
      } as const;
    }
    assertSafePaymentInstructions(parsed.data.instructions);
    await ensureBookingConversation(parsed.data.bookingId);
    const message = await shareBookingPaymentInstructions({
      bookingId: parsed.data.bookingId,
      hostId: session.user.id,
      body: buildBookingPaymentRequest({
        reference: payment.reference,
        method: payment.selectedPaymentMethod,
        otherLabel: payment.otherLabel,
        total: payment.total,
        currency: payment.currency,
        dueDate: parsed.data.dueDate,
        instructions: parsed.data.instructions,
      }),
      dueAt: new Date(`${parsed.data.dueDate}T00:00:00.000Z`),
    });
    let warning: string | undefined;
    if (parsed.data.saveForFuture) {
      try {
        await saveBookingPaymentInstructionTemplate({
          bookingId: parsed.data.bookingId,
          hostId: session.user.id,
          method: payment.selectedPaymentMethod,
          body: parsed.data.instructions,
        });
      } catch {
        warning =
          "Payment request sent, but the reusable copy was not saved.";
      }
    }
    await createAuditLog({
      userId: session.user.id,
      action: "booking.payment_instructions_shared",
      entityType: "Message",
      entityId: message.id,
      metadata: { kind: "PAYMENT_INSTRUCTIONS", fromReminder: true },
    });
    revalidateAcceptedBooking(parsed.data.bookingId);
    revalidatePath("/messages");
    revalidatePath(`/messages/${message.conversationId}`);
    return { success: true, messageId: message.id, warning } as const;
  } catch {
    return { error: "Could not send the payment request" } as const;
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
