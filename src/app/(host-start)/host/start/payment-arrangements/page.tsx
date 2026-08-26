import { NewListingHeader } from "@/components/host/v2/listings/new-listing-header";
import { PaymentArrangementsStep } from "@/components/host/v2/listings/payment-arrangements-step";
import { requireHostPage } from "@/lib/auth-helpers";
import { getT } from "@/lib/i18n/t";
import {
  requireListingFlowContext,
  type ListingFlowSearchParams,
} from "@/lib/listing-flow-context";

export const metadata = { title: "Payment arrangements" };

export default async function PaymentArrangementsPage({
  searchParams,
}: {
  searchParams: Promise<ListingFlowSearchParams>;
}) {
  const [params, , t] = await Promise.all([
    searchParams,
    requireHostPage(),
    getT(),
  ]);
  const { propertyType, spaceType } = await requireListingFlowContext(params);
  return (
    <div className="listing-flow flex min-h-dvh flex-col bg-white text-slate-950">
      <NewListingHeader t={t} exitHref="/host/listings" />
      <PaymentArrangementsStep
        propertyType={propertyType}
        spaceType={spaceType}
      />
    </div>
  );
}
