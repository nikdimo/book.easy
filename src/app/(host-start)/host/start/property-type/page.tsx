import { NewListingHeader } from "@/components/host/v2/listings/new-listing-header";
import { PropertyTypeStep } from "@/components/host/v2/listings/property-type-step";
import { requireHostPage } from "@/lib/auth-helpers";
import { getT } from "@/lib/i18n/t";
import { getActivePropertyTypes } from "@/lib/services/property-type.service";
import { returnsToReview } from "@/lib/host/v2/listing-flow-return";

export const metadata = { title: "Choose your property type" };

/**
 * The first from-scratch listing step.
 *
 * Catalog data is read on the server, but choosing a tile is deliberately local UI
 * state. Merely reaching this page must not create a draft or write to the database.
 */
export default async function NewListingPropertyTypePage({
  searchParams,
}: {
  searchParams: Promise<{
    propertyType?: string | string[];
    spaceType?: string | string[];
    returnTo?: string | string[];
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
  const initialPropertyType = propertyTypes.some(
    (propertyType) => propertyType.value === requestedType,
  )
    ? requestedType
    : undefined;

  return (
    <div className="listing-flow flex min-h-dvh flex-col bg-white text-slate-950">
      <NewListingHeader t={t} exitHref="/host/listings" />
      <PropertyTypeStep
        propertyTypes={propertyTypes}
        initialPropertyType={initialPropertyType}
        /* Only carried so a host who came from Review can go straight back to it, and
           so the space-type screen after this one opens on the answer they already
           gave. Nothing on this page reads it otherwise. */
        spaceType={Array.isArray(params.spaceType) ? params.spaceType[0] : params.spaceType}
        returnToReview={returnsToReview(params.returnTo)}
      />
    </div>
  );
}
