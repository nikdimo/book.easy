"use server";

import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-helpers";
import { revalidateTag, revalidatePath } from "next/cache";
import { AMENITIES_TAG } from "@/lib/services/amenity.service";
import { revalidatePublicListingCaches } from "@/lib/utils/revalidate-public-listing-caches";
import { normalizeAmenityName } from "@/lib/amenities/normalize";

const PROVIDERS = new Set(["AIRBNB", "BOOKING", "VRBO"]);

function refreshAmenityViews() {
  revalidateTag(AMENITIES_TAG, "max");
  revalidatePath("/admin/settings");
  revalidatePublicListingCaches();
}

export async function addAmenity(name: string, category: string) {
  await requireAdmin();

  const label = name.trim();
  if (label.length < 2) {
    return { error: "Please enter a name for the amenity." };
  }

  const existing = await db.amenity.findUnique({ where: { name: label } });
  if (existing) {
    return { error: "An amenity with that name already exists." };
  }

  await db.amenity.create({ data: { name: label, category } });

  refreshAmenityViews();
  return { success: true };
}

export async function toggleAmenityActive(id: string) {
  await requireAdmin();

  const amenity = await db.amenity.findUnique({ where: { id } });
  if (!amenity) {
    return { error: "Amenity not found." };
  }

  await db.amenity.update({
    where: { id },
    data: { isActive: !amenity.isActive },
  });

  refreshAmenityViews();
  return { success: true };
}

export async function saveAmenityAlias(
  provider: string,
  providerName: string,
  amenityId: string,
) {
  await requireAdmin();
  const normalizedProvider = provider.trim().toUpperCase();
  const label = providerName.trim();
  const normalizedName = normalizeAmenityName(label);
  if (!PROVIDERS.has(normalizedProvider)) return { error: "Choose a supported provider." };
  if (label.length < 2 || !normalizedName) return { error: "Enter a provider amenity name." };
  const amenity = await db.amenity.findUnique({ where: { id: amenityId } });
  if (!amenity) return { error: "Canonical amenity not found." };

  await db.amenityAlias.upsert({
    where: {
      provider_normalizedName: { provider: normalizedProvider, normalizedName },
    },
    update: { providerName: label, amenityId },
    create: {
      provider: normalizedProvider,
      providerName: label,
      normalizedName,
      amenityId,
    },
  });
  refreshAmenityViews();
  return { success: true };
}

/** Consolidates a duplicate catalogue row without losing any listing usage or aliases. */
export async function mergeAmenities(
  sourceAmenityId: string,
  targetAmenityId: string,
  provider = "AIRBNB",
) {
  await requireAdmin();
  if (sourceAmenityId === targetAmenityId) return { error: "Choose a different amenity." };
  const normalizedProvider = provider.trim().toUpperCase();
  if (!PROVIDERS.has(normalizedProvider)) return { error: "Choose a supported provider." };

  const result = await db.$transaction(async (transaction) => {
    const [source, target] = await Promise.all([
      transaction.amenity.findUnique({
        where: { id: sourceAmenityId },
        include: { listings: true, aliases: true },
      }),
      transaction.amenity.findUnique({ where: { id: targetAmenityId } }),
    ]);
    if (!source || !target) return { error: "Amenity not found." } as const;

    if (source.listings.length > 0) {
      await transaction.listingAmenity.createMany({
        data: source.listings.map(({ listingId }) => ({ listingId, amenityId: target.id })),
        skipDuplicates: true,
      });
    }
    for (const alias of source.aliases) {
      await transaction.amenityAlias.upsert({
        where: {
          provider_normalizedName: {
            provider: alias.provider,
            normalizedName: alias.normalizedName,
          },
        },
        update: { providerName: alias.providerName, amenityId: target.id },
        create: {
          provider: alias.provider,
          providerName: alias.providerName,
          normalizedName: alias.normalizedName,
          amenityId: target.id,
        },
      });
    }
    const sourceKey = normalizeAmenityName(source.name);
    await transaction.amenityAlias.upsert({
      where: {
        provider_normalizedName: { provider: normalizedProvider, normalizedName: sourceKey },
      },
      update: { providerName: source.name, amenityId: target.id },
      create: {
        provider: normalizedProvider,
        providerName: source.name,
        normalizedName: sourceKey,
        amenityId: target.id,
      },
    });
    await transaction.amenity.delete({ where: { id: source.id } });
    return { success: true, sourceName: source.name, targetName: target.name } as const;
  });
  if ("error" in result) return result;
  refreshAmenityViews();
  return result;
}
