import "server-only";
import { unstable_cache } from "next/cache";
import { db } from "@/lib/db";
import { DEFAULT_LOCALE } from "@/lib/i18n/locale-preference";
import { getT, getTForLocale, type Translator } from "@/lib/i18n/t";
import {
  resolveAmenityCategory,
  resolveAmenityLabel,
} from "@/lib/i18n/amenity-labels";
import type {
  CatalogAmenity,
  CatalogCategory,
} from "@/lib/types/amenity-catalog";

export const AMENITIES_TAG = "amenities";

export type { CatalogAmenity, CatalogCategory };

/** Raw catalog rows plus the requested locale's overrides. Cached per locale and
 *  invalidated via AMENITIES_TAG whenever an admin edits the catalog or a host
 *  suggestion is approved. */
function getCatalogRows(locale: string) {
  return unstable_cache(
    async () =>
      db.amenity.findMany({
        where: { isActive: true, category: { isActive: true } },
        include: {
          category: { include: { translations: { where: { locale } } } },
          translations: { where: { locale } },
        },
        orderBy: [
          { category: { sortOrder: "asc" } },
          { sortOrder: "asc" },
          { name: "asc" },
        ],
      }),
    ["active-amenities", locale],
    { revalidate: 300, tags: [AMENITIES_TAG] },
  )();
}

type CatalogRow = Awaited<ReturnType<typeof getCatalogRows>>[number];

/**
 * Resolution order for every catalog label:
 *   1. the admin's per-language override in the database — the only source that can
 *      cover a row created from Settings after the last deploy;
 *   2. the reviewed source-literal catalog, which the AI sync keeps current for every
 *      amenity that ships with the code;
 *   3. the English name.
 */
function withOverride(
  override: string | undefined,
  fallback: () => { text: string; translated: boolean },
) {
  if (override) return { text: override, translated: true };
  return fallback();
}

function serialize(translator: Translator, row: CatalogRow): CatalogAmenity {
  const { category } = row;
  const categoryLabel = withOverride(category.translations[0]?.label, () =>
    resolveAmenityCategory(translator, category.name),
  );
  const label = withOverride(row.translations[0]?.label, () =>
    resolveAmenityLabel(translator, row.name),
  );
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    label: label.text,
    translated: label.translated,
    icon: row.icon,
    sortOrder: row.sortOrder,
    category: {
      id: category.id,
      key: category.key,
      name: category.name,
      label: categoryLabel.text,
      translated: categoryLabel.translated,
      icon: category.icon,
      sortOrder: category.sortOrder,
    },
  };
}

/** The pickable catalog, resolved for the current request's locale. */
export async function getAmenityCatalog(): Promise<CatalogAmenity[]> {
  const translator = await getT();
  const rows = await getCatalogRows(translator.locale);
  return rows.map((row) => serialize(translator, row));
}

/**
 * The picker for one listing: the active catalog plus any inactive row that listing
 * already uses. A "this listing only" suggestion approval creates an amenity nobody
 * else is offered, and leaving it out of the picker would silently drop it the next
 * time the host saves the form.
 */
export async function getAmenityCatalogIncluding(
  amenityIds: string[],
): Promise<CatalogAmenity[]> {
  const catalog = await getAmenityCatalog();
  const missing = amenityIds.filter((id) => !catalog.some((row) => row.id === id));
  if (missing.length === 0) return catalog;

  const translator = await getT();
  const extras = await db.amenity.findMany({
    where: { id: { in: missing } },
    include: {
      category: { include: { translations: { where: { locale: translator.locale } } } },
      translations: { where: { locale: translator.locale } },
    },
  });
  return [...catalog, ...extras.map((row) => serialize(translator, row))];
}

/** Same catalog for an explicitly chosen locale — used by the mobile API, which
 *  carries its locale in the request rather than in a cookie. */
export async function getAmenityCatalogForLocale(
  locale: string,
): Promise<CatalogAmenity[]> {
  const translator = await getTForLocale(locale);
  const rows = await getCatalogRows(translator.locale);
  return rows.map((row) => serialize(translator, row));
}

/** Resolves labels for amenities already loaded with a listing, so the public page
 *  doesn't refetch the whole catalog just to translate what it is holding. */
export async function resolveAmenityLabels<
  T extends { name: string; category: { name: string } },
>(amenities: T[]): Promise<(T & { label: string; translated: boolean })[]> {
  if (amenities.length === 0) return [];
  const translator = await getT();

  const overrides =
    translator.locale === DEFAULT_LOCALE
      ? new Map<string, string>()
      : new Map(
          (
            await db.amenityTranslation.findMany({
              where: {
                locale: translator.locale,
                amenity: { name: { in: amenities.map((a) => a.name) } },
              },
              select: { label: true, amenity: { select: { name: true } } },
            })
          ).map((row) => [row.amenity.name, row.label]),
        );

  return amenities.map((amenity) => {
    const label = withOverride(overrides.get(amenity.name), () =>
      resolveAmenityLabel(translator, amenity.name),
    );
    return { ...amenity, label: label.text, translated: label.translated };
  });
}

/** Full catalog including hidden rows, every language, provider aliases and the
 *  listing usage the editor needs before offering a merge or a delete. */
export async function getAmenityCatalogForAdmin() {
  const [categories, amenities, languages] = await Promise.all([
    db.amenityCategory.findMany({
      include: { translations: true, _count: { select: { amenities: true } } },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    db.amenity.findMany({
      include: {
        translations: true,
        aliases: { orderBy: [{ provider: "asc" }, { providerName: "asc" }] },
        _count: { select: { listings: true } },
      },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    db.language.findMany({
      where: { isEnabled: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { code: true, name: true, isDefault: true },
    }),
  ]);

  return { categories, amenities, languages };
}
