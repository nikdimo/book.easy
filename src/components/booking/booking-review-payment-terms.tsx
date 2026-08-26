import {
  AcceptedPaymentMethods,
  type AcceptedPaymentMethodsPresentation,
} from "./accepted-payment-methods";
import { DepositPolicySummary } from "./deposit-policy-summary";
import type { DepositPolicySnapshotV1 } from "@/lib/payments/deposit-policy";

/** Public payment terms shown in the final request review, immediately above its controls. */
export function BookingReviewPaymentTerms({
  t,
  acceptedPaymentMethods,
  depositPolicy,
}: {
  t: Parameters<typeof AcceptedPaymentMethods>[0]["t"];
  acceptedPaymentMethods: AcceptedPaymentMethodsPresentation;
  depositPolicy: DepositPolicySnapshotV1;
}) {
  return (
    <div className="space-y-4">
      <AcceptedPaymentMethods
        t={t}
        data={acceptedPaymentMethods}
        appearance="card"
        headingAs="h3"
      />
      <DepositPolicySummary
        t={t}
        data={depositPolicy}
        appearance="card"
        headingAs="h3"
      />
    </div>
  );
}
