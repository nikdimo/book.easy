import snapshot from "../prisma/data/room-type-catalog.json";
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

type RoomTypeSnapshotRow = {
  key: string;
  name: string;
  category: string;
  icon: string | null;
  sortOrder: number;
  isRepeatable: boolean;
  isStandard: boolean;
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
    snapshot.schemaVersion === 1,
    `Unsupported room snapshot version: ${snapshot.schemaVersion}. Re-export with \`npm run rooms:export\`.`,
  );
  assert(
    Array.isArray(snapshot.categories) && snapshot.categories.length > 0,
    "The room snapshot has no categories.",
  );
  assert(
    Array.isArray(snapshot.roomTypes) && snapshot.roomTypes.length > 0,
    "The room snapshot is empty.",
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

  const roomTypeKeys = new Set<string>();
  const roomTypeNames = new Set<string>();
  const roomTypes = snapshot.roomTypes.map((entry, index): RoomTypeSnapshotRow => {
    const row = entry as Partial<RoomTypeSnapshotRow>;
    const label = `Room type row ${index + 1}`;
    assert(typeof row.key === "string" && row.key.trim(), `${label} has no key.`);
    assert(typeof row.name === "string" && row.name.trim(), `${label} has no name.`);
    assert(row.name === row.name.trim(), `${label} has surrounding whitespace.`);
    assert(
      typeof row.category === "string" && categoryKeys.has(row.category),
      `${label} ("${row.name}") points at unknown category "${row.category}".`,
    );
    assert(row.icon === null || typeof row.icon === "string", `${label} has a bad icon.`);
    assert(typeof row.sortOrder === "number", `${label} has no sortOrder.`);
    assert(typeof row.isRepeatable === "boolean", `${label} has no isRepeatable.`);
    assert(typeof row.isStandard === "boolean", `${label} has no isStandard.`);
    assert(typeof row.isActive === "boolean", `${label} has no isActive.`);
    assert(!roomTypeKeys.has(row.key), `Duplicate room type key "${row.key}".`);
    assert(!roomTypeNames.has(row.name), `Duplicate room type name "${row.name}".`);
    roomTypeKeys.add(row.key);
    roomTypeNames.add(row.name);
    return {
      key: row.key,
      name: row.name,
      category: row.category,
      icon: row.icon ?? null,
      sortOrder: row.sortOrder,
      isRepeatable: row.isRepeatable,
      isStandard: row.isStandard,
      isActive: row.isActive,
      translations: readTranslations(row.translations, label),
    };
  });

  return { categories, roomTypes };
}

/**
 * Reconciles production with the release snapshot.
 *
 * What it changes on a row that already exists: category, icon, sort order, whether it
 * repeats, whether it is offered as a standard space, and any translation it carries.
 *
 * What it deliberately leaves alone:
 *   - rows that exist only in production — they are never deleted, only left untouched;
 *   - `isActive` on any existing row, because hiding a room type is a production
 *     decision that a local export should not be able to reverse;
 *   - translations the snapshot has nothing to say about.
 *
 * Rows are matched on `key`, then on `name`, so a rename in the snapshot renames the
 * same row instead of creating a second one.
 */
async function main() {
  const { categories, roomTypes } = validateSnapshot();

  const [existingCategories, existingRoomTypes] = await Promise.all([
    db.roomTypeCategory.findMany({ select: { id: true, key: true, name: true } }),
    db.roomType.findMany({ select: { id: true, key: true, name: true } }),
  ]);

  const categoryByKey = new Map(existingCategories.map((row) => [row.key, row]));
  const categoryByName = new Map(existingCategories.map((row) => [row.name, row]));
  const roomTypeByKey = new Map(existingRoomTypes.map((row) => [row.key, row]));
  const roomTypeByName = new Map(existingRoomTypes.map((row) => [row.name, row]));

  const plan = {
    categoriesCreated: 0,
    categoriesUpdated: 0,
    roomTypesCreated: 0,
    roomTypesUpdated: 0,
    translations: 0,
  };

  for (const category of categories) {
    const match = categoryByKey.get(category.key) ?? categoryByName.get(category.name);
    if (match) plan.categoriesUpdated += 1;
    else plan.categoriesCreated += 1;
    plan.translations += Object.keys(category.translations).length;
  }
  for (const roomType of roomTypes) {
    const match = roomTypeByKey.get(roomType.key) ?? roomTypeByName.get(roomType.name);
    if (match) plan.roomTypesUpdated += 1;
    else plan.roomTypesCreated += 1;
    plan.translations += Object.keys(roomType.translations).length;
  }

  if (DRY_RUN) {
    console.log(
      `Dry run: ${plan.categoriesCreated} categories to insert, ${plan.categoriesUpdated} to reconcile; ` +
        `${plan.roomTypesCreated} room types to insert, ${plan.roomTypesUpdated} to reconcile; ` +
        `${plan.translations} translations to apply. ` +
        `${existingRoomTypes.length - plan.roomTypesUpdated} production-only room types would be left untouched.`,
    );
    return;
  }

  const categoryIds = new Map<string, string>();
  for (const category of categories) {
    const match = categoryByKey.get(category.key) ?? categoryByName.get(category.name);
    const saved = match
      ? await db.roomTypeCategory.update({
          where: { id: match.id },
          data: {
            key: category.key,
            name: category.name,
            icon: category.icon,
            sortOrder: category.sortOrder,
          },
        })
      : await db.roomTypeCategory.create({
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
      await db.roomTypeCategoryTranslation.upsert({
        where: { categoryId_locale: { categoryId, locale } },
        update: { label },
        create: { categoryId, locale, label },
      });
    }
  }

  for (const roomType of roomTypes) {
    const match = roomTypeByKey.get(roomType.key) ?? roomTypeByName.get(roomType.name);
    const categoryId = categoryIds.get(roomType.category)!;
    const saved = match
      ? await db.roomType.update({
          where: { id: match.id },
          data: {
            key: roomType.key,
            name: roomType.name,
            categoryId,
            icon: roomType.icon,
            sortOrder: roomType.sortOrder,
            isRepeatable: roomType.isRepeatable,
            isStandard: roomType.isStandard,
          },
        })
      : await db.roomType.create({
          data: {
            key: roomType.key,
            name: roomType.name,
            categoryId,
            icon: roomType.icon,
            sortOrder: roomType.sortOrder,
            isRepeatable: roomType.isRepeatable,
            isStandard: roomType.isStandard,
            isActive: roomType.isActive,
          },
        });

    for (const [locale, label] of Object.entries(roomType.translations)) {
      if (!knownLocales.has(locale)) {
        skippedLocales += 1;
        continue;
      }
      await db.roomTypeTranslation.upsert({
        where: { roomTypeId_locale: { roomTypeId: saved.id, locale } },
        update: { label },
        create: { roomTypeId: saved.id, locale, label },
      });
    }
  }

  console.log(
    `Room type sync complete: ${plan.categoriesCreated} categories inserted, ${plan.categoriesUpdated} reconciled; ` +
      `${plan.roomTypesCreated} room types inserted, ${plan.roomTypesUpdated} reconciled. ` +
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
