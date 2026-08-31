import "server-only";
import { createAuditLog } from "@/lib/services/audit.service";
import {
  confirmBooking,
  getBookingAcceptancePaymentData,
  saveBookingPaymentInstructionTemplate,
} from "@/lib/services/booking.service";
import {
  ensureBookingConversation,
  shareBookingPaymentInstructions,
} from "@/lib/services/chat.service";
import { assertSafePaymentInstructions } from "@/lib/services/payment-instructions";
import { todayYmd, ymdToDbDate } from "@/lib/utils/date-only";
import {
  acceptanceDecisionError,
  acceptanceDecisionRule,
  resolveRequestMethod,
  resolveStructuredDetails,
} from "@/lib/payments/booking-acceptance";
import {
  bookingPaymentDetailsSnapshot,
  buildBookingPaymentRequest,
  buildStructuredBookingPaymentRequest,
  type BookingPaymentDecision,
} from "@/lib/payments/booking-payment-request";
import {
  formatPaymentDetailsAsText,
  type PaymentDetailFieldValues,
} from "@/lib/payments/payment-details";
import type { PaymentMethodCode } from "@/lib/payments/payment-methods";

/**
 * The one acceptance workflow.
 *
 * Every host path that turns a request into a confirmed booking comes through here —
 * the web dialog's server action and the mobile PATCH — so the same booking accepted
 * from either place lands in the same state. Before this, the web action carried the
 * whole rule and the mobile route carried none of it, which is exactly the divergence
 * M1 describes.
 *
 * What this owns: the payment decision, its compatibility with the booking, sending the
 * instructions a SEND_NOW promised, and the audit trail. What it does not own: session
 * lookup, request parsing and cache revalidation, which stay in the transports.
 */

export type AcceptBookingSource = "WEB" | "MOBILE";

export interface AcceptBookingInput {
  bookingId: string;
  /** Already authenticated. Ownership is re-checked here against the listing. */
  hostId: string;
  /** Unvalidated on purpose: a missing or unknown decision is rejected here, not by
   *  whichever transport happened to carry it. */
  decision: unknown;
  /** Only consulted for a booking whose guest never recorded a choice. */
  method?: PaymentMethodCode;
  instructions?: string;
  detailFields?: Record<string, string>;
  dueDate?: string;
  saveForFuture?: boolean;
  /**
   * Send the details this host already reviewed and saved for the booking's method,
   * resolved on the server. The mobile sheet previews exactly this text before the host
   * taps, so it is still a reviewed send — it just never carries the host's private
   * coordinates down to the phone and back.
   */
  useSavedInstructions?: boolean;
  source: AcceptBookingSource;
}

export type AcceptBookingResult =
  | {
      success: true;
      decision: BookingPaymentDecision;
      instructionsSent: boolean;
      warning?: string;
    }
  | { success: false; error: string };

type AcceptancePaymentData = Awaited<
  ReturnType<typeof getBookingAcceptancePaymentData>
>;

const failure = (error: string): AcceptBookingResult => ({ success: false, error });

/** The reviewed content a SEND_NOW will actually put in the guest's conversation. */
type SendableInstructions =
  | { fields: PaymentDetailFieldValues; text: null }
  | { fields: null; text: string };

export async function acceptBookingAsHost(
  input: AcceptBookingInput,
): Promise<AcceptBookingResult> {
  let payment: AcceptancePaymentData;
  try {
    // Scoped to `listing: { hostId }`, so another host's booking is indistinguishable
    // from one that does not exist. This is the authorization check, and it runs before
    // anything about the decision is considered.
    payment = await getBookingAcceptancePaymentData(input.bookingId, input.hostId);
  } catch (error) {
    return failure(error instanceof Error ? error.message : "Booking not found");
  }

  if (payment.status !== "PENDING") {
    // Covers the second tap of a double submit, and a request that was declined,
    // cancelled or swept as expired while the host's screen was open.
    return failure("Only pending bookings can be accepted.");
  }

  const method = resolveRequestMethod(payment, input.method);
  if (!payment.selectedPaymentMethod && input.method && !method) {
    return failure("That payment method is not valid for this booking.");
  }
  // Recomputed against the method actually in play. The DTO's own rule is built from
  // the guest's choice for the host's screen; a host supplying a method for a booking
  // that never recorded one must be held to that method's answer, not to null's.
  const rule = acceptanceDecisionRule({
    method,
    payableCount: payment.payableRequestCount,
    availableMethods: payment.availableMethods,
  });
  const decisionError = acceptanceDecisionError(input.decision, rule);
  if (decisionError) return failure(decisionError);
  const decision = input.decision as BookingPaymentDecision;

  const draft = payment.requests.find((request) => request.status === "DRAFT");
  let sendable: SendableInstructions | null = null;
  const dueDate = input.dueDate;

  if (decision === "SEND_NOW") {
    if (!method) return failure("Choose the payment method for this booking.");
    if (!draft) return failure("This booking has no payment request to send.");

    const resolved = input.useSavedInstructions
      ? savedInstructionsFor(payment, method)
      : postedInstructionsFor(method, input);
    if ("error" in resolved) return failure(resolved.error);
    sendable = resolved.sendable;

    if (!dueDate) return failure("Choose when payment is due.");
    // Marketplace day, matching `sendBookingPaymentRequestAction`'s floor and the
    // date the host's own picker offers — UTC disagreed with both overnight (M6).
    const today = todayYmd();
    if (dueDate < today || dueDate > payment.checkIn) {
      return failure("Choose a payment deadline between today and check-in.");
    }
    if (sendable.text !== null) assertSafePaymentInstructions(sendable.text);
  }

  try {
    // The status guard inside this transaction is what makes a duplicate acceptance
    // lose: the second writer finds no PENDING row and throws rather than accepting
    // twice, re-creating the payment requests or sending the instructions again.
    await confirmBooking(input.bookingId, input.hostId, {
      decision,
      method: method ?? undefined,
    });
  } catch (error) {
    return failure(
      error instanceof Error ? error.message : "Failed to confirm booking",
    );
  }

  let instructionsSent = false;
  let warning: string | undefined;

  if (decision === "SEND_NOW" && method && dueDate && draft && sendable) {
    try {
      await ensureBookingConversation(input.bookingId);
      const message = await shareBookingPaymentInstructions({
        bookingId: input.bookingId,
        hostId: input.hostId,
        body: sendable.fields
          ? buildStructuredBookingPaymentRequest({
              reference: payment.reference,
              method,
              otherLabel: payment.otherLabel,
              total: draft.amount,
              currency: payment.currency,
              dueDate,
              fields: sendable.fields,
            })
          : buildBookingPaymentRequest({
              reference: payment.reference,
              method,
              otherLabel: payment.otherLabel,
              total: draft.amount,
              currency: payment.currency,
              dueDate,
              instructions: sendable.text,
            }),
        dueAt: ymdToDbDate(dueDate),
        detailsSnapshot: sendable.fields
          ? bookingPaymentDetailsSnapshot({
              method,
              otherLabel: payment.otherLabel,
              fields: sendable.fields,
            })
          : null,
        // Addressed by type, which resolves through the request's unique
        // (bookingId, type) key — a second send finds it no longer DRAFT and refuses.
        paymentRequestType: draft.type,
        method,
      });
      instructionsSent = true;
      await createAuditLog({
        userId: input.hostId,
        action: "booking.payment_instructions_shared",
        entityType: "Message",
        entityId: message.id,
        // Metadata records that a send happened and in which format — never a field,
        // a label, or a value from the instructions themselves.
        metadata: {
          kind: "PAYMENT_INSTRUCTIONS",
          duringAcceptance: true,
          source: input.source,
          format: sendable.fields ? "STRUCTURED" : "FREE_TEXT",
        },
      });
      if (input.saveForFuture) {
        try {
          await saveBookingPaymentInstructionTemplate({
            bookingId: input.bookingId,
            hostId: input.hostId,
            method,
            ...(sendable.fields
              ? { fields: sendable.fields }
              : { body: sendable.text }),
          });
        } catch {
          warning =
            "Booking accepted and instructions sent, but the reusable copy was not saved.";
        }
      }
    } catch {
      // The booking stays accepted. `paymentInstructionsStatus` is still PENDING, so
      // the send survives as a task on the host's action queue rather than vanishing.
      warning =
        "Booking accepted, but the payment instructions were not sent. They remain in your action list.";
    }
  }

  await createAuditLog({
    userId: input.hostId,
    action: "booking.confirm",
    entityType: "Booking",
    entityId: input.bookingId,
    metadata: {
      confirmedBy: "host",
      source: input.source,
      paymentDecision: decision,
      instructionsSent,
    },
  });

  return { success: true, decision, instructionsSent, warning };
}

/** Details posted by the host's own screen, validated against the method in play. */
function postedInstructionsFor(
  method: PaymentMethodCode,
  input: Pick<AcceptBookingInput, "detailFields" | "instructions">,
): { sendable: SendableInstructions } | { error: string } {
  const structured = resolveStructuredDetails(method, input.detailFields);
  if (structured && "error" in structured) return { error: structured.error };
  if (structured) return { sendable: { fields: structured.fields, text: null } };

  const text = input.instructions?.trim() ?? "";
  if (!text) return { error: "Add the payment details before accepting and sending." };
  return { sendable: { fields: null, text } };
}

/** The host's saved template for this booking's method, re-validated before sending. */
function savedInstructionsFor(
  payment: AcceptancePaymentData,
  method: PaymentMethodCode,
): { sendable: SendableInstructions } | { error: string } {
  if (payment.savedDetailsKind === "STRUCTURED") {
    const structured = resolveStructuredDetails(method, payment.savedDetailFields);
    if (structured && "error" in structured) return { error: structured.error };
    if (structured) return { sendable: { fields: structured.fields, text: null } };
  }
  const text = payment.savedInstructions.trim();
  if (!text) return { error: "Add the payment details before accepting and sending." };
  return { sendable: { fields: null, text } };
}

/**
 * The readable preview of what a SEND_NOW would put in the conversation.
 *
 * Only the coordinates, not the amount-and-reference wrapper the message adds, and only
 * ever shown to the listing's own host — this is that host's own saved data.
 */
export function savedInstructionsPreview(
  payment: Pick<
    AcceptancePaymentData,
    "savedDetailsKind" | "savedDetailFields" | "savedInstructions"
  >,
  method: PaymentMethodCode | null,
): string | null {
  if (!method) return null;
  if (payment.savedDetailsKind === "STRUCTURED") {
    const structured = resolveStructuredDetails(method, payment.savedDetailFields);
    if (structured && "fields" in structured) {
      return formatPaymentDetailsAsText(method, structured.fields);
    }
    return null;
  }
  return payment.savedInstructions.trim() || null;
}
