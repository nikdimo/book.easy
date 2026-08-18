import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { db } from "../src/lib/db";

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
        category: { select: { key: true } },
        translations: { orderBy: { locale: "asc" } },
      },
    }),
  ]);

  if (!amenities.length) {
    throw new Error(
      "The local amenity catalog is empty. Refusing to replace the release snapshot."
    );
  }
  if (!categories.length) {
    throw new Error(
      "The local amenity catalog has no categories. Refusing to replace the release snapshot."
    );
  }

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
    amenities: amenities.map((amenity) => ({
      key: amenity.key,
      name: amenity.name,
      category: amenity.category.key,
      icon: amenity.icon,
      sortOrder: amenity.sortOrder,
      isActive: amenity.isActive,
      translations: Object.fromEntries(
        amenity.translations.map((row) => [row.locale, row.label])
      ),
    })),
  };

  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");

  console.log(
    `Exported ${amenities.length} amenities in ${categories.length} categories to ${OUTPUT_PATH}.`
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
