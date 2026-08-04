import type { ListingDraftData } from "@/lib/types/listing-draft";
import {
  getHostListingDrafts,
  getHostListings,
} from "@/lib/services/listing.service";
import { mobileJson, mobileOptions, requireMobileHost } from "@/lib/mobile-api";
import { resolveMobileDraftStep } from "@/lib/mobile-listing-steps";

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
      promotions: listing.promotions.map((promotion) => ({
        id: promotion.id,
        type: promotion.type,
        discountPercent: promotion.discountPercent,
        minimumNights: promotion.minimumNights,
        freeCleaning: promotion.freeCleaning,
        roundToWholeUnit: promotion.roundToWholeUnit,
        startDate: promotion.startDate?.toISOString() ?? null,
        endDate: promotion.endDate?.toISOString() ?? null,
      })),
      // Kept temporarily for older mobile clients. New clients should use
      // `promotions` so they can evaluate threshold and date precedence.
      promotion: listing.promotions[0]
        ? {
            id: listing.promotions[0].id,
            type: listing.promotions[0].type,
            discountPercent: listing.promotions[0].discountPercent,
            minimumNights: listing.promotions[0].minimumNights,
            freeCleaning: listing.promotions[0].freeCleaning,
            roundToWholeUnit: listing.promotions[0].roundToWholeUnit,
            startDate: listing.promotions[0].startDate?.toISOString() ?? null,
            endDate: listing.promotions[0].endDate?.toISOString() ?? null,
          }
        : null,
      bookingCount: listing._count.bookings,
      updatedAt: listing.updatedAt.toISOString(),
    })),
    drafts: drafts.map((draft) => {
      const data = draft.data as ListingDraftData;
      return {
        id: draft.id,
        title: data.title?.trim() || "Untitled draft",
        step: resolveMobileDraftStep(data),
        updatedAt: draft.updatedAt.toISOString(),
      };
    }),
  });
}
