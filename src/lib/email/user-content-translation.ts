import "server-only";

import { SUPPORTED_CURRENCY_CODES } from "@/lib/currency/currencies";
import {
  containsPaymentCoordinates,
  containsUnsafePaymentCredentials,
} from "@/lib/services/payment-instructions";

/**
 * Machine translation for the parts of an email that a person wrote: a guest's note
 * to a host, a host's reason for declining, a message preview, a listing title.
 *
 * The reviewed catalog cannot cover these — they are typed by users, in whatever
 * language they speak — so a Macedonian host reading a booking request from a French
 * guest currently gets a sentence they cannot read at all. This calls Google's Cloud
 * Translation API (the official v2 REST endpoint, not the browser widget the site
 * uses) to give them something they can.
 *
 * Three rules follow from this being *email*, and they are why this module looks the
 * way it does:
 *
 * 1. A booking confirmation must never be delayed or lost because a translation
 *    endpoint is slow or down. Every failure path here — no API key, a timeout, an
 *    HTTP error, a malformed body, an unexpected throw — returns the original text
 *    and lets the email go out. Nothing rethrows.
 *
 * 2. Machine translation is not evidence. The original is always sent alongside the
 *    translation and labelled as such, so a disagreement about what a host actually
 *    wrote is settled by their own words rather than by a model's rendering of them.
 *
 * 3. Some strings must never be sent to a third party or altered: booking
 *    references, URLs, currency codes, people's names, and the redacted stand-in for
 *    payment instructions. Names are excluded at the call sites (they are never
 *    passed in); the rest are refused here.
 */

const ENDPOINT = "https://translation.googleapis.com/language/translate/v2";

/** Long enough for a normal round trip, short enough that a stalled endpoint costs
 * the send path a couple of seconds rather than the request timeout. */
const DEFAULT_TIMEOUT_MS = 2500;

/** Free text in an email is a note, a reason or a preview — none of them long. A
 * value past this is either not prose or not worth the latency and the cost. */
const MAX_CHARACTERS = 1200;

/** How many strings one email may translate. One call, bounded cost. */
const MAX_VALUES = 8;

export interface TranslatedText {
  /** What the email should show. Equals `original` when nothing was translated. */
  text: string;
  /** Exactly what the person wrote. Always sent alongside `text`. */
  original: string;
  /** True only when `text` came back from the translation API. */
  machineTranslated: boolean;
  /** The language Google detected, when it translated. For the "translated from" label. */
  detectedSourceLanguage?: string;
}

function untranslated(original: string): TranslatedText {
  return { text: original, original, machineTranslated: false };
}

/** Unset in development and in tests, which is a supported configuration: user-written
 * text then stays in the language it was written in, exactly as it does today. */
function apiKey(): string | undefined {
  return process.env.GOOGLE_TRANSLATE_API_KEY || undefined;
}

function timeoutMs(): number {
  const configured = Number(process.env.GOOGLE_TRANSLATE_TIMEOUT_MS);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_TIMEOUT_MS;
}

/** `LH-2026-ABCDEFGH`. A reference is the one string in the email that has to survive
 * byte for byte — it is what support and the host search on. */
const BOOKING_REFERENCE_RE = /\bLH-\d{4}-[A-Z0-9]{4,}\b/i;

/** A three-letter ISO 4217 code. "MKD" is not a word to be translated. */
const CURRENCY_CODE_RE = /^[A-Z]{3}$/;

const URL_RE = /(?:https?:\/\/|www\.)\S+/i;
const EMAIL_ADDRESS_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const SUPPORTED_CURRENCY_RE = new RegExp(
  `\\b(?:${SUPPORTED_CURRENCY_CODES.join("|")})\\b`,
  "i",
);

/** At least one letter — digits, punctuation and emoji have nothing to translate. */
const HAS_LETTERS_RE = /\p{L}/u;

/**
 * Whether a value may be sent to the translation API at all.
 *
 * Deliberately conservative: anything that is not clearly prose is left exactly as
 * it is. Refusing to translate something translatable costs a recipient nothing
 * beyond the status quo; translating something that must not change can cost a
 * booking.
 */
export function isTranslatableUserContent(
  value: string | null | undefined,
): value is string {
  if (!value) return false;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_CHARACTERS) return false;
  if (!HAS_LETTERS_RE.test(trimmed)) return false;
  // Skip the whole field when protected or sensitive content appears anywhere in
  // it. That is intentionally stricter than merely preserving the matched token:
  // placeholders can be changed by a translation engine, and the original secret
  // would still have been disclosed to a third party.
  if (BOOKING_REFERENCE_RE.test(trimmed)) return false;
  if (CURRENCY_CODE_RE.test(trimmed)) return false;
  if (URL_RE.test(trimmed)) return false;
  if (EMAIL_ADDRESS_RE.test(trimmed)) return false;
  if (SUPPORTED_CURRENCY_RE.test(trimmed)) return false;
  if (containsPaymentCoordinates(trimmed)) return false;
  if (containsUnsafePaymentCredentials(trimmed)) return false;
  return true;
}

interface TranslateResponse {
  data?: {
    translations?: { translatedText?: string; detectedSourceLanguage?: string }[];
  };
}

/**
 * Google escapes `& < > " '` as HTML entities even with `format: "text"`. Left as
 * they are, a host's "B&B" arrives as "B&amp;B" in a plain-text email.
 *
 * `&amp;` is undone last so an entity that was itself escaped ("&amp;quot;") does not
 * decode twice into a character the sender never wrote.
 */
function decodeEntities(value: string): string {
  return value
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    )
    .replaceAll("&quot;", String.fromCharCode(34))
    .replaceAll("&apos;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&nbsp;", " ")
    .replaceAll("&amp;", "&");
}

/**
 * Translates the translatable entries of `values` into `target`, preserving order
 * and length. Entries that must not be translated, and every kind of failure, come
 * back as the original text with `machineTranslated: false`.
 *
 * Never throws, never rejects.
 */
export async function translateEmailUserContent(
  values: readonly (string | null | undefined)[],
  target: string,
): Promise<TranslatedText[]> {
  const results: TranslatedText[] = values.map((value) => untranslated(value ?? ""));

  const key = apiKey();
  if (!key) return results;

  const indices = values
    .map((value, index) => ({ value, index }))
    .filter(({ value }) => isTranslatableUserContent(value))
    .slice(0, MAX_VALUES);
  if (indices.length === 0) return results;

  try {
    const response = await fetch(`${ENDPOINT}?key=${encodeURIComponent(key)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        q: indices.map(({ value }) => (value as string).trim()),
        target,
        format: "text",
      }),
      signal: AbortSignal.timeout(timeoutMs()),
    });
    if (!response.ok) return results;

    const payload = (await response.json()) as TranslateResponse;
    const translations = payload.data?.translations;
    if (!Array.isArray(translations) || translations.length !== indices.length) {
      return results;
    }

    indices.forEach(({ value, index }, position) => {
      const translation = translations[position];
      const translated = decodeEntities(translation?.translatedText?.trim() ?? "");
      const original = (value as string).trim();
      // Google echoes the input back when the text is already in the target
      // language. Labelling that as a translation would put an identical "original"
      // underneath it for no reason.
      if (!translated || translated === original) return;
      if (translation?.detectedSourceLanguage === target) return;
      results[index] = {
        text: translated,
        original,
        machineTranslated: true,
        detectedSourceLanguage: translation?.detectedSourceLanguage,
      };
    });
  } catch {
    // A timeout, a network error, a body that is not JSON. The email still goes out,
    // in the words the sender wrote. This is never worth failing a send over.
    return values.map((value, index) =>
      results[index].machineTranslated ? results[index] : untranslated(value ?? ""),
    );
  }

  return results;
}
