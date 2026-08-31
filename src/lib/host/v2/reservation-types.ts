import type { CalendarFormats } from "@/lib/host/v2/calendar-format";
import type { BookingParty } from "@/lib/booking-party";
import type { DepositPoliciesSnapshotV2 } from "@/lib/payments/deposit-policies";
import type {
  CancellationPolicySnapshotV1,
  CancellationSettlementSnapshotV1,
} from "@/lib/payments/cancellation-policy";
import type { SavedPaymentInstructionTemplate } from "@/lib/payments/payment-instruction-templates";
import type { PaymentMethodCode } from "@/lib/payments/payment-methods";
import type {
  BookingPaymentDetailsSnapshotV2,
  BookingPaymentRequestPrefill,
} from "@/lib/payments/booking-payment-request";

/**
 * The reservations panel's payload, as plain JSON.
 *
 * Every date that names a *day* is a `YYYY-MM-DD` civil date, and every field that
 * names an *instant* is an ISO string — the same split the calendar makes, and for the
 * same reason: a check-in is a day in the marketplace's time zone, while a response
 * deadline is a moment on a clock. Decimals arrive as numbers; the server is the only
 * side that ever touches Prisma's `Decimal`.
 */

export interface HostReservationProperty {
  id: string;
  title: string;
  photoUrl: string | null;
  photoAlt: string | null;
  city: string | null;
}

export interface HostReservationGuest {
  id: string;
  name: string | null;
  image: string | null;
}

export interface HostReservation {
  id: string;
  reference: string;
  /** `BookingStatus`, carried as a string so the client bundle needs no Prisma enum. */
  status: string;
  listingId: string;
  guest: HostReservationGuest;
  checkIn: string;
  checkOut: string;
  nights: number;
  /** Capacity: adults + children, the number `maxGuests` was checked against. */
  guestCount: number;
  /**
   * The rest of the party, or null for a booking taken before it was recorded. Never
   * summed into `guestCount` — infants and pets consume no capacity — and never
   * defaulted to zeroes, because "no pets" and "never asked" are different answers.
   *
   * Optional as well as nullable so a fixture that predates it still describes a valid
   * reservation; readers treat a missing field exactly as they treat null.
   */
  party?: BookingParty | null;
  currency: string;
  /**
   * @deprecated Compatibility data. A rounded effective average, not a price component:
   * `nightlyRate * nights` does not reconstruct the accommodation subtotal (audit L2).
   * Read `accommodationSubtotal` for the amount and `averageNightlyRate` for the
   * average, and never multiply either.
   */
  nightlyRate: number;
  /** The average per night, for a line that says so. Display only. */
  averageNightlyRate: number;
  /**
   * What the nights are worth, net of any promotion — from the frozen `priceBreakdown`,
   * or derived from the stored totals for a booking that predates it.
   * `accommodationSubtotal + cleaningFee + serviceFee === total`.
   */
  accommodationSubtotal: number;
  /** The same, before the promotion. Print this beside an itemised discount row; the
   *  net figure there would subtract the promotion twice. */
  originalAccommodationSubtotal: number;
  cleaningFee: number;
  /** `cleaningFee` before the promotion, for the same reason. */
  originalCleaningFee: number;
  serviceFee: number;
  discountAmount: number;
  total: number;
  /** Manual reports only; no Linger Homes payment processing is implied. */
  paymentStatus: string;
  paymentInstructionsStatus: string;
  selectedPaymentMethod: PaymentMethodCode | null;
  paymentMethodOtherLabel: string | null;
  advancePaymentStatus: string;
  damageDepositStatus: string;
  accommodationRefundStatus?: string;
  accommodationRefundAmount?: number | null;
  /** The booking-time amounts, never recomputed from a later listing policy and never
   *  summed: the advance payment is part of `total`, the damage deposit is on top. */
  advancePaymentAmount: number | null;
  damageDepositAmount: number | null;
  depositPolicies: DepositPoliciesSnapshotV2 | null;
  cancellationPolicy?: CancellationPolicySnapshotV1 | null;
  cancellationSettlement?: CancellationSettlementSnapshotV1 | null;
  paymentStatusEvents: Array<{
    id: string;
    actor: "HOST" | "GUEST" | "ADMIN" | "SYSTEM";
    eventType: string;
    createdAt: string;
  }>;
  guestNote: string | null;
  cancellationReason: string | null;
  createdAt: string;
  respondedAt: string | null;
  /** When an unanswered request expires on its own and releases the dates. */
  responseDueAt: string;
  /** Deadline of an open invitation to rate the guest; null once rated or never sent. */
  ratingDueAt: string | null;
  unreadCount: number;
  conversationId: string | null;
  /** The listing's house times, shown beside the dates. */
  checkInTime: string | null;
  checkOutTime: string | null;
  /** Owner-only saved copy used to prefill, never sent until the host submits it. */
  savedPaymentInstructionTemplates?: SavedPaymentInstructionTemplate[];
  /**
   * Owner-only prefill for the payment request, for the one method this booking uses.
   * Carries no other method's details and is never part of a guest-facing payload.
   */
  paymentRequestPrefill?: BookingPaymentRequestPrefill;
  /** The structured details already sent to this guest, if any. Both participants. */
  sentPaymentDetails?: BookingPaymentDetailsSnapshotV2 | null;
  paymentRequests?: Array<{
    id: string;
    type: "ADVANCE_PAYMENT" | "ACCOMMODATION_BALANCE" | "DAMAGE_DEPOSIT";
    amount: number;
    currency: string;
    dueAt: string;
    status: "DRAFT" | "SENT" | "CANCELLED" | "SETTLED";
    sentPaymentDetails: BookingPaymentDetailsSnapshotV2 | null;
    instructionsNotRequired?: boolean;
    reminders: Array<{ kind: string; sentAt: string }>;
  }>;
  transactionReports?: Array<{
    id: string;
    track: string;
    reporter: "HOST" | "GUEST" | "REDACTED";
    amount: number;
    currency: string;
    transactionDate: string;
    reference: string | null;
    note: string | null;
    retainedReason: string | null;
  }>;
}

export interface HostReservationsData {
  /** Today in the marketplace time zone, which is what "upcoming" is measured from. */
  today: string;
  /**
   * The server's clock at render. Countdowns start from this so the first client paint
   * matches the server's markup instead of flashing a different number.
   */
  now: string;
  formats: CalendarFormats;
  properties: HostReservationProperty[];
  reservations: HostReservation[];
}
