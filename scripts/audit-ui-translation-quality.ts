import { db } from "../src/lib/db";

const PLACEHOLDER_RE = /\{[A-Za-z][A-Za-z0-9_]*\}/g;
const URL_RE = /https?:\/\/[^\s]+/gi;
const CYRILLIC_LOCALES = new Set(["mk", "sr", "bg", "uk", "ru"]);
// Runtime UI interpolation supports simple {name} placeholders, not ICU message
// expressions. An ICU expression can pass the simple placeholder comparison while
// still being rendered to the customer as raw syntax.
const UNSUPPORTED_MESSAGE_FORMAT_RE =
  /\{[A-Za-z][A-Za-z0-9_]*\s*,\s*(?:plural|select|selectordinal)\b/i;
const ALLOWED_LATIN =
  /lingerhomes\.com|Linger Homes|Airbnb|Booking(?:\.com)?|Vrbo|Facebook|Google|Maps|Street View|API|HTTPS?|EUR|Alt\+T|SMS|URL|Wi-?Fi|JPEG|JPG|PNG|WebP|HEIC|PDF|JSON|MP4|MOV|WebM|MB|push|X{1,3}|CVV|PIN|Ctrl|SEPA|IBAN|SWIFT|BIC|Bitcoin|seed|MobilePay|PayPal|Revolut|Wise|e-?mail|cookie/gi;

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
