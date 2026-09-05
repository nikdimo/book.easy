import { notFound } from "next/navigation";
import { requireHostPage } from "@/lib/auth-helpers";
import { getListingEditorHeader } from "@/lib/services/listing-editor.service";
import { getListingPaymentMethodsData } from "@/lib/services/listing-payment-methods.service";
import { getListingDepositPoliciesData } from "@/lib/services/listing-deposit-policies.service";
import { getListingCancellationPolicyData } from "@/lib/services/listing-cancellation-policy.service";
import { EditorFrame } from "@/components/host/v2/editor/editor-frame";
import { PaymentArrangementsWorkspace } from "@/components/host/v2/editor/payment-arrangements";
import { detailsMapToDraft } from "@/components/host/v2/editor/payment-arrangements/payment-arrangements-model";

export const metadata = { title: "Payment arrangements" };

export default async function ListingPaymentArrangementsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireHostPage();
  const [header, data, deposit, cancellation] = await Promise.all([
    getListingEditorHeader(id, user.id),
    getListingPaymentMethodsData(id, user.id),
    getListingDepositPoliciesData(id, user.id),
    getListingCancellationPolicyData(id, user.id),
  ]);
  if (!header || !data || !deposit || !cancellation) notFound();

  return (
    <EditorFrame
      listingId={id}
      section="payment-arrangements"
      attention={header.attention}
      overview={header}
      previewSlug={header.slug}
      previewStatus={header.status}
    >
      <PaymentArrangementsWorkspace
        listingId={id}
        initialValue={{
          methodCodes: data.preferences.methods,
          otherLabel: data.preferences.otherLabel,
          instructionTemplates: data.instructionTemplates,
          details: detailsMapToDraft(data.instructionDetails),
          reviewedAt: data.preferences.reviewedAt?.toISOString() ?? null,
        }}
        initialDeposit={deposit.policies}
        listingCurrency={deposit.listingCurrency}
        initialCancellation={{
          freeCancellationDaysBeforeCheckIn:
            cancellation.freeCancellationDaysBeforeCheckIn,
          reviewedAt:
            cancellation.cancellationPolicyReviewedAt?.toISOString() ?? null,
        }}
      />
    </EditorFrame>
  );
}
