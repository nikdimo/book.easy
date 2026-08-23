import { AmenitiesStep } from "@/components/host/v2/listings/amenities-step";
import { NewListingHeader } from "@/components/host/v2/listings/new-listing-header";
import { requireHostPage } from "@/lib/auth-helpers";
import { getT } from "@/lib/i18n/t";
import { requireListingFlowContext, type ListingFlowSearchParams } from "@/lib/listing-flow-context";
import { getAmenityCatalog } from "@/lib/services/amenity.service";

export const metadata = { title: "Amenities" };

/**
 * First screen of phase two. The catalog is read from the admin's live taxonomy, but
 * nothing is written: the flow still carries its whole state in the URL.
 *
 * No `md:h-dvh md:overflow-hidden` here, unlike the phase-one screens — the catalog is
 * long enough that the page is meant to scroll on every viewport.
 */
export default async function AmenitiesPage({ searchParams }: { searchParams: Promise<ListingFlowSearchParams> }) {
  const [params, , t, catalog] = await Promise.all([searchParams, requireHostPage(), getT(), getAmenityCatalog()]);
  const { propertyType, spaceType } = await requireListingFlowContext(params);
  return (
    <div className="listing-flow flex min-h-dvh flex-col bg-white text-slate-950">
      <NewListingHeader t={t} exitHref="/host/listings" />
      <AmenitiesStep propertyType={propertyType} spaceType={spaceType} catalog={catalog} />
    </div>
  );
}
