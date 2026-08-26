/**
 * Dumps the email catalog as a side-by-side English/target-language table for review.
 *
 * Design decision #3 for localized email is that a native speaker reads every
 * template before it ships. That review needs the strings in one readable document,
 * not spread across a TypeScript file or a large JSON package — this produces it.
 *
 *   npx tsx scripts/export-email-translations.ts > email-translations-review.md
 *   npx tsx scripts/export-email-translations.ts fr > email-review-fr.md
 *
 * Defaults to Macedonian, the language that has been read end to end. The other
 * fourteen were produced without a native reviewer; this is how they get one.
 */
import { EMAIL_CATALOG } from "../src/lib/email/i18n/catalog";
import { EMAIL_TRANSLATIONS_BY_LOCALE } from "../src/lib/email/i18n/translations";
import { getReviewedLanguage } from "../src/lib/i18n/reviewed-languages";

const GROUPS: Array<{ prefix: string; title: string }> = [
  { prefix: "email.signin.", title: "Sign-in link" },
  { prefix: "email.booking.request_received.", title: "Booking — request received (guest)" },
  { prefix: "email.booking.host_request.", title: "Booking — new request (host)" },
  { prefix: "email.booking.host_reminder.", title: "Booking — reminder (host)" },
  { prefix: "email.booking.confirmed.", title: "Booking — confirmed (guest)" },
  { prefix: "email.booking.declined.", title: "Booking — declined (guest)" },
  { prefix: "email.booking.expired.", title: "Booking — expired (guest)" },
  { prefix: "email.booking.cancelled.", title: "Booking — cancelled (guest)" },
  { prefix: "email.booking.guest_cancelled.", title: "Booking — cancelled by guest (host)" },
  { prefix: "email.booking.", title: "Booking — shared labels" },
  { prefix: "email.message.", title: "New message" },
  { prefix: "email.review.", title: "Ratings and reviews" },
  { prefix: "email.case.", title: "Safety cases" },
  { prefix: "email.claim.", title: "Claims" },
  { prefix: "email.deletion.", title: "Account deletion" },
  { prefix: "email.", title: "Shared" },
];

function escapeCell(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("\n", "<br>");
}

const locale = process.argv[2] || "mk";
const language = getReviewedLanguage(locale);
if (!language) {
  console.error(`Unknown email language "${locale}".`);
  process.exit(1);
}

/** Macedonian lives inline in catalog.ts; every other language in the package. */
const translationFor = (key: string): string =>
  locale === "mk"
    ? EMAIL_CATALOG[key].mk
    : EMAIL_TRANSLATIONS_BY_LOCALE.get(locale)?.[key] ?? "";

const remaining = new Map(
  // Plural categories the language never selects are absent by design, and an empty
  // review row for one would only invite someone to fill it in.
  Object.entries(EMAIL_CATALOG).filter(([key]) => translationFor(key)),
);
const lines: string[] = [
  `# System email — ${language.englishName} review`,
  "",
  `Every string below is sent to a real recipient. Please read the ${language.englishName}`,
  "column and correct anything that sounds machine-translated, overly formal, or wrong.",
  "",
  `Editorial guidance for this language: ${language.editorGuidance}`,
  "",
  "This is transactional email, not interface copy. Booking status, payment and claim",
  "wording is read as a statement of fact: a request must not read as a confirmed",
  "reservation, and nothing may suggest that Linger Homes charges, holds, or refunds",
  "booking money — it never does.",
  "",
  "`{placeholders}` are substituted at send time and **must survive translation**",
  "with the same names — a dropped `{deadline}` produces a fluent sentence that is",
  "missing the only fact the recipient needed. A test enforces this.",
  "",
  `${remaining.size} strings.`,
  "",
];

for (const group of GROUPS) {
  const entries = [...remaining.entries()].filter(([key]) => key.startsWith(group.prefix));
  if (entries.length === 0) continue;
  for (const [key] of entries) remaining.delete(key);

  lines.push(
    `## ${group.title}`,
    "",
    `| Key | English | ${language.englishName} |`,
    "| --- | --- | --- |"
  );
  for (const [key, entry] of entries) {
    lines.push(
      `| \`${key}\` | ${escapeCell(entry.en)} | ${escapeCell(translationFor(key))} |`
    );
  }
  lines.push("");
}

console.log(lines.join("\n"));
