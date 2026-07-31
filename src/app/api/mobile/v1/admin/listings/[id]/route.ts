import { mobileJson, mobileOptions, requireMobileAdmin } from "@/lib/mobile-api";
import { getListingForAdminReview } from "@/lib/services/admin.service";
import { markListingReviewed, suspendListing } from "@/lib/actions/admin.actions";

export async function OPTIONS(request: Request) {
  return mobileOptions(request);
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const access = await requireMobileAdmin(request);
  if ("response" in access) return access.response;

  const { id } = await params;
  const result = await getListingForAdminReview(id);

  if (!result) {
    return mobileJson(request, { error: "Listing not found" }, { status: 404 });
  }

  const { listing } = result;

  return mobileJson(request, {
    listing: {
      id: listing.id,
      slug: listing.slug,
      title: listing.title,
      description: listing.description,
      status: listing.status,
      needsReview: listing.needsReview,
      moderationNote: listing.moderationNote,
      propertyType: listing.property?.propertyType ?? "Apartment",
      city: listing.property?.city ?? "",
      country: listing.property?.country ?? "",
      address: listing.property?.address ?? "",
      maxGuests: listing.maxGuests,
      bedrooms: listing.bedrooms,
      beds: listing.beds,
      bathrooms: listing.bathrooms ? Number(listing.bathrooms) : 1,
      nightlyRate: listing.pricingRule?.baseNightlyRate ? Number(listing.pricingRule.baseNightlyRate) : null,
      currency: listing.pricingRule?.currency ?? "EUR",
      host: {
        id: listing.host.id,
        name: listing.host.name,
        email: listing.host.email,
        image: listing.host.image,
      },
      images: listing.images.map((img) => ({
        id: img.id,
        url: img.url,
        caption: img.alt,
      })),
      amenities: listing.amenities.map((a) => a.amenity.name),
      updatedAt: listing.updatedAt.toISOString(),
      createdAt: listing.createdAt.toISOString(),
    },
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const access = await requireMobileAdmin(request);
  if ("response" in access) return access.response;

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const { action, reason } = body as { action?: string; reason?: string };

  if (action === "approve") {
    const res = await markListingReviewed(id);
    if ("error" in res && res.error) {
      return mobileJson(request, { error: res.error }, { status: 400 });
    }
    return mobileJson(request, { success: true });
  }

  if (action === "suspend") {
    if (!reason) {
      return mobileJson(
        request,
        { error: "Reason is required to suspend" },
        { status: 400 }
      );
    }
    const res = await suspendListing(id, reason);
    if ("error" in res && res.error) {
      return mobileJson(request, { error: res.error }, { status: 400 });
    }
    return mobileJson(request, { success: true });
  }

  return mobileJson(request, { error: "Invalid action" }, { status: 400 });
}
