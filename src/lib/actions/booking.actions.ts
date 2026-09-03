"use server";

import { auth } from "@/lib/auth";
import {
  acceptBookingWithPaymentSchema,
  createBookingSchema,
  sendBookingPaymentRequestSchema,
} from "@/lib/validations/booking.schema";
import { firstZodMessage } from "@/lib/utils/zod-error";
import { todayYmd, ymdToDbDate } from "@/lib/utils/date-only";
import {
  createBooking,
  cancelBooking,
  getBookingAcceptancePaymentData,
  rejectBooking,
  saveBookingPaymentInstructionTemplate,
} from "@/lib/services/booking.service";
import { acceptBookingAsHost } from "@/lib/services/booking-acceptance.service";
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
} from "@/lib/payments/booking-payment-request";
import {
  resolveRequestMethod,
  resolveStructuredDetails,
} from "@/lib/payments/booking-acceptance";
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
    // Two dates, in both booking modes. A weekly listing accepts only pairs that land on
    // its changeover day and run whole weeks inside its stay limits, and that is decided
    // on the server against the listing row — never from anything the form carried.
    checkIn: (formData.get("checkIn") as string | null) || undefined,
    checkOut: (formData.get("checkOut") as string | null) || undefined,
    // Read only so a stale page's payload is *refused* rather than ignored. The schema
    // rejects any value here; nothing books by period id any more.
    fixedStayPeriodId:
      (formData.get("fixedStayPeriodId") as string | null) || undefined,
    // The party, four numbers rather than one. `guestCount` is no longer posted — the
    // server derives it from adults + children — but a page loaded before this shipped
    // still posts it and nothing else, so it stands in for the adults on that one
    // request rather than failing a guest mid-booking over a deploy boundary.
    adults:
      (formData.get("adults") as string | null) ??
      (formData.get("guestCount") as string | null) ??
      undefined,
    children: (formData.get("children") as string | null) ?? undefined,
    infants: (formData.get("infants") as string | null) ?? undefined,
    pets: (formData.get("pets") as string | null) ?? undefined,
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
      // Through the shared helper: `@db.Date` columns take UTC midnight, and naming that
      // rather than leaning on `new Date("2026-06-10")`'s parsing keeps the one
      // conversion the rest of the booking flow reads back with `dbDateToYmd`.
      checkIn: ymdToDbDate(parsed.data.checkIn),
      checkOut: ymdToDbDate(parsed.data.checkOut),
      // Passed whole. `createBooking` derives the capacity from adults + children,
      // checks the party against the listing's own house rules, and stores all four —
      // this action does no arithmetic on them.
      party: {
        adults: parsed.data.adults,
        children: parsed.data.children,
        infants: parsed.data.infants,
        pets: parsed.data.pets,
      },
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

/**
 * The web transport over the one acceptance workflow.
 *
 * Session, input shape and cache revalidation only. The payment decision, every rule
 * that decides whether it may be applied, the send and the audit trail all live in
 * `acceptBookingAsHost`, which the mobile PATCH route calls with the same payload — so
 * a host accepting the same booking from either place lands in the same state.
 */
export async function acceptBookingWithPaymentAction(input: unknown) {
  const session = await auth();
  if (!session?.user?.id || !session.user.isHost) {
    return { error: "Not authorized" } as const;
  }
  const parsed = acceptBookingWithPaymentSchema.safeParse(input);
  if (!parsed.success) {
    return { error: firstZodMessage(parsed.error) } as const;
  }

  const result = await acceptBookingAsHost({
    ...parsed.data,
    hostId: session.user.id,
    source: "WEB",
  });
  if (!result.success) return { error: result.error } as const;

  revalidateAcceptedBooking(parsed.data.bookingId);
  return {
    success: true,
    instructionsSent: result.instructionsSent,
    warning: result.warning,
  } as const;
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
    const paymentRequest = parsed.data.paymentRequestId
      ? payment.requests.find(
          (request) => request.id === parsed.data.paymentRequestId,
        )
      : payment.requests.find((request) => request.status === "DRAFT");
    if (!paymentRequest || paymentRequest.status !== "DRAFT") {
      return { error: "Choose a payment request that still needs to be sent." } as const;
    }
    // The same day the acceptance dialog floors its picker at — read in the
    // marketplace zone rather than in UTC, which put the floor a day early for the
    // first two hours of every local morning (M6).
    const today = todayYmd();
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
            total: paymentRequest.amount,
            currency: payment.currency,
            dueDate: parsed.data.dueDate,
            fields,
          })
        : buildBookingPaymentRequest({
            reference: payment.reference,
            method,
            otherLabel: payment.otherLabel,
            total: paymentRequest.amount,
            currency: payment.currency,
            dueDate: parsed.data.dueDate,
            instructions,
          }),
      dueAt: ymdToDbDate(parsed.data.dueDate),
      detailsSnapshot: fields
        ? bookingPaymentDetailsSnapshot({
            method,
            otherLabel: payment.otherLabel,
            fields,
          })
        : null,
      paymentRequestId: paymentRequest.id,
      paymentRequestType: paymentRequest.type,
      method,
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
