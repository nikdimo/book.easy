import {
  AcceptedPaymentMethods,
  PaymentMethodName,
  acceptedPaymentMethodCodes,
  hasReviewedPaymentMethods,
  safeOtherPaymentMethodLabel,
  type AcceptedPaymentMethodCode,
  type AcceptedPaymentMethodsPresentation,
} from "./accepted-payment-methods";
import { DepositPoliciesSummary } from "./deposit-policies-summary";
import { CancellationPolicySummary } from "./cancellation-policy-summary";
import type { DepositPoliciesSnapshotV2 } from "@/lib/payments/deposit-policies";
import type { CancellationPolicySnapshotV1 } from "@/lib/payments/cancellation-policy";
import { cn } from "@/lib/utils";

/** Public payment terms shown in the final request review, immediately above its controls. */
export function BookingReviewPaymentTerms({
  t,
  acceptedPaymentMethods,
  depositPolicies,
  cancellationPolicy = {
    version: 1,
    status: "UNANSWERED",
    freeCancellationDaysBeforeCheckIn: null,
  },
  selectedPaymentMethod,
  onSelectedPaymentMethodChange,
  appearance = "card",
}: {
  t: Parameters<typeof AcceptedPaymentMethods>[0]["t"];
  acceptedPaymentMethods: AcceptedPaymentMethodsPresentation;
  depositPolicies: DepositPoliciesSnapshotV2;
  cancellationPolicy?: CancellationPolicySnapshotV1;
  selectedPaymentMethod: AcceptedPaymentMethodCode | null;
  onSelectedPaymentMethodChange: (method: AcceptedPaymentMethodCode) => void;
  /**
   * `card` stacks three raised tiles. `plain` renders the same three as sections
   * divided by hairlines, for the booking review — where the tiles sat inside the
   * dialog's own frame and each carried bordered blocks of their own.
   */
  appearance?: "card" | "plain";
}) {
  const methods = acceptedPaymentMethodCodes(acceptedPaymentMethods.methodCodes);
  const canChoose =
    hasReviewedPaymentMethods(acceptedPaymentMethods.reviewedAt) &&
    methods.length > 0;
  const plain = appearance === "plain";
  // The radios keep their borders in both: a border here is around something you press.
  const sectionClassName = plain
    ? "py-4"
    : "rounded-xl bg-card p-4 text-card-foreground shadow-sm ring-1 ring-border/80 sm:p-5";

  return (
    <div className={plain ? "divide-y divide-border/60" : "space-y-4"}>
      {canChoose ? (
        <section className={sectionClassName}>
          <h3 className="text-base font-semibold text-foreground">
            {t.resolve(
              "booking.payment_method_choice.heading",
              "How would you like to pay?",
            ).text}
          </h3>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            {t.resolve(
              "booking.payment_method_choice.explanation",
              "Choose one method accepted by the host. You will not pay now. If the host accepts, they will send any payment instructions privately.",
            ).text}
          </p>
          <div className="mt-3 grid gap-2" role="radiogroup">
            {methods.map((method) => {
              const checked = selectedPaymentMethod === method;
              const id = `booking-payment-method-${method.toLowerCase().replaceAll("_", "-")}`;
              return (
                <label
                  key={method}
                  htmlFor={id}
                  className={cn(
                    "flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-3 text-sm transition-colors",
                    checked
                      ? "border-primary bg-primary/5 ring-1 ring-primary"
                      : "border-border hover:bg-muted/40",
                  )}
                >
                  <input
                    id={id}
                    type="radio"
                    name="booking-payment-method"
                    value={method}
                    checked={checked}
                    onChange={() => onSelectedPaymentMethodChange(method)}
                    className="size-4 accent-primary"
                  />
                  <span className="font-medium text-foreground">
                    <PaymentMethodName
                      t={t}
                      code={method}
                      otherLabel={safeOtherPaymentMethodLabel(
                        acceptedPaymentMethods.otherLabel,
                      )}
                    />
                  </span>
                </label>
              );
            })}
          </div>
        </section>
      ) : (
        <AcceptedPaymentMethods
          t={t}
          data={acceptedPaymentMethods}
          appearance={plain ? "inline" : "card"}
          className={plain ? "py-4" : undefined}
          headingAs="h3"
        />
      )}
      <DepositPoliciesSummary
        t={t}
        data={depositPolicies}
        appearance={plain ? "inline" : "card"}
        className={plain ? "py-4" : undefined}
        headingAs="h3"
      />
      <CancellationPolicySummary
        t={t}
        data={cancellationPolicy}
        appearance={plain ? "inline" : "card"}
        className={plain ? "py-4" : undefined}
      />
    </div>
  );
}
