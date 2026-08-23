import { NewListingHeader } from "@/components/host/v2/listings/new-listing-header";
import { ReviewStep } from "@/components/host/v2/listings/review-step";
import { requireHostPage } from "@/lib/auth-helpers";
import { getT } from "@/lib/i18n/t";
import { requireListingFlowContext, type ListingFlowSearchParams } from "@/lib/listing-flow-context";
import { todayYmd } from "@/lib/utils/date-only";

export const metadata = { title: "Review your listing" };

/**
 * The final screen of the create flow: the whole draft in one summary, the blockers that
 * would make publishing fail, and the Publish button.
 *
 * `today` is read on the server so the "that availability date has passed" blocker is
 * decided in the marketplace's own zone — the same one the publish gate uses — rather
 * than in whatever zone the host's browser is in.
 */
export default async function ReviewPage({ searchParams }: { searchParams: Promise<ListingFlowSearchParams> }) {
  const [params, , t] = await Promise.all([searchParams, requireHostPage(), getT()]);
  const { propertyType, spaceType } = await requireListingFlowContext(params);
  return (
    <div className="listing-flow flex min-h-dvh flex-col bg-white text-slate-950">
      <NewListingHeader t={t} exitHref="/host/listings" />
      <ReviewStep propertyType={propertyType} spaceType={spaceType} today={todayYmd()} />
    </div>
  );
}
