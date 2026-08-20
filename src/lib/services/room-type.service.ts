import "server-only";
import { unstable_cache } from "next/cache";
import { db } from "@/lib/db";
import { getT, getTForLocale, type Translator } from "@/lib/i18n/t";
import { resolveRoomCategory, resolveRoomTypeLabel } from "@/lib/i18n/room-labels";
import type { CatalogRoomType } from "@/lib/types/room-catalog";

export const ROOM_TYPES_TAG = "room-types";

export type { CatalogRoomType };

/** Raw taxonomy rows plus the requested locale's overrides. Cached per locale and
 *  invalidated via ROOM_TYPES_TAG whenever an admin edits the taxonomy. */
function getCatalogRows(locale: string) {
  return unstable_cache(
    async () =>
      db.roomType.findMany({
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
    ["active-room-types", locale],
    { revalidate: 300, tags: [ROOM_TYPES_TAG] },
  )();
}

type CatalogRow = Awaited<ReturnType<typeof getCatalogRows>>[number];

/**
 * Resolution order for every label:
 *   1. the admin's per-language override in the database — the only source that can
 *      cover a row created from Settings after the last deploy;
 *   2. the reviewed source-literal catalog in `room-labels.ts`;
 *   3. the English name.
 */
function withOverride(
  override: string | undefined,
  fallback: () => { text: string; translated: boolean },
) {
  if (override) return { text: override, translated: true };
  return fallback();
}

function serialize(translator: Translator, row: CatalogRow): CatalogRoomType {
  const { category } = row;
  const categoryLabel = withOverride(category.translations[0]?.label, () =>
    resolveRoomCategory(translator, category.name),
  );
  const label = withOverride(row.translations[0]?.label, () =>
    resolveRoomTypeLabel(translator, row.name),
  );
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    label: label.text,
    translated: label.translated,
    icon: row.icon,
    sortOrder: row.sortOrder,
    isRepeatable: row.isRepeatable,
    isStandard: row.isStandard,
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

/** The pickable taxonomy, resolved for the current request's locale. */
export async function getRoomTypeCatalog(): Promise<CatalogRoomType[]> {
  const translator = await getT();
  const rows = await getCatalogRows(translator.locale);
  return rows.map((row) => serialize(translator, row));
}

/**
 * The picker for one listing: the active taxonomy plus any hidden type that listing
 * already uses. Leaving a hidden type out would make an existing room look nameless in
 * the editor that is supposed to be managing it.
 */
export async function getRoomTypeCatalogIncluding(
  roomTypeIds: string[],
): Promise<CatalogRoomType[]> {
  const catalog = await getRoomTypeCatalog();
  const missing = roomTypeIds.filter((id) => !catalog.some((row) => row.id === id));
  if (missing.length === 0) return catalog;

  const translator = await getT();
  const extras = await db.roomType.findMany({
    where: { id: { in: missing } },
    include: {
      category: { include: { translations: { where: { locale: translator.locale } } } },
      translations: { where: { locale: translator.locale } },
    },
  });
  return [...catalog, ...extras.map((row) => serialize(translator, row))];
}

/** Same taxonomy for an explicitly chosen locale — used by the mobile API, which carries
 *  its locale in the request rather than in a cookie. */
export async function getRoomTypeCatalogForLocale(
  locale: string,
): Promise<CatalogRoomType[]> {
  const translator = await getTForLocale(locale);
  const rows = await getCatalogRows(translator.locale);
  return rows.map((row) => serialize(translator, row));
}

/** Full taxonomy including hidden rows, every language, and the listing usage the editor
 *  needs before offering a delete. */
export async function getRoomTypeCatalogForAdmin() {
  const [categories, roomTypes, languages] = await Promise.all([
    db.roomTypeCategory.findMany({
      include: { translations: true, _count: { select: { roomTypes: true } } },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    db.roomType.findMany({
      include: {
        translations: true,
        _count: { select: { rooms: true } },
      },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    db.language.findMany({
      where: { isEnabled: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { code: true, name: true, isDefault: true },
    }),
  ]);

  return { categories, roomTypes, languages };
}
