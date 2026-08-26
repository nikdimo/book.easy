import "server-only";

import type {
  BookingDepositStatus,
  BookingPaymentStatus,
  Prisma,
} from "@prisma/client";
import { db } from "@/lib/db";
import { parseDepositPolicySnapshot } from "@/lib/payments/deposit-policy";

export const BOOKING_PAYMENT_EVENTS = [
  "HOST_MARK_PAYMENT_DUE",
  "GUEST_REPORT_PAYMENT_SENT",
  "HOST_CONFIRM_PAYMENT_RECEIVED",
  "HOST_MARK_PAYMENT_NOT_REQUIRED",
  "HOST_MARK_DEPOSIT_DUE",
  "GUEST_REPORT_DEPOSIT_SENT",
  "HOST_CONFIRM_DEPOSIT_RECEIVED",
  "HOST_REPORT_DEPOSIT_RETURNED",
  "GUEST_CONFIRM_DEPOSIT_RETURNED",
  "HOST_MARK_DEPOSIT_RETAINED",
] as const;

export type BookingPaymentEvent = (typeof BOOKING_PAYMENT_EVENTS)[number];

const EVENT_SET = new Set<string>(BOOKING_PAYMENT_EVENTS);

type BookingPaymentActor = "HOST" | "GUEST";

type StatusPair = {
  paymentStatus: BookingPaymentStatus;
  depositStatus: BookingDepositStatus;
};

function actorFor(
  booking: { guestId: string; listing: { hostId: string } },
  actorId: string,
): BookingPaymentActor | null {
  if (booking.listing.hostId === actorId) return "HOST";
  if (booking.guestId === actorId) return "GUEST";
  return null;
}

function nextStatuses(
  current: StatusPair,
  event: BookingPaymentEvent,
  actor: BookingPaymentActor,
  depositRequired: boolean,
  securityDeposit: boolean,
): StatusPair {
  const hostOnly = () => {
    if (actor !== "HOST") throw new Error("Only the host can record that update");
  };
  const guestOnly = () => {
    if (actor !== "GUEST") throw new Error("Only the guest can record that update");
  };
  const requireDeposit = () => {
    if (!depositRequired) throw new Error("This booking does not require a deposit");
  };
  const requireSecurityDeposit = () => {
    requireDeposit();
    if (!securityDeposit) {
      throw new Error("Only a damage/security deposit can be returned or retained");
    }
  };

  switch (event) {
    case "HOST_MARK_PAYMENT_DUE":
      hostOnly();
      if (current.paymentStatus !== "UNTRACKED") {
        throw new Error("Payment progress has already started");
      }
      return { ...current, paymentStatus: "AWAITING_PAYMENT" };
    case "GUEST_REPORT_PAYMENT_SENT":
      guestOnly();
      if (current.paymentStatus === "NOT_REQUIRED") {
        throw new Error("Payment is marked as not required");
      }
      if (current.paymentStatus === "PAYMENT_CONFIRMED") {
        throw new Error("Payment has already been confirmed");
      }
      return { ...current, paymentStatus: "PAYMENT_REPORTED" };
    case "HOST_CONFIRM_PAYMENT_RECEIVED":
      hostOnly();
      if (current.paymentStatus === "NOT_REQUIRED") {
        throw new Error("Payment is marked as not required");
      }
      if (current.paymentStatus === "PAYMENT_CONFIRMED") {
        throw new Error("Payment has already been confirmed");
      }
      return { ...current, paymentStatus: "PAYMENT_CONFIRMED" };
    case "HOST_MARK_PAYMENT_NOT_REQUIRED":
      hostOnly();
      if (
        current.paymentStatus === "PAYMENT_REPORTED" ||
        current.paymentStatus === "PAYMENT_CONFIRMED"
      ) {
        throw new Error("A reported or confirmed payment cannot be marked not required");
      }
      return { ...current, paymentStatus: "NOT_REQUIRED" };
    case "HOST_MARK_DEPOSIT_DUE":
      hostOnly();
      requireDeposit();
      if (current.depositStatus !== "UNTRACKED") {
        throw new Error("Deposit progress has already started");
      }
      return { ...current, depositStatus: "AWAITING_DEPOSIT" };
    case "GUEST_REPORT_DEPOSIT_SENT":
      guestOnly();
      requireDeposit();
      if (current.depositStatus !== "AWAITING_DEPOSIT") {
        throw new Error("The deposit is not awaiting payment");
      }
      return { ...current, depositStatus: "DEPOSIT_REPORTED" };
    case "HOST_CONFIRM_DEPOSIT_RECEIVED":
      hostOnly();
      requireDeposit();
      if (
        current.depositStatus !== "AWAITING_DEPOSIT" &&
        current.depositStatus !== "DEPOSIT_REPORTED"
      ) {
        throw new Error("The deposit cannot be confirmed from its current status");
      }
      return { ...current, depositStatus: "DEPOSIT_CONFIRMED" };
    case "HOST_REPORT_DEPOSIT_RETURNED":
      hostOnly();
      requireSecurityDeposit();
      if (current.depositStatus !== "DEPOSIT_CONFIRMED") {
        throw new Error("Confirm receiving the deposit before reporting its return");
      }
      return { ...current, depositStatus: "RETURN_REPORTED" };
    case "GUEST_CONFIRM_DEPOSIT_RETURNED":
      guestOnly();
      requireSecurityDeposit();
      if (current.depositStatus !== "RETURN_REPORTED") {
        throw new Error("The host has not reported returning the deposit");
      }
      return { ...current, depositStatus: "RETURN_CONFIRMED" };
    case "HOST_MARK_DEPOSIT_RETAINED":
      hostOnly();
      requireSecurityDeposit();
      if (current.depositStatus !== "DEPOSIT_CONFIRMED") {
        throw new Error("Confirm receiving the deposit before marking it retained");
      }
      return { ...current, depositStatus: "RETAINED" };
  }
}

export function isBookingPaymentEvent(value: unknown): value is BookingPaymentEvent {
  return typeof value === "string" && EVENT_SET.has(value);
}

/**
 * Participant-scoped read for the manual status card. These are user reports, never
 * evidence that Linger Homes processed or verified a transaction.
 */
export async function getBookingPaymentProgress(bookingId: string, userId: string) {
  return db.booking.findFirst({
    where: {
      id: bookingId,
      OR: [{ guestId: userId }, { listing: { hostId: userId } }],
    },
    select: {
      id: true,
      status: true,
      acceptedAt: true,
      currency: true,
      totalPrice: true,
      depositAmount: true,
      depositPolicySnapshot: true,
      paymentStatus: true,
      depositStatus: true,
      paymentStatusUpdatedAt: true,
      depositStatusUpdatedAt: true,
      guestId: true,
      listing: { select: { hostId: true } },
      paymentStatusEvents: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          actorId: true,
          eventType: true,
          paymentStatus: true,
          depositStatus: true,
          createdAt: true,
          actor: { select: { id: true, name: true } },
        },
      },
    },
  });
}

/**
 * Appends one actor-labelled status change. The row lock makes the status pair and its
 * event history one ordered stream even if both participants act at the same moment.
 */
export async function recordBookingPaymentEvent(input: {
  bookingId: string;
  actorId: string;
  event: BookingPaymentEvent;
}) {
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${input.bookingId}))`;
    await tx.$queryRaw`SELECT "id" FROM "Booking" WHERE "id" = ${input.bookingId} FOR UPDATE`;

    const booking = await tx.booking.findUnique({
      where: { id: input.bookingId },
      select: {
        id: true,
        guestId: true,
        status: true,
        acceptedAt: true,
        depositAmount: true,
        depositPolicySnapshot: true,
        paymentStatus: true,
        depositStatus: true,
        listing: { select: { hostId: true } },
      },
    });
    if (!booking) throw new Error("Booking not found");

    const actor = actorFor(booking, input.actorId);
    if (!actor) throw new Error("Booking not found");
    if (booking.status !== "CONFIRMED" || !booking.acceptedAt) {
      throw new Error("Payment progress can only be updated for an accepted booking");
    }

    const next = nextStatuses(
      {
        paymentStatus: booking.paymentStatus,
        depositStatus: booking.depositStatus,
      },
      input.event,
      actor,
      Number(booking.depositAmount ?? 0) > 0,
      parseDepositPolicySnapshot(booking.depositPolicySnapshot)?.purpose ===
        "DAMAGE_SECURITY",
    );
    if (
      next.paymentStatus === booking.paymentStatus &&
      next.depositStatus === booking.depositStatus
    ) {
      return { changed: false, ...next };
    }

    const now = new Date();
    await tx.booking.update({
      where: { id: booking.id },
      data: {
        paymentStatus: next.paymentStatus,
        depositStatus: next.depositStatus,
        ...(next.paymentStatus !== booking.paymentStatus
          ? { paymentStatusUpdatedAt: now }
          : {}),
        ...(next.depositStatus !== booking.depositStatus
          ? { depositStatusUpdatedAt: now }
          : {}),
      },
    });
    const event = await tx.bookingPaymentStatusEvent.create({
      data: {
        bookingId: booking.id,
        actorId: input.actorId,
        eventType: input.event,
        paymentStatus: next.paymentStatus,
        depositStatus: next.depositStatus,
      },
    });
    return { changed: true, ...next, eventId: event.id };
  }, { timeout: 10_000 });
}

export type BookingPaymentProgress = Prisma.PromiseReturnType<
  typeof getBookingPaymentProgress
>;
