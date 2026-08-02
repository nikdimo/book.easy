import { describe, expect, it } from "vitest";
import { getEmailT } from "@/lib/email/i18n";
import { resolveEmailLocale } from "@/lib/email/i18n/locales";

describe("resolveEmailLocale", () => {
  it("keeps a reviewed language", () => {
    expect(resolveEmailLocale("mk")).toBe("mk");
  });

  it("collapses a regional variant onto its base language", () => {
    expect(resolveEmailLocale("mk-MK")).toBe("mk");
  });

  it("falls back to English for a language nobody has reviewed", () => {
    // The site offers fifteen languages; email is only reviewed in two. Everything
    // else must get reviewed English, never unreviewed machine output.
    expect(resolveEmailLocale("sq")).toBe("en");
    expect(resolveEmailLocale("tr")).toBe("en");
  });

  it("falls back to English for missing or malformed values", () => {
    expect(resolveEmailLocale(null)).toBe("en");
    expect(resolveEmailLocale(undefined)).toBe("en");
    expect(resolveEmailLocale("")).toBe("en");
    expect(resolveEmailLocale("not a locale")).toBe("en");
  });
});

describe("getEmailT", () => {
  it("translates a known key", () => {
    expect(getEmailT("mk").t("email.booking.check_in", "Check-in")).toBe(
      "Пристигнување",
    );
  });

  it("returns the English source for an unreviewed language", () => {
    expect(getEmailT("sq").t("email.booking.check_in", "Check-in")).toBe("Check-in");
  });

  it("falls back to English when the source no longer matches the snapshot", () => {
    // This is the whole staleness contract: reword the English at the call site and
    // that key reverts to English rather than sending a translation of a sentence
    // the product no longer says.
    expect(
      getEmailT("mk").t("email.booking.check_in", "Arrival date"),
    ).toBe("Arrival date");
  });

  it("returns the source for a key that isn't in the catalog at all", () => {
    expect(getEmailT("mk").t("email.nonexistent.key", "Some text")).toBe("Some text");
  });

  it("substitutes placeholders into the translated text", () => {
    expect(
      getEmailT("mk").ti("email.greeting.hi", "Hi {name},", { name: "Ана" }),
    ).toBe("Здраво Ана,");
  });

  it("leaves unknown placeholders untouched rather than printing undefined", () => {
    expect(
      getEmailT("en").ti("email.greeting.hi", "Hi {name},", {}),
    ).toBe("Hi {name},");
  });

  it("reports the resolved locale, so date and money formatting follows the copy", () => {
    expect(getEmailT("mk").locale).toBe("mk");
    // A recipient whose language isn't reviewed gets English prose — their dates and
    // prices have to be English too, not formatted in the language they picked.
    expect(getEmailT("sq").locale).toBe("en");
  });
});
