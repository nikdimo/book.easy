"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { recordBookingPaymentEventAction } from "@/lib/actions/booking-payment.actions";
import { sendBookingPaymentRequestAction } from "@/lib/actions/booking.actions";
import type { DepositPolicySnapshotV1 } from "@/lib/payments/deposit-policy";
import type { SavedPaymentInstructionTemplate } from "@/lib/payments/payment-instruction-templates";
import type { PaymentMethodCode } from "@/lib/payments/payment-methods";
import { DepositPolicySummary } from "./deposit-policy-summary";
import { PaymentMethodName } from "./accepted-payment-methods";
import { useI18n } from "@/lib/i18n/client";

type PaymentEvent =
  | "HOST_MARK_PAYMENT_DUE"
  | "GUEST_REPORT_PAYMENT_SENT"
  | "HOST_CONFIRM_PAYMENT_RECEIVED"
  | "HOST_MARK_PAYMENT_NOT_REQUIRED"
  | "HOST_MARK_DEPOSIT_DUE"
  | "GUEST_REPORT_DEPOSIT_SENT"
  | "HOST_CONFIRM_DEPOSIT_RECEIVED"
  | "HOST_REPORT_DEPOSIT_RETURNED"
  | "GUEST_CONFIRM_DEPOSIT_RETURNED"
  | "HOST_MARK_DEPOSIT_RETAINED";

export interface BookingPaymentProgressView {
  bookingId: string;
  status: string;
  checkIn: string;
  currency: string;
  total: number;
  depositAmount: number | null;
  depositPolicy: DepositPolicySnapshotV1 | null;
  paymentStatus: string;
  paymentInstructionsStatus: string;
  selectedPaymentMethod: PaymentMethodCode | null;
  paymentMethodOtherLabel?: string | null;
  depositStatus: string;
  paymentStatusEvents: Array<{
    id: string;
    actor: "HOST" | "GUEST";
    eventType: string;
    createdAt: string;
  }>;
  /** Host-only prefill; this component never receives it for a guest. */
  savedPaymentInstructionTemplates?: SavedPaymentInstructionTemplate[];
}

const PAYMENT_LABELS: Record<string, string> = {
  UNTRACKED: "Not tracked",
  NOT_REQUIRED: "Not required",
  AWAITING_PAYMENT: "Awaiting payment",
  PAYMENT_REPORTED: "Payment reported",
  PAYMENT_CONFIRMED: "Payment received",
};

const DEPOSIT_LABELS: Record<string, string> = {
  UNTRACKED: "Not tracked",
  NOT_REQUIRED: "Not required",
  AWAITING_DEPOSIT: "Awaiting deposit",
  DEPOSIT_REPORTED: "Deposit reported",
  DEPOSIT_CONFIRMED: "Deposit received",
  RETURN_REPORTED: "Return reported",
  RETURN_CONFIRMED: "Return confirmed",
  RETAINED: "Deposit retained",
};

function money(value: number, currency: string, locale: string) {
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency }).format(value);
  } catch {
    return `${value} ${currency}`;
  }
}

function statusCopy(
  resolve: ReturnType<typeof useI18n>["resolve"],
  category: "payment" | "deposit",
  value: string,
) {
  if (category === "payment") {
    switch (value) {
      case "UNTRACKED": return resolve("booking.payment_progress.payment_status.untracked", "Not tracked").text;
      case "NOT_REQUIRED": return resolve("booking.payment_progress.payment_status.not_required", "Not required").text;
      case "AWAITING_PAYMENT": return resolve("booking.payment_progress.payment_status.awaiting_payment", "Awaiting payment").text;
      case "PAYMENT_REPORTED": return resolve("booking.payment_progress.payment_status.payment_reported", "Payment reported").text;
      case "PAYMENT_CONFIRMED": return resolve("booking.payment_progress.payment_status.payment_confirmed", "Payment received").text;
    }
  } else {
    switch (value) {
      case "UNTRACKED": return resolve("booking.payment_progress.deposit_status.untracked", "Not tracked").text;
      case "NOT_REQUIRED": return resolve("booking.payment_progress.deposit_status.not_required", "Not required").text;
      case "AWAITING_DEPOSIT": return resolve("booking.payment_progress.deposit_status.awaiting_deposit", "Awaiting deposit").text;
      case "DEPOSIT_REPORTED": return resolve("booking.payment_progress.deposit_status.deposit_reported", "Deposit reported").text;
      case "DEPOSIT_CONFIRMED": return resolve("booking.payment_progress.deposit_status.deposit_confirmed", "Deposit received").text;
      case "RETURN_REPORTED": return resolve("booking.payment_progress.deposit_status.return_reported", "Return reported").text;
      case "RETURN_CONFIRMED": return resolve("booking.payment_progress.deposit_status.return_confirmed", "Return confirmed").text;
      case "RETAINED": return resolve("booking.payment_progress.deposit_status.retained", "Deposit retained").text;
    }
  }
  return (category === "payment" ? PAYMENT_LABELS : DEPOSIT_LABELS)[value] ?? value;
}

function ActorLabel({ actor }: { actor: "HOST" | "GUEST" }) {
  const { resolve } = useI18n();
  return actor === "HOST"
    ? resolve("booking.payment_progress.reported_by_host", "Reported by host").text
    : resolve("booking.payment_progress.reported_by_guest", "Reported by guest").text;
}

const EVENT_LABELS: Record<string, string> = {
  HOST_MARK_PAYMENT_DUE: "Marked payment due",
  GUEST_REPORT_PAYMENT_SENT: "Reported payment sent",
  HOST_CONFIRM_PAYMENT_RECEIVED: "Confirmed payment received",
  HOST_MARK_PAYMENT_NOT_REQUIRED: "Marked payment not required",
  HOST_MARK_DEPOSIT_DUE: "Marked deposit due",
  GUEST_REPORT_DEPOSIT_SENT: "Reported deposit sent",
  HOST_CONFIRM_DEPOSIT_RECEIVED: "Confirmed deposit received",
  HOST_REPORT_DEPOSIT_RETURNED: "Reported deposit returned",
  GUEST_CONFIRM_DEPOSIT_RETURNED: "Confirmed deposit return",
  HOST_MARK_DEPOSIT_RETAINED: "Marked deposit retained",
};

function eventCopy(
  resolve: ReturnType<typeof useI18n>["resolve"],
  eventType: string,
) {
  switch (eventType) {
    case "HOST_MARK_PAYMENT_DUE": return resolve("booking.payment_progress.event.host_mark_payment_due", "Marked payment due").text;
    case "GUEST_REPORT_PAYMENT_SENT": return resolve("booking.payment_progress.event.guest_report_payment_sent", "Reported payment sent").text;
    case "HOST_CONFIRM_PAYMENT_RECEIVED": return resolve("booking.payment_progress.event.host_confirm_payment_received", "Confirmed payment received").text;
    case "HOST_MARK_PAYMENT_NOT_REQUIRED": return resolve("booking.payment_progress.event.host_mark_payment_not_required", "Marked payment not required").text;
    case "HOST_MARK_DEPOSIT_DUE": return resolve("booking.payment_progress.event.host_mark_deposit_due", "Marked deposit due").text;
    case "GUEST_REPORT_DEPOSIT_SENT": return resolve("booking.payment_progress.event.guest_report_deposit_sent", "Reported deposit sent").text;
    case "HOST_CONFIRM_DEPOSIT_RECEIVED": return resolve("booking.payment_progress.event.host_confirm_deposit_received", "Confirmed deposit received").text;
    case "HOST_REPORT_DEPOSIT_RETURNED": return resolve("booking.payment_progress.event.host_report_deposit_returned", "Reported deposit returned").text;
    case "GUEST_CONFIRM_DEPOSIT_RETURNED": return resolve("booking.payment_progress.event.guest_confirm_deposit_returned", "Confirmed deposit return").text;
    case "HOST_MARK_DEPOSIT_RETAINED": return resolve("booking.payment_progress.event.host_mark_deposit_retained", "Marked deposit retained").text;
    default: return EVENT_LABELS[eventType] ?? eventType;
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
  const hasDeposit = (progress.depositAmount ?? 0) > 0;
  const hasSecurityDeposit =
    hasDeposit && progress.depositPolicy?.purpose === "DAMAGE_SECURITY";

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
    { event: "HOST_MARK_DEPOSIT_DUE", label: resolve("booking.payment_progress.mark_deposit_due", "Mark deposit due").text, allowed: hasDeposit && progress.depositStatus === "UNTRACKED" },
    { event: "HOST_CONFIRM_DEPOSIT_RECEIVED", label: resolve("booking.payment_progress.mark_deposit_received", "Mark deposit received").text, allowed: hasDeposit && (progress.depositStatus === "AWAITING_DEPOSIT" || progress.depositStatus === "DEPOSIT_REPORTED") },
    { event: "HOST_REPORT_DEPOSIT_RETURNED", label: resolve("booking.payment_progress.mark_deposit_returned", "Mark deposit returned").text, allowed: hasSecurityDeposit && progress.depositStatus === "DEPOSIT_CONFIRMED" },
    { event: "HOST_MARK_DEPOSIT_RETAINED", label: resolve("booking.payment_progress.mark_deposit_retained", "Mark deposit retained").text, allowed: hasSecurityDeposit && progress.depositStatus === "DEPOSIT_CONFIRMED" },
  ];
  const guestControls: Array<{ event: PaymentEvent; label: string; allowed: boolean }> = [
    { event: "GUEST_REPORT_PAYMENT_SENT", label: resolve("booking.payment_progress.report_payment_sent", "Report payment sent").text, allowed: progress.paymentStatus === "UNTRACKED" || progress.paymentStatus === "AWAITING_PAYMENT" },
    { event: "GUEST_REPORT_DEPOSIT_SENT", label: resolve("booking.payment_progress.report_deposit_sent", "Report deposit sent").text, allowed: hasDeposit && progress.depositStatus === "AWAITING_DEPOSIT" },
    { event: "GUEST_CONFIRM_DEPOSIT_RETURNED", label: resolve("booking.payment_progress.confirm_deposit_return", "Confirm deposit return").text, allowed: hasSecurityDeposit && progress.depositStatus === "RETURN_REPORTED" },
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

function PaymentInstructionsForm({
  bookingId,
  checkIn,
  initialTemplates,
}: {
  bookingId: string;
  checkIn: string;
  initialTemplates?: SavedPaymentInstructionTemplate[];
}) {
  const { resolve } = useI18n();
  const router = useRouter();
  const [body, setBody] = useState(() =>
    formatSavedInstructionTemplates(initialTemplates ?? []),
  );
  const [dueDate, setDueDate] = useState(checkIn);
  const [saveForFuture, setSaveForFuture] = useState(false);
  const [isPending, startTransition] = useTransition();

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!body.trim()) return;
    startTransition(async () => {
      try {
        const result = await sendBookingPaymentRequestAction({
          bookingId,
          instructions: body,
          dueDate,
          saveForFuture,
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
      <div className="space-y-1.5">
        <Label htmlFor={`payment-instructions-${bookingId}`}>
          {resolve("booking.payment_progress.instructions_label", "Secure payment instructions").text}
        </Label>
        <Textarea
          id={`payment-instructions-${bookingId}`}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          maxLength={2000}
          rows={5}
          required
          placeholder={resolve("booking.payment_progress.instructions_placeholder", "Add the private account, payment link, handle, wallet address, or other details the guest needs.").text}
        />
      </div>
      <p className="text-xs leading-5 text-muted-foreground">
        {resolve("booking.payment_progress.instructions_private", "This is sent only inside the Linger Homes conversation.").text}
      </p>
      <p className="text-xs leading-5 text-destructive">
        {resolve("booking.payment_progress.instructions_security", "Never ask for or send a card number, CVV, PIN, password, seed phrase, or private key.").text}
      </p>
      <label className="flex cursor-pointer items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={saveForFuture}
          onChange={(event) => setSaveForFuture(event.currentTarget.checked)}
          className="mt-1 size-4 accent-primary"
        />
        <span>{resolve("booking.payment_progress.save_for_future", "Save these private details for future bookings using this method").text}</span>
      </label>
      <Button type="submit" size="sm" disabled={isPending || !body.trim() || !dueDate}>
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
  const depositAmount = progress.depositAmount;

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
          <p><span className="text-muted-foreground">{i18n.resolve("booking.payment_progress.payment", "Payment").text}: </span><span className="font-medium">{statusCopy(i18n.resolve, "payment", progress.paymentStatus)}</span></p>
          {depositAmount !== null ? (
            <p><span className="text-muted-foreground">{i18n.resolve("booking.payment_progress.frozen_deposit", "Frozen deposit amount").text}: </span><span className="font-medium">{money(depositAmount, progress.currency, i18n.locale)}</span></p>
          ) : null}
          <p><span className="text-muted-foreground">{i18n.resolve("booking.payment_progress.deposit", "Deposit").text}: </span><span className="font-medium">{statusCopy(i18n.resolve, "deposit", progress.depositStatus)}</span></p>
        </div>

        {progress.depositPolicy ? <DepositPolicySummary t={i18n} data={progress.depositPolicy} headingAs="h3" /> : null}

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
          <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">
            {i18n.resolve("booking.payment_progress.instructions_sent", "Payment instructions were sent in the private conversation.").text}
          </p>
        ) : null}

        {actor === "HOST" && confirmed && progress.paymentInstructionsStatus === "PENDING" ? (
          <PaymentInstructionsForm
            bookingId={progress.bookingId}
            checkIn={progress.checkIn}
            initialTemplates={progress.savedPaymentInstructionTemplates}
          />
        ) : null}
        {confirmed ? <ProgressControls progress={progress} actor={actor} /> : null}
        <StatusHistory progress={progress} />
      </CardContent>
    </Card>
  );
}
