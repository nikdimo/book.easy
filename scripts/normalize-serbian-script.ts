import { db } from "../src/lib/db";

const PROTECTED_TOKEN_RE = /(\{[A-Za-z][A-Za-z0-9_]*\}|book\.easy\.mk|easy\.mk|Book Easy|EUR|Alt\+T|SMS|URL|Wi-?Fi)/gi;

const LETTERS: Record<string, string> = {
  A: "А", B: "Б", C: "Ц", Č: "Ч", Ć: "Ћ", D: "Д", Đ: "Ђ", E: "Е", F: "Ф",
  G: "Г", H: "Х", I: "И", J: "Ј", K: "К", L: "Л", M: "М", N: "Н", O: "О",
  P: "П", R: "Р", S: "С", Š: "Ш", T: "Т", U: "У", V: "В", Z: "З", Ž: "Ж",
  a: "а", b: "б", c: "ц", č: "ч", ć: "ћ", d: "д", đ: "ђ", e: "е", f: "ф",
  g: "г", h: "х", i: "и", j: "ј", k: "к", l: "л", m: "м", n: "н", o: "о",
  p: "п", r: "р", s: "с", š: "ш", t: "т", u: "у", v: "в", z: "з", ž: "ж",
};

function transliterateSegment(value: string): string {
  return value
    .replace(/DŽ|Dž|dž|LJ|Lj|lj|NJ|Nj|nj/g, (match) => {
      const lower = match.toLocaleLowerCase("sr-Latn");
      const letter = lower === "dž" ? "џ" : lower === "lj" ? "љ" : "њ";
      return match === match.toLocaleUpperCase("sr-Latn")
        ? letter.toLocaleUpperCase("sr-Cyrl")
        : match[0] === match[0].toLocaleUpperCase("sr-Latn")
          ? letter.toLocaleUpperCase("sr-Cyrl")
          : letter;
    })
    .replace(/[A-Za-zČĆĐŠŽčćđšž]/g, (letter) => LETTERS[letter] ?? letter);
}

function toSerbianCyrillic(value: string): string {
  return value
    .split(PROTECTED_TOKEN_RE)
    .map((part, index) => (index % 2 === 1 ? part : transliterateSegment(part)))
    .join("");
}

async function main() {
  const rows = await db.uiTranslation.findMany({
    where: { locale: "sr", isManuallyEdited: false, uiString: { isActive: true } },
    select: { key: true, value: true },
  });
  const changed = rows
    .map((row) => ({ ...row, normalized: toSerbianCyrillic(row.value) }))
    .filter((row) => row.normalized !== row.value);
  if (changed.length) {
    await db.$transaction(
      changed.map((row) =>
        db.uiTranslation.update({
          where: { locale_key: { locale: "sr", key: row.key } },
          data: { value: row.normalized },
        })
      )
    );
  }
  console.info(`Normalized ${changed.length} Serbian translations to Cyrillic.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
