import { DescriptionStep } from "@/components/host/v2/listings/description-step";
import { NewListingHeader } from "@/components/host/v2/listings/new-listing-header";
import { requireHostPage } from "@/lib/auth-helpers";
import { getT } from "@/lib/i18n/t";
import { requireListingFlowContext, type ListingFlowSearchParams } from "@/lib/listing-flow-context";
import { returnsToReview } from "@/lib/host/v2/listing-flow-return";

export const metadata = { title: "Title and description" };

/**
 * The third screen of phase two. Nothing is written here: the flow still carries its
 * whole state in the URL, and the title and description live only in the tab.
 *
 * Keeps the phase-one `md:h-dvh md:overflow-hidden` — two short fields fit a desktop
 * viewport without scrolling, while mobile still grows and scrolls under the footer.
 */
export default async function DescriptionPage({ searchParams }: { searchParams: Promise<ListingFlowSearchParams> }) {
  const [params, , t] = await Promise.all([searchParams, requireHostPage(), getT()]);
  const { propertyType, spaceType } = await requireListingFlowContext(params);
  const requestedView = Array.isArray(params.descriptionView)
    ? params.descriptionView[0]
    : params.descriptionView;
  return (
    <div className="listing-flow flex min-h-dvh flex-col bg-white text-slate-950 md:h-dvh md:overflow-hidden">
      <NewListingHeader t={t} exitHref="/host/listings" />
      <DescriptionStep
        propertyType={propertyType}
        spaceType={spaceType}
        initialView={requestedView === "description" ? "description" : "title"}
        returnToReview={returnsToReview(params.returnTo)}
      />
    </div>
  );
}
