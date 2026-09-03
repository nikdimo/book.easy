import { db } from "../src/lib/db";

/** Everything the transliterator must copy through untouched.
 *
 * Latin script inside Serbian copy is not automatically Serbian: brand names,
 * file formats, banking codes, URLs and addresses are the same in every locale,
 * and transliterating them produces text no reader can act on ("ПаyПал",
 * "СWИФТ/БИЦ", "хттпс://еxампле.цом"). URLs and e-mail addresses come first so a
 * host inside one is never matched on its own, and the alternation is otherwise
 * ordered longest-first so "Booking.com" wins over "Booking".
 *
 * Kept deliberately in step with ALLOWED_LATIN in
 * scripts/audit-ui-translation-quality.ts, which decides whether the same text
 * is reported as an issue. */
const PROTECTED_TOKEN_RE = new RegExp(
  "(" +
    [
      "https?:\\/\\/[^\\s]+",
      "[^\\s@]+@[^\\s@]+\\.[A-Za-z]{2,}",
      // Bare domains and paths, e.g. "facebook.com/groups/…".
      "[A-Za-z0-9-]+\\.(?:com|net|org|io|mk|eu|co\\.uk)(?:\\/[^\\s]*)?",
      "\\{[A-Za-z][A-Za-z0-9_]*\\}",
      // Example IBAN, printed in the spaced groups a bank statement uses.
      "\\b[A-Z]{2}[0-9]{2}(?:\\s?[A-Z0-9]{2,4}){2,}",
      // Example on-chain address.
      "bc1(?:[A-Za-z0-9]+|…)",
      "lingerhomes\\.com",
      "Linger Homes",
      "Booking\\.com",
      "Street View",
      "Wi-?Fi",
      "MobilePay",
      "PayPal",
      "Revolut",
      "Revtag",
      "Bitcoin",
      "Lightning",
      "on-chain",
      "WhatsApp",
      "Instagram",
      "Facebook",
      "Telegram",
      "Messenger",
      "Viber",
      "Airbnb",
      "Booking",
      "Google",
      "Android",
      "iPhone",
      "iPad",
      "Vrbo",
      "Wise",
      "Maps",
      // Codes, formats and units, which are written the same way everywhere.
      "SWIFT",
      "SEPA",
      "IBAN",
      "HTTPS?",
      "WebP",
      "WebM",
      "JPEG",
      "JSON",
      "HEIC",
      "JPG",
      "PNG",
      "PDF",
      "MP4",
      "MOV",
      "CVV",
      "PIN",
      "BIC",
      "API",
      "SMS",
      "URL",
      "EUR",
      "USD",
      "GBP",
      "MB",
      "GB",
      "Alt\\+T",
      "Ctrl(?:\\+[A-Za-z0-9]+)?",
      // Example account identifiers such as an IBAN or a SWIFT/BIC code.
      "\\b[A-Z]{2}[A-Z0-9]{6,}\\b",
    ].join("|") +
    ")",
  "gi",
);

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
