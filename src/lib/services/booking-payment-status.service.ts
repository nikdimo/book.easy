import "server-only";

import type {
  BookingDepositStatus,
  BookingPaymentStatus,
  Prisma,
} from "@prisma/client";
import { db } from "@/lib/db";
import { parseDepositPoliciesSnapshot } from "@/lib/payments/deposit-policies";

/**
 * Manual, participant-reported payment progress across three independent tracks:
 *
 *   1. the booking price as a whole (`paymentStatus`),
 *   2. the advance payment toward that price (`advancePaymentStatus`),
 *   3. the refundable damage deposit held as security (`damageDepositStatus`).
 *
 * They are separate because they settle at different moments and mean different things.
 * A guest who sends the damage deposit has said nothing about the advance payment, and a
 * host who returns the damage deposit has not refunded any part of the stay.
 *
 * Every value here is one side's own report. None of it asserts that Linger Homes
 * collected, held, processed, verified or refunded anything — it never does.
 */

export const BOOKING_PAYMENT_EVENTS = [
  // The booking price as a whole.
  "HOST_MARK_PAYMENT_DUE",
  "GUEST_REPORT_PAYMENT_SENT",
  "HOST_CONFIRM_PAYMENT_RECEIVED",
  "HOST_MARK_PAYMENT_NOT_REQUIRED",
  // The advance payment, which counts toward that price.
  "HOST_MARK_ADVANCE_PAYMENT_DUE",
  "GUEST_REPORT_ADVANCE_PAYMENT_SENT",
  "HOST_CONFIRM_ADVANCE_PAYMENT_RECEIVED",
  // The refundable damage deposit, which is additional to it.
  "HOST_MARK_DAMAGE_DEPOSIT_DUE",
  "GUEST_REPORT_DAMAGE_DEPOSIT_SENT",
  "HOST_CONFIRM_DAMAGE_DEPOSIT_RECEIVED",
  "HOST_REPORT_DAMAGE_DEPOSIT_RETURNED",
  "GUEST_CONFIRM_DAMAGE_DEPOSIT_RETURNED",
  "HOST_MARK_DAMAGE_DEPOSIT_RETAINED",
] as const;

export type BookingPaymentEvent = (typeof BOOKING_PAYMENT_EVENTS)[number];

/**
 * V1 event names, from when a booking had one deposit of one purpose.
 *
 * Still accepted so a browser tab opened before the deposit split does not fail on its
 * next click, but they carry no track of their own: each resolves to whichever policy
 * this booking actually froze. When a booking has both, the old name cannot say which
 * one the actor meant, and guessing would put a report against the wrong money — so it
 * is refused and the caller is told to reload.
 */
const LEGACY_DEPOSIT_EVENTS = {
  HOST_MARK_DEPOSIT_DUE: {
    advance: "HOST_MARK_ADVANCE_PAYMENT_DUE",
    damage: "HOST_MARK_DAMAGE_DEPOSIT_DUE",
  },
  GUEST_REPORT_DEPOSIT_SENT: {
    advance: "GUEST_REPORT_ADVANCE_PAYMENT_SENT",
    damage: "GUEST_REPORT_DAMAGE_DEPOSIT_SENT",
  },
  HOST_CONFIRM_DEPOSIT_RECEIVED: {
    advance: "HOST_CONFIRM_ADVANCE_PAYMENT_RECEIVED",
    damage: "HOST_CONFIRM_DAMAGE_DEPOSIT_RECEIVED",
  },
  HOST_REPORT_DEPOSIT_RETURNED: {
    advance: null,
    damage: "HOST_REPORT_DAMAGE_DEPOSIT_RETURNED",
  },
  GUEST_CONFIRM_DEPOSIT_RETURNED: {
    advance: null,
    damage: "GUEST_CONFIRM_DAMAGE_DEPOSIT_RETURNED",
  },
  HOST_MARK_DEPOSIT_RETAINED: {
    advance: null,
    damage: "HOST_MARK_DAMAGE_DEPOSIT_RETAINED",
  },
} as const satisfies Record<
  string,
  { advance: BookingPaymentEvent | null; damage: BookingPaymentEvent | null }
>;

export type LegacyBookingDepositEvent = keyof typeof LEGACY_DEPOSIT_EVENTS;

const EVENT_SET = new Set<string>(BOOKING_PAYMENT_EVENTS);
const LEGACY_EVENT_SET = new Set<string>(Object.keys(LEGACY_DEPOSIT_EVENTS));

type BookingPaymentActor = "HOST" | "GUEST";

/** Which policies this booking froze. Read from the snapshot, never from the listing. */
interface RequiredPolicies {
  advancePayment: boolean;
  damageDeposit: boolean;
}

interface StatusTriple {
  paymentStatus: BookingPaymentStatus;
  advancePaymentStatus: BookingPaymentStatus;
  damageDepositStatus: BookingDepositStatus;
}

function actorFor(
  booking: { guestId: string; listing: { hostId: string } },
  actorId: string,
): BookingPaymentActor | null {
  if (booking.listing.hostId === actorId) return "HOST";
  if (booking.guestId === actorId) return "GUEST";
  return null;
}

/**
 * What this booking actually asked for.
 *
 * The frozen snapshot is the authority; the amount columns are a fallback for rows whose
 * snapshot predates or fails validation, so an old booking that was visibly tracking a
 * deposit does not silently lose its controls.
 */
export function requiredPoliciesFor(booking: {
  depositPolicySnapshot: unknown;
  advancePaymentAmount: Prisma.Decimal | null;
  damageDepositAmount: Prisma.Decimal | null;
}): RequiredPolicies {
  const policies = parseDepositPoliciesSnapshot(booking.depositPolicySnapshot);
  return {
    advancePayment:
      policies?.advancePayment != null ||
      Number(booking.advancePaymentAmount ?? 0) > 0,
    damageDeposit:
      policies?.damageDeposit != null ||
      Number(booking.damageDepositAmount ?? 0) > 0,
  };
}

/**
 * Resolves a V1 deposit event onto the track this booking actually has.
 * Returns null when the name is not a legacy one.
 */
export function resolveLegacyDepositEvent(
  event: string,
  required: RequiredPolicies,
): BookingPaymentEvent {
  const mapping = LEGACY_DEPOSIT_EVENTS[event as LegacyBookingDepositEvent];
  if (required.advancePayment && required.damageDeposit) {
    throw new Error(
      "This booking has both an advance payment and a damage deposit. Reload the page and choose which one to update.",
    );
  }
  if (required.damageDeposit && mapping.damage) return mapping.damage;
  if (required.advancePayment && mapping.advance) return mapping.advance;
  if (required.advancePayment && !mapping.advance) {
    throw new Error("Only a damage deposit can be returned or retained");
  }
  throw new Error("This booking does not require a deposit");
}

function nextStatuses(
  current: StatusTriple,
  event: BookingPaymentEvent,
  actor: BookingPaymentActor,
  required: RequiredPolicies,
): StatusTriple {
  const hostOnly = () => {
    if (actor !== "HOST") throw new Error("Only the host can record that update");
  };
  const guestOnly = () => {
    if (actor !== "GUEST") throw new Error("Only the guest can record that update");
  };
  const requireAdvance = () => {
    if (!required.advancePayment) {
      throw new Error("This booking does not require an advance payment");
    }
  };
  const requireDamage = () => {
    if (!required.damageDeposit) {
      throw new Error("This booking does not require a damage deposit");
    }
  };

  switch (event) {
    // ---- The booking price as a whole -------------------------------------------
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

    // ---- The advance payment toward that price -----------------------------------
    case "HOST_MARK_ADVANCE_PAYMENT_DUE":
      hostOnly();
      requireAdvance();
      if (current.advancePaymentStatus !== "UNTRACKED") {
        throw new Error("Advance payment progress has already started");
      }
      return { ...current, advancePaymentStatus: "AWAITING_PAYMENT" };
    case "GUEST_REPORT_ADVANCE_PAYMENT_SENT":
      guestOnly();
      requireAdvance();
      if (current.advancePaymentStatus === "NOT_REQUIRED") {
        throw new Error("The advance payment is marked as not required");
      }
      if (current.advancePaymentStatus === "PAYMENT_CONFIRMED") {
        throw new Error("The advance payment has already been confirmed");
      }
      return { ...current, advancePaymentStatus: "PAYMENT_REPORTED" };
    case "HOST_CONFIRM_ADVANCE_PAYMENT_RECEIVED":
      hostOnly();
      requireAdvance();
      if (current.advancePaymentStatus === "NOT_REQUIRED") {
        throw new Error("The advance payment is marked as not required");
      }
      if (current.advancePaymentStatus === "PAYMENT_CONFIRMED") {
        throw new Error("The advance payment has already been confirmed");
      }
      return { ...current, advancePaymentStatus: "PAYMENT_CONFIRMED" };

    // ---- The refundable damage deposit -------------------------------------------
    case "HOST_MARK_DAMAGE_DEPOSIT_DUE":
      hostOnly();
      requireDamage();
      if (current.damageDepositStatus !== "UNTRACKED") {
        throw new Error("Damage deposit progress has already started");
      }
      return { ...current, damageDepositStatus: "AWAITING_DEPOSIT" };
    case "GUEST_REPORT_DAMAGE_DEPOSIT_SENT":
      guestOnly();
      requireDamage();
      if (
        current.damageDepositStatus !== "UNTRACKED" &&
        current.damageDepositStatus !== "AWAITING_DEPOSIT"
      ) {
        throw new Error("The damage deposit is not awaiting payment");
      }
      return { ...current, damageDepositStatus: "DEPOSIT_REPORTED" };
    case "HOST_CONFIRM_DAMAGE_DEPOSIT_RECEIVED":
      hostOnly();
      requireDamage();
      if (
        current.damageDepositStatus !== "UNTRACKED" &&
        current.damageDepositStatus !== "AWAITING_DEPOSIT" &&
        current.damageDepositStatus !== "DEPOSIT_REPORTED"
      ) {
        throw new Error("The damage deposit cannot be confirmed from its current status");
      }
      return { ...current, damageDepositStatus: "DEPOSIT_CONFIRMED" };
    case "HOST_REPORT_DAMAGE_DEPOSIT_RETURNED":
      hostOnly();
      requireDamage();
      if (current.damageDepositStatus !== "DEPOSIT_CONFIRMED") {
        throw new Error("Confirm receiving the damage deposit before reporting its return");
      }
      return { ...current, damageDepositStatus: "RETURN_REPORTED" };
    case "GUEST_CONFIRM_DAMAGE_DEPOSIT_RETURNED":
      guestOnly();
      requireDamage();
      if (current.damageDepositStatus !== "RETURN_REPORTED") {
        throw new Error("The host has not reported returning the damage deposit");
      }
      return { ...current, damageDepositStatus: "RETURN_CONFIRMED" };
    case "HOST_MARK_DAMAGE_DEPOSIT_RETAINED":
      hostOnly();
      requireDamage();
      if (current.damageDepositStatus !== "DEPOSIT_CONFIRMED") {
        throw new Error("Confirm receiving the damage deposit before marking it retained");
      }
      return { ...current, damageDepositStatus: "RETAINED" };
  }
}

export function isBookingPaymentEvent(value: unknown): value is BookingPaymentEvent {
  return typeof value === "string" && EVENT_SET.has(value);
}

/** Whether this is a V1 deposit event name that still needs resolving onto a track. */
export function isLegacyBookingDepositEvent(
  value: unknown,
): value is LegacyBookingDepositEvent {
  return typeof value === "string" && LEGACY_EVENT_SET.has(value);
}

/** The advance track in the deposit vocabulary the deprecated audit column speaks. */
function advanceStatusAsDepositStatus(
  status: BookingPaymentStatus,
): BookingDepositStatus {
  switch (status) {
    case "AWAITING_PAYMENT":
      return "AWAITING_DEPOSIT";
    case "PAYMENT_REPORTED":
      return "DEPOSIT_REPORTED";
    case "PAYMENT_CONFIRMED":
      return "DEPOSIT_CONFIRMED";
    case "NOT_REQUIRED":
      return "NOT_REQUIRED";
    case "UNTRACKED":
      return "UNTRACKED";
  }
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
      checkIn: true,
      acceptedAt: true,
      currency: true,
      totalPrice: true,
      depositPolicySnapshot: true,
      advancePaymentAmount: true,
      damageDepositAmount: true,
      paymentStatus: true,
      paymentInstructionsStatus: true,
      selectedPaymentMethod: true,
      advancePaymentStatus: true,
      damageDepositStatus: true,
      paymentStatusUpdatedAt: true,
      advancePaymentStatusUpdatedAt: true,
      damageDepositStatusUpdatedAt: true,
      guestId: true,
      listing: { select: { hostId: true } },
      paymentStatusEvents: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          actorId: true,
          eventType: true,
          paymentStatus: true,
          advancePaymentStatus: true,
          damageDepositStatus: true,
          createdAt: true,
          actor: { select: { id: true, name: true } },
        },
      },
    },
  });
}

/**
 * Appends one actor-labelled status change. The row lock makes the three status tracks
 * and their event history one ordered stream even if both participants act at the same
 * moment.
 */
export async function recordBookingPaymentEvent(input: {
  bookingId: string;
  actorId: string;
  event: BookingPaymentEvent | LegacyBookingDepositEvent;
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
        depositPolicySnapshot: true,
        depositStatus: true,
        advancePaymentAmount: true,
        damageDepositAmount: true,
        paymentStatus: true,
        advancePaymentStatus: true,
        damageDepositStatus: true,
        listing: { select: { hostId: true } },
      },
    });
    if (!booking) throw new Error("Booking not found");

    const actor = actorFor(booking, input.actorId);
    if (!actor) throw new Error("Booking not found");
    if (booking.status !== "CONFIRMED" || !booking.acceptedAt) {
      throw new Error("Payment progress can only be updated for an accepted booking");
    }

    const required = requiredPoliciesFor(booking);
    const event = isLegacyBookingDepositEvent(input.event)
      ? resolveLegacyDepositEvent(input.event, required)
      : input.event;

    const current: StatusTriple = {
      paymentStatus: booking.paymentStatus,
      advancePaymentStatus: booking.advancePaymentStatus,
      damageDepositStatus: booking.damageDepositStatus,
    };
    const next = nextStatuses(current, event, actor, required);
    if (
      next.paymentStatus === current.paymentStatus &&
      next.advancePaymentStatus === current.advancePaymentStatus &&
      next.damageDepositStatus === current.damageDepositStatus
    ) {
      return { changed: false, ...next };
    }

    const now = new Date();
    await tx.booking.update({
      where: { id: booking.id },
      data: {
        paymentStatus: next.paymentStatus,
        advancePaymentStatus: next.advancePaymentStatus,
        damageDepositStatus: next.damageDepositStatus,
        ...(next.paymentStatus !== current.paymentStatus
          ? { paymentStatusUpdatedAt: now }
          : {}),
        ...(next.advancePaymentStatus !== current.advancePaymentStatus
          ? { advancePaymentStatusUpdatedAt: now }
          : {}),
        ...(next.damageDepositStatus !== current.damageDepositStatus
          ? { damageDepositStatusUpdatedAt: now }
          : {}),
      },
    });
    const recorded = await tx.bookingPaymentStatusEvent.create({
      data: {
        bookingId: booking.id,
        actorId: input.actorId,
        // Always the resolved name, so the audit trail says which money moved even when
        // a stale client sent the ambiguous V1 name.
        eventType: event,
        paymentStatus: next.paymentStatus,
        advancePaymentStatus: next.advancePaymentStatus,
        damageDepositStatus: next.damageDepositStatus,
        // The deprecated shared column stays non-null and legible: it follows the damage
        // deposit when there is one, otherwise the advance payment translated into its
        // vocabulary. Readers should prefer the two columns above.
        depositStatus: required.damageDeposit
          ? next.damageDepositStatus
          : required.advancePayment
            ? advanceStatusAsDepositStatus(next.advancePaymentStatus)
            : booking.depositStatus,
      },
    });
    return { changed: true, ...next, eventId: recorded.id };
  }, { timeout: 10_000 });
}

export type BookingPaymentProgress = Prisma.PromiseReturnType<
  typeof getBookingPaymentProgress
>;
