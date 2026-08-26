import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/currency/convert";
import type { DepositPolicySnapshotV1 } from "@/lib/payments/deposit-policy";
import type { PaymentMethodLabelResolver } from "./accepted-payment-methods";

export interface DepositPolicySummaryProps {
  t: PaymentMethodLabelResolver;
  /** A validated, serializable public snapshot. Never pass raw listing fields here. */
  data: DepositPolicySnapshotV1;
  appearance?: "plain" | "card";
  headingAs?: "h2" | "h3";
  className?: string;
}

/**
 * Public terms for a host-managed deposit. This component is safe in both Server and
 * Client Component trees: its input is serializable and it intentionally has no path
 * for payment instructions or operational payment data.
 */
export function DepositPolicySummary({
  t,
  data,
  appearance = "plain",
  headingAs = "h2",
  className,
}: DepositPolicySummaryProps) {
  const surfaceClassName = cn(
    appearance === "card" &&
      "rounded-xl bg-card p-4 text-card-foreground shadow-sm ring-1 ring-border/80 sm:p-5",
    className,
  );
  const Heading = headingAs;
  const reviewed = data.status === "REVIEWED";
  const required = data.policy === "FIXED" || data.policy === "PERCENTAGE";

  return (
    <section data-deposit-policy-state={required ? "required" : reviewed ? "none" : "unanswered"} className={surfaceClassName}>
      <Heading className={cn("font-semibold text-foreground", appearance === "card" ? "text-base" : "text-xl")}>
        <ResolvedCopy value={t.resolve("listing.deposit_policy.heading", "Deposit policy")} />
      </Heading>

      {!reviewed ? (
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          <ResolvedCopy value={t.resolve("listing.deposit_policy.unanswered", "The host has not specified a deposit policy.")} />
        </p>
      ) : !required ? (
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          <ResolvedCopy value={t.resolve("listing.deposit_policy.none", "No deposit is required by the host.")} />
        </p>
      ) : (
        <div className="mt-3 space-y-1.5 text-sm leading-6 text-foreground">
          <p className="font-medium">
            <ResolvedCopy value={depositAmountCopy(t, data)} />
          </p>
          <p><ResolvedCopy value={depositPurposeCopy(t, data.purpose)} /></p>
          <p><ResolvedCopy value={depositDueCopy(t, data)} /></p>
          {data.purpose === "DAMAGE_SECURITY" && validPositiveInteger(data.returnDaysAfterCheckout) ? (
            <p><ResolvedCopy value={interpolate(t, "listing.deposit_policy.return_within_days", "The host says this refundable security deposit will be returned within {days} days after check-out.", { days: data.returnDaysAfterCheckout })} /></p>
          ) : null}
        </div>
      )}

      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
        <ResolvedCopy value={t.resolve("listing.deposit_policy.direct_payment_disclaimer", "Guests pay the host directly. Linger Homes does not collect, hold, verify, protect, or refund this payment.")} />
      </p>
    </section>
  );
}

function depositAmountCopy(t: PaymentMethodLabelResolver, data: DepositPolicySnapshotV1) {
  if (data.policy === "PERCENTAGE") {
    return interpolate(t, "listing.deposit_policy.required_percentage", "Required deposit: {value}% of the stay price.", { value: displayValue(data.value) });
  }
  // The host's own deposit amount, in the host's own currency — never converted.
  // Formatted with the reading locale's separators and symbol placement rather than
  // a bare "{value} {currency}" concatenation, which always printed as English digits.
  const amount =
    data.value !== null && data.currency !== null
      ? formatMoney(Number(data.value), data.currency, t.locale ?? "en", { exact: true })
      : displayValue(data.value);
  return interpolate(t, "listing.deposit_policy.required_fixed_amount", "Required deposit: {amount}.", { amount });
}

function depositPurposeCopy(t: PaymentMethodLabelResolver, purpose: DepositPolicySnapshotV1["purpose"]) {
  return purpose === "DAMAGE_SECURITY"
    ? t.resolve("listing.deposit_policy.damage_security", "Purpose: refundable damage/security deposit.")
    : t.resolve("listing.deposit_policy.advance_payment", "Purpose: advance payment.");
}

function depositDueCopy(t: PaymentMethodLabelResolver, data: DepositPolicySnapshotV1) {
  if (data.dueTiming === "DAYS_BEFORE_CHECK_IN" && validPositiveInteger(data.dueDaysBeforeCheckIn)) {
    return interpolate(t, "listing.deposit_policy.due_days_before_check_in", "Due {days} days before check-in.", { days: data.dueDaysBeforeCheckIn });
  }
  return data.dueTiming === "AT_CHECK_IN"
    ? t.resolve("listing.deposit_policy.due_at_check_in", "Due at check-in.")
    : t.resolve("listing.deposit_policy.due_after_acceptance", "Due after the booking request is accepted.");
}

function displayValue(value: string | null): string {
  return value ?? "—";
}

function validPositiveInteger(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function interpolate(
  t: PaymentMethodLabelResolver,
  key: string,
  source: string,
  values: Record<string, string | number>,
) {
  // Keep every variable deposit sentence visible to the static i18n extractor. A
  // generic `resolve(key, source)` call cannot be catalogued because both arguments
  // are runtime variables, even though today's callers pass constants.
  const resolved = (() => {
    switch (key) {
      case "listing.deposit_policy.return_within_days":
        return t.resolve(
          "listing.deposit_policy.return_within_days",
          "The host says this refundable security deposit will be returned within {days} days after check-out.",
        );
      case "listing.deposit_policy.required_percentage":
        return t.resolve(
          "listing.deposit_policy.required_percentage",
          "Required deposit: {value}% of the stay price.",
        );
      case "listing.deposit_policy.required_fixed_amount":
        return t.resolve(
          "listing.deposit_policy.required_fixed_amount",
          "Required deposit: {amount}.",
        );
      case "listing.deposit_policy.due_days_before_check_in":
        return t.resolve(
          "listing.deposit_policy.due_days_before_check_in",
          "Due {days} days before check-in.",
        );
      default:
        return t.resolve(key, source);
    }
  })();
  return {
    ...resolved,
    text: Object.entries(values).reduce(
      (text, [name, value]) => text.replace(`{${name}}`, String(value)),
      resolved.text,
    ),
  };
}

function ResolvedCopy({ value }: { value: { text: string; translated: boolean } }) {
  return value.translated ? <span className="notranslate" translate="no">{value.text}</span> : <>{value.text}</>;
}
