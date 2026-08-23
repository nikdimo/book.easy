import snapshot from "../prisma/data/amenity-catalog.json";
import { AMENITY_DUPLICATE_TARGETS, canonicalAmenityKey } from "../src/lib/amenities/dedupe-map";
import { normalizeAmenityName } from "../src/lib/amenities/normalize";
import { db } from "../src/lib/db";

const APPLY = process.argv.includes("--apply");

type CatalogAmenity = (typeof snapshot.amenities)[number];
type Selection = { listingId: string; amenity: { key: string } };

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function selectionSets(rows: Selection[]) {
  const byListing = new Map<string, Set<string>>();
  for (const row of rows) {
    const keys = byListing.get(row.listingId) ?? new Set<string>();
    keys.add(canonicalAmenityKey(row.amenity.key));
    byListing.set(row.listingId, keys);
  }
  return byListing;
}

function sameSet(left: ReadonlySet<string>, right: ReadonlySet<string>) {
  return left.size === right.size && [...left].every((value) => right.has(value));
}

async function main() {
  const pairs = Object.entries(AMENITY_DUPLICATE_TARGETS);
  const sourceKeys = pairs.map(([sourceKey]) => sourceKey);
  const targetKeys = [...new Set(pairs.map(([, targetKey]) => targetKey))];
  const catalogByKey = new Map(snapshot.amenities.map((row) => [row.key, row]));

  for (const targetKey of targetKeys) {
    assert(catalogByKey.has(targetKey), `Canonical amenity "${targetKey}" is absent from the release catalog.`);
  }

  const existing = await db.amenity.findMany({
    where: { key: { in: [...sourceKeys, ...targetKeys] } },
    select: {
      id: true,
      key: true,
      name: true,
      _count: { select: { listings: true, aliases: true, translations: true } },
    },
  });
  const existingByKey = new Map(existing.map((row) => [row.key, row]));
  const sources = sourceKeys.flatMap((key) => {
    const row = existingByKey.get(key);
    return row ? [row] : [];
  });
  const targetsToCreate = targetKeys.filter((key) => !existingByKey.has(key));
  const listingSelectionsToMove = sources.reduce((sum, row) => sum + row._count.listings, 0);

  console.log(
    `${APPLY ? "Apply" : "Dry run"}: ${sources.length} duplicate amenity rows; ` +
      `${targetsToCreate.length} canonical rows to create; ` +
      `${listingSelectionsToMove} listing selection${listingSelectionsToMove === 1 ? "" : "s"} to preserve.`,
  );

  if (sources.length === 0) {
    console.log("No duplicate amenity rows remain. Nothing changed.");
    return;
  }
  if (!APPLY) {
    for (const source of sources) {
      const targetKey = canonicalAmenityKey(source.key);
      console.log(`  ${source.key} -> ${targetKey} (${source._count.listings} listings)`);
    }
    console.log("Run with --apply to execute this plan transactionally.");
    return;
  }

  const result = await db.$transaction(async (tx) => {
    const currentSources = await tx.amenity.findMany({
      where: { key: { in: sourceKeys } },
      include: { listings: true, aliases: true, translations: true },
    });
    const impactedListingIds = [...new Set(currentSources.flatMap((row) => row.listings.map(({ listingId }) => listingId)))];
    const beforeSelections = impactedListingIds.length
      ? await tx.listingAmenity.findMany({
          where: { listingId: { in: impactedListingIds } },
          select: { listingId: true, amenity: { select: { key: true } } },
        })
      : [];
    const expectedByListing = selectionSets(beforeSelections);
    const targetCache = new Map<string, { id: string; key: string; name: string }>();
    let createdTargets = 0;
    let movedSelections = 0;
    let movedAliases = 0;
    let copiedTranslations = 0;
    let translationConflicts = 0;

    for (const source of currentSources) {
      const targetKey = canonicalAmenityKey(source.key);
      assert(targetKey !== source.key, `No canonical target is configured for "${source.key}".`);

      let target = targetCache.get(targetKey) ?? (await tx.amenity.findUnique({
        where: { key: targetKey },
        select: { id: true, key: true, name: true },
      }));
      if (!target) {
        const catalogRow = catalogByKey.get(targetKey) as CatalogAmenity | undefined;
        assert(catalogRow, `Canonical amenity "${targetKey}" is absent from the release catalog.`);
        const category = await tx.amenityCategory.findUnique({
          where: { key: catalogRow.category },
          select: { id: true },
        });
        assert(category, `Category "${catalogRow.category}" is absent for canonical amenity "${targetKey}".`);

        const sameName = await tx.amenity.findUnique({
          where: { name: catalogRow.name },
          select: { id: true, key: true, name: true },
        });
        target = sameName
          ? await tx.amenity.update({
              where: { id: sameName.id },
              data: { key: targetKey },
              select: { id: true, key: true, name: true },
            })
          : await tx.amenity.create({
              data: {
                key: catalogRow.key,
                name: catalogRow.name,
                categoryId: category.id,
                icon: catalogRow.icon,
                sortOrder: catalogRow.sortOrder,
                isActive: catalogRow.isActive,
              },
              select: { id: true, key: true, name: true },
            });
        createdTargets += 1;
      }
      targetCache.set(targetKey, target);

      if (source.listings.length > 0) {
        const inserted = await tx.listingAmenity.createMany({
          data: source.listings.map(({ listingId }) => ({ listingId, amenityId: target.id })),
          skipDuplicates: true,
        });
        movedSelections += source.listings.length;
        void inserted;
      }

      for (const alias of source.aliases) {
        await tx.amenityAlias.upsert({
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
        movedAliases += 1;
      }
      await tx.amenityAlias.upsert({
        where: {
          provider_normalizedName: {
            provider: "AIRBNB",
            normalizedName: normalizeAmenityName(source.name),
          },
        },
        update: { providerName: source.name, amenityId: target.id },
        create: {
          provider: "AIRBNB",
          providerName: source.name,
          normalizedName: normalizeAmenityName(source.name),
          amenityId: target.id,
        },
      });
      movedAliases += 1;

      const existingTranslations = new Set(
        (await tx.amenityTranslation.findMany({
          where: { amenityId: target.id },
          select: { locale: true },
        })).map(({ locale }) => locale),
      );
      const missingTranslations = source.translations.filter(({ locale }) => !existingTranslations.has(locale));
      translationConflicts += source.translations.length - missingTranslations.length;
      if (missingTranslations.length > 0) {
        await tx.amenityTranslation.createMany({
          data: missingTranslations.map(({ locale, label, isManuallyEdited }) => ({
            amenityId: target.id,
            locale,
            label,
            isManuallyEdited,
          })),
          skipDuplicates: true,
        });
        copiedTranslations += missingTranslations.length;
      }

      await tx.amenity.delete({ where: { id: source.id } });
    }

    if (impactedListingIds.length > 0) {
      const afterSelections = await tx.listingAmenity.findMany({
        where: { listingId: { in: impactedListingIds } },
        select: { listingId: true, amenity: { select: { key: true } } },
      });
      const actualByListing = selectionSets(afterSelections);
      for (const listingId of impactedListingIds) {
        const expected = expectedByListing.get(listingId) ?? new Set<string>();
        const actual = actualByListing.get(listingId) ?? new Set<string>();
        assert(sameSet(expected, actual), `Selection verification failed for listing "${listingId}".`);
      }
    }

    const remainingDuplicates = await tx.amenity.count({ where: { key: { in: sourceKeys } } });
    assert(remainingDuplicates === 0, `${remainingDuplicates} duplicate amenity rows remain.`);

    return {
      deletedSources: currentSources.length,
      createdTargets,
      movedSelections,
      movedAliases,
      copiedTranslations,
      translationConflicts,
      verifiedListings: impactedListingIds.length,
    };
  });

  console.log(
    `Complete: deleted ${result.deletedSources} duplicate rows, created ${result.createdTargets} canonical rows, ` +
      `preserved ${result.movedSelections} selections across ${result.verifiedListings} listings, ` +
      `retained ${result.movedAliases} provider aliases, and copied ${result.copiedTranslations} translations.` +
      (result.translationConflicts > 0
        ? ` ${result.translationConflicts} translation conflicts kept the canonical label.`
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
