"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Clock3, Loader2, Send, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  acceptBookingWithPaymentAction,
  getBookingAcceptancePaymentDataAction,
  rejectBookingAction,
} from "@/lib/actions/booking.actions";
import { PaymentMethodName } from "@/components/booking/accepted-payment-methods";
import type { PaymentMethodCode } from "@/lib/payments/payment-methods";
import {
  paymentMethodCanNeedNoInstructions,
  type BookingPaymentDecision,
  type BookingPaymentRequestPrefill,
} from "@/lib/payments/booking-payment-request";
import {
  PaymentRequestComposer,
  type PaymentRequestValue,
} from "@/components/booking/payment-request-composer";
import { Tx, useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

type AcceptanceData = {
  bookingId: string;
  listingId: string;
  reference: string;
  guestName: string | null;
  currency: string;
  total: number;
  checkIn: string;
  selectedPaymentMethod: PaymentMethodCode | null;
  methodSource: "GUEST" | "HOST_FALLBACK";
  availableMethods: PaymentMethodCode[];
  otherLabel: string | null;
  savedInstructions: string;
  savedDetailsKind: "STRUCTURED" | "LEGACY_TEXT" | "NONE";
  savedDetailFields: Record<string, string>;
};

/** The acceptance payload, in the shape the shared composer expects. */
function prefillFrom(payment: AcceptanceData): BookingPaymentRequestPrefill {
  return {
    method: payment.selectedPaymentMethod,
    methodSource: payment.methodSource,
    availableMethods: payment.availableMethods,
    otherLabel: payment.otherLabel,
    savedDetailsKind: payment.savedDetailsKind,
    savedDetailFields: payment.savedDetailFields,
    savedInstructions: payment.savedInstructions,
  };
}

function amount(value: number, currency: string, locale: string) {
  try {
    return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 3 }).format(value)} ${currency}`;
  } catch {
    return `${value} ${currency}`;
  }
}

export function HostBookingActions({ bookingId }: { bookingId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [decision, setDecision] = useState<"accept" | "decline" | null>(null);
  const [reason, setReason] = useState("");
  const [payment, setPayment] = useState<AcceptanceData | null>(null);
  const [loadingPayment, setLoadingPayment] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [paymentDecision, setPaymentDecision] =
    useState<BookingPaymentDecision>("SEND_NOW");
  const [request, setRequest] = useState<PaymentRequestValue>({
    method: null,
    mode: "FREE_TEXT",
    fields: {},
    instructions: "",
    saveForFuture: false,
    isReady: false,
  });
  const [dueDate, setDueDate] = useState("");
  const { locale, resolve } = useI18n();

  async function openAccept() {
    setDecision("accept");
    setPayment(null);
    setPaymentError(null);
    setLoadingPayment(true);
    const result = await getBookingAcceptancePaymentDataAction(bookingId);
    setLoadingPayment(false);
    if ("error" in result) {
      setPaymentError(result.error ?? "Could not load booking details");
      return;
    }
    const next = result.data as AcceptanceData;
    setPayment(next);
    setRequest({
      method: next.selectedPaymentMethod,
      mode: "FREE_TEXT",
      fields: {},
      instructions: next.savedInstructions,
      saveForFuture: false,
      isReady: false,
    });
    setDueDate(next.checkIn);
    setPaymentDecision(
      paymentMethodCanNeedNoInstructions(next.selectedPaymentMethod)
        ? "NO_INSTRUCTIONS"
        : "SEND_NOW",
    );
  }

  function close() {
    setDecision(null);
    setPayment(null);
    setPaymentError(null);
    setReason("");
  }

  function submit() {
    if (!decision) return;
    startTransition(async () => {
      const result =
        decision === "accept"
          ? await acceptBookingWithPaymentAction({
              bookingId,
              decision: paymentDecision,
              ...(paymentDecision === "SEND_NOW"
                ? {
                    ...(request.mode === "STRUCTURED"
                      ? { detailFields: request.fields }
                      : { instructions: request.instructions }),
                    // Only offered, and only accepted by the server, for a booking
                    // whose guest never recorded a choice.
                    ...(payment?.methodSource === "HOST_FALLBACK" && request.method
                      ? { method: request.method }
                      : {}),
                    dueDate,
                    saveForFuture: request.saveForFuture,
                  }
                : {}),
            })
          : await rejectBookingAction(bookingId, reason.trim());
      if (result.error) {
        toast.error(result.error);
        return;
      }
      if ("warning" in result && result.warning) toast.warning(result.warning);
      else {
        toast.success(
          decision === "accept"
            ? paymentDecision === "SEND_NOW"
              ? resolve(
                  "host.booking.accepted_and_payment_sent_toast",
                  "Booking accepted and payment request sent",
                ).text
              : resolve("host.booking.confirmed_toast", "Booking confirmed").text
            : resolve("host.booking.declined_toast", "Request declined").text,
        );
      }
      close();
      router.refresh();
    });
  }

  const canSubmitAccept = Boolean(
    payment &&
      !loadingPayment &&
      !paymentError &&
      (paymentDecision !== "SEND_NOW" || (request.isReady && dueDate)),
  );

  return (
    <>
      <div className="flex flex-wrap items-center gap-1">
        <Button
          onClick={() => void openAccept()}
          className="bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-500"
        >
          <Check className="mr-1 h-4 w-4" />
          <Tx k="host.booking.accept" source="Accept request" />
        </Button>
        <Button
          variant="ghost"
          onClick={() => setDecision("decline")}
          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
        >
          <X className="mr-1 h-4 w-4" />
          <Tx k="host.booking.decline" source="Decline" />
        </Button>
      </div>

      <Dialog open={decision !== null} onOpenChange={(open) => !open && close()}>
        <DialogContent
          variant="sheet"
          className={cn(
            // The sheet variant drops its height cap at `md`, so a long accept panel
            // runs off the top and bottom of the window. Cap it in both shapes and
            // scroll the body between a pinned header and footer.
            "max-h-[92dvh] overflow-hidden md:max-h-[85dvh]",
            "grid-rows-[auto_minmax(0,1fr)_auto]",
            decision === "accept" ? "md:max-w-2xl" : "md:max-w-md",
          )}
        >
          <DialogHeader>
            <span
              className={cn(
                "mb-1 grid size-10 place-items-center rounded-full",
                decision === "decline"
                  ? "bg-destructive/10 text-destructive"
                  : "bg-emerald-600/10 text-emerald-700 dark:text-emerald-400",
              )}
            >
              {decision === "decline" ? (
                <X className="h-5 w-5" />
              ) : (
                <Check className="h-5 w-5" />
              )}
            </span>
            <DialogTitle>
              {decision === "accept" ? (
                <Tx k="host.booking.accept_title" source="Accept this booking" />
              ) : (
                <Tx k="host.booking.decline_title" source="Decline this request?" />
              )}
            </DialogTitle>
            <DialogDescription>
              {decision === "accept" ? (
                <Tx
                  k="host.booking.accept_payment_body"
                  source="Review the guest's payment choice and decide whether to send instructions now or later. Nothing is sent until you confirm below."
                />
              ) : (
                <Tx
                  k="host.booking.decline_body"
                  source="Tell the guest why you cannot host them. Their dates will be released immediately."
                />
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 overflow-y-auto px-[var(--dialog-inset)] -mx-[var(--dialog-inset)]">
          {decision === "accept" ? (
            loadingPayment ? (
              <div className="grid min-h-44 place-items-center text-muted-foreground">
                <Loader2
                  className="size-6 animate-spin"
                  aria-label={
                    resolve(
                      "host.booking.loading_payment",
                      "Loading payment details",
                    ).text
                  }
                />
              </div>
            ) : paymentError ? (
              <p
                role="alert"
                className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive"
              >
                {paymentError}
              </p>
            ) : payment ? (
              <div className="space-y-5">
                <section className="rounded-xl border bg-muted/25 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <Tx k="host.booking.guest_payment_choice" source="Guest chose" />
                  </p>
                  <div className="mt-1 flex flex-wrap items-baseline justify-between gap-2">
                    <p className="font-semibold">
                      {payment.selectedPaymentMethod ? (
                        <PaymentMethodName
                          t={{ resolve, locale }}
                          code={payment.selectedPaymentMethod}
                          otherLabel={payment.otherLabel}
                        />
                      ) : (
                        <Tx
                          k="host.booking.payment_choice_missing"
                          source="Payment method not recorded"
                        />
                      )}
                    </p>
                    <p
                      className="text-sm font-medium tabular-nums"
                      translate="no"
                    >
                      {amount(payment.total, payment.currency, locale)}
                    </p>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground" translate="no">
                    {payment.reference}
                  </p>
                </section>

                <fieldset className="space-y-2">
                  <legend className="text-sm font-semibold">
                    <Tx
                      k="host.booking.payment_next_step"
                      source="Payment instructions"
                    />
                  </legend>
                  <PaymentDecisionOption
                    value="SEND_NOW"
                    current={paymentDecision}
                    icon={Send}
                    title={
                      resolve(
                        "host.booking.payment_send_now",
                        "Accept and send payment request",
                      ).text
                    }
                    description={
                      resolve(
                        "host.booking.payment_send_now_hint",
                        "Review the private details below and send them with the booking total and reference.",
                      ).text
                    }
                    onChange={setPaymentDecision}
                  />
                  <PaymentDecisionOption
                    value="SEND_LATER"
                    current={paymentDecision}
                    icon={Clock3}
                    title={
                      resolve(
                        "host.booking.payment_send_later",
                        "Accept and send later",
                      ).text
                    }
                    description={
                      resolve(
                        "host.booking.payment_send_later_hint",
                        "The booking is accepted now and remains in your action list until instructions are sent.",
                      ).text
                    }
                    onChange={setPaymentDecision}
                  />
                  {paymentMethodCanNeedNoInstructions(
                    payment.selectedPaymentMethod,
                  ) ? (
                    <PaymentDecisionOption
                      value="NO_INSTRUCTIONS"
                      current={paymentDecision}
                      icon={Check}
                      title={
                        resolve(
                          "host.booking.payment_no_instructions",
                          "No instructions needed",
                        ).text
                      }
                      description={
                        resolve(
                          "host.booking.payment_no_instructions_hint",
                          "Use this for cash at the property or an arrangement you will make directly.",
                        ).text
                      }
                      onChange={setPaymentDecision}
                    />
                  ) : null}
                </fieldset>

                {paymentDecision === "SEND_NOW" ? (
                  <section className="space-y-4 rounded-xl border p-4">
                    <div className="space-y-1.5">
                      <Label htmlFor={`payment-due-${bookingId}`}>
                        <Tx k="host.booking.payment_due" source="Payment due" />
                      </Label>
                      <Input
                        id={`payment-due-${bookingId}`}
                        type="date"
                        value={dueDate}
                        max={payment.checkIn}
                        onChange={(event) =>
                          setDueDate(event.currentTarget.value)
                        }
                        required
                      />
                    </div>
                    <PaymentRequestComposer
                      prefill={prefillFrom(payment)}
                      idPrefix={`accept-payment-${bookingId}`}
                      disabled={isPending}
                      onChange={setRequest}
                    />
                    <p className="text-xs leading-5 text-muted-foreground">
                      <Tx
                        k="host.booking.payment_request_prepared"
                        source="The booking reference, selected method, total, currency, and deadline are added automatically."
                      />
                    </p>
                  </section>
                ) : null}
              </div>
            ) : null
          ) : (
            <div className="flex flex-col gap-1.5">
              <Textarea
                autoFocus
                id="decline-reason"
                rows={4}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder={
                  resolve(
                    "host.booking.decline_placeholder",
                    "Brief reason for declining (required)",
                  ).text
                }
                maxLength={500}
                className="resize-none"
              />
              <span
                className="self-end text-xs text-muted-foreground tabular-nums"
                translate="no"
              >
                {reason.length}/500
              </span>
            </div>
          )}
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" size="lg" className="sm:w-auto">
                <Tx k="host.booking.go_back" source="Go back" />
              </Button>
            </DialogClose>
            <Button
              size="lg"
              variant={decision === "decline" ? "destructive" : "default"}
              disabled={
                isPending ||
                (decision === "decline" && !reason.trim()) ||
                (decision === "accept" && !canSubmitAccept)
              }
              onClick={submit}
              className={
                decision === "decline"
                  ? "sm:w-auto"
                  : "bg-emerald-600 text-white hover:bg-emerald-700 sm:w-auto"
              }
            >
              {isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : decision === "decline" ? (
                <X className="h-4 w-4" />
              ) : paymentDecision === "SEND_NOW" ? (
                <Send className="h-4 w-4" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              {isPending
                ? resolve("host.booking.saving", "Saving…").text
                : decision === "decline"
                  ? resolve(
                      "host.booking.decline_action",
                      "Decline request",
                    ).text
                  : paymentDecision === "SEND_NOW"
                    ? resolve(
                        "host.booking.accept_send_action",
                        "Accept booking and send payment request",
                      ).text
                    : resolve(
                        "host.booking.confirm_action",
                        "Accept booking",
                      ).text}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function PaymentDecisionOption({
  value,
  current,
  icon: Icon,
  title,
  description,
  onChange,
}: {
  value: BookingPaymentDecision;
  current: BookingPaymentDecision;
  icon: typeof Send;
  title: string;
  description: string;
  onChange: (value: BookingPaymentDecision) => void;
}) {
  const checked = value === current;
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors",
        checked
          ? "border-primary bg-primary/5 ring-1 ring-primary"
          : "hover:bg-muted/40",
      )}
    >
      <input
        type="radio"
        name="payment-acceptance-decision"
        value={value}
        checked={checked}
        onChange={() => onChange(value)}
        className="mt-1 size-4 accent-primary"
      />
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
      <span>
        <span className="block text-sm font-semibold">{title}</span>
        <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
          {description}
        </span>
      </span>
    </label>
  );
}
