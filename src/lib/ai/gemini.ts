import "server-only";
import {
  multiLocalePrompt,
  parseMultiLocaleTranslations,
  TRANSLATION_RULES,
  type TranslationTarget,
} from "@/lib/ai/translation-batch";

/** Free-tier gemini-2.5-flash allows 5 requests per minute per project. Pacing to
 * that budget locally is what stops a sync from turning into a burst of 429s. */
const DEFAULT_REQUESTS_PER_MINUTE = 5;
const MAX_ATTEMPTS = 4;
const RATE_WINDOW_MS = 60_000;
const REQUEST_TIMEOUT_MS = 90_000;

function requestsPerMinute(): number {
  const configured = Number.parseInt(
    process.env.GEMINI_REQUESTS_PER_MINUTE ?? "",
    10,
  );
  if (!Number.isFinite(configured) || configured < 1)
    return DEFAULT_REQUESTS_PER_MINUTE;
  return configured;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Timestamps of the requests issued inside the current window. */
const recentRequests: number[] = [];
/** Reservations are chained so concurrent callers queue instead of all observing
 * the same free slot and issuing simultaneously. */
let reservationQueue: Promise<void> = Promise.resolve();

/** Resolves once this caller may issue a request without exceeding the configured
 * per-minute budget. The first requests of a run go out immediately; only a sync
 * large enough to exhaust the window actually waits. */
function reserveRequestSlot(): Promise<void> {
  const reservation = reservationQueue.then(async () => {
    const limit = requestsPerMinute();
    for (;;) {
      const now = Date.now();
      while (recentRequests.length && now - recentRequests[0] >= RATE_WINDOW_MS) {
        recentRequests.shift();
      }
      if (recentRequests.length < limit) {
        recentRequests.push(now);
        return;
      }
      await sleep(RATE_WINDOW_MS - (now - recentRequests[0]) + 250);
    }
  });
  reservationQueue = reservation.catch(() => undefined);
  return reservation;
}

/** Google reports how long to wait in the error body; honouring it beats guessing. */
function retryDelayFromError(body: string): number | null {
  const match = /"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/.exec(body);
  if (!match) return null;
  return Math.ceil(Number(match[1]) * 1000) + 500;
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status === 500 || status === 502 || status === 503;
}

async function callGemini(prompt: string): Promise<string> {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_API_KEY is not configured.");
  const model = process.env.GEMINI_TRANSLATION_MODEL || "gemini-2.5-flash";

  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    await reserveRequestSlot();
    let response: Response;
    try {
      response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            systemInstruction: { parts: [{ text: TRANSLATION_RULES }] },
            generationConfig: {
              temperature: 0.15,
              responseMimeType: "application/json",
              maxOutputTokens: 32_768,
            },
          }),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        },
      );
    } catch (error) {
      lastError = new Error(
        `Gemini request failed: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
      if (attempt === MAX_ATTEMPTS) break;
      await sleep(attempt * 2_000);
      continue;
    }

    if (response.ok) {
      const payload = (await response.json()) as {
        candidates?: {
          content?: { parts?: { text?: string }[] };
          finishReason?: string;
        }[];
      };
      const candidate = payload.candidates?.[0];
      const text = candidate?.content?.parts
        ?.map((part) => part.text || "")
        .join("");
      if (!text) {
        throw new Error(
          `Gemini returned no translation payload (finishReason: ${candidate?.finishReason ?? "unknown"}).`,
        );
      }
      return text;
    }

    const body = await response.text();
    lastError = new Error(`Gemini ${response.status}: ${body}`);
    if (!isRetryableStatus(response.status) || attempt === MAX_ATTEMPTS) break;
    await sleep(retryDelayFromError(body) ?? attempt * 2_000);
  }
  throw lastError ?? new Error("Gemini request failed.");
}

/** Translates one batch of {key: englishText} strings into every target locale in a
 * single API call, returning {locale: {key: translatedText}}. */
export async function translateBatchToLocalesWithGemini(
  texts: Record<string, string>,
  targets: readonly TranslationTarget[],
): Promise<Record<string, Record<string, string>>> {
  if (Object.keys(texts).length === 0 || targets.length === 0) return {};
  const responseText = await callGemini(multiLocalePrompt(texts, targets));
  return parseMultiLocaleTranslations(
    texts,
    targets,
    responseText,
    "Gemini translation API response",
  );
}
