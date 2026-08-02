/**
 * Dumps the email catalog as a side-by-side English/Macedonian table for review.
 *
 * Design decision #3 for localized email is that a native speaker reads every
 * template before it ships. That review needs the strings in one readable document,
 * not spread across a TypeScript file — this produces it.
 *
 *   npx tsx scripts/export-email-translations.ts > email-translations-review.md
 */
import { EMAIL_CATALOG } from "../src/lib/email/i18n/catalog";

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

const remaining = new Map(Object.entries(EMAIL_CATALOG));
const lines: string[] = [
  "# System email — Macedonian review",
  "",
  "Every string below is sent to a real recipient. Please read the Macedonian column",
  "and correct anything that sounds machine-translated, overly formal, or wrong.",
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

  lines.push(`## ${group.title}`, "", "| Key | English | Macedonian |", "| --- | --- | --- |");
  for (const [key, entry] of entries) {
    lines.push(`| \`${key}\` | ${escapeCell(entry.en)} | ${escapeCell(entry.mk)} |`);
  }
  lines.push("");
}

console.log(lines.join("\n"));
