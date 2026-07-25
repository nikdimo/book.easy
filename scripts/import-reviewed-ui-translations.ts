import { db } from "../src/lib/db";
import catalog from "../src/lib/i18n/generated-ui-strings.json";
import snapshot from "../src/lib/i18n/reviewed-ai-translations.json";
import { scanUiStrings } from "../src/lib/services/ui-translation.service";
import { REVIEWED_LANGUAGES } from "../src/lib/i18n/reviewed-languages";
import { validateTranslationMap } from "../src/lib/i18n/translation-validation";
const DRY_RUN = process.argv.includes("--dry-run");

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
  const expectedLanguages = REVIEWED_LANGUAGES.map((language) => language.code);
  const snapshotLanguages = snapshot.languages.map((language) => language.code);
  if (JSON.stringify(snapshotLanguages) !== JSON.stringify(expectedLanguages)) {
    throw new Error(
      `Reviewed snapshot languages must match the canonical manifest (${expectedLanguages.join(", ")}).`
    );
  }
  for (const [key, source] of Object.entries(snapshot.catalog)) {
    if (currentCatalog.get(key) !== source) {
      throw new Error(`Reviewed translation snapshot is stale for "${key}".`);
    }
  }
  for (const [index, language] of snapshot.languages.entries()) {
    const manifestLanguage = REVIEWED_LANGUAGES[index];
    if (language.name !== manifestLanguage.nativeName) {
      throw new Error(
        `${language.code} must use the canonical native name "${manifestLanguage.nativeName}".`
      );
    }
    validateTranslationMap(
      snapshot.catalog,
      language.translations,
      `Reviewed snapshot ${language.code}`
    );
  }
}

async function main() {
  validateSnapshot();
  if (!DRY_RUN) await scanUiStrings();

  const locales = snapshot.languages.map((language) => language.code);
  const existingLanguages = await db.language.findMany({
    where: { code: { in: locales } },
    select: { code: true },
  });
  const existingLocaleSet = new Set(existingLanguages.map((language) => language.code));
  const missingLocales = locales.filter((locale) => !existingLocaleSet.has(locale));
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
      `Dry run: would import ${catalog.length} reviewed AI translations for ${locales.join(", ")}, ` +
        `create ${missingLocales.length ? missingLocales.join(", ") : "no missing languages"}, ` +
        `enable all reviewed languages, and preserve ${currentManual.size} current manual overrides.`
    );
    return;
  }

  for (const [index, language] of snapshot.languages.entries()) {
    const { code, name } = language;
    await db.language.upsert({
      where: { code },
      create: {
        code,
        name,
        isDefault: false,
        isEnabled: true,
        sortOrder: index + 1,
        useAiTranslation: true,
      },
      update: {
        name,
        isDefault: false,
        isEnabled: true,
        useAiTranslation: true,
      },
    });

    const translationOperations = Object.entries(language.translations).flatMap(
      ([key, value]) => {
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
      }
    );
    if (translationOperations.length) {
      await db.$transaction(translationOperations);
    }
  }

  for (const { code } of snapshot.languages) {
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
    `Imported reviewed AI translations for ${locales.join(", ")}; ` +
      `created ${missingLocales.length ? missingLocales.join(", ") : "no languages"}; ` +
      `preserved ${currentManual.size} current manual overrides.`
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
