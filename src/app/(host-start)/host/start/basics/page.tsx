import { BasicsStep } from "@/components/host/v2/listings/basics-step";
import { NewListingHeader } from "@/components/host/v2/listings/new-listing-header";
import { requireHostPage } from "@/lib/auth-helpers";
import { getT } from "@/lib/i18n/t";
import { requireListingFlowContext, type ListingFlowSearchParams } from "@/lib/listing-flow-context";
import { returnsToReview } from "@/lib/host/v2/listing-flow-return";

export const metadata = { title: "Property capacity" };

export default async function BasicsPage({ searchParams }: { searchParams: Promise<ListingFlowSearchParams> }) {
  const [params, , t] = await Promise.all([searchParams, requireHostPage(), getT()]);
  const { propertyType, spaceType } = await requireListingFlowContext(params);
  return <div className="listing-flow flex min-h-dvh flex-col bg-white text-slate-950 md:h-dvh md:overflow-hidden"><NewListingHeader t={t} exitHref="/host/listings" /><BasicsStep propertyType={propertyType} spaceType={spaceType} returnToReview={returnsToReview(params.returnTo)} /></div>;
}
