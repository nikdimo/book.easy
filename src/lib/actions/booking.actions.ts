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
  bookingPaymentDetailsSnapshot,
  buildBookingPaymentRequest,
  buildStructuredBookingPaymentRequest,
  paymentMethodCanNeedNoInstructions,
} from "@/lib/payments/booking-payment-request";
import {
  methodSupportsPaymentDetails,
  paymentDetailsAreComplete,
  validatePaymentMethodDetails,
  type PaymentDetailFieldValues,
} from "@/lib/payments/payment-details";
import type { PaymentMethodCode } from "@/lib/payments/payment-methods";
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

type AcceptancePaymentData = Awaited<
  ReturnType<typeof getBookingAcceptancePaymentData>
>;

/**
 * Which method this request is actually for.
 *
 * A guest's recorded choice is returned unchanged and a posted `method` is ignored — the
 * host cannot silently swap it. Only a booking with no recorded choice consults the
 * posted value, and only if it is on that booking's own frozen list.
 */
function resolveRequestMethod(
  payment: AcceptancePaymentData,
  posted: PaymentMethodCode | undefined,
): PaymentMethodCode | null {
  if (payment.selectedPaymentMethod) return payment.selectedPaymentMethod;
  if (!posted) return null;
  return payment.availableMethods.includes(posted) ? posted : null;
}

type ResolvedStructuredDetails =
  | { fields: PaymentDetailFieldValues }
  | { error: string };

/**
 * Validates the structured fields the host reviewed, against the method in play.
 *
 * Returns null when the request carries no structured data at all, which is what routes
 * a legacy free-text send down the original path. Errors are generic on purpose: an
 * action's error string can be surfaced in a toast or a log, and payment values must
 * never reach either.
 */
function resolveStructuredDetails(
  method: PaymentMethodCode,
  detailFields: Record<string, string> | undefined,
): ResolvedStructuredDetails | null {
  if (!detailFields) return null;
  const hasValue = Object.values(detailFields).some((value) => value.trim() !== "");
  if (!hasValue) return null;
  if (!methodSupportsPaymentDetails(method)) {
    return { error: "This payment method does not take saved details." };
  }

  const validated = validatePaymentMethodDetails(method, detailFields);
  if (!validated.success) {
    return { error: "Check the payment details and try again." };
  }
  if (!paymentDetailsAreComplete(method, validated.value)) {
    return { error: "Fill in every required payment detail before sending." };
  }
  return { fields: validated.value };
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
    // The guest's own choice always wins. A `method` on the wire is only consulted for
    // a booking that never recorded one, and only against that booking's own list.
    const method = resolveRequestMethod(payment, parsed.data.method);
    if (decision === "NO_INSTRUCTIONS" &&
        !paymentMethodCanNeedNoInstructions(method)) {
      return {
        error: "Choose send now or send later for this payment method.",
      } as const;
    }
    let structured: ResolvedStructuredDetails | null = null;
    if (decision === "SEND_NOW") {
      if (!method) {
        return { error: "Choose the payment method for this booking." } as const;
      }
      structured = resolveStructuredDetails(method, parsed.data.detailFields);
      if (structured && "error" in structured) {
        return { error: structured.error } as const;
      }
      if (!structured && !instructions) {
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
      if (!structured) assertSafePaymentInstructions(instructions);
    }

    await confirmBooking(bookingId, session.user.id, {
      paymentInstructionsStatus:
        decision === "NO_INSTRUCTIONS" ? "NOT_NEEDED" : "PENDING",
    });

    let instructionsSent = false;
    let warning: string | undefined;
    if (decision === "SEND_NOW" && method && dueDate) {
      try {
        await ensureBookingConversation(bookingId);
        const fields = structured && "fields" in structured ? structured.fields : null;
        const message = await shareBookingPaymentInstructions({
          bookingId,
          hostId: session.user.id,
          body: fields
            ? buildStructuredBookingPaymentRequest({
                reference: payment.reference,
                method,
                otherLabel: payment.otherLabel,
                total: payment.total,
                currency: payment.currency,
                dueDate,
                fields,
              })
            : buildBookingPaymentRequest({
                reference: payment.reference,
                method,
                otherLabel: payment.otherLabel,
                total: payment.total,
                currency: payment.currency,
                dueDate,
                instructions,
              }),
          dueAt: new Date(`${dueDate}T00:00:00.000Z`),
          detailsSnapshot: fields
            ? bookingPaymentDetailsSnapshot({
                method,
                otherLabel: payment.otherLabel,
                fields,
              })
            : null,
        });
        instructionsSent = true;
        await createAuditLog({
          userId: session.user.id,
          action: "booking.payment_instructions_shared",
          entityType: "Message",
          entityId: message.id,
          // Metadata records that a send happened and in which format — never a field,
          // a label, or a value from the instructions themselves.
          metadata: {
            kind: "PAYMENT_INSTRUCTIONS",
            duringAcceptance: true,
            format: fields ? "STRUCTURED" : "FREE_TEXT",
          },
        });
        if (saveForFuture) {
          try {
            await saveBookingPaymentInstructionTemplate({
              bookingId,
              hostId: session.user.id,
              method,
              ...(fields ? { fields } : { body: instructions }),
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
    if (payment.status !== "CONFIRMED") {
      return {
        error: "Payment instructions can only be sent for an accepted booking.",
      } as const;
    }
    const method = resolveRequestMethod(payment, parsed.data.method);
    if (!method) {
      return {
        error: "Choose the payment method for this booking.",
      } as const;
    }
    const today = new Date().toISOString().slice(0, 10);
    if (parsed.data.dueDate < today || parsed.data.dueDate > payment.checkIn) {
      return {
        error: "Choose a payment deadline between today and check-in.",
      } as const;
    }
    const structured = resolveStructuredDetails(method, parsed.data.detailFields);
    if (structured && "error" in structured) {
      return { error: structured.error } as const;
    }
    const instructions = parsed.data.instructions?.trim() ?? "";
    if (!structured && !instructions) {
      return { error: "Add the payment details before sending." } as const;
    }
    if (!structured) assertSafePaymentInstructions(instructions);

    await ensureBookingConversation(parsed.data.bookingId);
    const fields = structured ? structured.fields : null;
    const message = await shareBookingPaymentInstructions({
      bookingId: parsed.data.bookingId,
      hostId: session.user.id,
      body: fields
        ? buildStructuredBookingPaymentRequest({
            reference: payment.reference,
            method,
            otherLabel: payment.otherLabel,
            total: payment.total,
            currency: payment.currency,
            dueDate: parsed.data.dueDate,
            fields,
          })
        : buildBookingPaymentRequest({
            reference: payment.reference,
            method,
            otherLabel: payment.otherLabel,
            total: payment.total,
            currency: payment.currency,
            dueDate: parsed.data.dueDate,
            instructions,
          }),
      dueAt: new Date(`${parsed.data.dueDate}T00:00:00.000Z`),
      detailsSnapshot: fields
        ? bookingPaymentDetailsSnapshot({
            method,
            otherLabel: payment.otherLabel,
            fields,
          })
        : null,
    });
    let warning: string | undefined;
    if (parsed.data.saveForFuture) {
      try {
        await saveBookingPaymentInstructionTemplate({
          bookingId: parsed.data.bookingId,
          hostId: session.user.id,
          method,
          ...(fields ? { fields } : { body: instructions }),
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
      metadata: {
        kind: "PAYMENT_INSTRUCTIONS",
        fromReminder: true,
        format: fields ? "STRUCTURED" : "FREE_TEXT",
      },
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
