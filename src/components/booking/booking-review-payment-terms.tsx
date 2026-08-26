import {
  AcceptedPaymentMethods,
  PaymentMethodName,
  acceptedPaymentMethodCodes,
  hasReviewedPaymentMethods,
  safeOtherPaymentMethodLabel,
  type AcceptedPaymentMethodCode,
  type AcceptedPaymentMethodsPresentation,
} from "./accepted-payment-methods";
import { DepositPolicySummary } from "./deposit-policy-summary";
import type { DepositPolicySnapshotV1 } from "@/lib/payments/deposit-policy";
import { cn } from "@/lib/utils";

/** Public payment terms shown in the final request review, immediately above its controls. */
export function BookingReviewPaymentTerms({
  t,
  acceptedPaymentMethods,
  depositPolicy,
  selectedPaymentMethod,
  onSelectedPaymentMethodChange,
}: {
  t: Parameters<typeof AcceptedPaymentMethods>[0]["t"];
  acceptedPaymentMethods: AcceptedPaymentMethodsPresentation;
  depositPolicy: DepositPolicySnapshotV1;
  selectedPaymentMethod: AcceptedPaymentMethodCode | null;
  onSelectedPaymentMethodChange: (method: AcceptedPaymentMethodCode) => void;
}) {
  const methods = acceptedPaymentMethodCodes(acceptedPaymentMethods.methodCodes);
  const canChoose =
    hasReviewedPaymentMethods(acceptedPaymentMethods.reviewedAt) &&
    methods.length > 0;

  return (
    <div className="space-y-4">
      {canChoose ? (
        <section className="rounded-xl bg-card p-4 text-card-foreground shadow-sm ring-1 ring-border/80 sm:p-5">
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
          appearance="card"
          headingAs="h3"
        />
      )}
      <DepositPolicySummary
        t={t}
        data={depositPolicy}
        appearance="card"
        headingAs="h3"
      />
    </div>
  );
}
