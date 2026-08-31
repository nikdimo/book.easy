import "server-only";

import type {
  BookingDepositStatus,
  BookingPaymentStatus,
  BookingRefundStatus,
  Prisma,
} from "@prisma/client";
import { db } from "@/lib/db";
import { parseDepositPoliciesSnapshot } from "@/lib/payments/deposit-policies";
import { isValidYmd, todayYmd } from "@/lib/utils/date-only";

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
  // Cancellation-created accommodation refund obligation.
  "HOST_REPORT_ACCOMMODATION_REFUND_SENT",
  "GUEST_CONFIRM_ACCOMMODATION_REFUND_RECEIVED",
] as const;

export type BookingPaymentEvent = (typeof BOOKING_PAYMENT_EVENTS)[number];

export interface BookingPaymentPrivateRecordInput {
  amount: number;
  transactionDate: string;
  reference?: string | null;
  note?: string | null;
  retainedReason?: string | null;
}

const PRIVATE_REPORT_TRACK = {
  GUEST_REPORT_PAYMENT_SENT: "ACCOMMODATION_BALANCE",
  GUEST_REPORT_ADVANCE_PAYMENT_SENT: "ADVANCE_PAYMENT",
  GUEST_REPORT_DAMAGE_DEPOSIT_SENT: "DAMAGE_DEPOSIT",
  HOST_REPORT_DAMAGE_DEPOSIT_RETURNED: "DAMAGE_DEPOSIT_RETURN",
  HOST_MARK_DAMAGE_DEPOSIT_RETAINED: "DAMAGE_DEPOSIT_RETENTION",
  HOST_REPORT_ACCOMMODATION_REFUND_SENT: "ACCOMMODATION_REFUND",
} as const;

export function paymentEventNeedsPrivateRecord(event: BookingPaymentEvent) {
  return event in PRIVATE_REPORT_TRACK;
}

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
  accommodationRefundStatus: BookingRefundStatus;
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

/**
 * Where a booking is in its own life, as far as money is concerned.
 *
 * `ACCEPTED` is a confirmed booking whose stay has not been completed yet; `COMPLETED`
 * is one whose checkout has passed and which `completePastBookings` has since flipped.
 * They are separate because parts of this machine only make sense on one side of
 * checkout: a host opens collection *before* the stay, while the damage deposit is
 * returned *after* it, and cash handed over at the property is routinely reported once
 * the booking has already completed.
 */
export type BookingPhase = "ACCEPTED" | "COMPLETED" | "CANCELLED";

/** Everything that survives checkout. */
const ANY_PHASE = ["ACCEPTED", "COMPLETED"] as const satisfies readonly BookingPhase[];
const REFUND_PHASES = ["CANCELLED"] as const satisfies readonly BookingPhase[];
const RETURN_PHASES = ["ACCEPTED", "COMPLETED", "CANCELLED"] as const satisfies readonly BookingPhase[];
/**
 * Only while the stay is still ahead. Reserved for the events that *open* a track:
 * announcing that money is due once the guest has already left reopens collection on a
 * finished stay, which is not something either side can act on.
 */
const BEFORE_COMPLETION = ["ACCEPTED"] as const satisfies readonly BookingPhase[];

type TrackKey = keyof StatusTriple;

interface TransitionBase {
  track: TrackKey;
  actor: BookingPaymentActor;
  /** The policy this booking must have frozen, for the events that need one. */
  requires: keyof RequiredPolicies | null;
  phases: readonly BookingPhase[];
  /** Refusal when the current status is not one this event may start from. */
  blocked: string;
  /**
   * Refusals that name the current status, consulted before `blocked` so a participant
   * is told *why* rather than just that it did not work.
   */
  reasons?: Readonly<Record<string, string>>;
  /**
   * A second track this event settles as a consequence of its own. Only ever used to
   * close a track that is still open — never to overwrite what a participant already
   * reported or confirmed.
   */
  cascade?: (current: StatusTriple) => Partial<StatusTriple>;
}

/**
 * One event, one move.
 *
 * `from` is exhaustive: every status this event may be applied from, and nothing else.
 * Whether `to` itself appears in `from` is the whole of the repeat rule — see below.
 */
type PaymentTransition = TransitionBase &
  (
    | {
        track: "paymentStatus" | "advancePaymentStatus";
        from: readonly BookingPaymentStatus[];
        to: BookingPaymentStatus;
      }
    | {
        track: "damageDepositStatus";
        from: readonly BookingDepositStatus[];
        to: BookingDepositStatus;
      }
    | {
        track: "accommodationRefundStatus";
        from: readonly BookingRefundStatus[];
        to: BookingRefundStatus;
      }
  );

/**
 * The state machine, written once for all three tracks.
 *
 * It used to be thirteen hand-written `switch` arms, half guarding with blacklists
 * (`!== NOT_REQUIRED && !== PAYMENT_CONFIRMED`) and half with whitelists
 * (`=== UNTRACKED || === AWAITING_DEPOSIT`). Same intent, opposite shape, and the two
 * shapes disagreed: a guest could restate an advance payment they had already reported
 * but could not restate a damage deposit. Nothing in the product justifies the
 * difference, so all three tracks now follow one rule of three:
 *
 *   - **due** — opens a track. Only from `UNTRACKED`, and only before completion.
 *   - **report** — one side's own claim. Allowed from every open status up to and
 *     including the reported one, so repeating it is a deliberate no-op: a guest saying
 *     they sent the money twice has said one thing twice, not something new.
 *   - **confirm / retain** — the other side settling. Allowed from every status at or
 *     before the matching report, but never from its own result: once a settlement is on
 *     the record, a repeat means the actor is looking at a stale page and should be told.
 *
 * Nothing here asserts money moved. Each entry moves one participant's report from one
 * value to another.
 */
const TRANSITIONS = {
  // ---- The booking price as a whole -------------------------------------------
  HOST_MARK_PAYMENT_DUE: {
    track: "paymentStatus",
    actor: "HOST",
    requires: null,
    phases: BEFORE_COMPLETION,
    from: ["UNTRACKED"],
    to: "AWAITING_PAYMENT",
    blocked: "Payment progress has already started",
  },
  GUEST_REPORT_PAYMENT_SENT: {
    track: "paymentStatus",
    actor: "GUEST",
    requires: null,
    // Cash at the property changes hands at check-in or checkout, so this report
    // routinely arrives after the booking itself has completed.
    phases: ANY_PHASE,
    from: ["UNTRACKED", "AWAITING_PAYMENT", "PAYMENT_REPORTED"],
    to: "PAYMENT_REPORTED",
    blocked: "Payment cannot be reported from its current status",
    reasons: {
      NOT_REQUIRED: "Payment is marked as not required",
      PAYMENT_CONFIRMED: "Payment has already been confirmed",
    },
  },
  HOST_CONFIRM_PAYMENT_RECEIVED: {
    track: "paymentStatus",
    actor: "HOST",
    requires: null,
    // The counterpart of the report above: the host confirms the cash they were handed.
    phases: ANY_PHASE,
    from: ["UNTRACKED", "AWAITING_PAYMENT", "PAYMENT_REPORTED"],
    to: "PAYMENT_CONFIRMED",
    blocked: "Payment cannot be confirmed from its current status",
    reasons: {
      NOT_REQUIRED: "Payment is marked as not required",
      PAYMENT_CONFIRMED: "Payment has already been confirmed",
    },
  },
  HOST_MARK_PAYMENT_NOT_REQUIRED: {
    track: "paymentStatus",
    actor: "HOST",
    requires: null,
    // Waiving closes a track rather than opening one, so it stays available to a host
    // settling up after the stay.
    phases: ANY_PHASE,
    from: ["UNTRACKED", "AWAITING_PAYMENT", "NOT_REQUIRED"],
    to: "NOT_REQUIRED",
    blocked: "A reported or confirmed payment cannot be marked not required",
    // The advance payment is documented as *part of* `totalPrice`. Waiving the price
    // while leaving the advance `AWAITING_PAYMENT` asked the guest to send money toward
    // a price the host had just given up on. Settle it in the same move — but only where
    // it is still open, because a guest who already reported sending the advance, or a
    // host who already confirmed receiving it, said something this event does not unsay.
    cascade: (current) =>
      current.advancePaymentStatus === "UNTRACKED" ||
      current.advancePaymentStatus === "AWAITING_PAYMENT"
        ? { advancePaymentStatus: "NOT_REQUIRED" }
        : {},
  },

  // ---- The advance payment toward that price -----------------------------------
  HOST_MARK_ADVANCE_PAYMENT_DUE: {
    track: "advancePaymentStatus",
    actor: "HOST",
    requires: "advancePayment",
    phases: BEFORE_COMPLETION,
    from: ["UNTRACKED"],
    to: "AWAITING_PAYMENT",
    blocked: "Advance payment progress has already started",
  },
  GUEST_REPORT_ADVANCE_PAYMENT_SENT: {
    track: "advancePaymentStatus",
    actor: "GUEST",
    requires: "advancePayment",
    // An advance sent late is still worth recording: it is the guest's own account of
    // money that moved, and a booking that completes should not freeze it out.
    phases: ANY_PHASE,
    from: ["UNTRACKED", "AWAITING_PAYMENT", "PAYMENT_REPORTED"],
    to: "PAYMENT_REPORTED",
    blocked: "The advance payment cannot be reported from its current status",
    reasons: {
      NOT_REQUIRED: "The advance payment is marked as not required",
      PAYMENT_CONFIRMED: "The advance payment has already been confirmed",
    },
  },
  HOST_CONFIRM_ADVANCE_PAYMENT_RECEIVED: {
    track: "advancePaymentStatus",
    actor: "HOST",
    requires: "advancePayment",
    phases: ANY_PHASE,
    from: ["UNTRACKED", "AWAITING_PAYMENT", "PAYMENT_REPORTED"],
    to: "PAYMENT_CONFIRMED",
    blocked: "The advance payment cannot be confirmed from its current status",
    reasons: {
      NOT_REQUIRED: "The advance payment is marked as not required",
      PAYMENT_CONFIRMED: "The advance payment has already been confirmed",
    },
  },

  // ---- The refundable damage deposit -------------------------------------------
  HOST_MARK_DAMAGE_DEPOSIT_DUE: {
    track: "damageDepositStatus",
    actor: "HOST",
    requires: "damageDeposit",
    phases: BEFORE_COMPLETION,
    from: ["UNTRACKED"],
    to: "AWAITING_DEPOSIT",
    blocked: "Damage deposit progress has already started",
  },
  GUEST_REPORT_DAMAGE_DEPOSIT_SENT: {
    track: "damageDepositStatus",
    actor: "GUEST",
    requires: "damageDeposit",
    phases: ANY_PHASE,
    // `DEPOSIT_REPORTED` is in this list where it never used to be: restating a report
    // is the same no-op here as it already was on the advance track.
    from: ["UNTRACKED", "AWAITING_DEPOSIT", "DEPOSIT_REPORTED"],
    to: "DEPOSIT_REPORTED",
    blocked: "The damage deposit is not awaiting payment",
    reasons: {
      NOT_REQUIRED: "The damage deposit is marked as not required",
      DEPOSIT_CONFIRMED: "The damage deposit has already been confirmed",
    },
  },
  HOST_CONFIRM_DAMAGE_DEPOSIT_RECEIVED: {
    track: "damageDepositStatus",
    actor: "HOST",
    requires: "damageDeposit",
    phases: ANY_PHASE,
    from: ["UNTRACKED", "AWAITING_DEPOSIT", "DEPOSIT_REPORTED"],
    to: "DEPOSIT_CONFIRMED",
    blocked: "The damage deposit cannot be confirmed from its current status",
    reasons: {
      NOT_REQUIRED: "The damage deposit is marked as not required",
      DEPOSIT_CONFIRMED: "The damage deposit has already been confirmed",
    },
  },
  HOST_REPORT_DAMAGE_DEPOSIT_RETURNED: {
    track: "damageDepositStatus",
    actor: "HOST",
    requires: "damageDeposit",
    // The leg of the deposit lifecycle that is normally post-checkout:
    // `DamageDepositPolicy.returnDaysAfterCheckout` exists so a host can promise
    // "returned within 7 days after checkout", and the guest is shown that promise.
    phases: RETURN_PHASES,
    // A cancelled booking may have a guest report that arrived just before the
    // cancellation and never received a separate host confirmation. Reporting the
    // return is itself a stronger acknowledgement that the host received the money.
    from: ["DEPOSIT_REPORTED", "DEPOSIT_CONFIRMED", "RETURN_REPORTED"],
    to: "RETURN_REPORTED",
    blocked: "Confirm receiving the damage deposit before reporting its return",
    reasons: {
      RETURN_CONFIRMED: "The guest has already confirmed the damage deposit came back",
      RETAINED: "The damage deposit is marked as retained",
    },
  },
  GUEST_CONFIRM_DAMAGE_DEPOSIT_RETURNED: {
    track: "damageDepositStatus",
    actor: "GUEST",
    requires: "damageDeposit",
    phases: RETURN_PHASES,
    from: ["RETURN_REPORTED"],
    to: "RETURN_CONFIRMED",
    blocked: "The host has not reported returning the damage deposit",
    reasons: {
      RETURN_CONFIRMED: "The damage deposit return has already been confirmed",
    },
  },
  HOST_MARK_DAMAGE_DEPOSIT_RETAINED: {
    track: "damageDepositStatus",
    actor: "HOST",
    requires: "damageDeposit",
    phases: ANY_PHASE,
    from: ["DEPOSIT_CONFIRMED"],
    to: "RETAINED",
    blocked: "Confirm receiving the damage deposit before marking it retained",
    reasons: {
      RETAINED: "The damage deposit is already marked as retained",
      RETURN_CONFIRMED: "The damage deposit has already been returned to the guest",
    },
  },
  HOST_REPORT_ACCOMMODATION_REFUND_SENT: {
    track: "accommodationRefundStatus",
    actor: "HOST",
    requires: null,
    phases: REFUND_PHASES,
    from: ["AWAITING_REFUND", "REFUND_REPORTED"],
    to: "REFUND_REPORTED",
    blocked: "There is no accommodation refund awaiting the host",
    reasons: {
      NOT_REQUIRED: "This cancellation does not require an accommodation refund",
      REFUND_CONFIRMED: "The guest has already confirmed the refund",
    },
  },
  GUEST_CONFIRM_ACCOMMODATION_REFUND_RECEIVED: {
    track: "accommodationRefundStatus",
    actor: "GUEST",
    requires: null,
    phases: REFUND_PHASES,
    from: ["REFUND_REPORTED"],
    to: "REFUND_CONFIRMED",
    blocked: "The host has not reported sending the accommodation refund",
    reasons: {
      REFUND_CONFIRMED: "The accommodation refund has already been confirmed",
      NOT_REQUIRED: "This cancellation does not require an accommodation refund",
    },
  },
} as const satisfies Record<BookingPaymentEvent, PaymentTransition>;

/**
 * The phase this booking is in, or null when payment progress has no business moving at
 * all — a request nobody has accepted yet, or a booking that was rejected, expired or
 * cancelled.
 */
export function bookingPaymentPhase(booking: {
  status: string;
  acceptedAt: Date | null;
}): BookingPhase | null {
  if (!booking.acceptedAt) return null;
  if (booking.status === "CONFIRMED") return "ACCEPTED";
  // A completed stay still has money to settle: cash handed over at the property, and
  // the whole damage-deposit return leg, which by definition happens after checkout.
  if (booking.status === "COMPLETED") return "COMPLETED";
  if (booking.status.startsWith("CANCELLED_BY_")) return "CANCELLED";
  return null;
}

/**
 * The only accepted-booking initializer for the three settlement tracks.
 * `confirmBooking` calls this pure helper inside its existing transaction, preserving
 * atomic acceptance without opening a second transaction or hand-writing statuses.
 */
export function paymentStateAfterAcceptance(input: {
  paymentStatus: BookingPaymentStatus;
  advancePaymentStatus: BookingPaymentStatus;
  damageDepositStatus: BookingDepositStatus;
  advancePaymentAmount: Prisma.Decimal | number | string | null;
  damageDepositAmount: Prisma.Decimal | number | string | null;
  advanceDueAfterAcceptance: boolean;
  damageDueAfterAcceptance: boolean;
}) {
  const paymentStatus: BookingPaymentStatus =
    input.paymentStatus === "NOT_REQUIRED" ? "NOT_REQUIRED" : "AWAITING_PAYMENT";
  const advancePaymentStatus: BookingPaymentStatus =
    Number(input.advancePaymentAmount ?? 0) <= 0 ||
    input.advancePaymentStatus === "NOT_REQUIRED"
      ? "NOT_REQUIRED"
      : input.advanceDueAfterAcceptance
        ? "AWAITING_PAYMENT"
        : "UNTRACKED";
  const damageDepositStatus: BookingDepositStatus =
    Number(input.damageDepositAmount ?? 0) <= 0 ||
    input.damageDepositStatus === "NOT_REQUIRED"
      ? "NOT_REQUIRED"
      : input.damageDueAfterAcceptance
        ? "AWAITING_DEPOSIT"
        : "UNTRACKED";
  return { paymentStatus, advancePaymentStatus, damageDepositStatus };
}

/** Opens only obligations; cancellation never claims that money moved. */
export function paymentStateAfterCancellation(input: {
  accommodationRefundAmount: number;
  accommodationRefundStatus: BookingRefundStatus;
}) {
  return {
    accommodationRefundStatus:
      input.accommodationRefundAmount > 0 &&
      input.accommodationRefundStatus !== "REFUND_CONFIRMED"
        ? ("AWAITING_REFUND" as const)
        : input.accommodationRefundStatus,
  };
}

/** Whether this phase allows the event at all, before the track's own state is read. */
export function isEventAllowedInPhase(
  event: BookingPaymentEvent,
  phase: BookingPhase,
): boolean {
  return (TRANSITIONS[event].phases as readonly BookingPhase[]).includes(phase);
}

function nextStatuses(
  current: StatusTriple,
  event: BookingPaymentEvent,
  actor: BookingPaymentActor,
  required: RequiredPolicies,
  phase: BookingPhase,
): StatusTriple {
  const transition: PaymentTransition = TRANSITIONS[event];

  if (transition.actor !== actor) {
    throw new Error(
      transition.actor === "HOST"
        ? "Only the host can record that update"
        : "Only the guest can record that update",
    );
  }
  if (transition.requires && !required[transition.requires]) {
    throw new Error(
      transition.requires === "advancePayment"
        ? "This booking does not require an advance payment"
        : "This booking does not require a damage deposit",
    );
  }
  if (!isEventAllowedInPhase(event, phase)) {
    if (phase === "CANCELLED") {
      throw new Error("Payment progress can only be updated for an accepted booking");
    }
    throw new Error(
      "This booking is already completed, so payment collection can no longer be opened",
    );
  }

  const from: readonly string[] = transition.from;
  const status = current[transition.track];
  if (
    event === "HOST_REPORT_DAMAGE_DEPOSIT_RETURNED" &&
    phase !== "CANCELLED" &&
    status === "DEPOSIT_REPORTED"
  ) {
    throw new Error("Confirm receiving the damage deposit before reporting its return");
  }
  if (!from.includes(status)) {
    throw new Error(transition.reasons?.[status] ?? transition.blocked);
  }

  // Split by track so each `to` keeps its own enum type rather than widening to string.
  const moved: StatusTriple =
    transition.track === "accommodationRefundStatus"
      ? { ...current, accommodationRefundStatus: transition.to }
      : transition.track === "damageDepositStatus"
      ? { ...current, damageDepositStatus: transition.to }
      : transition.track === "advancePaymentStatus"
        ? { ...current, advancePaymentStatus: transition.to }
        : { ...current, paymentStatus: transition.to };

  return transition.cascade ? { ...moved, ...transition.cascade(current) } : moved;
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
 * Participant-scoped read for the manual status card. These are user reports,
 * never evidence that Linger Homes processed or verified a transaction.
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
      reference: true,
      checkIn: true,
      acceptedAt: true,
      currency: true,
      totalPrice: true,
      depositPolicySnapshot: true,
      cancellationPolicySnapshot: true,
      cancellationSettlementSnapshot: true,
      advancePaymentAmount: true,
      damageDepositAmount: true,
      paymentStatus: true,
      paymentInstructionsStatus: true,
      paymentInstructionsDueAt: true,
      // The structured details this booking was sent. Owned by both participants: the
      // guest needs them to pay, and they are the host's own data. Never the listing's
      // reusable templates, which stay host-only.
      paymentInstructionsSnapshot: true,
      selectedPaymentMethod: true,
      advancePaymentStatus: true,
      damageDepositStatus: true,
      accommodationRefundStatus: true,
      accommodationRefundAmount: true,
      paymentStatusUpdatedAt: true,
      advancePaymentStatusUpdatedAt: true,
      damageDepositStatusUpdatedAt: true,
      guestId: true,
      listing: { select: { hostId: true } },
      paymentRequests: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          type: true,
          amount: true,
          currency: true,
          dueAt: true,
          status: true,
          method: true,
          otherLabel: true,
          instructionsSnapshot: true,
          reviewedAt: true,
          sentAt: true,
          reminders: {
            orderBy: { sentAt: "desc" },
            select: { kind: true, sentAt: true, recipientId: true },
          },
        },
      },
      paymentPrivateRecords: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          track: true,
          reporterId: true,
          amount: true,
          currency: true,
          transactionDate: true,
          reference: true,
          note: true,
          retainedReason: true,
          createdAt: true,
        },
      },
      paymentStatusEvents: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          actorId: true,
          eventType: true,
          paymentStatus: true,
          advancePaymentStatus: true,
          damageDepositStatus: true,
          accommodationRefundStatus: true,
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
  privateRecord?: BookingPaymentPrivateRecordInput;
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
        accommodationRefundStatus: true,
        accommodationRefundAmount: true,
        currency: true,
        totalPrice: true,
        listing: { select: { hostId: true } },
        paymentRequests: {
          select: { id: true, type: true, amount: true, status: true },
        },
      },
    });
    if (!booking) throw new Error("Booking not found");

    const actor = actorFor(booking, input.actorId);
    if (!actor) throw new Error("Booking not found");
    // A completed stay is still a live payment surface: the deposit return leg only
    // happens after checkout, and cash taken at the property is often confirmed then
    // too. Which events each phase allows is the transition table's business, not this
    // guard's — all it settles is whether the booking is one either side can act on.
    const phase = bookingPaymentPhase(booking);
    if (!phase) {
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
      accommodationRefundStatus: booking.accommodationRefundStatus,
    };
    // Authorisation, booking phase, required policy, and current state are checked
    // before form data. Invalid business transitions should not be disguised as a
    // transaction-form error merely because an untrusted caller supplied bad fields.
    const next = nextStatuses(current, event, actor, required, phase);

    // Amount and transaction date are part of the business record for every report.
    // Enforce that invariant here, at the authoritative service boundary, rather than
    // relying on one web action to supply it. Mobile clients, tests, jobs, or a future
    // caller must not be able to create a report event with no matching private row.
    if (paymentEventNeedsPrivateRecord(event) && !input.privateRecord) {
      throw new Error("Add the transaction amount and date");
    }

    let privateData:
      | {
          track: (typeof PRIVATE_REPORT_TRACK)[keyof typeof PRIVATE_REPORT_TRACK];
          requestId: string | null;
          amount: number;
          transactionDate: Date;
          reference: string | null;
          note: string | null;
          retainedReason: string | null;
        }
      | null = null;
    if (input.privateRecord) {
      const track = PRIVATE_REPORT_TRACK[event as keyof typeof PRIVATE_REPORT_TRACK];
      if (!track) throw new Error("This payment update does not take transaction details");
      const amount = Number(input.privateRecord.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        throw new Error("Enter a transaction amount greater than zero");
      }
      if (
        !isValidYmd(input.privateRecord.transactionDate) ||
        input.privateRecord.transactionDate > todayYmd()
      ) {
        throw new Error("Choose a valid transaction date that is not in the future");
      }
      const requestType =
        track === "ADVANCE_PAYMENT" ||
        track === "ACCOMMODATION_BALANCE" ||
        track === "DAMAGE_DEPOSIT"
          ? track
          : track === "DAMAGE_DEPOSIT_RETURN" || track === "DAMAGE_DEPOSIT_RETENTION"
            ? "DAMAGE_DEPOSIT"
            : null;
      const request = requestType
        ? booking.paymentRequests.find((candidate) => candidate.type === requestType) ?? null
        : null;
      const expected =
        track === "ACCOMMODATION_REFUND"
          ? Number(booking.accommodationRefundAmount ?? 0)
          : request
            ? Number(request.amount)
            : track === "ADVANCE_PAYMENT"
              ? Number(booking.advancePaymentAmount ?? 0)
              : track === "DAMAGE_DEPOSIT" ||
                  track === "DAMAGE_DEPOSIT_RETURN" ||
                  track === "DAMAGE_DEPOSIT_RETENTION"
                ? Number(booking.damageDepositAmount ?? 0)
                : Math.max(
                    0,
                    Number(booking.totalPrice) -
                      Number(booking.advancePaymentAmount ?? 0),
                  );
      if (expected <= 0 || Math.abs(amount - expected) > 0.005) {
        throw new Error("The transaction amount must match this payment request");
      }
      const reference = input.privateRecord.reference?.trim() || null;
      const note = input.privateRecord.note?.trim() || null;
      const retainedReason = input.privateRecord.retainedReason?.trim() || null;
      if ((reference?.length ?? 0) > 140 || (note?.length ?? 0) > 1200) {
        throw new Error("Shorten the transaction reference or note");
      }
      if (track === "DAMAGE_DEPOSIT_RETENTION" && !retainedReason) {
        throw new Error("Add the reason for retaining the damage deposit");
      }
      if ((retainedReason?.length ?? 0) > 1200) {
        throw new Error("Shorten the retention reason");
      }
      privateData = {
        track,
        requestId: request?.id ?? null,
        amount,
        transactionDate: new Date(`${input.privateRecord.transactionDate}T00:00:00.000Z`),
        reference,
        note,
        retainedReason,
      };
    }

    if (
      next.paymentStatus === current.paymentStatus &&
      next.advancePaymentStatus === current.advancePaymentStatus &&
      next.damageDepositStatus === current.damageDepositStatus
      && next.accommodationRefundStatus === current.accommodationRefundStatus
    ) {
      if (privateData) {
        const existing = await tx.bookingPaymentPrivateRecord.findFirst({
          where: {
            bookingId: booking.id,
            reporterId: input.actorId,
            track: privateData.track,
          },
          orderBy: { createdAt: "desc" },
        });
        if (!existing) throw new Error("Transaction report not found");
        await tx.bookingPaymentPrivateRecord.update({
          where: { id: existing.id },
          data: {
            amount: privateData.amount,
            transactionDate: privateData.transactionDate,
            reference: privateData.reference,
            note: privateData.note,
            retainedReason: privateData.retainedReason,
          },
        });
      }
      return { changed: false, ...next };
    }

    const now = new Date();
    await tx.booking.update({
      where: { id: booking.id },
      data: {
        paymentStatus: next.paymentStatus,
        advancePaymentStatus: next.advancePaymentStatus,
        damageDepositStatus: next.damageDepositStatus,
        accommodationRefundStatus: next.accommodationRefundStatus,
        ...(next.paymentStatus !== current.paymentStatus
          ? { paymentStatusUpdatedAt: now }
          : {}),
        ...(next.advancePaymentStatus !== current.advancePaymentStatus
          ? { advancePaymentStatusUpdatedAt: now }
          : {}),
        ...(next.damageDepositStatus !== current.damageDepositStatus
          ? { damageDepositStatusUpdatedAt: now }
          : {}),
        ...(next.accommodationRefundStatus !== current.accommodationRefundStatus
          ? { accommodationRefundStatusUpdatedAt: now }
          : {}),
      },
    });

    // A payment request describes the lifecycle of one concrete obligation. Keep it
    // synchronized with the central status machine so reminders and the UI cannot keep
    // presenting a confirmed or waived request as merely SENT.
    const settledRequestType =
      event === "HOST_CONFIRM_PAYMENT_RECEIVED"
        ? "ACCOMMODATION_BALANCE"
        : event === "HOST_CONFIRM_ADVANCE_PAYMENT_RECEIVED"
          ? "ADVANCE_PAYMENT"
          : event === "HOST_CONFIRM_DAMAGE_DEPOSIT_RECEIVED"
            ? "DAMAGE_DEPOSIT"
            : null;
    if (settledRequestType) {
      await tx.bookingPaymentRequest.updateMany({
        where: {
          bookingId: booking.id,
          type: settledRequestType,
          status: { in: ["DRAFT", "SENT"] },
        },
        data: { status: "SETTLED" },
      });
    }
    if (event === "HOST_MARK_PAYMENT_NOT_REQUIRED") {
      const cancelledTypes: Array<"ACCOMMODATION_BALANCE" | "ADVANCE_PAYMENT"> = [
        "ACCOMMODATION_BALANCE",
      ];
      if (
        current.advancePaymentStatus !== next.advancePaymentStatus &&
        next.advancePaymentStatus === "NOT_REQUIRED"
      ) {
        cancelledTypes.push("ADVANCE_PAYMENT");
      }
      await tx.bookingPaymentRequest.updateMany({
        where: {
          bookingId: booking.id,
          type: { in: cancelledTypes },
          status: { in: ["DRAFT", "SENT"] },
        },
        data: { status: "CANCELLED" },
      });
    }
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
        accommodationRefundStatus: next.accommodationRefundStatus,
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
    if (privateData) {
      await tx.bookingPaymentPrivateRecord.create({
        data: {
          bookingId: booking.id,
          requestId: privateData.requestId,
          eventId: recorded.id,
          track: privateData.track,
          reporterId: input.actorId,
          amount: privateData.amount,
          currency: booking.currency,
          transactionDate: privateData.transactionDate,
          reference: privateData.reference,
          note: privateData.note,
          retainedReason: privateData.retainedReason,
        },
      });
    }
    return { changed: true, ...next, eventId: recorded.id };
  }, { timeout: 10_000 });
}

export type BookingPaymentProgress = Prisma.PromiseReturnType<
  typeof getBookingPaymentProgress
>;
