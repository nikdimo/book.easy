"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  recordBookingPaymentEventAction,
  reportBookingTransactionAction,
} from "@/lib/actions/booking-payment.actions";
import { sendBookingPaymentRequestAction } from "@/lib/actions/booking.actions";
import type { DepositPoliciesSnapshotV2 } from "@/lib/payments/deposit-policies";
import type { SavedPaymentInstructionTemplate } from "@/lib/payments/payment-instruction-templates";
import type {
  BookingPaymentDetailsSnapshotV2,
  BookingPaymentRequestPrefill,
} from "@/lib/payments/booking-payment-request";
import {
  PaymentRequestComposer,
  type PaymentRequestValue,
} from "./payment-request-composer";
import { GuestPaymentCard } from "./guest-payment-card";
import type { PaymentMethodCode } from "@/lib/payments/payment-methods";
import { DepositPoliciesSummary } from "./deposit-policies-summary";
import { CancellationPolicySummary } from "./cancellation-policy-summary";
import { PaymentMethodName } from "./accepted-payment-methods";
import { useI18n } from "@/lib/i18n/client";
import { derivePaymentReminderState } from "@/lib/payments/payment-reminders";
import { todayYmd } from "@/lib/utils/date-only";
import type {
  CancellationPolicySnapshotV1,
  CancellationSettlementSnapshotV1,
} from "@/lib/payments/cancellation-policy";
import {
  formatLongDate,
  formatMoney as formatCalendarMoney,
  type CalendarFormats,
} from "@/lib/host/v2/calendar-format";

type PaymentEvent =
  | "HOST_MARK_PAYMENT_DUE"
  | "GUEST_REPORT_PAYMENT_SENT"
  | "HOST_CONFIRM_PAYMENT_RECEIVED"
  | "HOST_MARK_PAYMENT_NOT_REQUIRED"
  | "HOST_MARK_ADVANCE_PAYMENT_DUE"
  | "GUEST_REPORT_ADVANCE_PAYMENT_SENT"
  | "HOST_CONFIRM_ADVANCE_PAYMENT_RECEIVED"
  | "HOST_MARK_DAMAGE_DEPOSIT_DUE"
  | "GUEST_REPORT_DAMAGE_DEPOSIT_SENT"
  | "HOST_CONFIRM_DAMAGE_DEPOSIT_RECEIVED"
  | "HOST_REPORT_DAMAGE_DEPOSIT_RETURNED"
  | "GUEST_CONFIRM_DAMAGE_DEPOSIT_RETURNED"
  | "HOST_MARK_DAMAGE_DEPOSIT_RETAINED"
  | "HOST_REPORT_ACCOMMODATION_REFUND_SENT"
  | "GUEST_CONFIRM_ACCOMMODATION_REFUND_RECEIVED";

export interface BookingPaymentProgressView {
  bookingId: string;
  status: string;
  checkIn: string;
  currency: string;
  total: number;
  /** The two frozen amounts, each on its own. Never render their sum. */
  advancePaymentAmount: number | null;
  damageDepositAmount: number | null;
  depositPolicies: DepositPoliciesSnapshotV2 | null;
  cancellationPolicy?: CancellationPolicySnapshotV1 | null;
  cancellationSettlement?: CancellationSettlementSnapshotV1 | null;
  paymentStatus: string;
  paymentInstructionsStatus: string;
  selectedPaymentMethod: PaymentMethodCode | null;
  paymentMethodOtherLabel?: string | null;
  advancePaymentStatus: string;
  damageDepositStatus: string;
  accommodationRefundStatus?: string;
  accommodationRefundAmount?: number | null;
  paymentStatusEvents: Array<{
    id: string;
    actor: "HOST" | "GUEST" | "ADMIN" | "SYSTEM";
    eventType: string;
    createdAt: string;
  }>;
  /** Host-only prefill; this component never receives it for a guest. */
  savedPaymentInstructionTemplates?: SavedPaymentInstructionTemplate[];
  /**
   * Host-only prefill for the payment request, carrying the saved details for this
   * booking's method only. Never populated for a guest.
   */
  paymentRequestPrefill?: BookingPaymentRequestPrefill;
  /**
   * The structured details already sent for this booking. Both participants see this:
   * the guest needs it to pay, and it is the host's own data.
   */
  sentPaymentDetails?: BookingPaymentDetailsSnapshotV2 | null;
  /** When payment is due, as sent. Rendered on the guest's card. */
  paymentInstructionsDueAt?: string | null;
  /** The booking reference the guest quotes on the transfer. */
  reference?: string;
  paymentRequests?: Array<{
    id: string;
    type: "ADVANCE_PAYMENT" | "ACCOMMODATION_BALANCE" | "DAMAGE_DEPOSIT";
    amount: number;
    currency: string;
    dueAt: string;
    status: "DRAFT" | "SENT" | "CANCELLED" | "SETTLED";
    sentPaymentDetails?: BookingPaymentDetailsSnapshotV2 | null;
    instructionsNotRequired?: boolean;
    reminders?: Array<{ kind: string; sentAt: string }>;
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

function paymentRequestTitle(
  resolve: ReturnType<typeof useI18n>["resolve"],
  type: "ADVANCE_PAYMENT" | "ACCOMMODATION_BALANCE" | "DAMAGE_DEPOSIT",
) {
  if (type === "ADVANCE_PAYMENT") {
    return resolve("booking.payment_request.advance", "Advance payment").text;
  }
  if (type === "DAMAGE_DEPOSIT") {
    return resolve("booking.payment_request.damage", "Refundable damage deposit").text;
  }
  return resolve("booking.payment_request.balance", "Remaining accommodation balance").text;
}

function requestDisplayState(
  request: NonNullable<BookingPaymentProgressView["paymentRequests"]>[number],
) {
  if (request.status === "DRAFT") return "Missing host review";
  if (request.status === "CANCELLED") return "Cancelled";
  if (request.status === "SETTLED") return "Settled";
  return derivePaymentReminderState({
    dueDate: request.dueAt.slice(0, 10),
    today: todayYmd(),
  }).replaceAll("_", " ").toLowerCase();
}

/** The sent deadline as a plain date, or null when none was recorded. */
function formatDueDate(
  value: string | null | undefined,
  locale: string,
  formats?: CalendarFormats,
) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  if (formats) return formatLongDate(value.slice(0, 10), formats);
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(date);
  } catch {
    return value.slice(0, 10);
  }
}

function money(
  value: number,
  currency: string,
  locale: string,
  formats?: CalendarFormats,
) {
  if (formats) return formatCalendarMoney(value, currency, formats);
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency }).format(value);
  } catch {
    return `${value} ${currency}`;
  }
}

/**
 * The booking phases in which payment progress can still move. Mirrors
 * `bookingPaymentPhase` in booking-payment-status.service.ts, which is the authority —
 * this only decides which buttons to draw.
 *
 * A completed stay keeps its controls: the damage deposit is returned after checkout by
 * design, and cash taken at the property is usually confirmed then too.
 */
function paymentPhase(status: string): "ACCEPTED" | "COMPLETED" | "CANCELLED" | null {
  if (status === "CONFIRMED") return "ACCEPTED";
  if (status === "COMPLETED") return "COMPLETED";
  if (status.startsWith("CANCELLED_BY_")) return "CANCELLED";
  return null;
}

/**
 * The events that *open* a track. Mirrors `BEFORE_COMPLETION` in the service: announcing
 * that money is due once the guest has left reopens collection on a finished stay, so
 * these three drop away at completion while everything else stays.
 */
const OPENS_COLLECTION = new Set<PaymentEvent>([
  "HOST_MARK_PAYMENT_DUE",
  "HOST_MARK_ADVANCE_PAYMENT_DUE",
  "HOST_MARK_DAMAGE_DEPOSIT_DUE",
]);

/**
 * The statuses each track can still be reported or confirmed from, spelled out the same
 * way for all three rather than as a mix of blacklists and whitelists.
 */
const PAYMENT_OPEN = ["UNTRACKED", "AWAITING_PAYMENT", "PAYMENT_REPORTED"];
const PAYMENT_UNREPORTED = ["UNTRACKED", "AWAITING_PAYMENT"];
const DAMAGE_OPEN = ["UNTRACKED", "AWAITING_DEPOSIT", "DEPOSIT_REPORTED"];

/** Whether this booking froze a policy of each kind. Mirrors the server's own test. */
function frozenPolicies(progress: BookingPaymentProgressView) {
  return {
    advancePayment:
      progress.depositPolicies?.advancePayment != null ||
      (progress.advancePaymentAmount ?? 0) > 0,
    damageDeposit:
      progress.depositPolicies?.damageDeposit != null ||
      (progress.damageDepositAmount ?? 0) > 0,
  };
}

function paymentStatusCopy(
  resolve: ReturnType<typeof useI18n>["resolve"],
  value: string,
) {
  switch (value) {
    case "UNTRACKED": return resolve("booking.payment_progress.payment_status.untracked", "Not tracked").text;
    case "NOT_REQUIRED": return resolve("booking.payment_progress.payment_status.not_required", "Not required").text;
    case "AWAITING_PAYMENT": return resolve("booking.payment_progress.payment_status.awaiting_payment", "Awaiting payment").text;
    // Worded like the advance and damage tracks, so who said what is legible on all
    // three: a report is the sender's claim, a confirmation is the receiver agreeing.
    case "PAYMENT_REPORTED": return resolve("booking.payment_progress.payment_status.payment_reported", "Guest reported sending it").text;
    case "PAYMENT_CONFIRMED": return resolve("booking.payment_progress.payment_status.payment_confirmed", "Host confirmed receiving it").text;
    default: return value;
  }
}

function advanceStatusCopy(
  resolve: ReturnType<typeof useI18n>["resolve"],
  value: string,
) {
  switch (value) {
    case "UNTRACKED": return resolve("booking.payment_progress.advance_status.untracked", "Not tracked").text;
    case "NOT_REQUIRED": return resolve("booking.payment_progress.advance_status.not_required", "Not required").text;
    case "AWAITING_PAYMENT": return resolve("booking.payment_progress.advance_status.awaiting", "Awaiting advance payment").text;
    case "PAYMENT_REPORTED": return resolve("booking.payment_progress.advance_status.reported", "Guest reported sending it").text;
    case "PAYMENT_CONFIRMED": return resolve("booking.payment_progress.advance_status.confirmed", "Host confirmed receiving it").text;
    default: return value;
  }
}

function damageStatusCopy(
  resolve: ReturnType<typeof useI18n>["resolve"],
  value: string,
) {
  switch (value) {
    case "UNTRACKED": return resolve("booking.payment_progress.damage_status.untracked", "Not tracked").text;
    case "NOT_REQUIRED": return resolve("booking.payment_progress.damage_status.not_required", "Not required").text;
    case "AWAITING_DEPOSIT": return resolve("booking.payment_progress.damage_status.awaiting", "Awaiting damage deposit").text;
    case "DEPOSIT_REPORTED": return resolve("booking.payment_progress.damage_status.reported", "Guest reported sending it").text;
    case "DEPOSIT_CONFIRMED": return resolve("booking.payment_progress.damage_status.confirmed", "Host confirmed receiving it").text;
    case "RETURN_REPORTED": return resolve("booking.payment_progress.damage_status.return_reported", "Host reported returning it").text;
    case "RETURN_CONFIRMED": return resolve("booking.payment_progress.damage_status.return_confirmed", "Guest confirmed its return").text;
    case "RETAINED": return resolve("booking.payment_progress.damage_status.retained", "Host marked it retained").text;
    default: return value;
  }
}

function refundStatusCopy(
  resolve: ReturnType<typeof useI18n>["resolve"],
  value: string,
) {
  switch (value) {
    case "NOT_REQUIRED": return resolve("booking.payment_progress.refund_status.not_required", "No refund due").text;
    case "AWAITING_REFUND": return resolve("booking.payment_progress.refund_status.awaiting", "Awaiting host refund").text;
    case "REFUND_REPORTED": return resolve("booking.payment_progress.refund_status.reported", "Host reported sending the refund").text;
    case "REFUND_CONFIRMED": return resolve("booking.payment_progress.refund_status.confirmed", "Guest confirmed receiving the refund").text;
    default: return value;
  }
}

function ActorLabel({
  actor,
}: {
  actor: "HOST" | "GUEST" | "ADMIN" | "SYSTEM";
}) {
  const { resolve } = useI18n();
  if (actor === "HOST") {
    return resolve("booking.payment_progress.reported_by_host", "Reported by host").text;
  }
  if (actor === "GUEST") {
    return resolve("booking.payment_progress.reported_by_guest", "Reported by guest").text;
  }
  if (actor === "ADMIN") {
    return resolve("booking.payment_progress.reported_by_admin", "Recorded by support").text;
  }
  return resolve("booking.payment_progress.reported_by_system", "Recorded automatically").text;
}

function eventCopy(
  resolve: ReturnType<typeof useI18n>["resolve"],
  eventType: string,
) {
  switch (eventType) {
    case "HOST_MARK_PAYMENT_DUE": return resolve("booking.payment_progress.event.host_mark_payment_due", "Marked the accommodation balance due").text;
    case "GUEST_REPORT_PAYMENT_SENT": return resolve("booking.payment_progress.event.guest_report_payment_sent", "Reported sending the accommodation balance").text;
    case "HOST_CONFIRM_PAYMENT_RECEIVED": return resolve("booking.payment_progress.event.host_confirm_payment_received", "Confirmed receiving the accommodation balance").text;
    case "HOST_MARK_PAYMENT_NOT_REQUIRED": return resolve("booking.payment_progress.event.host_mark_payment_not_required", "Marked payment not required").text;
    case "HOST_MARK_ADVANCE_PAYMENT_DUE": return resolve("booking.payment_progress.event.host_mark_advance_due", "Marked the advance payment due").text;
    case "GUEST_REPORT_ADVANCE_PAYMENT_SENT": return resolve("booking.payment_progress.event.guest_report_advance_sent", "Reported sending the advance payment").text;
    case "HOST_CONFIRM_ADVANCE_PAYMENT_RECEIVED": return resolve("booking.payment_progress.event.host_confirm_advance_received", "Confirmed receiving the advance payment").text;
    case "HOST_MARK_DAMAGE_DEPOSIT_DUE": return resolve("booking.payment_progress.event.host_mark_damage_due", "Marked the damage deposit due").text;
    case "GUEST_REPORT_DAMAGE_DEPOSIT_SENT": return resolve("booking.payment_progress.event.guest_report_damage_sent", "Reported sending the damage deposit").text;
    case "HOST_CONFIRM_DAMAGE_DEPOSIT_RECEIVED": return resolve("booking.payment_progress.event.host_confirm_damage_received", "Confirmed receiving the damage deposit").text;
    case "HOST_REPORT_DAMAGE_DEPOSIT_RETURNED": return resolve("booking.payment_progress.event.host_report_damage_returned", "Reported returning the damage deposit").text;
    case "GUEST_CONFIRM_DAMAGE_DEPOSIT_RETURNED": return resolve("booking.payment_progress.event.guest_confirm_damage_returned", "Confirmed the damage deposit was returned").text;
    case "HOST_MARK_DAMAGE_DEPOSIT_RETAINED": return resolve("booking.payment_progress.event.host_mark_damage_retained", "Marked the damage deposit retained").text;
    case "HOST_REPORT_ACCOMMODATION_REFUND_SENT": return resolve("booking.payment_progress.event.host_report_refund_sent", "Reported sending the accommodation refund").text;
    case "GUEST_CONFIRM_ACCOMMODATION_REFUND_RECEIVED": return resolve("booking.payment_progress.event.guest_confirm_refund_received", "Confirmed receiving the accommodation refund").text;
    case "CANCELLATION_OPENED_ACCOMMODATION_REFUND": return resolve("booking.payment_progress.event.cancellation_opened_refund", "Cancellation created an accommodation refund obligation").text;
    default: return eventType;
  }
}

function StatusHistory({ progress }: { progress: BookingPaymentProgressView }) {
  const { locale, resolve } = useI18n();
  if (progress.paymentStatusEvents.length === 0) return null;

  return (
    <section className="space-y-2" aria-label={resolve("booking.payment_progress.history", "Status history").text}>
      <h3 className="text-sm font-semibold">
        {resolve("booking.payment_progress.history", "Status history").text}
      </h3>
      <ol className="space-y-2 border-l pl-3 text-sm text-muted-foreground">
        {progress.paymentStatusEvents.map((event) => (
          <li key={event.id} className="space-y-0.5">
            <p className="font-medium text-foreground"><ActorLabel actor={event.actor} /></p>
            <p>
              {eventCopy(resolve, event.eventType)}
            </p>
            <time dateTime={event.createdAt} className="text-xs">
              {new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(event.createdAt))}
            </time>
          </li>
        ))}
      </ol>
    </section>
  );
}

function ProgressControls({
  progress,
  actor,
}: {
  progress: BookingPaymentProgressView;
  actor: "HOST" | "GUEST";
}) {
  const { resolve } = useI18n();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [reportEvent, setReportEvent] = useState<PaymentEvent | null>(null);
  const [transactionDate, setTransactionDate] = useState(todayYmd());
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [retainedReason, setRetainedReason] = useState("");
  const frozen = frozenPolicies(progress);
  const advance = progress.advancePaymentStatus;
  const damage = progress.damageDepositStatus;

  const send = (event: PaymentEvent) => {
    if (TRANSACTION_REPORT_EVENTS.has(event)) {
      const track = transactionTrack(event);
      const existing = [...(progress.transactionReports ?? [])]
        .reverse()
        .find((report) => report.track === track && report.reporter === actor);
      setTransactionDate(existing?.transactionDate.slice(0, 10) ?? todayYmd());
      setReference(existing?.reference ?? "");
      setNote(existing?.note ?? "");
      setRetainedReason(existing?.retainedReason ?? "");
      setReportEvent(event);
      return;
    }
    startTransition(async () => {
      try {
        const result = await recordBookingPaymentEventAction(progress.bookingId, event);
        if (result?.error) {
          toast.error(result.error);
          return;
        }
        toast.success(resolve("booking.payment_progress.updated", "Payment status updated").text);
        router.refresh();
      } catch {
        toast.error(resolve("booking.payment_progress.update_failed", "Could not update payment status").text);
      }
    });
  };

  const phase = paymentPhase(progress.status);
  if (!phase) return null;

  const payment = progress.paymentStatus;
  const hostControls: Array<{ event: PaymentEvent; label: string; allowed: boolean }> = [
    // Named for the track they move. "Mark payment received" read as "everything is
    // settled" on a booking with an advance, when what it confirms is the balance alone.
    { event: "HOST_MARK_PAYMENT_DUE", label: resolve("booking.payment_progress.mark_balance_due", "Mark accommodation balance due").text, allowed: payment === "UNTRACKED" },
    { event: "HOST_MARK_PAYMENT_NOT_REQUIRED", label: resolve("booking.payment_progress.mark_payment_not_required", "Mark payment not required").text, allowed: PAYMENT_UNREPORTED.includes(payment) },
    { event: "HOST_CONFIRM_PAYMENT_RECEIVED", label: resolve("booking.payment_progress.mark_balance_received", "Mark accommodation balance received").text, allowed: PAYMENT_OPEN.includes(payment) },
    { event: "HOST_MARK_ADVANCE_PAYMENT_DUE", label: resolve("booking.payment_progress.mark_advance_due", "Mark advance payment due").text, allowed: frozen.advancePayment && advance === "UNTRACKED" },
    { event: "HOST_CONFIRM_ADVANCE_PAYMENT_RECEIVED", label: resolve("booking.payment_progress.mark_advance_received", "Mark advance payment received").text, allowed: frozen.advancePayment && PAYMENT_OPEN.includes(advance) },
    { event: "HOST_MARK_DAMAGE_DEPOSIT_DUE", label: resolve("booking.payment_progress.mark_damage_due", "Mark damage deposit due").text, allowed: frozen.damageDeposit && damage === "UNTRACKED" },
    { event: "HOST_CONFIRM_DAMAGE_DEPOSIT_RECEIVED", label: resolve("booking.payment_progress.mark_damage_received", "Mark damage deposit received").text, allowed: frozen.damageDeposit && DAMAGE_OPEN.includes(damage) },
    { event: "HOST_REPORT_DAMAGE_DEPOSIT_RETURNED", label: damage === "RETURN_REPORTED" ? resolve("booking.payment_progress.edit_damage_return", "Edit damage-deposit return report").text : resolve("booking.payment_progress.mark_damage_returned", "Mark damage deposit returned").text, allowed: frozen.damageDeposit && ["DEPOSIT_CONFIRMED", "RETURN_REPORTED"].includes(damage) },
    { event: "HOST_MARK_DAMAGE_DEPOSIT_RETAINED", label: resolve("booking.payment_progress.mark_damage_retained", "Mark damage deposit retained").text, allowed: frozen.damageDeposit && damage === "DEPOSIT_CONFIRMED" },
  ];
  // The three report buttons read the same way: offered while the track is open and the
  // guest has not already said this. While a report is awaiting confirmation, the same
  // control becomes an edit action and pre-fills the participant's latest private row.
  const guestControls: Array<{ event: PaymentEvent; label: string; allowed: boolean }> = [
    { event: "GUEST_REPORT_PAYMENT_SENT", label: payment === "PAYMENT_REPORTED" ? resolve("booking.payment_progress.edit_balance_report", "Edit accommodation-balance report").text : resolve("booking.payment_progress.report_balance_sent", "Report accommodation balance sent").text, allowed: PAYMENT_OPEN.includes(payment) && payment !== "PAYMENT_CONFIRMED" },
    { event: "GUEST_REPORT_ADVANCE_PAYMENT_SENT", label: advance === "PAYMENT_REPORTED" ? resolve("booking.payment_progress.edit_advance_report", "Edit advance-payment report").text : resolve("booking.payment_progress.report_advance_sent", "Report advance payment sent").text, allowed: frozen.advancePayment && PAYMENT_OPEN.includes(advance) && advance !== "PAYMENT_CONFIRMED" },
    { event: "GUEST_REPORT_DAMAGE_DEPOSIT_SENT", label: damage === "DEPOSIT_REPORTED" ? resolve("booking.payment_progress.edit_damage_report", "Edit damage-deposit report").text : resolve("booking.payment_progress.report_damage_sent", "Report damage deposit sent").text, allowed: frozen.damageDeposit && DAMAGE_OPEN.includes(damage) && damage !== "DEPOSIT_CONFIRMED" },
    { event: "GUEST_CONFIRM_DAMAGE_DEPOSIT_RETURNED", label: resolve("booking.payment_progress.confirm_damage_return", "Confirm damage deposit return").text, allowed: frozen.damageDeposit && damage === "RETURN_REPORTED" },
  ];
  const cancellationControls: Array<{ event: PaymentEvent; label: string; allowed: boolean }> =
    actor === "HOST"
      ? [
          {
            event: "HOST_REPORT_ACCOMMODATION_REFUND_SENT",
            label: progress.accommodationRefundStatus === "REFUND_REPORTED" ? resolve("booking.payment_progress.edit_refund_report", "Edit accommodation-refund report").text : resolve("booking.payment_progress.report_refund_sent", "Report accommodation refund sent").text,
            allowed: ["AWAITING_REFUND", "REFUND_REPORTED"].includes(
              progress.accommodationRefundStatus ?? "",
            ),
          },
          {
            event: "HOST_REPORT_DAMAGE_DEPOSIT_RETURNED",
            label: damage === "RETURN_REPORTED" ? resolve("booking.payment_progress.edit_damage_return", "Edit damage-deposit return report").text : resolve("booking.payment_progress.mark_damage_returned", "Mark damage deposit returned").text,
            allowed: frozen.damageDeposit && ["DEPOSIT_REPORTED", "DEPOSIT_CONFIRMED", "RETURN_REPORTED"].includes(damage),
          },
        ]
      : [
          {
            event: "GUEST_CONFIRM_ACCOMMODATION_REFUND_RECEIVED",
            label: resolve("booking.payment_progress.confirm_refund", "Confirm accommodation refund received").text,
            allowed: progress.accommodationRefundStatus === "REFUND_REPORTED",
          },
          {
            event: "GUEST_CONFIRM_DAMAGE_DEPOSIT_RETURNED",
            label: resolve("booking.payment_progress.confirm_damage_return", "Confirm damage deposit return").text,
            allowed: frozen.damageDeposit && damage === "RETURN_REPORTED",
          },
        ];
  const controls = (phase === "CANCELLED"
    ? cancellationControls
    : actor === "HOST"
      ? hostControls
      : guestControls).filter(
    (control) =>
      control.allowed &&
      (phase === "ACCEPTED" || !OPENS_COLLECTION.has(control.event)),
  );
  if (controls.length === 0 && !reportEvent) return null;

  const reportAmount = reportEvent
    ? transactionAmount(progress, reportEvent)
    : 0;

  function submitReport(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!reportEvent) return;
    startTransition(async () => {
      const result = await reportBookingTransactionAction({
        bookingId: progress.bookingId,
        event: reportEvent,
        amount: reportAmount,
        transactionDate,
        reference,
        note,
        retainedReason,
      });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      setReportEvent(null);
      setTransactionDate(todayYmd());
      setReference("");
      setNote("");
      setRetainedReason("");
      toast.success(resolve("booking.payment_progress.updated", "Payment status updated").text);
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {controls.map((control) => (
        <Button
          key={control.event}
          type="button"
          size="sm"
          variant="outline"
          disabled={isPending}
          data-payment-event={control.event}
          onClick={() => send(control.event)}
        >
          {control.label}
        </Button>
        ))}
      </div>
      {reportEvent ? (
        <form onSubmit={submitReport} className="space-y-3 rounded-lg border border-border p-3">
          <p className="text-sm font-semibold">
            {eventCopy(resolve, reportEvent)} · {money(reportAmount, progress.currency, "en")}
          </p>
          <div>
            <Label htmlFor={`transaction-date-${progress.bookingId}`}>
              {resolve("booking.transaction.date", "Transaction date").text}
            </Label>
            <Input
              id={`transaction-date-${progress.bookingId}`}
              type="date"
              value={transactionDate}
              max={todayYmd()}
              required
              onChange={(event) => setTransactionDate(event.currentTarget.value)}
            />
          </div>
          <div>
            <Label htmlFor={`transaction-reference-${progress.bookingId}`}>
              {resolve("booking.transaction.reference", "Transaction reference (optional)").text}
            </Label>
            <Input
              id={`transaction-reference-${progress.bookingId}`}
              value={reference}
              maxLength={140}
              onChange={(event) => setReference(event.currentTarget.value)}
            />
          </div>
          <div>
            <Label htmlFor={`transaction-note-${progress.bookingId}`}>
              {resolve("booking.transaction.note", "Note (optional)").text}
            </Label>
            <Textarea
              id={`transaction-note-${progress.bookingId}`}
              value={note}
              maxLength={1200}
              onChange={(event) => setNote(event.currentTarget.value)}
            />
          </div>
          {reportEvent === "HOST_MARK_DAMAGE_DEPOSIT_RETAINED" ? (
            <div>
              <Label htmlFor={`retention-reason-${progress.bookingId}`}>
                {resolve("booking.transaction.retention_reason", "Reason for retaining the deposit").text}
              </Label>
              <Textarea
                id={`retention-reason-${progress.bookingId}`}
                value={retainedReason}
                required
                maxLength={1200}
                onChange={(event) => setRetainedReason(event.currentTarget.value)}
              />
            </div>
          ) : null}
          <div className="flex gap-2">
            <Button
              type="submit"
              size="sm"
              disabled={isPending || reportAmount <= 0 || !transactionDate}
            >
              {resolve("booking.transaction.submit", "Submit report").text}
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setReportEvent(null)}>
              {resolve("common.cancel", "Cancel").text}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {resolve(
              "booking.transaction.no_receipt",
              "No receipt upload is required. The other participant must confirm the report.",
            ).text}
          </p>
        </form>
      ) : null}
    </div>
  );
}

const TRANSACTION_REPORT_EVENTS = new Set<PaymentEvent>([
  "GUEST_REPORT_PAYMENT_SENT",
  "GUEST_REPORT_ADVANCE_PAYMENT_SENT",
  "GUEST_REPORT_DAMAGE_DEPOSIT_SENT",
  "HOST_REPORT_DAMAGE_DEPOSIT_RETURNED",
  "HOST_MARK_DAMAGE_DEPOSIT_RETAINED",
  "HOST_REPORT_ACCOMMODATION_REFUND_SENT",
]);

function transactionTrack(event: PaymentEvent): string | null {
  if (event === "GUEST_REPORT_PAYMENT_SENT") return "ACCOMMODATION_BALANCE";
  if (event === "GUEST_REPORT_ADVANCE_PAYMENT_SENT") return "ADVANCE_PAYMENT";
  if (event === "GUEST_REPORT_DAMAGE_DEPOSIT_SENT") return "DAMAGE_DEPOSIT";
  if (event === "HOST_REPORT_DAMAGE_DEPOSIT_RETURNED") return "DAMAGE_DEPOSIT_RETURN";
  if (event === "HOST_MARK_DAMAGE_DEPOSIT_RETAINED") return "DAMAGE_DEPOSIT_RETENTION";
  if (event === "HOST_REPORT_ACCOMMODATION_REFUND_SENT") return "ACCOMMODATION_REFUND";
  return null;
}

function transactionAmount(progress: BookingPaymentProgressView, event: PaymentEvent) {
  if (event === "GUEST_REPORT_ADVANCE_PAYMENT_SENT") {
    return progress.advancePaymentAmount ?? 0;
  }
  if (
    event === "GUEST_REPORT_DAMAGE_DEPOSIT_SENT" ||
    event === "HOST_REPORT_DAMAGE_DEPOSIT_RETURNED" ||
    event === "HOST_MARK_DAMAGE_DEPOSIT_RETAINED"
  ) {
    return progress.damageDepositAmount ?? 0;
  }
  if (event === "HOST_REPORT_ACCOMMODATION_REFUND_SENT") {
    return progress.accommodationRefundAmount ?? 0;
  }
  return Math.max(0, progress.total - (progress.advancePaymentAmount ?? 0));
}

/**
 * The host's send-later form: review the prefilled details, choose a deadline, send.
 *
 * A booking whose host has no prefill at all still gets the composer — it opens on
 * empty fields for the guest's method rather than a blank paragraph box.
 */
function PaymentInstructionsForm({
  bookingId,
  checkIn,
  prefill,
  initialTemplates,
  paymentRequest,
}: {
  bookingId: string;
  checkIn: string;
  prefill?: BookingPaymentRequestPrefill;
  initialTemplates?: SavedPaymentInstructionTemplate[];
  paymentRequest?: NonNullable<BookingPaymentProgressView["paymentRequests"]>[number];
}) {
  const { resolve } = useI18n();
  const router = useRouter();
  const effectivePrefill: BookingPaymentRequestPrefill = prefill ?? {
    method: null,
    methodSource: "HOST_FALLBACK",
    availableMethods: [],
    otherLabel: null,
    savedDetailsKind: "NONE",
    savedDetailFields: {},
    savedInstructions: formatSavedInstructionTemplates(initialTemplates ?? []),
  };
  const [request, setRequest] = useState<PaymentRequestValue>({
    method: effectivePrefill.method,
    mode: "FREE_TEXT",
    fields: {},
    instructions: effectivePrefill.savedInstructions,
    saveForFuture: false,
    isReady: false,
  });
  const [dueDate, setDueDate] = useState(
    paymentRequest?.dueAt.slice(0, 10) ?? checkIn,
  );
  const [isPending, startTransition] = useTransition();

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!request.isReady) return;
    startTransition(async () => {
      try {
        const result = await sendBookingPaymentRequestAction({
          bookingId,
          ...(paymentRequest ? { paymentRequestId: paymentRequest.id } : {}),
          ...(request.mode === "STRUCTURED"
            ? { detailFields: request.fields }
            : { instructions: request.instructions }),
          ...(effectivePrefill.methodSource === "HOST_FALLBACK" && request.method
            ? { method: request.method }
            : {}),
          dueDate,
          saveForFuture: request.saveForFuture,
        });
        if (result?.error) {
          // This is deliberately generic: never reflect payment text in a toast or error.
          toast.error(resolve("booking.payment_progress.instructions_failed", "Could not share payment instructions").text);
          return;
        }
        if (result.warning) toast.warning(result.warning);
        else toast.success(resolve("booking.payment_progress.instructions_shared", "Payment request shared in the conversation").text);
        router.refresh();
      } catch {
        toast.error(resolve("booking.payment_progress.instructions_failed", "Could not share payment instructions").text);
      }
    });
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      {paymentRequest ? (
        <div className="rounded-lg bg-muted/40 p-3 text-sm">
          <p className="font-semibold">
            {paymentRequestTitle(resolve, paymentRequest.type)}
          </p>
          <p className="mt-1 text-muted-foreground">
            {money(paymentRequest.amount, paymentRequest.currency, "en")} · {requestDisplayState(paymentRequest)}
          </p>
        </div>
      ) : null}
      <div className="space-y-1.5">
        <Label htmlFor={`payment-due-${bookingId}`}>
          {resolve("booking.payment_progress.due_date", "Payment due").text}
        </Label>
        <input
          id={`payment-due-${bookingId}`}
          type="date"
          value={dueDate}
          max={checkIn}
          onChange={(event) => setDueDate(event.currentTarget.value)}
          required
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
      </div>
      <PaymentRequestComposer
        prefill={effectivePrefill}
        idPrefix={`payment-request-${bookingId}`}
        disabled={isPending}
        onChange={setRequest}
      />
      <Button type="submit" size="sm" disabled={isPending || !request.isReady || !dueDate}>
        {isPending
          ? resolve("booking.payment_progress.instructions_sending", "Sending…").text
          : resolve("booking.payment_progress.instructions_send", "Send payment request").text}
      </Button>
    </form>
  );
}

function formatSavedInstructionTemplates(
  templates: SavedPaymentInstructionTemplate[],
) {
  return templates.map(({ body }) => body.trim()).join("\n\n");
}

/**
 * One frozen amount with its own status line.
 *
 * Each track gets its own row rather than a shared "deposit" line, so a booking with
 * both never shows one figure or one state standing for two different pots of money.
 */
function TrackRow({
  kind,
  title,
  note,
  amount,
  status,
  currency,
  locale,
  formats,
  caveat,
}: {
  kind:
    | "accommodation-balance"
    | "advance-payment"
    | "damage-deposit"
    | "accommodation-refund";
  title: string;
  note: string;
  amount: number | null;
  status: string;
  currency: string;
  locale: string;
  formats?: CalendarFormats;
  /** An extra line under the status — used to say an obligation is only claimed. */
  caveat?: string | null;
}) {
  const { resolve } = useI18n();
  return (
    <div
      data-payment-track={kind}
      className="rounded-lg border border-border/80 p-3 text-sm"
    >
      <p className="font-semibold text-foreground">{title}</p>
      <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{note}</p>
      <dl className="mt-2 grid gap-1 sm:grid-cols-2">
        {amount !== null ? (
          <div className="flex gap-1">
            <dt className="text-muted-foreground">
              {resolve("booking.payment_progress.frozen_amount", "Agreed amount").text}:
            </dt>
            <dd className="font-medium" data-payment-track-amount={kind}>
              {money(amount, currency, locale, formats)}
            </dd>
          </div>
        ) : null}
        <div className="flex gap-1">
          <dt className="text-muted-foreground">
            {resolve("booking.payment_progress.track_status", "Status").text}:
          </dt>
          <dd className="font-medium" data-payment-track-status={kind}>
            {status}
          </dd>
        </div>
      </dl>
      {caveat ? (
        <p
          className="mt-2 text-xs leading-5 text-muted-foreground"
          data-payment-track-caveat={kind}
        >
          {caveat}
        </p>
      ) : null}
    </div>
  );
}

/** Participant-facing manual payment progress. It never receives payment instruction text. */
export function BookingPaymentProgress({
  progress,
  actor,
  compact = false,
  formats,
}: {
  progress: BookingPaymentProgressView;
  actor: "HOST" | "GUEST";
  compact?: boolean;
  /** Server-resolved patterns prevent ICU differences from breaking hydration. */
  formats?: CalendarFormats;
}) {
  const i18n = useI18n();
  const confirmed = progress.status === "CONFIRMED";
  const frozen = frozenPolicies(progress);
  // `total - advance`, never a stored column: the balance has no column of its own, and
  // `bookingPaymentObligations` derives it exactly this way on the server.
  const accommodationBalance = Math.max(
    0,
    progress.total - (progress.advancePaymentAmount ?? 0),
  );
  // A refund built on a payment the guest reported and the host never confirmed is a
  // claim, not an established debt — and a settlement written before provenance was
  // recorded (`UNKNOWN`) is not evidence of confirmation either.
  const refundIsClaimed =
    (progress.accommodationRefundAmount ?? 0) > 0 &&
    progress.cancellationSettlement != null &&
    progress.cancellationSettlement.refundBasis !== "CONFIRMED";
  const typedRequests = progress.paymentRequests ?? [];
  const draftRequests = typedRequests.filter((request) => request.status === "DRAFT");
  const sentRequests = typedRequests.filter((request) => request.status === "SENT");
  const hasTypedRequests = typedRequests.length > 0;
  const moneyText = (value: number, currency: string) =>
    money(value, currency, i18n.locale, formats);
  const dueDateText = (value: string | null | undefined) =>
    formatDueDate(value, i18n.locale, formats);

  return (
    <Card size={compact ? "sm" : "default"} data-payment-progress={actor.toLowerCase()}>
      <CardHeader>
        <CardTitle>{i18n.resolve("booking.payment_progress.title", "Payment progress").text}</CardTitle>
        <p className="text-sm text-muted-foreground">
          {i18n.resolve("booking.payment_progress.disclaimer", "Reported by host/guest. Linger Homes has not verified or processed this.").text}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2 text-sm sm:grid-cols-2">
          {progress.selectedPaymentMethod ? (
            <p>
              <span className="text-muted-foreground">{i18n.resolve("booking.payment_progress.chosen_method", "Chosen method").text}: </span>
              <span className="font-medium"><PaymentMethodName t={i18n} code={progress.selectedPaymentMethod} otherLabel={progress.paymentMethodOtherLabel ?? null} /></span>
            </p>
          ) : null}
          <p><span className="text-muted-foreground">{i18n.resolve("booking.payment_progress.total", "Payment total").text}: </span><span className="font-medium">{moneyText(progress.total, progress.currency)}</span></p>
        </div>

        {/*
          The track that `paymentStatus` actually governs, named and priced.

          It used to render as a bare "Payment: <status>" line with no figure beside it,
          while the advance and damage tracks each showed theirs. A host looking at a
          booking with a 200 EUR advance had no way to tell that "payment" meant the
          other 800 EUR — and the control under it said "Mark payment received", which
          invites the reading "everything is settled". The arithmetic was always the
          balance; only the label was not.
        */}
        <TrackRow
          kind="accommodation-balance"
          title={i18n.resolve("booking.payment_progress.balance_title", "Accommodation balance").text}
          note={i18n.resolve("booking.payment_progress.balance_note", "The payment total above, minus any advance payment.").text}
          amount={accommodationBalance}
          status={paymentStatusCopy(i18n.resolve, progress.paymentStatus)}
          currency={progress.currency}
          locale={i18n.locale}
          formats={formats}
        />

        {frozen.advancePayment ? (
          <TrackRow
            kind="advance-payment"
            title={i18n.resolve("booking.payment_progress.advance_title", "Advance payment").text}
            note={i18n.resolve("booking.payment_progress.advance_note", "Counts toward the payment total above.").text}
            amount={progress.advancePaymentAmount}
            status={advanceStatusCopy(i18n.resolve, progress.advancePaymentStatus)}
            currency={progress.currency}
            locale={i18n.locale}
            formats={formats}
          />
        ) : null}

        {frozen.damageDeposit ? (
          <TrackRow
            kind="damage-deposit"
            title={i18n.resolve("booking.payment_progress.damage_title", "Refundable damage deposit").text}
            note={i18n.resolve("booking.payment_progress.damage_note", "Additional to the payment total above, and returned by the host.").text}
            amount={progress.damageDepositAmount}
            status={damageStatusCopy(i18n.resolve, progress.damageDepositStatus)}
            currency={progress.currency}
            locale={i18n.locale}
            formats={formats}
          />
        ) : null}

        {progress.depositPolicies ? <DepositPoliciesSummary t={i18n} data={progress.depositPolicies} headingAs="h3" /> : null}

        {progress.cancellationPolicy ? (
          <CancellationPolicySummary t={i18n} data={progress.cancellationPolicy} />
        ) : null}

        {(progress.accommodationRefundAmount ?? 0) > 0 ||
        (progress.accommodationRefundStatus &&
          progress.accommodationRefundStatus !== "NOT_REQUIRED") ? (
          <TrackRow
            kind="accommodation-refund"
            title={i18n.resolve("booking.payment_progress.refund_title", "Accommodation refund").text}
            note={i18n.resolve("booking.payment_progress.refund_note", "Created by the frozen cancellation terms for this booking.").text}
            amount={progress.accommodationRefundAmount ?? 0}
            status={refundStatusCopy(
              i18n.resolve,
              progress.accommodationRefundStatus ?? "NOT_REQUIRED",
            )}
            currency={progress.currency}
            locale={i18n.locale}
            formats={formats}
            caveat={
              refundIsClaimed
                ? i18n.resolve(
                    "booking.payment_progress.refund_claimed",
                    "This amount is based on a payment the guest reported and the host has not confirmed. It is a claim under review, not a confirmed debt. Contact support if the two of you disagree about what was paid.",
                  ).text
                : null
            }
          />
        ) : null}

        {(progress.cancellationSettlement?.retainableAdvanceAmount ?? 0) > 0 ? (
          <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
            {i18n
              .resolve(
                "booking.payment_progress.retainable_advance",
                "The frozen cancellation calculation allows the host to retain up to {amount} of the received advance payment.",
              )
              .text.replace(
                "{amount}",
                moneyText(
                  progress.cancellationSettlement?.retainableAdvanceAmount ?? 0,
                  progress.currency,
                ),
              )}
          </p>
        ) : null}

        {confirmed && (hasTypedRequests ? draftRequests.length > 0 : progress.paymentInstructionsStatus === "PENDING") ? (
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
            <p>
              {actor === "HOST"
                ? i18n.resolve("booking.payment_progress.instructions_pending_host", "Payment instructions still need to be sent. This booking remains in your action list until you send them.").text
                : i18n.resolve("booking.payment_progress.instructions_pending_guest", "The host has accepted your booking and will send payment instructions privately.").text}
            </p>
          </div>
        ) : null}

        {!hasTypedRequests && confirmed && progress.paymentInstructionsStatus === "SENT" ? (
          progress.sentPaymentDetails ? (
            <GuestPaymentCard
              details={progress.sentPaymentDetails}
              amount={moneyText(progress.total, progress.currency)}
              dueDate={dueDateText(progress.paymentInstructionsDueAt)}
              reference={progress.reference ?? ""}
            />
          ) : (
            // A free-text or pre-V2 send has no structured record to render. The
            // private conversation message stays the whole record, exactly as before.
            <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">
              {i18n.resolve("booking.payment_progress.instructions_sent", "Payment instructions were sent in the private conversation.").text}
            </p>
          )
        ) : null}

        {hasTypedRequests && sentRequests.length > 0 ? (
          <div className="space-y-3">
            {sentRequests.map((request) => (
              <section key={request.id} className="space-y-2">
                <p className="text-sm font-semibold">
                  {paymentRequestTitle(i18n.resolve, request.type)} · {moneyText(request.amount, request.currency)}
                </p>
                <p className="text-xs capitalize text-muted-foreground">
                  {requestDisplayState(request)}
                  {request.reminders?.length
                    ? ` · Reminder sent ${request.reminders[0].sentAt.slice(0, 10)}`
                    : ""}
                </p>
                {request.sentPaymentDetails ? (
                  <GuestPaymentCard
                    details={request.sentPaymentDetails}
                    amount={moneyText(request.amount, request.currency)}
                    dueDate={dueDateText(request.dueAt)}
                    reference={progress.reference ?? ""}
                  />
                ) : request.instructionsNotRequired ? (
                  <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
                    {i18n.resolve(
                      "booking.payment_progress.instructions_not_required",
                      "No private payment instructions are needed for this payment method.",
                    ).text}
                  </p>
                ) : (
                  <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">
                    {i18n.resolve("booking.payment_progress.instructions_sent", "Payment instructions were sent in the private conversation.").text}
                  </p>
                )}
              </section>
            ))}
          </div>
        ) : null}

        {actor === "HOST" && confirmed && !hasTypedRequests && progress.paymentInstructionsStatus === "PENDING" ? (
          <PaymentInstructionsForm
            bookingId={progress.bookingId}
            checkIn={progress.checkIn}
            prefill={progress.paymentRequestPrefill}
            initialTemplates={progress.savedPaymentInstructionTemplates}
          />
        ) : null}
        {actor === "HOST" && confirmed && hasTypedRequests
          ? draftRequests.map((request) => (
              <PaymentInstructionsForm
                key={request.id}
                bookingId={progress.bookingId}
                checkIn={progress.checkIn}
                prefill={progress.paymentRequestPrefill}
                initialTemplates={progress.savedPaymentInstructionTemplates}
                paymentRequest={request}
              />
            ))
          : null}
        {progress.transactionReports?.length ? (
          <section className="space-y-2">
            <h3 className="text-sm font-semibold">
              {i18n.resolve("booking.transaction.reports", "Transaction reports").text}
            </h3>
            {progress.transactionReports.map((report) => (
              <div key={report.id} className="rounded-lg border border-border p-3 text-sm">
                <p className="font-medium">
                  {report.track.replaceAll("_", " ")} · {moneyText(report.amount, report.currency)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {i18n.resolve("booking.transaction.reported_by", "Reported by").text}{" "}
                  {report.reporter === "HOST"
                    ? i18n.resolve("common.host", "host").text
                    : report.reporter === "GUEST"
                      ? i18n.resolve("common.guest", "guest").text
                      : i18n.resolve("booking.transaction.deleted_account", "deleted account").text}{" "}
                  {i18n.resolve("common.on", "on").text}{" "}
                  {report.transactionDate.slice(0, 10)}
                </p>
                {report.reference ? (
                  <p className="mt-2 break-all">
                    {i18n.resolve("booking.transaction.reference_short", "Reference:").text}{" "}
                    <span translate="no">{report.reference}</span>
                  </p>
                ) : null}
                {report.note ? <p className="mt-1 whitespace-pre-wrap">{report.note}</p> : null}
                {report.retainedReason ? (
                  <p className="mt-1 whitespace-pre-wrap">
                    {i18n.resolve("booking.transaction.reason_short", "Reason:").text}{" "}
                    <span data-user-generated-content translate="yes">{report.retainedReason}</span>
                  </p>
                ) : null}
              </div>
            ))}
          </section>
        ) : null}
        {/*
          Not gated on `confirmed`: a completed stay still has a deposit to return and
          cash to confirm. `ProgressControls` returns null for every other status, and
          drops the collection-opening buttons once the booking has completed.
        */}
        <ProgressControls progress={progress} actor={actor} />
        <StatusHistory progress={progress} />
      </CardContent>
    </Card>
  );
}
