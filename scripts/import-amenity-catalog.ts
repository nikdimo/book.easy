import snapshot from "../prisma/data/amenity-catalog.json";
import { db } from "../src/lib/db";

const DRY_RUN = process.argv.includes("--dry-run");

type TranslationMap = Record<string, string>;

type CategorySnapshotRow = {
  key: string;
  name: string;
  icon: string | null;
  sortOrder: number;
  isActive: boolean;
  translations: TranslationMap;
};

type AmenitySnapshotRow = {
  key: string;
  name: string;
  category: string;
  icon: string | null;
  sortOrder: number;
  isActive: boolean;
  translations: TranslationMap;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function readTranslations(value: unknown, label: string): TranslationMap {
  if (value === undefined) return {};
  assert(
    typeof value === "object" && value !== null && !Array.isArray(value),
    `${label} has a malformed translations block.`,
  );
  const entries = Object.entries(value as Record<string, unknown>);
  for (const [locale, text] of entries) {
    assert(
      typeof text === "string" && text.trim().length > 0,
      `${label} has an empty translation for "${locale}".`,
    );
  }
  return Object.fromEntries(entries.map(([locale, text]) => [locale, String(text)]));
}

function validateSnapshot() {
  assert(
    snapshot.schemaVersion === 2,
    `Unsupported amenity snapshot version: ${snapshot.schemaVersion}. Re-export with \`npm run amenities:export\`.`,
  );
  assert(
    Array.isArray(snapshot.categories) && snapshot.categories.length > 0,
    "The amenity snapshot has no categories.",
  );
  assert(
    Array.isArray(snapshot.amenities) && snapshot.amenities.length > 0,
    "The amenity snapshot is empty.",
  );

  const categoryKeys = new Set<string>();
  const categories = snapshot.categories.map((entry, index): CategorySnapshotRow => {
    const row = entry as Partial<CategorySnapshotRow>;
    const label = `Category row ${index + 1}`;
    assert(typeof row.key === "string" && row.key.trim(), `${label} has no key.`);
    assert(typeof row.name === "string" && row.name.trim(), `${label} has no name.`);
    assert(row.icon === null || typeof row.icon === "string", `${label} has a bad icon.`);
    assert(typeof row.sortOrder === "number", `${label} has no sortOrder.`);
    assert(typeof row.isActive === "boolean", `${label} has no isActive.`);
    assert(!categoryKeys.has(row.key), `Duplicate category key "${row.key}".`);
    categoryKeys.add(row.key);
    return {
      key: row.key,
      name: row.name,
      icon: row.icon ?? null,
      sortOrder: row.sortOrder,
      isActive: row.isActive,
      translations: readTranslations(row.translations, label),
    };
  });

  const amenityKeys = new Set<string>();
  const amenityNames = new Set<string>();
  const amenities = snapshot.amenities.map((entry, index): AmenitySnapshotRow => {
    const row = entry as Partial<AmenitySnapshotRow>;
    const label = `Amenity row ${index + 1}`;
    assert(typeof row.key === "string" && row.key.trim(), `${label} has no key.`);
    assert(typeof row.name === "string" && row.name.trim(), `${label} has no name.`);
    assert(row.name === row.name.trim(), `${label} has surrounding whitespace.`);
    assert(
      typeof row.category === "string" && categoryKeys.has(row.category),
      `${label} ("${row.name}") points at unknown category "${row.category}".`,
    );
    assert(row.icon === null || typeof row.icon === "string", `${label} has a bad icon.`);
    assert(typeof row.sortOrder === "number", `${label} has no sortOrder.`);
    assert(typeof row.isActive === "boolean", `${label} has no isActive.`);
    assert(!amenityKeys.has(row.key), `Duplicate amenity key "${row.key}".`);
    assert(!amenityNames.has(row.name), `Duplicate amenity name "${row.name}".`);
    amenityKeys.add(row.key);
    amenityNames.add(row.name);
    return {
      key: row.key,
      name: row.name,
      category: row.category,
      icon: row.icon ?? null,
      sortOrder: row.sortOrder,
      isActive: row.isActive,
      translations: readTranslations(row.translations, label),
    };
  });

  return { categories, amenities };
}

/**
 * Reconciles production with the release snapshot.
 *
 * What it changes on a row that already exists: category, icon, sort order, and any
 * translation the snapshot carries.
 *
 * What it deliberately leaves alone:
 *   - rows that exist only in production (provider imports, host suggestions) — they
 *     are never deleted, only left untouched;
 *   - `isActive` on any existing row, because hiding an amenity is a production
 *     decision that a local export should not be able to reverse;
 *   - translations the snapshot has nothing to say about.
 *
 * Rows are matched on `key`, then on `name` for catalogs predating the key column, so
 * a rename in the snapshot renames the same row instead of creating a second one.
 */
async function main() {
  const { categories, amenities } = validateSnapshot();

  const [existingCategories, existingAmenities] = await Promise.all([
    db.amenityCategory.findMany({ select: { id: true, key: true, name: true } }),
    db.amenity.findMany({ select: { id: true, key: true, name: true } }),
  ]);

  const categoryByKey = new Map(existingCategories.map((row) => [row.key, row]));
  const categoryByName = new Map(existingCategories.map((row) => [row.name, row]));
  const amenityByKey = new Map(existingAmenities.map((row) => [row.key, row]));
  const amenityByName = new Map(existingAmenities.map((row) => [row.name, row]));

  const plan = {
    categoriesCreated: 0,
    categoriesUpdated: 0,
    amenitiesCreated: 0,
    amenitiesUpdated: 0,
    translations: 0,
  };

  for (const category of categories) {
    const match = categoryByKey.get(category.key) ?? categoryByName.get(category.name);
    if (match) plan.categoriesUpdated += 1;
    else plan.categoriesCreated += 1;
    plan.translations += Object.keys(category.translations).length;
  }
  for (const amenity of amenities) {
    const match = amenityByKey.get(amenity.key) ?? amenityByName.get(amenity.name);
    if (match) plan.amenitiesUpdated += 1;
    else plan.amenitiesCreated += 1;
    plan.translations += Object.keys(amenity.translations).length;
  }

  if (DRY_RUN) {
    console.log(
      `Dry run: ${plan.categoriesCreated} categories to insert, ${plan.categoriesUpdated} to reconcile; ` +
        `${plan.amenitiesCreated} amenities to insert, ${plan.amenitiesUpdated} to reconcile; ` +
        `${plan.translations} translations to apply. ` +
        `${existingAmenities.length - plan.amenitiesUpdated} production-only amenities would be left untouched.`,
    );
    return;
  }

  const categoryIds = new Map<string, string>();
  for (const category of categories) {
    const match = categoryByKey.get(category.key) ?? categoryByName.get(category.name);
    const saved = match
      ? await db.amenityCategory.update({
          where: { id: match.id },
          data: {
            key: category.key,
            name: category.name,
            icon: category.icon,
            sortOrder: category.sortOrder,
          },
        })
      : await db.amenityCategory.create({
          data: {
            key: category.key,
            name: category.name,
            icon: category.icon,
            sortOrder: category.sortOrder,
            isActive: category.isActive,
          },
        });
    categoryIds.set(category.key, saved.id);
  }

  // Languages the snapshot mentions but this database does not have would violate the
  // translation foreign key, so they are skipped rather than failing the deploy.
  const knownLocales = new Set(
    (await db.language.findMany({ select: { code: true } })).map((row) => row.code),
  );
  let skippedLocales = 0;

  for (const category of categories) {
    const categoryId = categoryIds.get(category.key)!;
    for (const [locale, label] of Object.entries(category.translations)) {
      if (!knownLocales.has(locale)) {
        skippedLocales += 1;
        continue;
      }
      await db.amenityCategoryTranslation.upsert({
        where: { categoryId_locale: { categoryId, locale } },
        update: { label },
        create: { categoryId, locale, label },
      });
    }
  }

  for (const amenity of amenities) {
    const match = amenityByKey.get(amenity.key) ?? amenityByName.get(amenity.name);
    const categoryId = categoryIds.get(amenity.category)!;
    const saved = match
      ? await db.amenity.update({
          where: { id: match.id },
          data: {
            key: amenity.key,
            name: amenity.name,
            categoryId,
            icon: amenity.icon,
            sortOrder: amenity.sortOrder,
          },
        })
      : await db.amenity.create({
          data: {
            key: amenity.key,
            name: amenity.name,
            categoryId,
            icon: amenity.icon,
            sortOrder: amenity.sortOrder,
            isActive: amenity.isActive,
          },
        });

    for (const [locale, label] of Object.entries(amenity.translations)) {
      if (!knownLocales.has(locale)) {
        skippedLocales += 1;
        continue;
      }
      await db.amenityTranslation.upsert({
        where: { amenityId_locale: { amenityId: saved.id, locale } },
        update: { label },
        create: { amenityId: saved.id, locale, label },
      });
    }
  }

  console.log(
    `Amenity sync complete: ${plan.categoriesCreated} categories inserted, ${plan.categoriesUpdated} reconciled; ` +
      `${plan.amenitiesCreated} amenities inserted, ${plan.amenitiesUpdated} reconciled. ` +
      `Production-only rows, hidden states and unlisted translations were left unchanged.` +
      (skippedLocales > 0 ? ` Skipped ${skippedLocales} translations for languages this database does not have.` : ""),
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
