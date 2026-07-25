import { writeFile } from "node:fs/promises";
import path from "node:path";
import { db } from "../src/lib/db";
import { scanUiStrings } from "../src/lib/services/ui-translation.service";
import { REVIEWED_LANGUAGES } from "../src/lib/i18n/reviewed-languages";

const OUTPUT_PATH = path.join(
  process.cwd(),
  "src",
  "lib",
  "i18n",
  "reviewed-ai-translations.json"
);

async function main() {
  // Refresh the database catalog first so newly added source keys make the export
  // fail as missing/stale instead of silently producing an outdated snapshot.
  await scanUiStrings();
  const [databaseLanguages, strings] = await Promise.all([
    db.language.findMany({
      where: {
        isDefault: false,
        isEnabled: true,
        useAiTranslation: true,
      },
      orderBy: { sortOrder: "asc" },
      select: { code: true, name: true },
    }),
    db.uiString.findMany({
      where: { isActive: true },
      orderBy: { key: "asc" },
      select: { key: true, sourceText: true },
    }),
  ]);

  if (!databaseLanguages.length) throw new Error("No enabled AI languages are available to export.");
  if (!strings.length) throw new Error("The active UI string catalog is empty.");

  const expectedCodes = REVIEWED_LANGUAGES.map((language) => language.code);
  const actualCodes = databaseLanguages.map((language) => language.code);
  const expectedCodeSet = new Set<string>(expectedCodes);
  const actualCodeSet = new Set<string>(actualCodes);
  const missingCodes = expectedCodes.filter((code) => !actualCodeSet.has(code));
  const unexpectedCodes = actualCodes.filter((code) => !expectedCodeSet.has(code));
  if (missingCodes.length || unexpectedCodes.length) {
    throw new Error(
      "Enabled AI languages do not match the canonical reviewed-language manifest " +
        `(missing: ${missingCodes.join(", ") || "none"}; ` +
        `unexpected: ${unexpectedCodes.join(", ") || "none"}).`
    );
  }

  const snapshotLanguages = [];
  for (const language of REVIEWED_LANGUAGES) {
    const translations = await db.uiTranslation.findMany({
      where: { locale: language.code },
      orderBy: { key: "asc" },
      select: { key: true, value: true, sourceTextSnapshot: true },
    });
    const byKey = new Map(translations.map((translation) => [translation.key, translation]));
    const missing = strings.filter((entry) => {
      const translation = byKey.get(entry.key);
      return (
        !translation ||
        !translation.value.trim() ||
        translation.sourceTextSnapshot !== entry.sourceText
      );
    });
    if (missing.length) {
      const preview = missing
        .slice(0, 10)
        .map((entry) => `${entry.key} (${JSON.stringify(entry.sourceText)})`)
        .join(", ");
      throw new Error(
        `${language.code} is not exportable: ${missing.length} active strings are missing, empty, or stale: ${preview}${missing.length > 10 ? ", …" : ""}.`
      );
    }
    snapshotLanguages.push({
      code: language.code,
      name: language.nativeName,
      translations: Object.fromEntries(
        strings.map((entry) => [entry.key, byKey.get(entry.key)!.value])
      ),
    });
  }

  const snapshot = {
    schemaVersion: 1,
    sourceLanguage: "en",
    catalog: Object.fromEntries(strings.map((entry) => [entry.key, entry.sourceText])),
    languages: snapshotLanguages,
  };
  await writeFile(OUTPUT_PATH, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  console.log(
    `Exported ${strings.length} reviewed strings for ${REVIEWED_LANGUAGES.length} languages to ${OUTPUT_PATH}.`
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
