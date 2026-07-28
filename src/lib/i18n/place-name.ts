const CYRILLIC_LOCALES = new Set(["mk", "sr", "bg", "uk", "ru"]);

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
  a: "а", b: "б", c: "ц", d: "д", e: "е", f: "ф", g: "г", h: "х",
  i: "и", j: "ј", k: "к", l: "л", m: "м", n: "н", o: "о", p: "п",
  q: "к", r: "р", s: "с", t: "т", u: "у", v: "в", w: "в", x: "кс",
  y: "и", z: "з",
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
  const withoutAccents = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return mapScript(mapScript(withoutAccents, GREEK_TO_LATIN), CYRILLIC_TO_LATIN);
}

function latinToCyrillic(value: string): string {
  const digraphs: Record<string, string> = {
    ch: "ч", dj: "џ", dz: "ѕ", gj: "ѓ", kj: "ќ", lj: "љ", nj: "њ",
    sh: "ш", zh: "ж",
  };
  let result = "";
  for (let index = 0; index < value.length;) {
    const pair = value.slice(index, index + 2);
    const mappedPair = digraphs[pair.toLowerCase()];
    if (mappedPair) {
      result += preserveCase(pair.charAt(0), mappedPair);
      index += 2;
      continue;
    }
    const character = value[index];
    const replacement = LATIN_TO_CYRILLIC[character.toLowerCase()];
    result += replacement === undefined ? character : preserveCase(character, replacement);
    index += 1;
  }
  return result;
}

/** Localizes the script of a proper place name without translating its meaning. */
export function localizePlaceName(value: string, locale: string): string {
  const language = locale.toLowerCase().split("-")[0];
  const latin = romanize(value);
  if (language === "el") {
    return /[\u0370-\u03ff]/u.test(value) ? value : mapScript(latin, LATIN_TO_GREEK);
  }
  if (CYRILLIC_LOCALES.has(language)) {
    return /[\u0400-\u04ff]/u.test(value) ? value : latinToCyrillic(latin);
  }
  return latin;
}

export function localizedPlaceLabel(
  place: { city: string; country: string },
  locale: string
): string {
  return `${localizePlaceName(place.city, locale)}, ${localizePlaceName(place.country, locale)}`;
}
