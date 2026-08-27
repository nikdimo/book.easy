"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { recordBookingPaymentEventAction } from "@/lib/actions/booking-payment.actions";
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
import { PaymentMethodName } from "./accepted-payment-methods";
import { useI18n } from "@/lib/i18n/client";

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
  | "HOST_MARK_DAMAGE_DEPOSIT_RETAINED";

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
  paymentStatus: string;
  paymentInstructionsStatus: string;
  selectedPaymentMethod: PaymentMethodCode | null;
  paymentMethodOtherLabel?: string | null;
  advancePaymentStatus: string;
  damageDepositStatus: string;
  paymentStatusEvents: Array<{
    id: string;
    actor: "HOST" | "GUEST";
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
}

/** The sent deadline as a plain date, or null when none was recorded. */
function formatDueDate(value: string | null | undefined, locale: string) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(date);
  } catch {
    return value.slice(0, 10);
  }
}

function money(value: number, currency: string, locale: string) {
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency }).format(value);
  } catch {
    return `${value} ${currency}`;
  }
}

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
    case "PAYMENT_REPORTED": return resolve("booking.payment_progress.payment_status.payment_reported", "Payment reported").text;
    case "PAYMENT_CONFIRMED": return resolve("booking.payment_progress.payment_status.payment_confirmed", "Payment received").text;
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

function ActorLabel({ actor }: { actor: "HOST" | "GUEST" }) {
  const { resolve } = useI18n();
  return actor === "HOST"
    ? resolve("booking.payment_progress.reported_by_host", "Reported by host").text
    : resolve("booking.payment_progress.reported_by_guest", "Reported by guest").text;
}

function eventCopy(
  resolve: ReturnType<typeof useI18n>["resolve"],
  eventType: string,
) {
  switch (eventType) {
    case "HOST_MARK_PAYMENT_DUE": return resolve("booking.payment_progress.event.host_mark_payment_due", "Marked payment due").text;
    case "GUEST_REPORT_PAYMENT_SENT": return resolve("booking.payment_progress.event.guest_report_payment_sent", "Reported payment sent").text;
    case "HOST_CONFIRM_PAYMENT_RECEIVED": return resolve("booking.payment_progress.event.host_confirm_payment_received", "Confirmed payment received").text;
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
  const frozen = frozenPolicies(progress);
  const advance = progress.advancePaymentStatus;
  const damage = progress.damageDepositStatus;

  const send = (event: PaymentEvent) => {
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

  if (progress.status !== "CONFIRMED") return null;

  const hostControls: Array<{ event: PaymentEvent; label: string; allowed: boolean }> = [
    { event: "HOST_MARK_PAYMENT_DUE", label: resolve("booking.payment_progress.mark_payment_due", "Mark payment due").text, allowed: progress.paymentStatus === "UNTRACKED" },
    { event: "HOST_MARK_PAYMENT_NOT_REQUIRED", label: resolve("booking.payment_progress.mark_payment_not_required", "Mark payment not required").text, allowed: progress.paymentStatus === "UNTRACKED" || progress.paymentStatus === "AWAITING_PAYMENT" },
    { event: "HOST_CONFIRM_PAYMENT_RECEIVED", label: resolve("booking.payment_progress.mark_payment_received", "Mark payment received").text, allowed: progress.paymentStatus !== "NOT_REQUIRED" && progress.paymentStatus !== "PAYMENT_CONFIRMED" },
    { event: "HOST_MARK_ADVANCE_PAYMENT_DUE", label: resolve("booking.payment_progress.mark_advance_due", "Mark advance payment due").text, allowed: frozen.advancePayment && advance === "UNTRACKED" },
    { event: "HOST_CONFIRM_ADVANCE_PAYMENT_RECEIVED", label: resolve("booking.payment_progress.mark_advance_received", "Mark advance payment received").text, allowed: frozen.advancePayment && advance !== "NOT_REQUIRED" && advance !== "PAYMENT_CONFIRMED" },
    { event: "HOST_MARK_DAMAGE_DEPOSIT_DUE", label: resolve("booking.payment_progress.mark_damage_due", "Mark damage deposit due").text, allowed: frozen.damageDeposit && damage === "UNTRACKED" },
    { event: "HOST_CONFIRM_DAMAGE_DEPOSIT_RECEIVED", label: resolve("booking.payment_progress.mark_damage_received", "Mark damage deposit received").text, allowed: frozen.damageDeposit && (damage === "UNTRACKED" || damage === "AWAITING_DEPOSIT" || damage === "DEPOSIT_REPORTED") },
    { event: "HOST_REPORT_DAMAGE_DEPOSIT_RETURNED", label: resolve("booking.payment_progress.mark_damage_returned", "Mark damage deposit returned").text, allowed: frozen.damageDeposit && damage === "DEPOSIT_CONFIRMED" },
    { event: "HOST_MARK_DAMAGE_DEPOSIT_RETAINED", label: resolve("booking.payment_progress.mark_damage_retained", "Mark damage deposit retained").text, allowed: frozen.damageDeposit && damage === "DEPOSIT_CONFIRMED" },
  ];
  const guestControls: Array<{ event: PaymentEvent; label: string; allowed: boolean }> = [
    { event: "GUEST_REPORT_PAYMENT_SENT", label: resolve("booking.payment_progress.report_payment_sent", "Report payment sent").text, allowed: progress.paymentStatus === "UNTRACKED" || progress.paymentStatus === "AWAITING_PAYMENT" },
    { event: "GUEST_REPORT_ADVANCE_PAYMENT_SENT", label: resolve("booking.payment_progress.report_advance_sent", "Report advance payment sent").text, allowed: frozen.advancePayment && advance !== "NOT_REQUIRED" && advance !== "PAYMENT_CONFIRMED" },
    { event: "GUEST_REPORT_DAMAGE_DEPOSIT_SENT", label: resolve("booking.payment_progress.report_damage_sent", "Report damage deposit sent").text, allowed: frozen.damageDeposit && (damage === "UNTRACKED" || damage === "AWAITING_DEPOSIT") },
    { event: "GUEST_CONFIRM_DAMAGE_DEPOSIT_RETURNED", label: resolve("booking.payment_progress.confirm_damage_return", "Confirm damage deposit return").text, allowed: frozen.damageDeposit && damage === "RETURN_REPORTED" },
  ];
  const controls = (actor === "HOST" ? hostControls : guestControls).filter((control) => control.allowed);
  if (controls.length === 0) return null;

  return (
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
  );
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
}: {
  bookingId: string;
  checkIn: string;
  prefill?: BookingPaymentRequestPrefill;
  initialTemplates?: SavedPaymentInstructionTemplate[];
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
  const [dueDate, setDueDate] = useState(checkIn);
  const [isPending, startTransition] = useTransition();

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!request.isReady) return;
    startTransition(async () => {
      try {
        const result = await sendBookingPaymentRequestAction({
          bookingId,
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
}: {
  kind: "advance-payment" | "damage-deposit";
  title: string;
  note: string;
  amount: number | null;
  status: string;
  currency: string;
  locale: string;
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
              {money(amount, currency, locale)}
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
    </div>
  );
}

/** Participant-facing manual payment progress. It never receives payment instruction text. */
export function BookingPaymentProgress({
  progress,
  actor,
  compact = false,
}: {
  progress: BookingPaymentProgressView;
  actor: "HOST" | "GUEST";
  compact?: boolean;
}) {
  const i18n = useI18n();
  const confirmed = progress.status === "CONFIRMED";
  const frozen = frozenPolicies(progress);

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
          <p><span className="text-muted-foreground">{i18n.resolve("booking.payment_progress.total", "Payment total").text}: </span><span className="font-medium">{money(progress.total, progress.currency, i18n.locale)}</span></p>
          <p><span className="text-muted-foreground">{i18n.resolve("booking.payment_progress.payment", "Payment").text}: </span><span className="font-medium">{paymentStatusCopy(i18n.resolve, progress.paymentStatus)}</span></p>
        </div>

        {frozen.advancePayment ? (
          <TrackRow
            kind="advance-payment"
            title={i18n.resolve("booking.payment_progress.advance_title", "Advance payment").text}
            note={i18n.resolve("booking.payment_progress.advance_note", "Counts toward the payment total above.").text}
            amount={progress.advancePaymentAmount}
            status={advanceStatusCopy(i18n.resolve, progress.advancePaymentStatus)}
            currency={progress.currency}
            locale={i18n.locale}
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
          />
        ) : null}

        {progress.depositPolicies ? <DepositPoliciesSummary t={i18n} data={progress.depositPolicies} headingAs="h3" /> : null}

        {confirmed && progress.paymentInstructionsStatus === "PENDING" ? (
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
            <p>
              {actor === "HOST"
                ? i18n.resolve("booking.payment_progress.instructions_pending_host", "Payment instructions still need to be sent. This booking remains in your action list until you send them.").text
                : i18n.resolve("booking.payment_progress.instructions_pending_guest", "The host has accepted your booking and will send payment instructions privately.").text}
            </p>
          </div>
        ) : null}

        {confirmed && progress.paymentInstructionsStatus === "SENT" ? (
          progress.sentPaymentDetails ? (
            <GuestPaymentCard
              details={progress.sentPaymentDetails}
              amount={money(progress.total, progress.currency, i18n.locale)}
              dueDate={formatDueDate(progress.paymentInstructionsDueAt, i18n.locale)}
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

        {actor === "HOST" && confirmed && progress.paymentInstructionsStatus === "PENDING" ? (
          <PaymentInstructionsForm
            bookingId={progress.bookingId}
            checkIn={progress.checkIn}
            prefill={progress.paymentRequestPrefill}
            initialTemplates={progress.savedPaymentInstructionTemplates}
          />
        ) : null}
        {confirmed ? <ProgressControls progress={progress} actor={actor} /> : null}
        <StatusHistory progress={progress} />
      </CardContent>
    </Card>
  );
}
