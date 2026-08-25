import { cn } from "@/lib/utils";

/**
 * The public Phase 2 vocabulary. Keep this presentation type independent from Prisma
 * so listing rows and frozen booking JSON can both be adapted without importing a
 * database enum into a public or client component.
 */
export const ACCEPTED_PAYMENT_METHOD_CODES = [
  "CASH_AT_PROPERTY",
  "BANK_TRANSFER_LOCAL_SEPA",
  "BANK_TRANSFER_INTERNATIONAL",
  "PAYPAL",
  "REVOLUT",
  "WISE",
  "HOST_SECURE_CARD_LINK",
  "OTHER",
  "ARRANGE_DIRECTLY",
] as const;

export type AcceptedPaymentMethodCode =
  (typeof ACCEPTED_PAYMENT_METHOD_CODES)[number];

export interface AcceptedPaymentMethodsPresentation {
  /** A timestamp means the host deliberately reviewed this setting. */
  reviewedAt: Date | string | null;
  methodCodes: readonly AcceptedPaymentMethodCode[];
  /** A short public name only. It is never a handle, destination or instruction. */
  otherLabel?: string | null;
}

export interface PaymentMethodLabelResolver {
  resolve(
    key: string,
    source: string,
  ): { text: string; translated: boolean };
}

export interface AcceptedPaymentMethodsProps {
  t: PaymentMethodLabelResolver;
  /**
   * Current listing settings use an object with `reviewedAt: null` when unanswered.
   * A null object is reserved for an old booking that has no frozen snapshot.
   */
  data: AcceptedPaymentMethodsPresentation | null;
  appearance?: "plain" | "card";
  headingAs?: "h2" | "h3";
  className?: string;
}

/**
 * Adapts database or JSON-shaped fields at the presentation boundary. Unknown method
 * strings are dropped, duplicates are collapsed, and unsafe host-authored copy never
 * reaches the display model.
 */
export function toAcceptedPaymentMethodsPresentation(input: {
  reviewedAt?: Date | string | null;
  methodCodes?: readonly string[] | null;
  otherLabel?: unknown;
}): AcceptedPaymentMethodsPresentation {
  return {
    reviewedAt: input.reviewedAt ?? null,
    methodCodes: acceptedPaymentMethodCodes(input.methodCodes),
    otherLabel: safeOtherPaymentMethodLabel(input.otherLabel),
  };
}

/**
 * Returns the label guests may safely see, or null when the value resembles contact,
 * account, address or instruction data. Storage validation remains the source of truth;
 * this is a final display guard for old or malformed snapshots.
 */
export function safeOtherPaymentMethodLabel(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (/[\r\n\t\u0000-\u001f\u007f]/u.test(value)) return null;

  const label = value.trim().replace(/ {2,}/g, " ");
  const length = Array.from(label).length;
  if (length < 2 || length > 40) return null;

  // A public label is intentionally much narrower than free-form text. These
  // characters cover ordinary provider and regional method names without admitting
  // URL, email, handle or key/value instruction syntax.
  if (!/^[\p{L}\p{M}\p{N}][\p{L}\p{M}\p{N} &+'’.()-]*$/u.test(label)) {
    return null;
  }

  if (
    /(?:https?:\/\/|www\.)/iu.test(label) ||
    /\b[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.[a-z]{2,}\b/iu.test(label) ||
    /\b(?:send|pay|transfer|deposit|refund|payout|protected|protection|guarantee(?:d)?|paid|unpaid|pending|complete|completed|successful|failed|contact|message|call|email|visit|click|scan)\b/iu.test(
      label,
    ) ||
    /(?:\+?\d[\s().-]*){7,}/u.test(label) ||
    /^\d[\d\s().-]{3,}$/u.test(label) ||
    /\d{6,}/u.test(label)
  ) {
    return null;
  }

  const compact = label.replace(/[\s().'-]/g, "");
  if (
    /^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/u.test(compact.toUpperCase()) ||
    (/^[A-Z0-9]{8}(?:[A-Z0-9]{3})?$/u.test(compact) &&
      /^[A-Z]{6}/u.test(compact)) ||
    /^0x[a-f0-9]{40}$/iu.test(compact) ||
    /^bc1[a-z0-9]{20,}$/iu.test(compact) ||
    /^(?=.*\d)[1-9A-HJ-NP-Za-km-z]{26,44}$/u.test(compact)
  ) {
    return null;
  }

  return label;
}

/**
 * Guest-facing accepted payment methods for both a live listing and a booking's frozen
 * snapshot. It deliberately renders names only: there is no prop through which an
 * account number, handle, URL, deposit, payment state or protection claim can enter.
 */
export function AcceptedPaymentMethods({
  t,
  data,
  appearance = "plain",
  headingAs = "h2",
  className,
}: AcceptedPaymentMethodsProps) {
  const surfaceClassName = cn(
    appearance === "card" &&
      "rounded-xl bg-card p-4 text-card-foreground shadow-sm ring-1 ring-border/80 sm:p-5",
    className,
  );

  if (data === null) {
    return (
      <p
        data-payment-methods-state="snapshot-unavailable"
        className={cn(surfaceClassName, "text-sm leading-6 text-muted-foreground")}
      >
        <ResolvedCopy
          value={t.resolve(
            "booking.accepted_payment_methods.snapshot_unavailable",
            "Accepted payment methods were not recorded for this booking. Confirm the payment arrangement with the host.",
          )}
        />
      </p>
    );
  }

  if (!hasReviewedTimestamp(data.reviewedAt)) {
    return (
      <p
        data-payment-methods-state="unanswered"
        className={cn(surfaceClassName, "text-sm leading-6 text-muted-foreground")}
      >
        <ResolvedCopy
          value={t.resolve(
            "listing.accepted_payment_methods.unanswered",
            "Payment is arranged directly with the host after the booking request is accepted.",
          )}
        />
      </p>
    );
  }

  const methodCodes = acceptedPaymentMethodCodes(data.methodCodes);
  const explanation = t.resolve(
    "listing.accepted_payment_methods.reviewed_explanation",
    "The host will share payment instructions after accepting your request.",
  );

  // ARRANGE_DIRECTLY is exclusive. If malformed legacy data combines it with another
  // code, rendering just this sentence avoids publishing a contradictory promise.
  const arrangedDirectly = methodCodes.includes("ARRANGE_DIRECTLY");
  const visibleCodes = arrangedDirectly
    ? (["ARRANGE_DIRECTLY"] as const)
    : methodCodes.filter(
        (
          code,
        ): code is Exclude<AcceptedPaymentMethodCode, "ARRANGE_DIRECTLY"> =>
          code !== "ARRANGE_DIRECTLY",
      );

  // A reviewed timestamp with no recognized codes is invalid but still distinct from
  // an unanswered listing. Keep the truthful reviewed explanation and omit an empty
  // heading/list rather than inventing a method.
  if (visibleCodes.length === 0) {
    return (
      <p
        data-payment-methods-state="reviewed-empty"
        className={cn(surfaceClassName, "text-sm leading-6 text-muted-foreground")}
      >
        <ResolvedCopy value={explanation} />
      </p>
    );
  }

  const Heading = headingAs;
  const safeOtherLabel = safeOtherPaymentMethodLabel(data.otherLabel);

  return (
    <section
      data-payment-methods-state="reviewed"
      className={surfaceClassName}
    >
      <Heading
        className={cn(
          "font-semibold text-foreground",
          appearance === "card" ? "text-base" : "text-xl",
        )}
      >
        <ResolvedCopy
          value={t.resolve(
            "listing.accepted_payment_methods.heading",
            "Accepted payment methods",
          )}
        />
      </Heading>

      {arrangedDirectly ? (
        <p className="mt-3 flex items-start gap-2 text-sm font-medium leading-6 text-foreground">
          <MethodCheck />
          <ResolvedCopy
            value={t.resolve(
              "listing.accepted_payment_methods.arrange_directly",
              "Payment is arranged directly with the host.",
            )}
          />
        </p>
      ) : (
        <ul className="mt-3 grid gap-2 sm:grid-cols-2" role="list">
          {visibleCodes.map((code) => (
            <li
              key={code}
              data-payment-method={code}
              className="flex min-w-0 items-start gap-2 text-sm leading-6 text-foreground"
            >
              <MethodCheck />
              <span className="min-w-0">
                <PaymentMethodName t={t} code={code} otherLabel={safeOtherLabel} />
              </span>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-3 text-sm leading-6 text-muted-foreground">
        <ResolvedCopy value={explanation} />
      </p>
    </section>
  );
}

function acceptedPaymentMethodCodes(
  methodCodes: readonly string[] | null | undefined,
): AcceptedPaymentMethodCode[] {
  const supplied = new Set(methodCodes ?? []);
  return ACCEPTED_PAYMENT_METHOD_CODES.filter((code) => supplied.has(code));
}

function hasReviewedTimestamp(value: Date | string | null): boolean {
  if (value instanceof Date) return !Number.isNaN(value.getTime());
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function MethodCheck() {
  return (
    <span
      aria-hidden="true"
      className="mt-1 grid size-4 shrink-0 place-items-center rounded-full bg-primary/10 text-primary"
    >
      <svg
        viewBox="0 0 16 16"
        className="size-2.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
      >
        <path d="m3 8 3 3 7-7" />
      </svg>
    </span>
  );
}

function PaymentMethodName({
  t,
  code,
  otherLabel,
}: {
  t: PaymentMethodLabelResolver;
  code: Exclude<AcceptedPaymentMethodCode, "ARRANGE_DIRECTLY">;
  otherLabel: string | null;
}) {
  switch (code) {
    case "CASH_AT_PROPERTY":
      return (
        <ResolvedCopy
          value={t.resolve(
            "listing.accepted_payment_methods.cash_at_property",
            "Cash at the property",
          )}
        />
      );
    case "BANK_TRANSFER_LOCAL_SEPA":
      return (
        <ResolvedCopy
          value={t.resolve(
            "listing.accepted_payment_methods.bank_transfer_local_sepa",
            "Local or SEPA bank transfer",
          )}
        />
      );
    case "BANK_TRANSFER_INTERNATIONAL":
      return (
        <ResolvedCopy
          value={t.resolve(
            "listing.accepted_payment_methods.bank_transfer_international",
            "International bank transfer",
          )}
        />
      );
    case "PAYPAL":
      return (
        <ResolvedCopy
          value={t.resolve(
            "listing.accepted_payment_methods.paypal",
            "PayPal",
          )}
        />
      );
    case "REVOLUT":
      return (
        <ResolvedCopy
          value={t.resolve(
            "listing.accepted_payment_methods.revolut",
            "Revolut",
          )}
        />
      );
    case "WISE":
      return (
        <ResolvedCopy
          value={t.resolve(
            "listing.accepted_payment_methods.wise",
            "Wise",
          )}
        />
      );
    case "HOST_SECURE_CARD_LINK":
      return (
        <ResolvedCopy
          value={t.resolve(
            "listing.accepted_payment_methods.host_secure_card_link",
            "Secure card payment link from the host",
          )}
        />
      );
    case "OTHER": {
      const other = t.resolve(
        "listing.accepted_payment_methods.other",
        "Other payment method",
      );
      return (
        <>
          <ResolvedCopy value={other} />
          {otherLabel ? (
            <>
              {": "}
              <span data-user-generated-content translate="yes">
                {otherLabel}
              </span>
            </>
          ) : null}
        </>
      );
    }
  }
}

function ResolvedCopy({
  value,
}: {
  value: { text: string; translated: boolean };
}) {
  return value.translated ? (
    <span className="notranslate" translate="no">
      {value.text}
    </span>
  ) : (
    <>{value.text}</>
  );
}
