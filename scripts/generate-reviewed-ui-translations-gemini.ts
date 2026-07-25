import { db } from "../src/lib/db";
import { scanUiStrings } from "../src/lib/services/ui-translation.service";
import {
  REVIEWED_LANGUAGES,
  type ReviewedLanguage,
} from "../src/lib/i18n/reviewed-languages";
import { validateTranslationMap } from "../src/lib/i18n/translation-validation";

const MODEL = process.env.GEMINI_TRANSLATION_MODEL || "gemini-2.5-flash";
const API_KEY = process.env.GOOGLE_API_KEY;
const BATCH_SIZE = 30;

interface CatalogEntry {
  key: string;
  sourceText: string;
}

function chunks<T>(values: T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(values.length / size) }, (_, index) =>
    values.slice(index * size, (index + 1) * size)
  );
}

async function generateBatch(
  languages: readonly ReviewedLanguage[],
  entries: CatalogEntry[]
): Promise<Record<string, Record<string, string>>> {
  if (!API_KEY) throw new Error("GOOGLE_API_KEY is required.");
  const prompt = [
    "Translate fixed user-interface copy for a vacation-rental marketplace.",
    "Return only JSON shaped as {\"translations\":{\"locale\":{\"key\":\"value\"}}}.",
    "Translate naturally and concisely, using terminology familiar from booking websites.",
    "Preserve every {placeholder} exactly. Preserve punctuation when it carries UI meaning.",
    "Keys ending in .zero/.one/.two/.few/.many/.other are CLDR plural categories:",
    "write the grammatically correct form for that category, even when the English source repeats.",
    "Do not translate brand names, currency codes, URLs, or placeholders.",
    "Follow the language-specific editorial guidance below:",
    ...languages.map(
      (language) =>
        `${language.code}=${language.englishName} (${language.nativeName}): ${language.editorGuidance}`
    ),
    `Entries: ${JSON.stringify(entries)}`,
  ].join("\n");

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.15,
          responseMimeType: "application/json",
        },
      }),
    }
  );
  if (!response.ok) {
    throw new Error(`Gemini ${response.status}: ${await response.text()}`);
  }
  const payload = (await response.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = payload.candidates?.[0]?.content?.parts
    ?.map((part) => part.text || "")
    .join("");
  if (!text) throw new Error("Gemini returned no translation payload.");
  const parsed = JSON.parse(text) as {
    translations?: Record<string, Record<string, string>>;
  };
  if (!parsed.translations) throw new Error("Gemini response has no translations object.");

  const sourceByKey = Object.fromEntries(
    entries.map((entry) => [entry.key, entry.sourceText])
  );
  for (const language of languages) {
    const translated = parsed.translations[language.code];
    if (!translated) throw new Error(`Gemini omitted locale ${language.code}.`);
    parsed.translations[language.code] = validateTranslationMap(
      sourceByKey,
      translated,
      `Gemini ${language.code} response`
    );
  }
  return parsed.translations;
}

async function generateWithRetry(
  languages: readonly ReviewedLanguage[],
  entries: CatalogEntry[]
) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      return await generateBatch(languages, entries);
    } catch (error) {
      lastError = error;
      if (attempt === 4) break;
      await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
    }
  }
  throw lastError;
}

async function main() {
  await scanUiStrings();
  const strings = await db.uiString.findMany({
    where: { isActive: true },
    orderBy: { key: "asc" },
    select: { key: true, sourceText: true },
  });
  const sourceByKey = new Map(strings.map((entry) => [entry.key, entry.sourceText]));

  for (const [index, language] of REVIEWED_LANGUAGES.entries()) {
    await db.language.upsert({
      where: { code: language.code },
      create: {
        code: language.code,
        name: language.nativeName,
        isDefault: false,
        isEnabled: true,
        sortOrder: index + 1,
        useAiTranslation: true,
      },
      update: {
        name: language.nativeName,
        isEnabled: true,
        useAiTranslation: true,
      },
    });
  }

  const missingByLocale = new Map<string, CatalogEntry[]>();
  for (const language of REVIEWED_LANGUAGES) {
    const existing = await db.uiTranslation.findMany({
      where: { locale: language.code },
      select: { key: true, value: true, sourceTextSnapshot: true },
    });
    const current = new Map(existing.map((entry) => [entry.key, entry]));
    missingByLocale.set(
      language.code,
      strings.filter((entry) => {
        const row = current.get(entry.key);
        return !row?.value.trim() || row.sourceTextSnapshot !== entry.sourceText;
      })
    );
  }

  const groups = new Map<string, ReviewedLanguage[]>();
  for (const language of REVIEWED_LANGUAGES) {
    const signature = missingByLocale
      .get(language.code)!
      .map((entry) => entry.key)
      .join("\u0000");
    if (!signature) continue;
    const group = groups.get(signature) || [];
    group.push(language);
    groups.set(signature, group);
  }

  for (const languages of groups.values()) {
    const entries = missingByLocale.get(languages[0].code)!;
    const batches = chunks(entries, BATCH_SIZE);
    for (const [batchIndex, batch] of batches.entries()) {
      const generated = await generateWithRetry(languages, batch);
      for (const language of languages) {
        await db.$transaction(
          batch.map((entry) =>
            db.uiTranslation.upsert({
              where: {
                locale_key: { locale: language.code, key: entry.key },
              },
              create: {
                locale: language.code,
                key: entry.key,
                value: generated[language.code][entry.key].trim(),
                sourceTextSnapshot: sourceByKey.get(entry.key)!,
                isManuallyEdited: false,
              },
              update: {
                value: generated[language.code][entry.key].trim(),
                sourceTextSnapshot: sourceByKey.get(entry.key)!,
                isManuallyEdited: false,
              },
            })
          )
        );
      }
      console.log(
        `Generated batch ${batchIndex + 1}/${batches.length} for ${languages
          .map((language) => language.code)
          .join(", ")} (${batch.length} strings).`
      );
    }
  }

  console.log(
    `Reviewed translation generation complete for ${REVIEWED_LANGUAGES.length} languages and ${strings.length} active strings.`
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
