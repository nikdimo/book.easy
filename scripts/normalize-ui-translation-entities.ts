import { db } from "../src/lib/db";

function normalize(value: string): string {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

async function main() {
  const rows = await db.uiTranslation.findMany({
    where: {
      OR: ["&amp;", "&quot;", "&#39;", "&lt;", "&gt;"].flatMap((entity) => [
        { value: { contains: entity } },
        { sourceTextSnapshot: { contains: entity } },
      ]),
    },
    select: {
      locale: true,
      key: true,
      value: true,
      sourceTextSnapshot: true,
      uiString: { select: { sourceText: true } },
    },
  });

  await db.$transaction(
    rows.map((row) =>
      db.uiTranslation.update({
        where: { locale_key: { locale: row.locale, key: row.key } },
        data: {
          value: normalize(row.value),
          ...(normalize(row.sourceTextSnapshot) === row.uiString.sourceText
            ? { sourceTextSnapshot: row.uiString.sourceText }
            : {}),
        },
      }),
    ),
  );
  console.info(`Normalized HTML entities in ${rows.length} UI translations.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
