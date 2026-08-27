import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/currency/convert";
import type {
  AdvancePaymentPolicy,
  DamageDepositPolicy,
  DepositPoliciesSnapshotV2,
} from "@/lib/payments/deposit-policies";
import type { PaymentMethodLabelResolver } from "./accepted-payment-methods";

export interface DepositPoliciesSummaryProps {
  t: PaymentMethodLabelResolver;
  /** A validated, serializable public snapshot. Never pass raw listing fields here. */
  data: DepositPoliciesSnapshotV2;
  appearance?: "plain" | "card";
  headingAs?: "h2" | "h3";
  className?: string;
}

/**
 * Public terms for a host's advance payment and damage deposit.
 *
 * The two are rendered as separate blocks with their own explanation of what the money
 * is, because the difference is the thing a guest most needs to understand before they
 * commit: an advance payment comes off the booking price, while a damage deposit is
 * extra money the host expects to give back. A single merged figure would be a lie about
 * both.
 *
 * Safe in both Server and Client Component trees: its input is serializable and it
 * intentionally has no path for payment instructions or operational payment data.
 */
export function DepositPoliciesSummary({
  t,
  data,
  appearance = "plain",
  headingAs = "h2",
  className,
}: DepositPoliciesSummaryProps) {
  const surfaceClassName = cn(
    appearance === "card" &&
      "rounded-xl bg-card p-4 text-card-foreground shadow-sm ring-1 ring-border/80 sm:p-5",
    className,
  );
  const Heading = headingAs;
  const BlockHeading = headingAs === "h2" ? "h3" : "h4";
  const reviewed = data.status === "REVIEWED";
  const required = Boolean(data.advancePayment || data.damageDeposit);

  return (
    <section
      data-deposit-policies-state={
        required ? "required" : reviewed ? "none" : "unanswered"
      }
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
            "listing.deposit_policies.heading",
            "Advance payment and damage deposit",
          )}
        />
      </Heading>

      {!reviewed ? (
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          <ResolvedCopy
            value={t.resolve(
              "listing.deposit_policies.unanswered",
              "The host has not said whether they ask for an advance payment or a damage deposit.",
            )}
          />
        </p>
      ) : !required ? (
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          <ResolvedCopy
            value={t.resolve(
              "listing.deposit_policies.none",
              "The host does not ask for an advance payment or a refundable damage deposit.",
            )}
          />
        </p>
      ) : (
        <div className="mt-3 space-y-3">
          {data.advancePayment ? (
            <PolicyBlock
              kind="advance-payment"
              headingAs={BlockHeading}
              title={
                <ResolvedCopy
                  value={t.resolve(
                    "listing.deposit_policies.advance.title",
                    "Advance payment toward the booking",
                  )}
                />
              }
              explanation={
                <ResolvedCopy
                  value={t.resolve(
                    "listing.deposit_policies.advance.explanation",
                    "This counts toward the price of your stay. It is part of the booking total, not an extra cost, and it is not a refundable damage deposit.",
                  )}
                />
              }
              amount={<ResolvedCopy value={advanceAmountCopy(t, data.advancePayment)} />}
              due={<ResolvedCopy value={dueCopy(t, data.advancePayment)} />}
            />
          ) : null}

          {data.damageDeposit ? (
            <PolicyBlock
              kind="damage-deposit"
              headingAs={BlockHeading}
              title={
                <ResolvedCopy
                  value={t.resolve(
                    "listing.deposit_policies.damage.title",
                    "Refundable damage deposit",
                  )}
                />
              }
              explanation={
                <ResolvedCopy
                  value={t.resolve(
                    "listing.deposit_policies.damage.explanation",
                    "This is separate from the price of your stay and is held as security against damage. It is additional money on top of the booking total, and the host returns it if nothing is damaged.",
                  )}
                />
              }
              amount={<ResolvedCopy value={damageAmountCopy(t, data.damageDeposit)} />}
              due={<ResolvedCopy value={dueCopy(t, data.damageDeposit)} />}
              extra={
                validPositiveInteger(data.damageDeposit.returnDaysAfterCheckout) ? (
                  <ResolvedCopy
                    value={interpolate(
                      t,
                      "listing.deposit_policies.damage.return_within_days",
                      "The host says they expect to return it within {days} days after check-out.",
                      { days: data.damageDeposit.returnDaysAfterCheckout },
                    )}
                  />
                ) : null
              }
            />
          ) : null}

          {data.advancePayment && data.damageDeposit ? (
            <p
              data-deposit-policies-separate-note
              className="text-sm leading-6 text-foreground"
            >
              <ResolvedCopy
                value={t.resolve(
                  "listing.deposit_policies.both_note",
                  "These are two separate amounts and are not added together. The advance payment is part of what your stay costs; the damage deposit is extra money the host expects to give back.",
                )}
              />
            </p>
          ) : null}
        </div>
      )}

      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
        <ResolvedCopy
          value={t.resolve(
            "listing.deposit_policy.direct_payment_disclaimer",
            "Guests pay the host directly. Linger Homes does not collect, hold, verify, protect, or refund this payment.",
          )}
        />
      </p>
    </section>
  );
}

function PolicyBlock({
  kind,
  headingAs,
  title,
  explanation,
  amount,
  due,
  extra,
}: {
  kind: "advance-payment" | "damage-deposit";
  headingAs: "h3" | "h4";
  title: React.ReactNode;
  explanation: React.ReactNode;
  amount: React.ReactNode;
  due: React.ReactNode;
  extra?: React.ReactNode;
}) {
  const Heading = headingAs;
  return (
    <div
      data-deposit-policy={kind}
      className="rounded-lg border border-border/80 p-3 sm:p-4"
    >
      <Heading className="text-sm font-semibold text-foreground">{title}</Heading>
      <p className="mt-1 text-sm leading-6 text-muted-foreground">{explanation}</p>
      <div className="mt-2 space-y-1 text-sm leading-6 text-foreground">
        <p className="font-medium">{amount}</p>
        <p>{due}</p>
        {extra ? <p>{extra}</p> : null}
      </div>
    </div>
  );
}

function advanceAmountCopy(
  t: PaymentMethodLabelResolver,
  policy: AdvancePaymentPolicy,
) {
  return policy.amountType === "PERCENTAGE"
    ? interpolate(
        t,
        "listing.deposit_policies.advance.percentage",
        "Advance payment: {value}% of the booking total.",
        { value: policy.value },
      )
    : interpolate(
        t,
        "listing.deposit_policies.advance.fixed",
        "Advance payment: {amount}.",
        { amount: formatPolicyAmount(t, policy) },
      );
}

function damageAmountCopy(
  t: PaymentMethodLabelResolver,
  policy: DamageDepositPolicy,
) {
  return policy.amountType === "PERCENTAGE"
    ? interpolate(
        t,
        "listing.deposit_policies.damage.percentage",
        "Damage deposit: {value}% of the booking total.",
        { value: policy.value },
      )
    : interpolate(
        t,
        "listing.deposit_policies.damage.fixed",
        "Damage deposit: {amount}.",
        { amount: formatPolicyAmount(t, policy) },
      );
}

/**
 * The host's own amount, in the host's own currency — never converted. Formatted with
 * the reading locale's separators and symbol placement rather than a bare
 * "{value} {currency}" concatenation, which always printed as English digits.
 */
function formatPolicyAmount(
  t: PaymentMethodLabelResolver,
  policy: AdvancePaymentPolicy,
): string {
  return formatMoney(Number(policy.value), policy.currency, t.locale ?? "en", {
    exact: true,
  });
}

function dueCopy(t: PaymentMethodLabelResolver, policy: AdvancePaymentPolicy) {
  if (
    policy.dueTiming === "DAYS_BEFORE_CHECK_IN" &&
    validPositiveInteger(policy.dueDaysBeforeCheckIn)
  ) {
    return interpolate(
      t,
      "listing.deposit_policy.due_days_before_check_in",
      "Due {days} days before check-in.",
      { days: policy.dueDaysBeforeCheckIn },
    );
  }
  return policy.dueTiming === "AT_CHECK_IN"
    ? t.resolve("listing.deposit_policy.due_at_check_in", "Due at check-in.")
    : t.resolve(
        "listing.deposit_policy.due_after_acceptance",
        "Due after the booking request is accepted.",
      );
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
      case "listing.deposit_policies.advance.percentage":
        return t.resolve(
          "listing.deposit_policies.advance.percentage",
          "Advance payment: {value}% of the booking total.",
        );
      case "listing.deposit_policies.advance.fixed":
        return t.resolve(
          "listing.deposit_policies.advance.fixed",
          "Advance payment: {amount}.",
        );
      case "listing.deposit_policies.damage.percentage":
        return t.resolve(
          "listing.deposit_policies.damage.percentage",
          "Damage deposit: {value}% of the booking total.",
        );
      case "listing.deposit_policies.damage.fixed":
        return t.resolve(
          "listing.deposit_policies.damage.fixed",
          "Damage deposit: {amount}.",
        );
      case "listing.deposit_policies.damage.return_within_days":
        return t.resolve(
          "listing.deposit_policies.damage.return_within_days",
          "The host says they expect to return it within {days} days after check-out.",
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
  return value.translated ? (
    <span className="notranslate" translate="no">
      {value.text}
    </span>
  ) : (
    <>{value.text}</>
  );
}
