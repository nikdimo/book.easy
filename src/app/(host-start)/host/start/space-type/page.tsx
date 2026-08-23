import { redirect } from "next/navigation";
import { NewListingHeader } from "@/components/host/v2/listings/new-listing-header";
import { SpaceTypeStep } from "@/components/host/v2/listings/space-type-step";
import { requireHostPage } from "@/lib/auth-helpers";
import { getT } from "@/lib/i18n/t";
import { getActivePropertyTypes } from "@/lib/services/property-type.service";
import {
  allowedListingSpaceTypes,
  type ListingSpaceTypeValue,
} from "@/lib/types/listing-space-type";

export const metadata = { title: "Choose what guests will book" };

/**
 * The second from-scratch listing step. The property type arrives in the URL so the
 * flow can move between UI-only screens without creating a draft or hiding state in
 * the browser. Unknown and inactive catalog values return to the first step.
 */
export default async function NewListingSpaceTypePage({
  searchParams,
}: {
  searchParams: Promise<{
    propertyType?: string | string[];
    spaceType?: string | string[];
  }>;
}) {
  const [, t, propertyTypes, params] = await Promise.all([
    requireHostPage(),
    getT(),
    getActivePropertyTypes(),
    searchParams,
  ]);
  const requestedType = Array.isArray(params.propertyType)
    ? params.propertyType[0]
    : params.propertyType;
  const propertyType = propertyTypes.find(
    (option) => option.value === requestedType,
  );

  if (!propertyType) redirect("/host/start/property-type");

  const requestedSpaceType = Array.isArray(params.spaceType)
    ? params.spaceType[0]
    : params.spaceType;
  const initialSpaceType = allowedListingSpaceTypes(propertyType.value).some(
    (option) => option.value === requestedSpaceType,
  )
    ? (requestedSpaceType as ListingSpaceTypeValue)
    : undefined;

  return (
    <div className="listing-flow flex min-h-dvh flex-col bg-white text-slate-950">
      <NewListingHeader t={t} exitHref="/host/listings" />
      <SpaceTypeStep
        propertyType={propertyType}
        initialSpaceType={initialSpaceType}
      />
    </div>
  );
}
