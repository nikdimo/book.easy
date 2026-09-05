const CYRILLIC_LOCALES = new Set(["mk", "sr", "bg", "uk", "ru"]);
/** Cyrillic alphabets that have `ј`, `љ`, `њ`. Bulgarian, Ukrainian and Russian
 * do not, so a name transliterated for them must not borrow those letters. */
const SOUTH_SLAVIC_LOCALES = new Set(["mk", "sr"]);

const GREEK_TO_LATIN: Record<string, string> = {
  α: "a", β: "v", γ: "g", δ: "d", ε: "e", ζ: "z", η: "i", θ: "th",
  ι: "i", κ: "k", λ: "l", μ: "m", ν: "n", ξ: "x", ο: "o", π: "p",
  ρ: "r", σ: "s", ς: "s", τ: "t", υ: "y", φ: "f", χ: "ch", ψ: "ps", ω: "o",
};

const CYRILLIC_TO_LATIN: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", ѓ: "gj", ђ: "dj", е: "e",
  ё: "yo", ж: "zh", з: "z", ѕ: "dz", и: "i", і: "i", ї: "yi", ј: "j",
  й: "y", к: "k", л: "l", љ: "lj", м: "m", н: "n", њ: "nj", о: "o",
  п: "p", р: "r", с: "s", т: "t", ќ: "kj", ћ: "c", у: "u", ф: "f",
  х: "h", ц: "c", ч: "ch", џ: "dj", ш: "sh", щ: "sht", ъ: "a", ы: "y",
  ь: "", э: "e", ю: "yu", я: "ya", є: "ye", ґ: "g",
};

const LATIN_TO_GREEK: Record<string, string> = {
  a: "α", b: "μπ", c: "κ", d: "ντ", e: "ε", f: "φ", g: "γ", h: "χ",
  i: "ι", j: "τζ", k: "κ", l: "λ", m: "μ", n: "ν", o: "ο", p: "π",
  q: "κ", r: "ρ", s: "σ", t: "τ", u: "ου", v: "β", w: "ου", x: "ξ",
  y: "ι", z: "ζ",
};

const LATIN_TO_CYRILLIC: Record<string, string> = {
  a: "а", b: "б", c: "к", d: "д", e: "е", f: "ф", g: "г", h: "х",
  i: "и", j: "ј", k: "к", l: "л", m: "м", n: "н", o: "о", p: "п",
  q: "к", r: "р", s: "с", t: "т", u: "у", v: "в", w: "в", x: "кс",
  y: "и", z: "з",
};

/**
 * Names that are not a transliteration of their Latin spelling.
 *
 * No rule turns "Munich" into "Минхен" or "Thessaloniki" into "Солун" — an
 * exonym is a separate word, not a respelling, so the only correct source is a
 * list. Transliteration stays the fallback and handles local names such as
 * Ohrid or Nea Flogita, which genuinely are respellings.
 *
 * Keyed by the folded Latin form, so "Χαλκιδική", "Halkidiki" and "Chalkidiki"
 * all resolve to the same row. Only the six locales that change script need an
 * entry; the Latin-script locales keep the Latin name, which is never wrong.
 *
 * Extend this table whenever a destination reads badly — that is the intended
 * maintenance path, and place-name.test.ts guards the shape.
 */
const CITY_EXONYMS: Record<string, Partial<Record<string, string>>> = {
  amsterdam: { mk: "Амстердам", sr: "Амстердам", bg: "Амстердам", uk: "Амстердам", ru: "Амстердам", el: "Άμστερνταμ" },
  antalya: { mk: "Анталија", sr: "Анталија", bg: "Анталия", uk: "Анталія", ru: "Анталья", el: "Αττάλεια" },
  athens: { mk: "Атина", sr: "Атина", bg: "Атина", uk: "Афіни", ru: "Афины", el: "Αθήνα" },
  barcelona: { mk: "Барселона", sr: "Барселона", bg: "Барселона", uk: "Барселона", ru: "Барселона", el: "Βαρκελώνη" },
  belgrade: { mk: "Белград", sr: "Београд", bg: "Белград", uk: "Белград", ru: "Белград", el: "Βελιγράδι" },
  berlin: { mk: "Берлин", sr: "Берлин", bg: "Берлин", uk: "Берлін", ru: "Берлин", el: "Βερολίνο" },
  bitola: { mk: "Битола", sr: "Битољ", bg: "Битоля", uk: "Бітола", ru: "Битола", el: "Μοναστήρι" },
  brussels: { mk: "Брисел", sr: "Брисел", bg: "Брюксел", uk: "Брюссель", ru: "Брюссель", el: "Βρυξέλλες" },
  bucharest: { mk: "Букурешт", sr: "Букурешт", bg: "Букурещ", uk: "Бухарест", ru: "Бухарест", el: "Βουκουρέστι" },
  budapest: { mk: "Будимпешта", sr: "Будимпешта", bg: "Будапеща", uk: "Будапешт", ru: "Будапешт", el: "Βουδαπέστη" },
  chalkidiki: { mk: "Халкидики", sr: "Халкидики", bg: "Халкидики", uk: "Халкідікі", ru: "Халкидики", el: "Χαλκιδική" },
  cologne: { mk: "Келн", sr: "Келн", bg: "Кьолн", uk: "Кельн", ru: "Кёльн", el: "Κολωνία" },
  copenhagen: { mk: "Копенхаген", sr: "Копенхаген", bg: "Копенхаген", uk: "Копенгаген", ru: "Копенгаген", el: "Κοπεγχάγη" },
  corfu: { mk: "Крф", sr: "Крф", bg: "Корфу", uk: "Корфу", ru: "Корфу", el: "Κέρκυρα" },
  crete: { mk: "Крит", sr: "Крит", bg: "Крит", uk: "Крит", ru: "Крит", el: "Κρήτη" },
  dublin: { mk: "Даблин", sr: "Даблин", bg: "Дъблин", uk: "Дублін", ru: "Дублин", el: "Δουβλίνο" },
  dubrovnik: { mk: "Дубровник", sr: "Дубровник", bg: "Дубровник", uk: "Дубровник", ru: "Дубровник", el: "Ντουμπρόβνικ" },
  florence: { mk: "Фиренца", sr: "Фиренца", bg: "Флоренция", uk: "Флоренція", ru: "Флоренция", el: "Φλωρεντία" },
  frankfurt: { mk: "Франкфурт", sr: "Франкфурт", bg: "Франкфурт", uk: "Франкфурт", ru: "Франкфурт", el: "Φρανκφούρτη" },
  hamburg: { mk: "Хамбург", sr: "Хамбург", bg: "Хамбург", uk: "Гамбург", ru: "Гамбург", el: "Αμβούργο" },
  helsinki: { mk: "Хелсинки", sr: "Хелсинки", bg: "Хелзинки", uk: "Гельсінкі", ru: "Хельсинки", el: "Ελσίνκι" },
  istanbul: { mk: "Истанбул", sr: "Истанбул", bg: "Истанбул", uk: "Стамбул", ru: "Стамбул", el: "Κωνσταντινούπολη" },
  kyiv: { mk: "Киев", sr: "Кијев", bg: "Киев", uk: "Київ", ru: "Киев", el: "Κίεβο" },
  lisbon: { mk: "Лисабон", sr: "Лисабон", bg: "Лисабон", uk: "Лісабон", ru: "Лиссабон", el: "Λισαβόνα" },
  ljubljana: { mk: "Љубљана", sr: "Љубљана", bg: "Любляна", uk: "Любляна", ru: "Любляна", el: "Λιουμπλιάνα" },
  london: { mk: "Лондон", sr: "Лондон", bg: "Лондон", uk: "Лондон", ru: "Лондон", el: "Λονδίνο" },
  madrid: { mk: "Мадрид", sr: "Мадрид", bg: "Мадрид", uk: "Мадрид", ru: "Мадрид", el: "Μαδρίτη" },
  mavrovo: { mk: "Маврово", sr: "Маврово", bg: "Маврово", uk: "Маврово", ru: "Маврово", el: "Μαβρόβο" },
  milan: { mk: "Милано", sr: "Милано", bg: "Милано", uk: "Мілан", ru: "Милан", el: "Μιλάνο" },
  moscow: { mk: "Москва", sr: "Москва", bg: "Москва", uk: "Москва", ru: "Москва", el: "Μόσχα" },
  munich: { mk: "Минхен", sr: "Минхен", bg: "Мюнхен", uk: "Мюнхен", ru: "Мюнхен", el: "Μόναχο" },
  naples: { mk: "Неапол", sr: "Напуљ", bg: "Неапол", uk: "Неаполь", ru: "Неаполь", el: "Νάπολη" },
  "nea flogita": { mk: "Неа Флогита", sr: "Неа Флогита", bg: "Неа Флогита", uk: "Неа Флогіта", ru: "Неа Флогита", el: "Νέα Φλογητά" },
  ohrid: { mk: "Охрид", sr: "Охрид", bg: "Охрид", uk: "Охрид", ru: "Охрид", el: "Αχρίδα" },
  oslo: { mk: "Осло", sr: "Осло", bg: "Осло", uk: "Осло", ru: "Осло", el: "Όσλο" },
  paris: { mk: "Париз", sr: "Париз", bg: "Париж", uk: "Париж", ru: "Париж", el: "Παρίσι" },
  podgorica: { mk: "Подгорица", sr: "Подгорица", bg: "Подгорица", uk: "Подгориця", ru: "Подгорица", el: "Ποντγκόριτσα" },
  prague: { mk: "Прага", sr: "Праг", bg: "Прага", uk: "Прага", ru: "Прага", el: "Πράγα" },
  pristina: { mk: "Приштина", sr: "Приштина", bg: "Прищина", uk: "Приштина", ru: "Приштина", el: "Πρίστινα" },
  rhodes: { mk: "Родос", sr: "Родос", bg: "Родос", uk: "Родос", ru: "Родос", el: "Ρόδος" },
  rome: { mk: "Рим", sr: "Рим", bg: "Рим", uk: "Рим", ru: "Рим", el: "Ρώμη" },
  sarajevo: { mk: "Сараево", sr: "Сарајево", bg: "Сараево", uk: "Сараєво", ru: "Сараево", el: "Σεράγεβο" },
  skopje: { mk: "Скопје", sr: "Скопље", bg: "Скопие", uk: "Скоп'є", ru: "Скопье", el: "Σκόπια" },
  sofia: { mk: "Софија", sr: "Софија", bg: "София", uk: "Софія", ru: "София", el: "Σόφια" },
  split: { mk: "Сплит", sr: "Сплит", bg: "Сплит", uk: "Спліт", ru: "Сплит", el: "Σπλιτ" },
  stockholm: { mk: "Стокхолм", sr: "Стокхолм", bg: "Стокхолм", uk: "Стокгольм", ru: "Стокгольм", el: "Στοκχόλμη" },
  struga: { mk: "Струга", sr: "Струга", bg: "Струга", uk: "Струга", ru: "Струга", el: "Στρούγκα" },
  thessaloniki: { mk: "Солун", sr: "Солун", bg: "Солун", uk: "Салоніки", ru: "Салоники", el: "Θεσσαλονίκη" },
  tirana: { mk: "Тирана", sr: "Тирана", bg: "Тирана", uk: "Тирана", ru: "Тирана", el: "Τίρανα" },
  venice: { mk: "Венеција", sr: "Венеција", bg: "Венеция", uk: "Венеція", ru: "Венеция", el: "Βενετία" },
  vienna: { mk: "Виена", sr: "Беч", bg: "Виена", uk: "Відень", ru: "Вена", el: "Βιέννη" },
  warsaw: { mk: "Варшава", sr: "Варшава", bg: "Варшава", uk: "Варшава", ru: "Варшава", el: "Βαρσοβία" },
  zagreb: { mk: "Загреб", sr: "Загреб", bg: "Загреб", uk: "Загреб", ru: "Загреб", el: "Ζάγκρεμπ" },
  zurich: { mk: "Цирих", sr: "Цирих", bg: "Цюрих", uk: "Цюрих", ru: "Цюрих", el: "Ζυρίχη" },
};

/** Spellings that reach the same row, so a host may type either one. */
const CITY_ALIASES: Record<string, string> = {
  halkidiki: "chalkidiki",
  kalkidiki: "chalkidiki",
  flogita: "nea flogita",
  neaflogita: "nea flogita",
  kiev: "kyiv",
  wien: "vienna",
  muenchen: "munich",
  munchen: "munich",
  koeln: "cologne",
  koln: "cologne",
  roma: "rome",
  napoli: "naples",
  firenze: "florence",
  venezia: "venice",
  milano: "milan",
  lisboa: "lisbon",
  praha: "prague",
  warszawa: "warsaw",
  beograd: "belgrade",
  solun: "thessaloniki",
  salonika: "thessaloniki",
  saloniki: "thessaloniki",
  athina: "athens",
  athina_gr: "athens",
  kobenhavn: "copenhagen",
  copenhaga: "copenhagen",
  bruxelles: "brussels",
  moskva: "moscow",
  bec: "vienna",
};

function preserveCase(source: string, replacement: string): string {
  if (source === source.toUpperCase()) {
    return replacement.charAt(0).toUpperCase() + replacement.slice(1);
  }
  return replacement;
}

function mapScript(value: string, map: Record<string, string>): string {
  return [...value].map((character) => {
    const replacement = map[character.toLowerCase()];
    return replacement === undefined ? character : preserveCase(character, replacement);
  }).join("");
}

function romanize(value: string): string {
  const withoutAccents = value.normalize("NFD").replace(/\p{M}/gu, "");
  return mapScript(mapScript(withoutAccents, GREEK_TO_LATIN), CYRILLIC_TO_LATIN);
}

/**
 * Latin digraphs, longest first.
 *
 * Without these the letter map spells English orthography out one character at a
 * time and invents words: "th" became "тх" ("Тхессалоники"), "ck" became "цк",
 * and a silent final "e" grew a vowel ("Белграде" for Belgrade).
 */
const LATIN_DIGRAPHS: Array<[string, string]> = [
  ["sch", "ш"], ["tsch", "ч"],
  ["ch", "ч"], ["sh", "ш"], ["th", "т"], ["ph", "ф"], ["kh", "х"],
  ["gh", "г"], ["ck", "к"], ["qu", "кв"], ["zh", "ж"], ["ts", "ц"],
  ["dz", "ѕ"], ["dj", "џ"], ["gj", "ѓ"], ["kj", "ќ"],
  ["lj", "љ"], ["nj", "њ"], ["ee", "и"], ["oo", "у"], ["ou", "у"],
];

/** Letters the South Slavic alphabets have and the East Slavic ones do not. */
const EAST_SLAVIC_SUBSTITUTES: Record<string, string> = {
  ј: "й", љ: "ль", њ: "нь", ѕ: "дз", ѓ: "г", ќ: "к", џ: "дж", ћ: "ч",
};

function latinToCyrillic(value: string, locale = "mk"): string {
  const southSlavic = SOUTH_SLAVIC_LOCALES.has(locale);
  // Deliberately no "silent final e" rule. Dropping it would fix Belgrade, but
  // that name is in the exonym table anyway, and the same rule would mangle the
  // Slavic and Italian names where the final e is pronounced — Ravne, Udine,
  // Firenze. Guessing at English orthography is what produced "Цопенхаген".
  const trimmed = value;

  let result = "";
  for (let index = 0; index < trimmed.length; ) {
    let matched = false;
    for (const [pattern, replacement] of LATIN_DIGRAPHS) {
      const slice = trimmed.slice(index, index + pattern.length);
      if (slice.toLowerCase() !== pattern) continue;
      result += preserveCase(slice.charAt(0), replacement);
      index += pattern.length;
      matched = true;
      break;
    }
    if (matched) continue;

    const character = trimmed[index];
    // Latin "c" is /k/ except before a front vowel — the source of "Цопенхаген".
    const replacement =
      character.toLowerCase() === "c"
        ? /[eiy]/i.test(trimmed[index + 1] ?? "")
          ? "ц"
          : "к"
        : LATIN_TO_CYRILLIC[character.toLowerCase()];
    result += replacement === undefined ? character : preserveCase(character, replacement);
    index += 1;
  }

  if (southSlavic) return result;
  return [...result]
    .map((letter) => {
      const substitute = EAST_SLAVIC_SUBSTITUTES[letter.toLowerCase()];
      return substitute === undefined ? letter : preserveCase(letter, substitute);
    })
    .join("");
}

function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

/** The exonym row for a place name written in any script, or undefined. */
function exonymsFor(value: string): Partial<Record<string, string>> | undefined {
  const key = fold(romanize(value));
  const resolved = CITY_ALIASES[key] ?? CITY_ALIASES[key.replace(/\s+/g, "")] ?? key;
  return CITY_EXONYMS[resolved];
}

/** Localizes the script of a proper place name without translating its meaning. */
export function localizePlaceName(value: string, locale: string): string {
  const language = locale.toLowerCase().split("-")[0];
  const exonym = exonymsFor(value)?.[language];
  if (exonym) return exonym;

  const latin = romanize(value);
  if (language === "el") {
    return /\p{Script=Greek}/u.test(value) ? value : mapScript(latin, LATIN_TO_GREEK);
  }
  if (CYRILLIC_LOCALES.has(language)) {
    return /\p{Script=Cyrillic}/u.test(value) ? value : latinToCyrillic(latin, language);
  }
  return latin;
}

/**
 * The country name in the reader's language.
 *
 * Country names are the one half of an address that never needs guessing: ICU
 * ships every one of them for every locale, so "Denmark" resolves to "Данска"
 * rather than to a transliteration of the English word. Properties store the
 * country as free text, so the English name is mapped back to its region code
 * first; anything unrecognised falls back to place-name handling.
 */
let regionCodeByEnglishName: Map<string, string> | undefined;

function englishRegionCodes(): Map<string, string> {
  if (regionCodeByEnglishName) return regionCodeByEnglishName;
  const english = new Intl.DisplayNames(["en"], { type: "region" });
  const map = new Map<string, string>();
  for (let first = 65; first <= 90; first++) {
    for (let second = 65; second <= 90; second++) {
      const code = String.fromCharCode(first) + String.fromCharCode(second);
      let name: string | undefined;
      try {
        name = english.of(code);
      } catch {
        continue;
      }
      if (name && name !== code) map.set(fold(name), code);
    }
  }
  regionCodeByEnglishName = map;
  return map;
}

export function localizeCountryName(value: string, locale: string): string {
  const language = locale.toLowerCase().split("-")[0];
  const code = englishRegionCodes().get(fold(value));
  if (code) {
    try {
      const localized = new Intl.DisplayNames([language], { type: "region" }).of(code);
      if (localized && localized !== code) return localized;
    } catch {
      // Fall through to script handling for an unsupported locale.
    }
  }
  return localizePlaceName(value, locale);
}

/** Every script a place name (or a typed query) can reasonably be written in, folded
 * for comparison. Latin↔Greek↔Cyrillic is lossy in both directions, so a name stored
 * as "Νέα Φλογητά" is compared as Greek, as "nea flogita", and as "неа флогита" —
 * whichever alphabet the visitor types in, one of the variants lines up.
 *
 * Exonyms join the same list, so searching "Копенхаген" or "Солун" finds the city
 * stored as "Copenhagen" or "Thessaloniki". */
function scriptVariants(value: string): string[] {
  const latin = fold(romanize(value));
  const exonyms = exonymsFor(value) ?? {};
  return [
    ...new Set([
      fold(value),
      latin,
      fold(latinToCyrillic(latin)),
      fold(mapScript(latin, LATIN_TO_GREEK)),
      ...Object.values(exonyms).flatMap((name) =>
        name ? [fold(name), fold(romanize(name))] : [],
      ),
    ]),
  ].filter(Boolean);
}

/** Substring match that ignores alphabet, case and accents; `startsWith` feeds the
 * "prefix matches first" ordering in the destination pickers. */
export function matchPlaceName(
  value: string,
  query: string
): { matches: boolean; startsWith: boolean } {
  const candidates = scriptVariants(value);
  const queries = scriptVariants(query);

  let matches = false;
  let startsWith = false;
  for (const candidate of candidates) {
    for (const q of queries) {
      if (!candidate.includes(q)) continue;
      matches = true;
      if (candidate.startsWith(q)) startsWith = true;
    }
  }
  return { matches, startsWith };
}

/** True when the typed name refers to this exact city, in any alphabet. */
export function isSamePlaceName(value: string, query: string): boolean {
  const candidates = new Set(scriptVariants(value));
  return scriptVariants(query).some((q) => candidates.has(q));
}

export function localizedPlaceLabel(
  place: { city: string; country: string },
  locale: string
): string {
  return `${localizePlaceName(place.city, locale)}, ${localizeCountryName(place.country, locale)}`;
}
