import { describe, expect, it } from "vitest";
import {
  isSamePlaceName,
  localizeCountryName,
  localizePlaceName,
  localizedPlaceLabel,
  matchPlaceName,
} from "@/lib/i18n/place-name";

describe("localizePlaceName", () => {
  it("romanizes Greek city names for English", () => {
    expect(localizePlaceName("Νέα Φλογητά", "en")).toBe("Nea Flogita");
  });

  it("uses Macedonian Cyrillic for Macedonian", () => {
    expect(localizePlaceName("Nea Flogita", "mk")).toBe("Неа Флогита");
    expect(localizePlaceName("Skopje", "mk")).toBe("Скопје");
  });

  it("keeps proper names instead of translating their meaning", () => {
    expect(localizePlaceName("Bitola", "en")).toBe("Bitola");
  });

  /** An exonym is a different word, not a respelling, so spelling it out letter by
   * letter produced non-words: "Copenhagen" came out as "Цопенхаген". */
  it("prefers the established local name over transliteration", () => {
    expect(localizePlaceName("Copenhagen", "mk")).toBe("Копенхаген");
    expect(localizePlaceName("Copenhagen", "ru")).toBe("Копенгаген");
    expect(localizePlaceName("Athens", "mk")).toBe("Атина");
    expect(localizePlaceName("Thessaloniki", "mk")).toBe("Солун");
    expect(localizePlaceName("Munich", "ru")).toBe("Мюнхен");
    expect(localizePlaceName("Vienna", "sr")).toBe("Беч");
  });

  it("gives Greek cities their Greek names rather than a respelling", () => {
    expect(localizePlaceName("Athens", "el")).toBe("Αθήνα");
    expect(localizePlaceName("Thessaloniki", "el")).toBe("Θεσσαλονίκη");
    expect(localizePlaceName("Chalkidiki", "el")).toBe("Χαλκιδική");
  });

  it("resolves alternative spellings to the same place", () => {
    expect(localizePlaceName("Halkidiki", "mk")).toBe(localizePlaceName("Chalkidiki", "mk"));
    expect(localizePlaceName("Flogita", "mk")).toBe("Неа Флогита");
  });

  it("leaves a name that is already in the reader's script alone", () => {
    expect(localizePlaceName("Охрид", "mk")).toBe("Охрид");
    expect(localizePlaceName("Νέα Φλογητά", "el")).toBe("Νέα Φλογητά");
  });

  /** The fallback still has to carry every name that is not in the table. */
  describe("transliteration fallback", () => {
    it("reads Latin c as /k/ except before a front vowel", () => {
      expect(localizePlaceName("Carev Dvor", "mk")).toBe("Карев Двор");
      expect(localizePlaceName("Cer", "mk")).toBe("Цер");
    });

    it("collapses Latin digraphs instead of spelling them out", () => {
      expect(localizePlaceName("Thermi", "mk")).toBe("Терми");
      expect(localizePlaceName("Chania", "mk")).toBe("Чаниа");
      expect(localizePlaceName("Blackpool", "mk")).toBe("Блакпул");
    });

    it("keeps a final e, which is pronounced in the names this serves", () => {
      expect(localizePlaceName("Ravne", "mk")).toBe("Равне");
      expect(localizePlaceName("Udine", "mk")).toBe("Удине");
    });

    it("avoids letters the reader's alphabet does not have", () => {
      // ј, љ and њ exist in Macedonian and Serbian but not in Russian.
      expect(localizePlaceName("Banjaluka", "mk")).toContain("њ");
      expect(localizePlaceName("Banjaluka", "ru")).not.toContain("њ");
      expect(localizePlaceName("Banjaluka", "ru")).not.toContain("ј");
    });
  });
});

describe("localizeCountryName", () => {
  /** Country names are the one part of an address nobody has to guess: ICU ships
   * all of them, so this must never fall through to transliteration. */
  it("uses the reader's own name for the country", () => {
    expect(localizeCountryName("Denmark", "mk")).toBe("Данска");
    expect(localizeCountryName("Denmark", "ru")).toBe("Дания");
    expect(localizeCountryName("Greece", "mk")).toBe("Грција");
    expect(localizeCountryName("North Macedonia", "de")).toBe("Nordmazedonien");
    expect(localizeCountryName("North Macedonia", "el")).toBe("Βόρεια Μακεδονία");
  });

  it("falls back to place-name handling for an unknown country", () => {
    expect(localizeCountryName("Testland", "mk")).toBe("Тестланд");
  });
});

describe("localizedPlaceLabel", () => {
  it("localizes both halves", () => {
    expect(localizedPlaceLabel({ city: "Copenhagen", country: "Denmark" }, "mk")).toBe(
      "Копенхаген, Данска",
    );
    expect(localizedPlaceLabel({ city: "Thessaloniki", country: "Greece" }, "el")).toBe(
      "Θεσσαλονίκη, Ελλάδα",
    );
  });
});

describe("place-name search", () => {
  it("matches whichever alphabet the visitor types in", () => {
    expect(matchPlaceName("Ohrid", "Охрид").matches).toBe(true);
    expect(matchPlaceName("Νέα Φλογητά", "nea flog").matches).toBe(true);
  });

  /** The local name is what a visitor reading the localized site actually sees,
   * so it has to be searchable too. */
  it("matches the established local name", () => {
    expect(matchPlaceName("Copenhagen", "Копенхаген").matches).toBe(true);
    expect(matchPlaceName("Thessaloniki", "Солун").matches).toBe(true);
    expect(isSamePlaceName("Vienna", "Беч")).toBe(true);
  });

  it("still rejects an unrelated place", () => {
    expect(matchPlaceName("Ohrid", "Копенхаген").matches).toBe(false);
  });
});
