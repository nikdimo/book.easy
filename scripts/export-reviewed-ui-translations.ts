import { writeFile } from "node:fs/promises";
import path from "node:path";
import { db } from "../src/lib/db";
import { scanUiStrings } from "../src/lib/services/ui-translation.service";

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
  const [languages, strings] = await Promise.all([
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

  if (!languages.length) throw new Error("No enabled AI languages are available to export.");
  if (!strings.length) throw new Error("The active UI string catalog is empty.");

  const snapshotLanguages = [];
  for (const language of languages) {
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
      name: language.name,
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
    `Exported ${strings.length} reviewed strings for ${languages.length} languages to ${OUTPUT_PATH}.`
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
