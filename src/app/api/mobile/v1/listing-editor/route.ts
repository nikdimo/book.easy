import { getAmenityCatalog } from "@/lib/services/amenity.service";
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
    getAmenityCatalog(),
  ]);

  return mobileJson(request, {
    // The canonical wizard order. Do not inline a literal list here — the mobile
    // client renders straight from this, and a second copy is what let web and
    // mobile drift apart in the first place.
    steps: mobileListingSteps(),
    propertyTypes,
    // `category` stays the English group name the installed app already groups by;
    // `label` and `categoryKey` are additive for clients that can use them.
    amenities: amenities.map((amenity) => ({
      id: amenity.id,
      name: amenity.name,
      label: amenity.label,
      category: amenity.category.name,
      categoryKey: amenity.category.key,
      icon: amenity.icon,
    })),
  });
}
