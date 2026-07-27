"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { ListingStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-helpers";
import { MARKETPLACE_SETTINGS_TAG } from "@/lib/services/marketplace-settings.service";

export async function updateMarketplaceSettings(input: {
  featuredMarketEnabled: boolean;
  featuredCity: string;
  featuredCountry: string;
}) {
  await requireAdmin();

  const featuredCity = input.featuredCity.trim();
  const featuredCountry = input.featuredCountry.trim();
  if (input.featuredMarketEnabled && (!featuredCity || !featuredCountry)) {
    return { error: "Choose a featured market before enabling it." };
  }

  if (input.featuredMarketEnabled) {
    const listingCount = await db.listing.count({
      where: {
        status: ListingStatus.APPROVED,
        property: {
          city: { equals: featuredCity, mode: "insensitive" },
          country: { equals: featuredCountry, mode: "insensitive" },
        },
      },
    });
    if (listingCount === 0) {
      return { error: "That market has no approved listings." };
    }
  }

  await db.marketplaceSettings.upsert({
    where: { id: "default" },
    update: {
      featuredMarketEnabled: input.featuredMarketEnabled,
      featuredCity: featuredCity || null,
      featuredCountry: featuredCountry || null,
    },
    create: {
      id: "default",
      featuredMarketEnabled: input.featuredMarketEnabled,
      featuredCity: featuredCity || null,
      featuredCountry: featuredCountry || null,
    },
  });

  revalidateTag(MARKETPLACE_SETTINGS_TAG, "max");
  revalidatePath("/admin/settings");
  revalidatePath("/properties");
  return { success: true };
}
