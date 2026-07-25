import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { db } from "../src/lib/db";

const OUTPUT_PATH = path.join(
  process.cwd(),
  "prisma",
  "data",
  "amenity-catalog.json"
);

async function main() {
  const amenities = await db.amenity.findMany({
    orderBy: [{ category: "asc" }, { name: "asc" }],
    select: {
      name: true,
      category: true,
      icon: true,
      isActive: true,
    },
  });

  if (!amenities.length) {
    throw new Error(
      "The local amenity catalog is empty. Refusing to replace the release snapshot."
    );
  }

  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(
    OUTPUT_PATH,
    `${JSON.stringify({ schemaVersion: 1, amenities }, null, 2)}\n`,
    "utf8"
  );

  console.log(`Exported ${amenities.length} local amenities to ${OUTPUT_PATH}.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
