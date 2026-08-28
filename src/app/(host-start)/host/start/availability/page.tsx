import { AvailabilityStep } from "@/components/host/v2/listings/availability-step";
import { NewListingHeader } from "@/components/host/v2/listings/new-listing-header";
import { requireHostPage } from "@/lib/auth-helpers";
import { getT } from "@/lib/i18n/t";
import { requireListingFlowContext, type ListingFlowSearchParams } from "@/lib/listing-flow-context";
import { returnsToReview } from "@/lib/host/v2/listing-flow-return";
import { todayYmd } from "@/lib/utils/date-only";

export const metadata = { title: "Availability" };

/**
 * The availability screen of phase two. Nothing is written here: the flow still carries
 * its whole state in the URL, and the answer lives only in the tab.
 *
 * `today` is read on the server so the date field's floor and the "that date has
 * passed" rule come from the marketplace's own zone, the one `todayYmd` documents —
 * a browser an hour behind would otherwise offer a date the publish gate refuses.
 *
 * Keeps the phase-one `md:h-dvh md:overflow-hidden`: three choices and a stepper fit a
 * desktop viewport without scrolling, while mobile grows and scrolls under the footer.
 */
export default async function AvailabilityPage({ searchParams }: { searchParams: Promise<ListingFlowSearchParams> }) {
  const [params, , t] = await Promise.all([searchParams, requireHostPage(), getT()]);
  const { propertyType, spaceType } = await requireListingFlowContext(params);
  return (
    <div className="listing-flow flex min-h-dvh flex-col bg-white text-slate-950 md:h-dvh md:overflow-hidden">
      <NewListingHeader t={t} exitHref="/host/listings" />
      <AvailabilityStep propertyType={propertyType} spaceType={spaceType} today={todayYmd()} returnToReview={returnsToReview(params.returnTo)} />
    </div>
  );
}
