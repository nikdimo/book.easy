import { db } from "../src/lib/db";
import {
  REVIEWED_LANGUAGES,
  type ReviewedLanguage,
} from "../src/lib/i18n/reviewed-languages";
import { validateTranslationMap } from "../src/lib/i18n/translation-validation";
import { EMAIL_TRANSLATION_GUIDANCE } from "../src/lib/i18n/email-translation-guidance";
import { scanUiStrings } from "../src/lib/services/ui-translation.service";

const API_KEY = process.env.OPENAI_API_KEY;
const MODEL = process.env.OPENAI_TRANSLATION_MODEL || "gpt-4.1-mini";
// Two locales and sixty short UI strings comfortably fit below the response
// ceiling while substantially reducing round trips for a full catalog recovery.
const BATCH_SIZE = 60;
const LANGUAGE_GROUP_SIZE = 2;
const REQUESTED_LOCALES = new Set(
  (process.env.OPENAI_TRANSLATION_LOCALES || "")
    .split(",")
    .map((locale) => locale.trim())
    .filter(Boolean)
);

interface CatalogEntry {
  key: string;
  sourceText: string;
}

function chunks<T>(values: readonly T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(values.length / size) }, (_, index) =>
    values.slice(index * size, (index + 1) * size)
  );
}

async function generateBatch(
  languages: readonly ReviewedLanguage[],
  entries: readonly CatalogEntry[]
): Promise<Record<string, Record<string, string>>> {
  if (!API_KEY) throw new Error("OPENAI_API_KEY is required.");

  const prompt = [
    "Translate fixed user-interface copy for a vacation-rental marketplace.",
    'Return only JSON shaped as {"translations":{"locale":{"key":"value"}}}.',
    "Translate naturally and concisely, using terminology familiar from booking websites. UI space is limited: keep buttons, tabs, badges, labels, and headings as short as naturally possible; do not add explanatory wording.",
    "Preserve every {placeholder} exactly and preserve punctuation when it carries UI meaning.",
    "Do not translate brand names, currency codes, URLs, or placeholders.",
    // Transactional email carries claims about money and travel that the rest of the
    // catalog does not. Only add the extra rules when the batch actually contains one.
    ...(entries.some((entry) => entry.key.startsWith("email."))
      ? [EMAIL_TRANSLATION_GUIDANCE]
      : []),
    "Follow this language-specific editorial guidance:",
    ...languages.map(
      (language) =>
        `${language.code}=${language.englishName} (${language.nativeName}): ${language.editorGuidance}`
    ),
    `Entries: ${JSON.stringify(entries)}`,
  ].join("\n");

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.15,
      response_format: { type: "json_object" },
      max_completion_tokens: 6000,
      messages: [
        {
          role: "system",
          content:
            "You are a meticulous localization editor. Return valid JSON and every requested locale and key.",
        },
        { role: "user", content: prompt },
      ],
    }),
    signal: AbortSignal.timeout(60_000),
  });

  if (!response.ok) {
    throw new Error(`OpenAI ${response.status}: ${await response.text()}`);
  }

  const payload = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const raw = payload.choices?.[0]?.message?.content;
  if (!raw) throw new Error("OpenAI returned no translation payload.");

  const parsed = JSON.parse(raw) as {
    translations?: Record<string, Record<string, string>>;
  };
  if (!parsed.translations) {
    throw new Error("OpenAI response has no translations object.");
  }

  const sourceByKey = Object.fromEntries(
    entries.map((entry) => [entry.key, entry.sourceText])
  );
  for (const language of languages) {
    const translated = parsed.translations[language.code];
    if (!translated) throw new Error(`OpenAI omitted locale ${language.code}.`);
    try {
      parsed.translations[language.code] = validateTranslationMap(
        sourceByKey,
        translated,
        `OpenAI ${language.code} response`
      );
    } catch (error) {
      // A model response that drops a runtime placeholder is never safe to ship.
      // Keep the English source for only the malformed entry and validate the rest
      // of the batch again, so one bad response cannot hold the whole locale back.
      for (const [key, source] of Object.entries(sourceByKey)) {
        const placeholders = source.match(/\{[A-Za-z][A-Za-z0-9_]*\}/g) ?? [];
        const value = translated[key] ?? "";
        const translatedPlaceholders = value.match(/\{[A-Za-z][A-Za-z0-9_]*\}/g) ?? [];
        if (placeholders.sort().join("\u0000") !== translatedPlaceholders.sort().join("\u0000")) {
          translated[key] = source;
        }
      }
      parsed.translations[language.code] = validateTranslationMap(
        sourceByKey,
        translated,
        `OpenAI ${language.code} response after placeholder fallback`
      );
    }
  }
  return parsed.translations;
}

async function generateWithRetry(
  languages: readonly ReviewedLanguage[],
  entries: readonly CatalogEntry[]
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
  const languages = REQUESTED_LOCALES.size
    ? REVIEWED_LANGUAGES.filter((language) => REQUESTED_LOCALES.has(language.code))
    : REVIEWED_LANGUAGES;
  const unknownLocales = [...REQUESTED_LOCALES].filter(
    (locale) => !languages.some((language) => language.code === locale)
  );
  if (unknownLocales.length) {
    throw new Error(`Unknown reviewed locale(s): ${unknownLocales.join(", ")}.`);
  }
  const strings = await db.uiString.findMany({
    where: { isActive: true },
    orderBy: { key: "asc" },
    select: { key: true, sourceText: true },
  });
  const sourceByKey = new Map(strings.map((entry) => [entry.key, entry.sourceText]));

  for (const languageGroup of chunks(languages, LANGUAGE_GROUP_SIZE)) {
    const missingByLocale = new Map<string, CatalogEntry[]>();
    for (const language of languageGroup) {
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
    for (const language of languageGroup) {
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
      const missing = missingByLocale.get(languages[0].code)!;
      const batches = chunks(missing, BATCH_SIZE);
      for (const [batchIndex, batch] of batches.entries()) {
        console.log(
          `Requesting batch ${batchIndex + 1}/${batches.length} for ${languages
            .map((language) => language.code)
            .join(", ")} (${batch.length} strings).`
        );
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
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
