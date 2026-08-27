"use client";

import { useState } from "react";
import { Check, Copy, Lock } from "lucide-react";
import { PaymentMethodName } from "@/components/booking/accepted-payment-methods";
import { PaymentFieldLabel } from "@/components/host/v2/editor/payment-arrangements/payment-detail-fields";
import { paymentDetailRows } from "@/lib/payments/payment-details";
import type { BookingPaymentDetailsSnapshotV2 } from "@/lib/payments/booking-payment-request";
import { Tx, useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

/**
 * The payment details a guest was sent, as a card they can actually pay from.
 *
 * Values are shown in full and copied one at a time: a guest pays with their banking
 * app open beside this, and a copy button that grabs "IBAN: MK07…" instead of the IBAN
 * pastes something their bank will reject.
 */
export function GuestPaymentCard({
  details,
  amount,
  dueDate,
  reference,
}: {
  details: BookingPaymentDetailsSnapshotV2;
  amount: string;
  dueDate: string | null;
  reference: string;
}) {
  const i18n = useI18n();
  const rows = paymentDetailRows(details.method, details.fields);

  return (
    <section
      data-payment-card
      className="rounded-lg border border-amber-300 bg-amber-50/60 p-3 sm:p-4"
      aria-labelledby="guest-payment-card-heading"
    >
      <div className="flex items-center gap-2">
        <Lock className="size-4 shrink-0 text-amber-800" aria-hidden />
        <h4
          id="guest-payment-card-heading"
          className="text-sm font-semibold text-amber-950"
        >
          <Tx
            k="booking.guest_payment_card.heading"
            source="How to pay the host"
          />
        </h4>
      </div>

      <dl className="mt-3 space-y-2 text-sm">
        <SummaryRow
          label={
            <Tx k="booking.guest_payment_card.method" source="Payment method" />
          }
          value={
            <PaymentMethodName
              t={i18n}
              code={details.method}
              otherLabel={details.otherLabel}
            />
          }
        />
        <SummaryRow
          label={<Tx k="booking.guest_payment_card.amount" source="Amount" />}
          value={amount}
        />
        {dueDate ? (
          <SummaryRow
            label={<Tx k="booking.guest_payment_card.due" source="Payment due" />}
            value={dueDate}
          />
        ) : null}
        <CopyRow
          fieldKey="reference-code"
          label={
            <Tx
              k="booking.guest_payment_card.reference"
              source="Booking reference"
            />
          }
          value={reference}
        />
      </dl>

      {rows.length > 0 ? (
        <dl className="mt-3 space-y-2 border-t border-amber-200 pt-3 text-sm">
          {rows.map((row) =>
            row.copyable ? (
              <CopyRow
                key={row.key}
                fieldKey={row.key}
                label={
                  <PaymentFieldLabel code={details.method} fieldKey={row.key} />
                }
                value={row.value}
              />
            ) : (
              <SummaryRow
                key={row.key}
                label={
                  <PaymentFieldLabel code={details.method} fieldKey={row.key} />
                }
                value={row.value}
                wrap
              />
            ),
          )}
        </dl>
      ) : null}

      <p className="mt-3 border-t border-amber-200 pt-3 text-xs leading-5 text-amber-900">
        <Tx
          k="booking.guest_payment_card.direct_notice"
          source="You pay the host directly. Linger Homes does not collect, hold, verify, protect, or refund this payment."
        />
      </p>
    </section>
  );
}

function SummaryRow({
  label,
  value,
  wrap = false,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  wrap?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2">
      <dt className="text-amber-900">{label}</dt>
      <dd
        className={cn("font-medium text-amber-950", wrap && "whitespace-pre-wrap")}
      >
        {value}
      </dd>
    </div>
  );
}

/**
 * One value with its own copy button.
 *
 * Only the raw value reaches the clipboard — no label, no punctuation, nothing the
 * guest would have to delete before pasting it into their bank.
 */
function CopyRow({
  fieldKey,
  label,
  value,
}: {
  fieldKey: string;
  label: React.ReactNode;
  value: string;
}) {
  const { resolve } = useI18n();
  const [copied, setCopied] = useState(false);
  const labelId = `guest-payment-${fieldKey}-label`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // A denied clipboard permission is not an error worth interrupting a payment
      // for: the value is on screen and can still be selected by hand.
      setCopied(false);
    }
  }

  return (
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0">
        <dt id={labelId} className="text-xs text-amber-900">
          {label}
        </dt>
        <dd
          className="font-mono text-sm break-all text-amber-950"
          translate="no"
        >
          {value}
        </dd>
      </div>
      {/* Every row's button reads "Copy". The field name comes from the row's own
          label, so a screen reader announces "Copy, IBAN" rather than ten identical
          buttons. */}
      <button
        type="button"
        onClick={copy}
        aria-describedby={labelId}
        className="flex shrink-0 items-center gap-1 rounded-md border border-amber-300 bg-white px-2 py-1.5 text-xs font-medium text-amber-900 hover:bg-amber-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
      >
        {copied ? (
          <Check className="size-3.5" aria-hidden />
        ) : (
          <Copy className="size-3.5" aria-hidden />
        )}
        {copied
          ? resolve("booking.guest_payment_card.copied", "Copied").text
          : resolve("booking.guest_payment_card.copy", "Copy").text}
      </button>
      <span role="status" aria-live="polite" className="sr-only">
        {copied
          ? resolve(
              "booking.guest_payment_card.copied_announcement",
              "Copied to clipboard",
            ).text
          : ""}
      </span>
    </div>
  );
}
