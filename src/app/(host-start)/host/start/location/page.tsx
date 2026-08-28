import { redirect } from "next/navigation";
import { LocationStep } from "@/components/host/v2/listings/location-step";
import { NewListingHeader } from "@/components/host/v2/listings/new-listing-header";
import { requireHostPage } from "@/lib/auth-helpers";
import { getT } from "@/lib/i18n/t";
import { getActivePropertyTypes } from "@/lib/services/property-type.service";
import { returnsToReview } from "@/lib/host/v2/listing-flow-return";
import {
  allowedListingSpaceTypes,
  type ListingSpaceTypeValue,
} from "@/lib/types/listing-space-type";

export const metadata = { title: "Add your property location" };

export default async function NewListingLocationPage({
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
  const requestedPropertyType = Array.isArray(params.propertyType)
    ? params.propertyType[0]
    : params.propertyType;
  const propertyType = propertyTypes.find(
    (option) => option.value === requestedPropertyType,
  );

  if (!propertyType) redirect("/host/start/property-type");

  const requestedSpaceType = Array.isArray(params.spaceType)
    ? params.spaceType[0]
    : params.spaceType;
  const validSpaceType = allowedListingSpaceTypes(propertyType.value).find(
    (option) => option.value === requestedSpaceType,
  )?.value as ListingSpaceTypeValue | undefined;

  if (!validSpaceType) {
    redirect(
      `/host/start/space-type?propertyType=${encodeURIComponent(propertyType.value)}`,
    );
  }

  return (
    <div className="listing-flow flex min-h-dvh flex-col bg-white text-slate-950 lg:h-dvh lg:overflow-hidden">
      <NewListingHeader t={t} exitHref="/host/listings" hideOnMobile />
      <LocationStep
        propertyType={propertyType}
        spaceType={validSpaceType}
        returnToReview={returnsToReview(params.returnTo)}
      />
    </div>
  );
}
