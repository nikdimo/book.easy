const PLACEHOLDER_RE = /\{[A-Za-z][A-Za-z0-9_]*\}/g;
const UNSUPPORTED_MESSAGE_FORMAT_RE =
  /\{[A-Za-z][A-Za-z0-9_]*\s*,\s*(?:plural|select|selectordinal)\b/i;

export function translationPlaceholders(value: string): string[] {
  return [...value.matchAll(PLACEHOLDER_RE)].map((match) => match[0]).sort();
}

export function validateTranslationMap(
  sourceByKey: Record<string, string>,
  candidate: unknown,
  label = "Translation response"
): Record<string, string> {
  if (typeof candidate !== "object" || candidate === null || Array.isArray(candidate)) {
    throw new Error(`${label} was not an object.`);
  }

  const result = candidate as Record<string, unknown>;
  const expectedKeys = new Set(Object.keys(sourceByKey));
  const returnedKeys = Object.keys(result);
  const missing = [...expectedKeys].filter((key) => !(key in result));
  const unexpected = returnedKeys.filter((key) => !expectedKeys.has(key));
  if (missing.length || unexpected.length) {
    throw new Error(
      `${label} keys did not match the request (missing: ${missing.join(", ") || "none"}; ` +
        `unexpected: ${unexpected.join(", ") || "none"}).`
    );
  }

  const validated: Record<string, string> = {};
  for (const [key, source] of Object.entries(sourceByKey)) {
    const value = result[key];
    if (typeof value !== "string" || value.trim().length === 0) {
      throw new Error(`Translation for "${key}" was not a non-empty string.`);
    }
    if (UNSUPPORTED_MESSAGE_FORMAT_RE.test(value)) {
      throw new Error(
        `Translation for "${key}" used unsupported ICU message syntax.`,
      );
    }
    const expectedPlaceholders = translationPlaceholders(source);
    const actualPlaceholders = translationPlaceholders(value);
    if (expectedPlaceholders.join("\u0000") !== actualPlaceholders.join("\u0000")) {
      throw new Error(`Translation for "${key}" did not preserve its placeholders.`);
    }
    validated[key] = value.trim();
  }
  return validated;
}

export function parseAndValidateTranslationJson(
  sourceByKey: Record<string, string>,
  responseText: string,
  label = "Translation response"
): Record<string, string> {
  const raw = responseText
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  return validateTranslationMap(sourceByKey, JSON.parse(raw) as unknown, label);
}
