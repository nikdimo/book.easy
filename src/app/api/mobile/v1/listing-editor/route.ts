import { getActiveAmenities } from "@/lib/services/amenity.service";
import { getActivePropertyTypes } from "@/lib/services/property-type.service";
import { mobileJson, mobileOptions, requireMobileHost } from "@/lib/mobile-api";
import { mobileListingSteps } from "@/lib/mobile-listing-steps";

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
    // The canonical wizard order. Do not inline a literal list here — the mobile
    // client renders straight from this, and a second copy is what let web and
    // mobile drift apart in the first place.
    steps: mobileListingSteps(),
    propertyTypes,
    amenities: amenities.map(({ id, name, category, icon }) => ({
      id,
      name,
      category,
      icon,
    })),
  });
}
