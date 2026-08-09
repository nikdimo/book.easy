import { db } from "@/lib/db";
import { updateListing } from "@/lib/actions/listing.actions";
import { getHostListing } from "@/lib/services/listing.service";
import { serializeHostListingForForm } from "@/lib/serializers/host-listing-form";
import {
  getActivePropertyTypes,
  getPropertyTypeOption,
} from "@/lib/services/property-type.service";
import { mobileJson, mobileOptions, requireMobileHost } from "@/lib/mobile-api";
import { appendMobileListingEditorTextFields } from "@/lib/mobile-listing-editor";

/** Loads and saves an existing listing for the native editor.
 *
 *  GET mirrors what the web edit page assembles, including the two rules that are
 *  easy to miss and silently destructive if skipped: an amenity or property type
 *  that was approved for this listing alone is inactive platform-wide, so it has to
 *  be added back into the pickers or saving would drop it.
 *
 *  PUT delegates to updateListing, the same action the web form posts to, so
 *  validation, media handling and moderation state stay in one place. */

type RouteContext = { params: Promise<{ id: string }> };

export async function OPTIONS(request: Request) {
  return mobileOptions(request);
}

export async function GET(request: Request, { params }: RouteContext) {
  const access = await requireMobileHost(request);
  if ("response" in access) return access.response;

  const { id } = await params;
  const listing = await getHostListing(id, access.user.id);
  if (!listing) {
    return mobileJson(request, { error: "Listing not found" }, { status: 404 });
  }

  const form = serializeHostListingForForm(listing);

  const activeAmenities = await db.amenity.findMany({
    where: { isActive: true },
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });
  // Approved "for this listing only": inactive for everyone else, but this listing
  // uses it, so it must stay selectable here.
  const usedInactive = listing.amenities
    .map((entry) => entry.amenity)
    .filter(
      (amenity) =>
        !amenity.isActive && !activeAmenities.some((active) => active.id === amenity.id)
    );

  const activePropertyTypes = await getActivePropertyTypes();
  const currentType = listing.property.propertyType;
  const propertyTypes = activePropertyTypes.some((type) => type.value === currentType)
    ? activePropertyTypes
    : [...activePropertyTypes, await getPropertyTypeOption(currentType)];

  return mobileJson(request, {
    listing: {
      ...form,
      status: listing.status,
      moderationNote: listing.moderationNote,
      slug: listing.slug,
    },
    mediaItems: listing.images.map((image) => ({
      id: image.id,
      url: image.url,
      mediaType: image.mediaType,
      alt: image.alt,
    })),
    propertyTypes,
    amenities: [...activeAmenities, ...usedInactive].map(
      ({ id: amenityId, name, category, icon }) => ({
        id: amenityId,
        name,
        category,
        icon,
      })
    ),
  });
}

export async function PUT(request: Request, { params }: RouteContext) {
  const access = await requireMobileHost(request);
  if ("response" in access) return access.response;

  const { id } = await params;
  const body = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  if (!body) {
    return mobileJson(request, { error: "Invalid listing" }, { status: 400 });
  }

  const formData = new FormData();
  appendMobileListingEditorTextFields(formData, body);
  if (Array.isArray(body.amenityIds)) {
    for (const amenityId of body.amenityIds) {
      formData.append("amenityIds", String(amenityId));
    }
  }
  if (Array.isArray(body.mediaItems)) {
    for (const item of body.mediaItems) {
      formData.append("mediaItems", JSON.stringify(item));
    }
  }

  const result = await updateListing(id, formData);
  if (result && "error" in result) {
    return mobileJson(request, { error: result.error }, { status: 400 });
  }
  return mobileJson(request, { success: true });
}
