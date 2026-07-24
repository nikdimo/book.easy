import "server-only";
import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | null = null;

const PLACEHOLDER_RE = /\{[A-Za-z][A-Za-z0-9_]*\}/g;

const LANGUAGE_EDITOR_GUIDANCE: Record<string, string> = {
  mk: "Use standard, idiomatic Macedonian. Prefer polite plural imperatives for guest actions. Use оглас/огласете for listing a property, never изложба/изложете. Avoid Serbian or Bulgarian calques.",
  sq: "Use standard, idiomatic Albanian with concise marketplace wording and a consistent friendly-polite voice. Avoid word-for-word English syntax.",
  sr: "Use standard Serbian in Cyrillic and Ekavian consistently. Prefer concise, idiomatic booking-marketplace terminology and polite plural imperatives.",
  tr: "Use idiomatic modern Turkish, concise marketplace terminology, and consistent polite imperatives. Avoid literal English word order.",
  bg: "Use standard, idiomatic Bulgarian with concise marketplace wording and polite plural imperatives. Avoid Macedonian or Serbian forms.",
};

function getClient(): Anthropic {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error("ANTHROPIC_API_KEY is not configured.");
    }
    client = new Anthropic({ apiKey, maxRetries: 2, timeout: 60_000 });
  }
  return client;
}

/** Translates a batch of {key: englishText} strings into `targetLanguageName` in one
 *  API call. Returns a {key: translatedText} map covering every input key. */
export async function translateBatch(
  texts: Record<string, string>,
  targetLanguageName: string,
  targetLocale?: string
): Promise<Record<string, string>> {
  const entries = Object.entries(texts);
  if (entries.length === 0) return {};

  const client = getClient();
  const response = await client.messages.create({
    model: process.env.ANTHROPIC_TRANSLATION_MODEL || "claude-sonnet-5",
    max_tokens: 4096,
    system:
      "You translate short website UI strings (buttons, labels, headings) from English into the requested language. " +
      "Keep translations concise and natural for a booking/rental website. Use each key as context; for plural keys ending " +
      "in .zero, .one, .two, .few, .many, or .other, use the grammar required by that plural category. " +
      "Preserve every placeholder like {name} exactly, without translating or removing it. " +
      "Brand names, currency codes, city names, and product names must remain unchanged. " +
      `${targetLocale ? LANGUAGE_EDITOR_GUIDANCE[targetLocale] ?? "" : ""} ` +
      "Respond with ONLY one valid JSON object containing exactly the input keys and string values — no markdown or commentary.",
    messages: [
      {
        role: "user",
        content: `Translate the values of this JSON object into ${targetLanguageName}. Keep the same keys.\n\n${JSON.stringify(
          Object.fromEntries(entries)
        )}`,
      },
    ],
  });

  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Unexpected response from translation API.");
  }

  return validateTranslationResponse(texts, textBlock.text);
}

/** Reviews existing translations as a native localization editor. The returned map
 * still covers every key so callers can update a batch atomically after validation. */
export async function reviewTranslationBatch(
  entries: Record<string, { source: string; current: string }>,
  targetLanguage: { code: string; name: string }
): Promise<Record<string, string>> {
  if (Object.keys(entries).length === 0) return {};

  const response = await getClient().messages.create({
    model: process.env.ANTHROPIC_TRANSLATION_MODEL || "claude-sonnet-5",
    max_tokens: 8192,
    system:
      "You are a senior native-language localization editor for a trusted accommodation marketplace. " +
      "Review every existing UI translation against its English source and key context. Return the existing wording unchanged when it is already natural; otherwise rewrite it so it sounds authored by a native product writer, not machine-translated. " +
      "Keep labels concise, preserve meaning and tone, use consistent marketplace terminology, and preserve every {placeholder} exactly. " +
      "For plural keys ending in .zero, .one, .two, .few, .many, or .other, use grammar for that exact CLDR category. " +
      "Never translate brands, currency codes, city names, or product names. " +
      `${LANGUAGE_EDITOR_GUIDANCE[targetLanguage.code] ?? "Use the standard native form of the target language."} ` +
      "Every returned value must be a non-empty translated string. Respond with ONLY one valid JSON object containing exactly the input keys and final string values—no markdown or commentary.",
    messages: [
      {
        role: "user",
        content:
          `Review these ${targetLanguage.name} (${targetLanguage.code}) UI translations. ` +
          `Each value contains the English source and current translation. Return key-to-final-translation JSON.\n\n${JSON.stringify(entries)}`,
      },
    ],
  });

  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Unexpected response from translation review API.");
  }

  const raw = textBlock.text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("Translation review API response was not an object.");
  }
  const normalized = { ...(parsed as Record<string, unknown>) };
  for (const [key, entry] of Object.entries(entries)) {
    // Some reviewers use an empty string to mean "no edit" even when explicitly
    // instructed otherwise. Retaining the already validated current value is the
    // only safe interpretation; every other malformed value still fails below.
    if (
      normalized[key] === null ||
      (typeof normalized[key] === "string" && normalized[key].trim() === "")
    ) {
      normalized[key] = entry.current;
    }
  }

  return validateTranslationResponse(
    Object.fromEntries(Object.entries(entries).map(([key, value]) => [key, value.source])),
    JSON.stringify(normalized)
  );
}

export function validateTranslationResponse(
  texts: Record<string, string>,
  responseText: string
): Record<string, string> {
  const entries = Object.entries(texts);
  const raw = responseText.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("Translation API response was not an object.");
  }

  const result = parsed as Record<string, unknown>;
  const expectedKeys = new Set(Object.keys(texts));
  const returnedKeys = Object.keys(result);
  const missing = [...expectedKeys].filter((key) => !(key in result));
  const unexpected = returnedKeys.filter((key) => !expectedKeys.has(key));
  if (missing.length || unexpected.length) {
    throw new Error(
      `Translation response keys did not match the request (missing: ${missing.join(", ") || "none"}; ` +
        `unexpected: ${unexpected.join(", ") || "none"}).`
    );
  }

  const validated: Record<string, string> = {};
  for (const [key, source] of entries) {
    const value = result[key];
    if (typeof value !== "string" || value.trim().length === 0) {
      throw new Error(`Translation for "${key}" was not a non-empty string.`);
    }
    const sourcePlaceholders = [...source.matchAll(PLACEHOLDER_RE)].map((match) => match[0]).sort();
    const valuePlaceholders = [...value.matchAll(PLACEHOLDER_RE)].map((match) => match[0]).sort();
    if (sourcePlaceholders.join("\u0000") !== valuePlaceholders.join("\u0000")) {
      throw new Error(`Translation for "${key}" did not preserve its placeholders.`);
    }
    validated[key] = value.trim();
  }

  return validated;
}
