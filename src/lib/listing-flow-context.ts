import { redirect } from "next/navigation";
import { getActivePropertyTypes } from "@/lib/services/property-type.service";
import { allowedListingSpaceTypes, type ListingSpaceTypeValue } from "@/lib/types/listing-space-type";

export type ListingFlowSearchParams = {
  propertyType?: string | string[];
  spaceType?: string | string[];
  address?: string | string[];
  descriptionView?: string | string[];
};

export async function requireListingFlowContext(params: ListingFlowSearchParams) {
  const requestedPropertyType = Array.isArray(params.propertyType) ? params.propertyType[0] : params.propertyType;
  const propertyTypes = await getActivePropertyTypes();
  const propertyType = propertyTypes.find((option) => option.value === requestedPropertyType);
  if (!propertyType) redirect("/host/start/property-type");

  const requestedSpaceType = Array.isArray(params.spaceType) ? params.spaceType[0] : params.spaceType;
  const spaceType = allowedListingSpaceTypes(propertyType.value).find((option) => option.value === requestedSpaceType)?.value as ListingSpaceTypeValue | undefined;
  if (!spaceType) redirect(`/host/start/space-type?propertyType=${encodeURIComponent(propertyType.value)}`);

  return { propertyType, spaceType };
}
