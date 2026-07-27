import type { ListingDraftData } from "@/lib/types/listing-draft";
import {
  getHostListingDrafts,
  getHostListings,
} from "@/lib/services/listing.service";
import { mobileJson, mobileOptions, requireMobileHost } from "@/lib/mobile-api";
import { normalizeListingStep } from "@/lib/constants/listing-steps";

export async function OPTIONS(request: Request) {
  return mobileOptions(request);
}

export async function GET(request: Request) {
  const access = await requireMobileHost(request);
  if ("response" in access) return access.response;

  const [listings, drafts] = await Promise.all([
    getHostListings(access.user.id),
    getHostListingDrafts(access.user.id),
  ]);

  return mobileJson(request, {
    listings: listings.map((listing) => ({
      id: listing.id,
      slug: listing.slug,
      title: listing.title,
      description: listing.description,
      status: listing.status,
      needsReview: listing.needsReview,
      city: listing.property.city,
      country: listing.property.country,
      imageUrl: listing.images[0]?.url ?? null,
      nightlyRate: listing.pricingRule
        ? Number(listing.pricingRule.baseNightlyRate)
        : null,
      currency: listing.pricingRule?.currency ?? "EUR",
      bookingCount: listing._count.bookings,
      updatedAt: listing.updatedAt.toISOString(),
    })),
    drafts: drafts.map((draft) => {
      const data = draft.data as ListingDraftData;
      return {
        id: draft.id,
        title: data.title?.trim() || "Untitled draft",
        currentStep: normalizeListingStep(data.currentStep),
        updatedAt: draft.updatedAt.toISOString(),
      };
    }),
  });
}
