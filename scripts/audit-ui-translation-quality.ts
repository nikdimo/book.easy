import { db } from "../src/lib/db";

const PLACEHOLDER_RE = /\{[A-Za-z][A-Za-z0-9_]*\}/g;
const CYRILLIC_LOCALES = new Set(["mk", "sr", "bg"]);
const ALLOWED_LATIN = /book\.easy\.mk|easy\.mk|Book Easy|EUR|Alt\+T|SMS|URL|Wi-?Fi/gi;

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
    if (CYRILLIC_LOCALES.has(row.locale)) {
      const prose = row.value.replace(PLACEHOLDER_RE, "").replace(ALLOWED_LATIN, "");
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
