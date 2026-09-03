import { db } from "../src/lib/db";

const PLACEHOLDER_RE = /\{[A-Za-z][A-Za-z0-9_]*\}/g;
const URL_RE = /https?:\/\/[^\s]+/gi;
const EMAIL_RE = /[^\s@]+@[^\s@]+\.[A-Za-z]{2,}/gi;
const PAYMENT_CODE_RE = /\b[A-Z]{2}[A-Z0-9 ]{6,}\b/g;
const PAYMENT_HANDLE_RE = /@[A-Za-z0-9._-]+/g;
const CRYPTO_ADDRESS_EXAMPLE_RE = /\bbc1(?:[A-Za-z0-9]+|…)/gi;
const CYRILLIC_LOCALES = new Set(["mk", "sr", "bg", "uk", "ru"]);
// Runtime UI interpolation supports simple {name} placeholders, not ICU message
// expressions. An ICU expression can pass the simple placeholder comparison while
// still being rendered to the customer as raw syntax.
const UNSUPPORTED_MESSAGE_FORMAT_RE =
  /\{[A-Za-z][A-Za-z0-9_]*\s*,\s*(?:plural|select|selectordinal)\b/i;
/** Latin that is expected inside a Cyrillic locale: brand names, device and
 * platform names, file formats, banking codes and keyboard shortcuts are spelled
 * the same in every language, so transliterating them would be the bug.
 *
 * A bare domain such as "facebook.com/groups/…" is matched before the brand
 * alternatives so its path does not leak through as stray Latin, and the
 * shortcut form keeps its key ("Ctrl+V") rather than leaving the "V" behind.
 *
 * Kept deliberately in step with PROTECTED_TOKEN_RE in
 * scripts/normalize-serbian-script.ts, which decides whether the same text is
 * transliterated in the first place. */
const ALLOWED_LATIN =
  /[A-Za-z0-9-]+\.(?:com|net|org|io|mk|eu)(?:\/[^\s]*)?|lingerhomes\.com|Linger Homes|Airbnb|Booking(?:\.com)?|Vrbo|Facebook|Messenger|Instagram|WhatsApp|Telegram|Viber|Google|Maps|Street View|iPhone|iPad|Android|API|HTTPS?|EUR|USD|GBP|Alt\+T|SMS|URL|Wi-?Fi|JPEG|JPG|PNG|WebP|HEIC|PDF|JSON|MP4|MOV|WebM|MB|GB|push|X{1,3}|CVV|PIN|Ctrl(?:\+[A-Za-z0-9]+)?|SEPA|IBAN|SWIFT|BIC|Bitcoin|Lightning|on-chain|seed|MobilePay|PayPal|Revolut|Revtag|Wise|e-?mail|cookie/gi;

async function main() {
  const rows = await db.uiTranslation.findMany({
    where: { language: { isEnabled: true, useAiTranslation: true }, uiString: { isActive: true } },
    include: { uiString: { select: { sourceText: true } } },
    orderBy: [{ locale: "asc" }, { key: "asc" }],
  });
  const issues: Array<{ locale: string; key: string; issue: string; value: string }> = [];
  for (const row of rows) {
    const sourcePlaceholders = [...row.uiString.sourceText.matchAll(PLACEHOLDER_RE)].map((match) => match[0]).sort();
    const valuePlaceholders = [...row.value.matchAll(PLACEHOLDER_RE)].map((match) => match[0]).sort();
    if (!row.value.trim()) issues.push({ locale: row.locale, key: row.key, issue: "empty", value: row.value });
    if (sourcePlaceholders.join("\u0000") !== valuePlaceholders.join("\u0000")) {
      issues.push({ locale: row.locale, key: row.key, issue: "placeholder mismatch", value: row.value });
    }
    if (UNSUPPORTED_MESSAGE_FORMAT_RE.test(row.value)) {
      issues.push({ locale: row.locale, key: row.key, issue: "unsupported ICU message syntax", value: row.value });
    }
    if (CYRILLIC_LOCALES.has(row.locale)) {
      const prose = row.value
        .replace(PLACEHOLDER_RE, "")
        .replace(URL_RE, "")
        .replace(EMAIL_RE, "")
        .replace(PAYMENT_CODE_RE, "")
        .replace(PAYMENT_HANDLE_RE, "")
        .replace(CRYPTO_ADDRESS_EXAMPLE_RE, "")
        .replace(ALLOWED_LATIN, "");
      if (/[A-Za-z]/.test(prose)) {
        issues.push({ locale: row.locale, key: row.key, issue: "Latin text in Cyrillic locale", value: row.value });
      }
    }
  }
  console.table(issues);
  console.info(`${rows.length} active translations audited; ${issues.length} issues found.`);
  if (issues.length) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
