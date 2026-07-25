import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { languageEditorGuidance } from "@/lib/i18n/reviewed-languages";
import {
  parseAndValidateTranslationJson,
  validateTranslationMap,
} from "@/lib/i18n/translation-validation";

let client: Anthropic | null = null;

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
      `${targetLocale ? languageEditorGuidance(targetLocale) : ""} ` +
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

  return parseAndValidateTranslationJson(texts, textBlock.text, "Translation API response");
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
      `${languageEditorGuidance(targetLanguage.code)} ` +
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

  return validateTranslationMap(
    Object.fromEntries(Object.entries(entries).map(([key, value]) => [key, value.source])),
    normalized,
    "Translation review API response"
  );
}

export function validateTranslationResponse(
  texts: Record<string, string>,
  responseText: string
): Record<string, string> {
  return parseAndValidateTranslationJson(texts, responseText, "Translation API response");
}
