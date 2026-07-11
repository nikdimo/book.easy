export interface LanguageCatalogEntry {
  code: string;
  name: string;
  englishName: string;
  aliases: string[];
}

/** Common languages offered in the admin "add language" picker. */
export const LANGUAGE_CATALOG: LanguageCatalogEntry[] = [
  {
    code: "mk",
    name: "Македонски",
    englishName: "Macedonian",
    aliases: ["macedonian", "makedonski", "македонски", "mk"],
  },
  {
    code: "en",
    name: "English",
    englishName: "English",
    aliases: ["english", "англиски", "en"],
  },
  {
    code: "ro",
    name: "Română",
    englishName: "Romanian",
    aliases: ["romanian", "romana", "română", "roumanian", "ro"],
  },
  {
    code: "de",
    name: "Deutsch",
    englishName: "German",
    aliases: ["german", "deutsch", "немски", "de"],
  },
  {
    code: "sq",
    name: "Shqip",
    englishName: "Albanian",
    aliases: ["albanian", "shqip", "албански", "sq"],
  },
  {
    code: "tr",
    name: "Türkçe",
    englishName: "Turkish",
    aliases: ["turkish", "turkce", "türkçe", "турски", "tr"],
  },
  {
    code: "it",
    name: "Italiano",
    englishName: "Italian",
    aliases: ["italian", "italiano", "италијански", "it"],
  },
  {
    code: "fr",
    name: "Français",
    englishName: "French",
    aliases: ["french", "francais", "français", "француски", "fr"],
  },
  {
    code: "es",
    name: "Español",
    englishName: "Spanish",
    aliases: ["spanish", "espanol", "español", "шпански", "es"],
  },
  {
    code: "nl",
    name: "Nederlands",
    englishName: "Dutch",
    aliases: ["dutch", "nederlands", "холандски", "nl"],
  },
  {
    code: "ru",
    name: "Русский",
    englishName: "Russian",
    aliases: ["russian", "russkiy", "русский", "руски", "ru"],
  },
  {
    code: "sr",
    name: "Српски",
    englishName: "Serbian",
    aliases: ["serbian", "srpski", "српски", "sr"],
  },
  {
    code: "bg",
    name: "Български",
    englishName: "Bulgarian",
    aliases: ["bulgarian", "balgarski", "български", "бугарски", "bg"],
  },
  {
    code: "el",
    name: "Ελληνικά",
    englishName: "Greek",
    aliases: ["greek", "ellinika", "ελληνικά", "грчки", "el"],
  },
  {
    code: "pl",
    name: "Polski",
    englishName: "Polish",
    aliases: ["polish", "polski", "полски", "pl"],
  },
  {
    code: "cs",
    name: "Čeština",
    englishName: "Czech",
    aliases: ["czech", "cestina", "čeština", "чешки", "cs"],
  },
  {
    code: "uk",
    name: "Українська",
    englishName: "Ukrainian",
    aliases: ["ukrainian", "ukrainska", "українська", "украински", "uk"],
  },
  {
    code: "zh-CN",
    name: "中文",
    englishName: "Chinese (Simplified)",
    aliases: ["chinese", "mandarin", "simplified chinese", "中文", "zh-cn", "zh"],
  },
  {
    code: "ar",
    name: "العربية",
    englishName: "Arabic",
    aliases: ["arabic", "al arabia", "العربية", "арапски", "ar"],
  },
];

export function normalizeLanguageSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function getLanguageSearchText(language: LanguageCatalogEntry): string {
  return normalizeLanguageSearch(
    [language.code, language.name, language.englishName, ...language.aliases].join(" ")
  );
}
