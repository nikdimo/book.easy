import { describe, expect, it } from "vitest";
import { localizePlaceName } from "@/lib/i18n/place-name";

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
});
