import snapshot from "../prisma/data/amenity-catalog.json";
import { db } from "../src/lib/db";

const DRY_RUN = process.argv.includes("--dry-run");

type AmenitySnapshotRow = {
  name: string;
  category: string;
  icon: string | null;
  isActive: boolean;
};

function validateSnapshot(): AmenitySnapshotRow[] {
  if (snapshot.schemaVersion !== 1) {
    throw new Error(`Unsupported amenity snapshot version: ${snapshot.schemaVersion}.`);
  }
  if (!Array.isArray(snapshot.amenities) || snapshot.amenities.length === 0) {
    throw new Error("The amenity snapshot is empty.");
  }

  const names = new Set<string>();
  return snapshot.amenities.map((amenity, index) => {
    const row = amenity as Partial<AmenitySnapshotRow>;
    if (
      typeof row.name !== "string" ||
      !row.name.trim() ||
      typeof row.category !== "string" ||
      !row.category.trim() ||
      (row.icon !== null && typeof row.icon !== "string") ||
      typeof row.isActive !== "boolean"
    ) {
      throw new Error(`Amenity snapshot row ${index + 1} is invalid.`);
    }
    if (row.name !== row.name.trim() || row.category !== row.category.trim()) {
      throw new Error(`Amenity snapshot row ${index + 1} contains surrounding whitespace.`);
    }
    if (names.has(row.name)) {
      throw new Error(`Amenity snapshot contains the duplicate name "${row.name}".`);
    }
    names.add(row.name);
    return row as AmenitySnapshotRow;
  });
}

async function main() {
  const amenities = validateSnapshot();
  const existing = await db.amenity.findMany({
    where: { name: { in: amenities.map((amenity) => amenity.name) } },
    select: { name: true },
  });
  const existingNames = new Set(existing.map((amenity) => amenity.name));
  const missing = amenities.filter((amenity) => !existingNames.has(amenity.name));

  if (DRY_RUN) {
    console.log(
      `Dry run: ${missing.length} of ${amenities.length} snapshot amenities are missing and would be inserted; existing amenities would be unchanged.`
    );
    return;
  }

  const result = missing.length
    ? await db.amenity.createMany({
        data: missing,
        skipDuplicates: true,
      })
    : { count: 0 };

  console.log(
    `Amenity sync complete: inserted ${result.count}; already present ${amenities.length - missing.length}; existing production amenities were unchanged.`
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
