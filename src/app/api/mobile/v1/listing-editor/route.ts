import { getActiveAmenities } from "@/lib/services/amenity.service";
import { getActivePropertyTypes } from "@/lib/services/property-type.service";
import { mobileJson, mobileOptions, requireMobileHost } from "@/lib/mobile-api";

export async function OPTIONS(request: Request) {
  return mobileOptions(request);
}

export async function GET(request: Request) {
  const access = await requireMobileHost(request);
  if ("response" in access) return access.response;

  const [propertyTypes, amenities] = await Promise.all([
    getActivePropertyTypes(),
    getActiveAmenities(),
  ]);

  return mobileJson(request, {
    propertyTypes,
    amenities: amenities.map(({ id, name, category, icon }) => ({
      id,
      name,
      category,
      icon,
    })),
  });
}
