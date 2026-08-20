import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { db } from "../src/lib/db";

const OUTPUT_PATH = path.join(
  process.cwd(),
  "prisma",
  "data",
  "room-type-catalog.json"
);

/** Writes the local room taxonomy as the release snapshot the deploy reconciles
 *  production against. Translations travel with it, so a label typed into Settings
 *  locally reaches production on the next full release. */
async function main() {
  const [categories, roomTypes] = await Promise.all([
    db.roomTypeCategory.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: { translations: { orderBy: { locale: "asc" } } },
    }),
    db.roomType.findMany({
      orderBy: [{ key: "asc" }],
      include: {
        category: { select: { key: true } },
        translations: { orderBy: { locale: "asc" } },
      },
    }),
  ]);

  if (!roomTypes.length) {
    throw new Error(
      "The local room catalog is empty. Refusing to replace the release snapshot."
    );
  }
  if (!categories.length) {
    throw new Error(
      "The local room catalog has no categories. Refusing to replace the release snapshot."
    );
  }

  const snapshot = {
    schemaVersion: 1,
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
    roomTypes: roomTypes.map((roomType) => ({
      key: roomType.key,
      name: roomType.name,
      category: roomType.category.key,
      icon: roomType.icon,
      sortOrder: roomType.sortOrder,
      isRepeatable: roomType.isRepeatable,
      isStandard: roomType.isStandard,
      isActive: roomType.isActive,
      translations: Object.fromEntries(
        roomType.translations.map((row) => [row.locale, row.label])
      ),
    })),
  };

  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");

  console.log(
    `Exported ${roomTypes.length} room types in ${categories.length} categories to ${OUTPUT_PATH}.`
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
