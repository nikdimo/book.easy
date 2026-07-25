import { db } from "../src/lib/db";
import catalog from "../src/lib/i18n/generated-ui-strings.json";
import snapshot from "../src/lib/i18n/reviewed-ai-translations.json";
import { scanUiStrings } from "../src/lib/services/ui-translation.service";

const PLACEHOLDER_RE = /\{[A-Za-z][A-Za-z0-9_]*\}/g;
const DRY_RUN = process.argv.includes("--dry-run");

function placeholders(value: string): string[] {
  return [...value.matchAll(PLACEHOLDER_RE)].map((match) => match[0]).sort();
}

function validateSnapshot(): void {
  if (snapshot.schemaVersion !== 1) {
    throw new Error(`Unsupported reviewed translation snapshot version: ${snapshot.schemaVersion}.`);
  }
  const currentCatalog = new Map(catalog.map((entry) => [entry.key, entry.sourceText]));
  const snapshotKeys = Object.keys(snapshot.catalog).sort();
  const currentKeys = [...currentCatalog.keys()].sort();
  if (JSON.stringify(snapshotKeys) !== JSON.stringify(currentKeys)) {
    throw new Error(
      "The reviewed translation snapshot does not contain exactly the deployed UI catalog keys."
    );
  }
  for (const [key, source] of Object.entries(snapshot.catalog)) {
    if (currentCatalog.get(key) !== source) {
      throw new Error(`Reviewed translation snapshot is stale for "${key}".`);
    }
  }
  for (const language of snapshot.languages) {
    const keys = Object.keys(language.translations).sort();
    if (JSON.stringify(keys) !== JSON.stringify(currentKeys)) {
      throw new Error(`${language.code} does not contain exactly the deployed UI catalog keys.`);
    }
    for (const [key, value] of Object.entries(language.translations)) {
      if (!value.trim()) throw new Error(`${language.code}:${key} is empty.`);
      const expected = placeholders(snapshot.catalog[key as keyof typeof snapshot.catalog]);
      const actual = placeholders(value);
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error(`${language.code}:${key} does not preserve source placeholders.`);
      }
    }
  }
}

async function main() {
  validateSnapshot();
  if (!DRY_RUN) await scanUiStrings();

  const snapshotByLocale = new Map(
    snapshot.languages.map((language) => [language.code, language])
  );
  const existingLanguages = await db.language.findMany({
    where: { code: { in: [...snapshotByLocale.keys()] }, isDefault: false },
    select: { code: true },
  });
  if (!existingLanguages.length) {
    throw new Error(
      "None of the reviewed snapshot languages exist in this database. Add languages in Admin settings first."
    );
  }

  const locales = existingLanguages.map((language) => language.code);
  const currentManualRows = await db.uiTranslation.findMany({
    where: {
      locale: { in: locales },
      isManuallyEdited: true,
    },
    select: { locale: true, key: true, sourceTextSnapshot: true },
  });
  const currentManual = new Set(
    currentManualRows
      .filter((row) => snapshot.catalog[row.key as keyof typeof snapshot.catalog] === row.sourceTextSnapshot)
      .map((row) => `${row.locale}\u0000${row.key}`)
  );

  if (DRY_RUN) {
    console.log(
      `Dry run: would import ${catalog.length} reviewed AI translations for ${locales.join(", ")}, enable AI fixed-copy for those existing languages, and preserve ${currentManual.size} current manual overrides.`
    );
    return;
  }

  const operations = existingLanguages.flatMap(({ code }) => {
    const language = snapshotByLocale.get(code)!;
    return [
      db.language.update({
        where: { code },
        data: { useAiTranslation: true },
      }),
      ...Object.entries(language.translations).flatMap(([key, value]) => {
        if (currentManual.has(`${code}\u0000${key}`)) return [];
        const sourceTextSnapshot =
          snapshot.catalog[key as keyof typeof snapshot.catalog];
        return [
          db.uiTranslation.upsert({
            where: { locale_key: { locale: code, key } },
            create: {
              locale: code,
              key,
              value,
              sourceTextSnapshot,
              isManuallyEdited: false,
            },
            update: {
              value,
              sourceTextSnapshot,
              isManuallyEdited: false,
            },
          }),
        ];
      }),
    ];
  });
  await db.$transaction(operations);

  for (const { code } of existingLanguages) {
    const current = await db.uiTranslation.findMany({
      where: {
        locale: code,
        uiString: { isActive: true },
      },
      select: {
        key: true,
        value: true,
        sourceTextSnapshot: true,
        uiString: { select: { sourceText: true } },
      },
    });
    const invalid = current.filter(
      (translation) =>
        !translation.value.trim() ||
        translation.sourceTextSnapshot !== translation.uiString.sourceText
    );
    if (current.length !== catalog.length || invalid.length) {
      throw new Error(
        `${code} verification failed after import: expected ${catalog.length} current translations, found ${current.length - invalid.length}.`
      );
    }
  }

  console.log(
    `Imported reviewed AI translations for ${locales.join(", ")}; preserved ${currentManual.size} current manual overrides.`
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
