import { HouseRulesStep } from "@/components/host/v2/listings/house-rules-step";
import { NewListingHeader } from "@/components/host/v2/listings/new-listing-header";
import { requireHostPage } from "@/lib/auth-helpers";
import { getT } from "@/lib/i18n/t";
import { requireListingFlowContext, type ListingFlowSearchParams } from "@/lib/listing-flow-context";
import { returnsToReview } from "@/lib/host/v2/listing-flow-return";

export const metadata = { title: "House rules" };

/**
 * The last editing screen of phase two. Nothing is written: the flow still carries its
 * whole state in the URL, and the rules live only in the tab.
 *
 * No `md:h-dvh md:overflow-hidden`, unlike the phase-one screens — the two stay times,
 * the guest limit and the note about rules kept elsewhere are meant to scroll.
 */
export default async function HouseRulesPage({ searchParams }: { searchParams: Promise<ListingFlowSearchParams> }) {
  const [params, , t] = await Promise.all([searchParams, requireHostPage(), getT()]);
  const { propertyType, spaceType } = await requireListingFlowContext(params);
  return (
    <div className="listing-flow flex min-h-dvh flex-col bg-white text-slate-950">
      <NewListingHeader t={t} exitHref="/host/listings" />
      <HouseRulesStep propertyType={propertyType} spaceType={spaceType} returnToReview={returnsToReview(params.returnTo)} />
    </div>
  );
}
