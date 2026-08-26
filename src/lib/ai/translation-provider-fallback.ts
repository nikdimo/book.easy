const AUTHENTICATION_FAILURE =
  /\b401\b|authentication(?:_error|\s+error)?|invalid (?:api )?key|incorrect (?:api )?key|unauthori[sz]ed/i;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Google's 429 payload may recommend waiting for the rolling minute even when the
 * violated quota is actually the non-recoverable requests-per-day cap. */
export function isDailyTranslationQuotaFailure(error: unknown): boolean {
  return /GenerateRequestsPerDay|PerDayPerProject|generate_content_free_tier_requests|requests? per day|daily quota/i.test(
    errorMessage(error),
  );
}

/** Provider-wide failures make every remaining translation batch fail identically.
 * The probe uses this to stop before spending more requests on bad credentials or
 * exhausted quota. */
export function isPermanentTranslationApiFailure(error: unknown): boolean {
  const message = errorMessage(error);
  return (
    AUTHENTICATION_FAILURE.test(message) ||
    /credit balance|billing|quota|rate.?limit|429|ANTHROPIC_API_KEY is not configured|GOOGLE_API_KEY is not configured/i.test(
      message,
    )
  );
}

/** Anthropic is the preferred provider, but a configured Gemini key should take over
 * when Anthropic cannot authenticate, has no quota, or its network connection is
 * temporarily unavailable. */
export function shouldUseGeminiFallback(
  error: unknown,
  googleApiKey = process.env.GOOGLE_API_KEY,
): boolean {
  if (!googleApiKey) return false;
  const message = errorMessage(error);
  return (
    AUTHENTICATION_FAILURE.test(message) ||
    /credit balance|billing|quota|rate.?limit|429|ANTHROPIC_API_KEY is not configured|529|503|502|connection error|fetch failed|econnreset|econnrefused|etimedout|eacces/i.test(
      message,
    )
  );
}
