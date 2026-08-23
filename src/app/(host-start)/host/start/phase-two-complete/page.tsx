import { NewListingHeader } from "@/components/host/v2/listings/new-listing-header";
import { PhaseTwoComplete } from "@/components/host/v2/listings/phase-two-complete";
import { requireHostPage } from "@/lib/auth-helpers";
import { getT } from "@/lib/i18n/t";
import { requireListingFlowContext, type ListingFlowSearchParams } from "@/lib/listing-flow-context";

export const metadata = { title: "Phase two complete" };

/** Same shell as the phase-one transition, down to the `md:h-dvh md:overflow-hidden`:
 *  the screen is one viewport by design, and only mobile grows under the footer. */
export default async function PhaseTwoCompletePage({ searchParams }: { searchParams: Promise<ListingFlowSearchParams> }) {
  const [params, , t] = await Promise.all([searchParams, requireHostPage(), getT()]);
  const { propertyType, spaceType } = await requireListingFlowContext(params);
  return (
    <div className="listing-flow flex min-h-dvh flex-col bg-white text-slate-950 md:h-dvh md:overflow-hidden">
      <NewListingHeader t={t} exitHref="/host/listings" />
      <PhaseTwoComplete propertyType={propertyType} spaceType={spaceType} />
    </div>
  );
}
