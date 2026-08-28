import { NewListingHeader } from "@/components/host/v2/listings/new-listing-header";
import { PhotosStep } from "@/components/host/v2/listings/photos-step";
import { requireHostPage } from "@/lib/auth-helpers";
import { getT } from "@/lib/i18n/t";
import { requireListingFlowContext, type ListingFlowSearchParams } from "@/lib/listing-flow-context";
import { returnsToReview } from "@/lib/host/v2/listing-flow-return";

export const metadata = { title: "Photos" };

/**
 * The second screen of phase two. Nothing is written here either: the flow still carries
 * its whole state in the URL, and the picked photos live only in the tab.
 *
 * No `md:h-dvh md:overflow-hidden`, unlike the phase-one screens — a large batch of
 * photos is meant to scroll under the fixed footer on every viewport.
 */
export default async function PhotosPage({ searchParams }: { searchParams: Promise<ListingFlowSearchParams> }) {
  const [params, , t] = await Promise.all([searchParams, requireHostPage(), getT()]);
  const { propertyType, spaceType } = await requireListingFlowContext(params);
  return (
    <div className="listing-flow flex min-h-dvh flex-col bg-white text-slate-950">
      <NewListingHeader t={t} exitHref="/host/listings" />
      <PhotosStep propertyType={propertyType} spaceType={spaceType} returnToReview={returnsToReview(params.returnTo)} />
    </div>
  );
}
