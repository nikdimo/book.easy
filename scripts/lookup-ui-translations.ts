import { db } from "../src/lib/db";

const prefixes = process.argv
  .filter((argument) => argument.startsWith("--prefix="))
  .map((argument) => argument.slice("--prefix=".length));
const keys = process.argv
  .filter((argument) => argument.startsWith("--key="))
  .map((argument) => argument.slice("--key=".length));
const locales = process.argv
  .filter((argument) => argument.startsWith("--locale="))
  .map((argument) => argument.slice("--locale=".length));

async function main() {
  if (!prefixes.length && !keys.length) {
    throw new Error("Pass at least one --prefix=header. or --key=header.list_your_property argument.");
  }
  const strings = await db.uiString.findMany({
    where: {
      isActive: true,
      OR: [
        ...prefixes.map((prefix) => ({ key: { startsWith: prefix } })),
        ...(keys.length ? [{ key: { in: keys } }] : []),
      ],
    },
    orderBy: { key: "asc" },
    include: {
      translations: {
        ...(locales.length ? { where: { locale: { in: locales } } } : {}),
        orderBy: { locale: "asc" },
        select: { locale: true, value: true },
      },
    },
  });
  console.table(
    strings.flatMap((entry) =>
      entry.translations.map((translation) => ({
        key: entry.key,
        source: entry.sourceText,
        locale: translation.locale,
        value: translation.value,
      }))
    )
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
