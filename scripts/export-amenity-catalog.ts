import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import previousSnapshot from "../prisma/data/amenity-catalog.json";
import { db } from "../src/lib/db";
import {
  hasReviewedAmenityLabel,
  reviewedAmenityCatalogKey,
} from "../src/lib/i18n/amenity-labels";

const OUTPUT_PATH = path.join(
  process.cwd(),
  "prisma",
  "data",
  "amenity-catalog.json"
);

/** Writes the local catalog as the release snapshot the deploy reconciles production
 *  against. Translations travel with it, so a label typed into Settings locally
 *  reaches production on the next full release. */
async function main() {
  const [categories, amenities] = await Promise.all([
    db.amenityCategory.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: { translations: { orderBy: { locale: "asc" } } },
    }),
    db.amenity.findMany({
      orderBy: [{ key: "asc" }],
      include: {
        category: { select: { key: true, icon: true } },
        translations: { orderBy: { locale: "asc" } },
      },
    }),
  ]);

  // Provider imports and listing-only approvals can create precise labels such as a
  // television model or branded toiletries. They remain valid database rows, but they
  // are not global marketplace taxonomy and therefore must not be seeded into every
  // production environment. A reviewed source-label mapping is the release boundary.
  const releaseAmenities = amenities.filter((amenity) =>
    hasReviewedAmenityLabel(amenity.name),
  );

  if (!releaseAmenities.length) {
    throw new Error(
      "The local amenity catalog is empty. Refusing to replace the release snapshot."
    );
  }
  if (!categories.length) {
    throw new Error(
      "The local amenity catalog has no categories. Refusing to replace the release snapshot."
    );
  }

  const previousByKey = new Map(
    previousSnapshot.amenities.flatMap((amenity) => {
      const key = reviewedAmenityCatalogKey(amenity.name);
      return key ? [[key, { ...amenity, key }] as const] : [];
    }),
  );

  // Start with the last reviewed snapshot so a local database populated from one
  // imported property cannot make canonical marketplace choices disappear. Local rows
  // with canonical keys remain authoritative; provider-shaped aliases reuse the stable
  // key and presentation from the reviewed snapshot.
  const releaseByKey = new Map(previousByKey);
  for (const amenity of releaseAmenities) {
    const key = reviewedAmenityCatalogKey(amenity.name)!;
    const previous = previousByKey.get(key);
    const canonicalLocalRow = amenity.key === key;
    releaseByKey.set(key, {
      key,
      name: amenity.name,
      category: canonicalLocalRow
        ? amenity.category.key
        : (previous?.category ?? amenity.category.key),
      icon: amenity.icon ?? previous?.icon ?? amenity.category.icon ?? "sparkles",
      sortOrder: canonicalLocalRow
        ? amenity.sortOrder
        : (previous?.sortOrder ?? amenity.sortOrder),
      isActive: amenity.isActive,
      translations:
        amenity.translations.length > 0
          ? Object.fromEntries(
              amenity.translations.map((row) => [row.locale, row.label]),
            )
          : (previous?.translations ?? {}),
    });
  }
  const releaseRows = [...releaseByKey.values()].sort((a, b) =>
    a.key.localeCompare(b.key),
  );

  const snapshot = {
    schemaVersion: 2,
    categories: categories.map((category) => ({
      key: category.key,
      name: category.name,
      icon: category.icon,
      sortOrder: category.sortOrder,
      isActive: category.isActive,
      translations: Object.fromEntries(
        category.translations.map((row) => [row.locale, row.label])
      ),
    })),
    amenities: releaseRows,
  };

  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");

  console.log(
    `Exported ${releaseRows.length} reviewed amenities in ${categories.length} categories to ${OUTPUT_PATH}.` +
      (releaseAmenities.length < amenities.length
        ? ` Kept ${amenities.length - releaseAmenities.length} provider/listing-specific labels out of the release seed.`
        : ""),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
