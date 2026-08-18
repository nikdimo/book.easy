"use server";

import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-helpers";
import { revalidateTag, revalidatePath } from "next/cache";
import { AMENITIES_TAG } from "@/lib/services/amenity.service";
import { revalidatePublicListingCaches } from "@/lib/utils/revalidate-public-listing-caches";
import { normalizeAmenityName } from "@/lib/amenities/normalize";
import { uniqueAmenityKey, uniqueCategoryKey } from "@/lib/amenities/catalog";
import { isAmenityIconKey } from "@/lib/amenities/icon-registry";
import { DEFAULT_LOCALE } from "@/lib/i18n/locale-preference";
import { translateBatchToLocales } from "@/lib/ai/anthropic";

const PROVIDERS = new Set(["AIRBNB", "BOOKING", "VRBO"]);
/** Leaves room to drop a row between two neighbours without renumbering the rest. */
const ORDER_STEP = 10;

function refreshAmenityViews() {
  revalidateTag(AMENITIES_TAG, "max");
  revalidatePath("/admin/settings");
  revalidatePublicListingCaches();
}

// ─── Amenities ────────────────────────────────────────────────────────────────

export async function addAmenity(name: string, categoryId: string, icon?: string) {
  await requireAdmin();

  const label = name.trim();
  if (label.length < 2) return { error: "Please enter a name for the amenity." };
  if (icon && !isAmenityIconKey(icon)) return { error: "Choose an icon from the list." };

  const [existing, category] = await Promise.all([
    db.amenity.findUnique({ where: { name: label } }),
    db.amenityCategory.findUnique({ where: { id: categoryId } }),
  ]);
  if (existing) return { error: "An amenity with that name already exists." };
  if (!category) return { error: "Choose a category." };

  const last = await db.amenity.findFirst({
    where: { categoryId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });

  const amenity = await db.amenity.create({
    data: {
      name: label,
      key: await uniqueAmenityKey(label),
      categoryId,
      icon: icon ?? null,
      sortOrder: (last?.sortOrder ?? 0) + ORDER_STEP,
    },
  });

  refreshAmenityViews();
  return { success: true, id: amenity.id };
}

export async function renameAmenity(id: string, name: string) {
  await requireAdmin();

  const label = name.trim();
  if (label.length < 2) return { error: "Please enter a name for the amenity." };

  const clash = await db.amenity.findFirst({
    where: { name: label, id: { not: id } },
    select: { id: true },
  });
  if (clash) return { error: "Another amenity already uses that name." };

  await db.amenity.update({ where: { id }, data: { name: label } });
  refreshAmenityViews();
  return { success: true };
}

export async function setAmenityIcon(id: string, icon: string | null) {
  await requireAdmin();
  if (icon !== null && !isAmenityIconKey(icon)) {
    return { error: "Choose an icon from the list." };
  }
  await db.amenity.update({ where: { id }, data: { icon } });
  refreshAmenityViews();
  return { success: true };
}

export async function toggleAmenityActive(id: string) {
  await requireAdmin();

  const amenity = await db.amenity.findUnique({ where: { id } });
  if (!amenity) return { error: "Amenity not found." };

  await db.amenity.update({
    where: { id },
    data: { isActive: !amenity.isActive },
  });

  refreshAmenityViews();
  return { success: true };
}

export async function setAmenitiesActive(ids: string[], isActive: boolean) {
  await requireAdmin();
  if (ids.length === 0) return { error: "Select at least one amenity." };
  await db.amenity.updateMany({ where: { id: { in: ids } }, data: { isActive } });
  refreshAmenityViews();
  return { success: true, count: ids.length };
}

/**
 * Applies one drag: the moved rows land in `categoryId` and every row in that
 * category is renumbered from the order the editor shows. Sending the whole order
 * rather than one index keeps the result identical to what the admin just saw, even
 * if two tabs are open.
 */
export async function reorderAmenities(categoryId: string, orderedIds: string[]) {
  await requireAdmin();
  if (orderedIds.length === 0) return { error: "Nothing to reorder." };

  const category = await db.amenityCategory.findUnique({ where: { id: categoryId } });
  if (!category) return { error: "Category not found." };

  const known = await db.amenity.findMany({
    where: { id: { in: orderedIds } },
    select: { id: true },
  });
  if (known.length !== orderedIds.length) return { error: "Some amenities no longer exist." };

  await db.$transaction(
    orderedIds.map((id, index) =>
      db.amenity.update({
        where: { id },
        data: { categoryId, sortOrder: (index + 1) * ORDER_STEP },
      }),
    ),
  );

  refreshAmenityViews();
  return { success: true };
}

/** Bulk "move to category" from the selection bar, appended after what is there. */
export async function moveAmenitiesToCategory(ids: string[], categoryId: string) {
  await requireAdmin();
  if (ids.length === 0) return { error: "Select at least one amenity." };

  const category = await db.amenityCategory.findUnique({ where: { id: categoryId } });
  if (!category) return { error: "Category not found." };

  const last = await db.amenity.findFirst({
    where: { categoryId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });

  await db.$transaction(
    ids.map((id, index) =>
      db.amenity.update({
        where: { id },
        data: {
          categoryId,
          sortOrder: (last?.sortOrder ?? 0) + (index + 1) * ORDER_STEP,
        },
      }),
    ),
  );

  refreshAmenityViews();
  return { success: true, count: ids.length, categoryName: category.name };
}

/**
 * Hard delete, allowed only for a row no listing uses. Anything in use has to be
 * hidden or merged instead: deleting it would silently strip the amenity from live
 * listings, which is not something an admin can see happening from this screen.
 */
export async function deleteAmenity(id: string) {
  await requireAdmin();

  const amenity = await db.amenity.findUnique({
    where: { id },
    include: { _count: { select: { listings: true } } },
  });
  if (!amenity) return { error: "Amenity not found." };
  if (amenity._count.listings > 0) {
    return {
      error: `${amenity.name} is used by ${amenity._count.listings} listing(s). Hide it or merge it into another amenity instead.`,
    };
  }

  await db.amenity.delete({ where: { id } });
  refreshAmenityViews();
  return { success: true, name: amenity.name };
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

export async function deleteAmenityAlias(id: string) {
  await requireAdmin();
  await db.amenityAlias.delete({ where: { id } });
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
        include: { listings: true, aliases: true, translations: true },
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
    return {
      success: true,
      sourceName: source.name,
      targetName: target.name,
      movedListings: source.listings.length,
    } as const;
  });
  if ("error" in result) return result;
  refreshAmenityViews();
  return result;
}

// ─── Categories ───────────────────────────────────────────────────────────────

export async function addAmenityCategory(name: string, icon?: string) {
  await requireAdmin();

  const label = name.trim();
  if (label.length < 2) return { error: "Please enter a name for the category." };
  if (icon && !isAmenityIconKey(icon)) return { error: "Choose an icon from the list." };

  const existing = await db.amenityCategory.findUnique({ where: { name: label } });
  if (existing) return { error: "A category with that name already exists." };

  const last = await db.amenityCategory.findFirst({
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });

  const category = await db.amenityCategory.create({
    data: {
      name: label,
      key: await uniqueCategoryKey(label),
      icon: icon ?? null,
      sortOrder: (last?.sortOrder ?? 0) + ORDER_STEP,
    },
  });

  refreshAmenityViews();
  return { success: true, id: category.id };
}

export async function renameAmenityCategory(id: string, name: string) {
  await requireAdmin();

  const label = name.trim();
  if (label.length < 2) return { error: "Please enter a name for the category." };

  const clash = await db.amenityCategory.findFirst({
    where: { name: label, id: { not: id } },
    select: { id: true },
  });
  if (clash) return { error: "Another category already uses that name." };

  await db.amenityCategory.update({ where: { id }, data: { name: label } });
  refreshAmenityViews();
  return { success: true };
}

export async function setAmenityCategoryIcon(id: string, icon: string | null) {
  await requireAdmin();
  if (icon !== null && !isAmenityIconKey(icon)) {
    return { error: "Choose an icon from the list." };
  }
  await db.amenityCategory.update({ where: { id }, data: { icon } });
  refreshAmenityViews();
  return { success: true };
}

export async function toggleAmenityCategoryActive(id: string) {
  await requireAdmin();
  const category = await db.amenityCategory.findUnique({ where: { id } });
  if (!category) return { error: "Category not found." };
  await db.amenityCategory.update({
    where: { id },
    data: { isActive: !category.isActive },
  });
  refreshAmenityViews();
  return { success: true };
}

export async function reorderAmenityCategories(orderedIds: string[]) {
  await requireAdmin();
  if (orderedIds.length === 0) return { error: "Nothing to reorder." };
  await db.$transaction(
    orderedIds.map((id, index) =>
      db.amenityCategory.update({
        where: { id },
        data: { sortOrder: (index + 1) * ORDER_STEP },
      }),
    ),
  );
  refreshAmenityViews();
  return { success: true };
}

/** Only an empty category can go: the alternative would be orphaning its amenities
 *  or silently moving them somewhere the admin did not choose. */
export async function deleteAmenityCategory(id: string) {
  await requireAdmin();
  const category = await db.amenityCategory.findUnique({
    where: { id },
    include: { _count: { select: { amenities: true } } },
  });
  if (!category) return { error: "Category not found." };
  if (category._count.amenities > 0) {
    return {
      error: `${category.name} still holds ${category._count.amenities} amenit${category._count.amenities === 1 ? "y" : "ies"}. Move them out first.`,
    };
  }
  await db.amenityCategory.delete({ where: { id } });
  refreshAmenityViews();
  return { success: true, name: category.name };
}

// ─── Translations ─────────────────────────────────────────────────────────────

async function assertLanguage(locale: string) {
  if (locale === DEFAULT_LOCALE) return { error: "English comes from the name itself." };
  const language = await db.language.findUnique({ where: { code: locale } });
  if (!language) return { error: "Unknown language." };
  return null;
}

export async function setAmenityTranslation(
  amenityId: string,
  locale: string,
  label: string,
) {
  await requireAdmin();
  const invalid = await assertLanguage(locale);
  if (invalid) return invalid;

  const value = label.trim();
  if (!value) {
    await db.amenityTranslation.deleteMany({ where: { amenityId, locale } });
    refreshAmenityViews();
    return { success: true, cleared: true };
  }

  await db.amenityTranslation.upsert({
    where: { amenityId_locale: { amenityId, locale } },
    update: { label: value, isManuallyEdited: true },
    create: { amenityId, locale, label: value, isManuallyEdited: true },
  });
  refreshAmenityViews();
  return { success: true };
}

export async function setAmenityCategoryTranslation(
  categoryId: string,
  locale: string,
  label: string,
) {
  await requireAdmin();
  const invalid = await assertLanguage(locale);
  if (invalid) return invalid;

  const value = label.trim();
  if (!value) {
    await db.amenityCategoryTranslation.deleteMany({ where: { categoryId, locale } });
    refreshAmenityViews();
    return { success: true, cleared: true };
  }

  await db.amenityCategoryTranslation.upsert({
    where: { categoryId_locale: { categoryId, locale } },
    update: { label: value, isManuallyEdited: true },
    create: { categoryId, locale, label: value, isManuallyEdited: true },
  });
  refreshAmenityViews();
  return { success: true };
}

/**
 * Fills every enabled language for one amenity in a single request, skipping any
 * label an admin typed by hand. Used for rows created from Settings, which never
 * pass through the deploy-time UI string sync.
 */
export async function fillAmenityTranslations(amenityId: string) {
  await requireAdmin();

  const amenity = await db.amenity.findUnique({
    where: { id: amenityId },
    include: { translations: true },
  });
  if (!amenity) return { error: "Amenity not found." };

  const manual = new Set(
    amenity.translations.filter((row) => row.isManuallyEdited).map((row) => row.locale),
  );
  const targets = (
    await db.language.findMany({
      where: { isEnabled: true, useAiTranslation: true, code: { not: DEFAULT_LOCALE } },
      select: { code: true, name: true },
    })
  ).filter((language) => !manual.has(language.code));

  if (targets.length === 0) {
    return { error: "Every enabled language already has a reviewed label." };
  }

  let translations: Record<string, Record<string, string>>;
  try {
    translations = await translateBatchToLocales(
      { [`amenities.items.${amenity.key}`]: amenity.name },
      targets,
    );
  } catch (error) {
    console.error("Amenity translation fill failed", error);
    return { error: "The translation service did not respond. Try again." };
  }

  const key = `amenities.items.${amenity.key}`;
  const writes = Object.entries(translations)
    .map(([locale, values]) => ({ locale, label: values[key]?.trim() }))
    .filter((row): row is { locale: string; label: string } => Boolean(row.label));

  if (writes.length === 0) return { error: "No usable translations came back." };

  await db.$transaction(
    writes.map((row) =>
      db.amenityTranslation.upsert({
        where: { amenityId_locale: { amenityId, locale: row.locale } },
        update: { label: row.label, isManuallyEdited: false },
        create: {
          amenityId,
          locale: row.locale,
          label: row.label,
          isManuallyEdited: false,
        },
      }),
    ),
  );

  refreshAmenityViews();
  return { success: true, count: writes.length };
}
