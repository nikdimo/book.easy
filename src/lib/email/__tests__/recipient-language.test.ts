import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { guestEmailLocale } from "@/lib/email/i18n/recipient-locale";
import { getEmailT } from "@/lib/email/i18n";
import { resolveEmailLocale, SUPPORTED_EMAIL_LOCALES } from "@/lib/email/i18n/locales";
import { guestCountKey, guestCountSource } from "@/lib/email/i18n/dynamic-keys";
import {
  formatCalendarDate,
  formatDate,
  formatPrice,
} from "@/lib/utils/format";

/**
 * Which language a recipient's mail goes out in, and whether the dates and money
 * inside it follow that language rather than the sender's or the server's.
 */

const guest = (locale: string | null, guestLocale: string | null) => ({
  guest: { locale },
  guestLocale,
});

/** The argument list of every `name(...)` call in `source`, parentheses balanced.
 * A plain regex stops at the first `)`, which is inside `Number(booking.totalPrice)`
 * rather than at the end of the `formatPrice(...)` call it belongs to. */
function callArguments(source: string, name: string): string[] {
  const calls: string[] = [];
  let from = 0;
  for (;;) {
    const start = source.indexOf(`${name}(`, from);
    if (start === -1) return calls;
    let depth = 0;
    let index = start + name.length;
    for (; index < source.length; index += 1) {
      if (source[index] === "(") depth += 1;
      else if (source[index] === ")") {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    calls.push(source.slice(start + name.length + 1, index));
    from = index + 1;
  }
}

describe("the language a guest's booking mail goes out in", () => {
  it("uses the language saved on the account", () => {
    expect(guestEmailLocale(guest("de", null))).toBe("de");
  });

  it("prefers the saved account language over the language of the request", () => {
    // The bug this replaced: a guest who booked in English while signed out, then set
    // their account to German, kept receiving English for that booking forever.
    expect(guestEmailLocale(guest("de", "en"))).toBe("de");
    expect(guestEmailLocale(guest("mk", "fr"))).toBe("mk");
  });

  it("falls back to the language the booking was made in when the account has none", () => {
    // A guest who booked before ever saving a preference is better served in the
    // language they booked in than in English.
    expect(guestEmailLocale(guest(null, "sq"))).toBe("sq");
  });

  it("is English when neither is known", () => {
    expect(resolveEmailLocale(guestEmailLocale(guest(null, null)))).toBe("en");
  });

  it("does not let a stale booking locale override an unsupported saved choice", () => {
    // "ja" is a real choice we cannot honour. It resolves to English, not to whatever
    // the browser happened to be set to at booking time.
    expect(resolveEmailLocale(guestEmailLocale(guest("ja", "de")))).toBe("en");
  });
});

describe("every send site picks a recipient's own language", () => {
  const source = readFileSync(join(process.cwd(), "src/lib/email/index.ts"), "utf8");

  it("never renders one email for a whole list of recipients", () => {
    // Host and guest mail about one booking has to be rendered separately, and a
    // conversation's recipients can each have a different language.
    const translators = callArguments(source, "getEmailT");
    expect(translators.length).toBeGreaterThan(10);
    for (const argument of translators) {
      expect(
        /recipient\.locale|guestEmailLocale\(booking\)|\.host\.locale|reporter\.locale|reportedUser\.locale|author\.locale/.test(
          argument,
        ),
        `getEmailT(${argument}) does not read a recipient's own language`,
      ).toBe(true);
    }
  });

  it("keeps the sign-in link on the request language", () => {
    // The one email sent while the recipient is still on the site, to an address
    // that may not have an account yet.
    const auth = readFileSync(join(process.cwd(), "src/lib/auth.ts"), "utf8");
    expect(auth).toContain("getEmailT(await getRequestLocale())");
  });

  it("formats every date and price in the email's own language", () => {
    // A German confirmation with American dates in it is still a bug.
    const calls = [
      ...callArguments(source, "formatCalendarDate"),
      ...callArguments(source, "formatDate"),
      ...callArguments(source, "formatPrice"),
      // The host response deadline formats itself, with its own Intl call.
      ...callArguments(source, "bookingDeadline"),
    ];
    expect(calls.length).toBeGreaterThan(10);
    // `callArguments` also finds each function's own declaration; a parameter list is
    // not a call site.
    const isDeclaration = (call: string) => call.includes(": ");
    const wrong = calls.filter(
      (call) => !isDeclaration(call) && !call.includes("t.locale"),
    );
    expect(wrong).toEqual([]);
  });
});

describe("dates and money inside an email", () => {
  const checkIn = new Date("2026-08-25T12:00:00Z");

  it("formats the date the way the email's language does", () => {
    expect(formatDate(checkIn, "en")).not.toBe(formatDate(checkIn, "de"));
    expect(formatDate(checkIn, "de")).toContain("2026");
    expect(formatDate(checkIn, "mk")).toContain("2026");
  });

  it("produces a date in every supported email language", () => {
    for (const locale of SUPPORTED_EMAIL_LOCALES) {
      expect(formatDate(checkIn, locale), locale).toMatch(/2026/);
    }
  });

  it("formats a booking calendar day in every supported email language", () => {
    for (const locale of SUPPORTED_EMAIL_LOCALES) {
      expect(formatCalendarDate("2026-08-25", locale), locale).toMatch(/2026/);
    }
  });

  it("keeps the booking's own currency whatever the language", () => {
    // The amount owed is in the currency the booking was made in. Rendering it in
    // German does not make it euros.
    for (const locale of SUPPORTED_EMAIL_LOCALES) {
      const formatted = formatPrice(1234.5, "MKD", locale);
      expect(formatted, locale).toMatch(/1[\s.,  ]?234/);
      expect(formatted, locale).toMatch(/MKD|ден/i);
    }
  });

  it("keeps the frozen display amount in its own frozen currency", () => {
    // `displayCurrency`/`displayTotal` are what the guest saw at booking time. They
    // are a record, not a live conversion, and the email language must not touch them.
    const approximate = formatPrice(20, "EUR", "pl");
    expect(approximate).toMatch(/20/);
    expect(approximate).toMatch(/€|EUR/);
  });

  it("counts guests with the plural form the language actually uses", () => {
    // Polish never selects `other` for a whole number, Russian and Serbian select
    // `few` for two. Before these keys existed every one of them printed English.
    const counted = (locale: string, n: number) => {
      const key = guestCountKey(locale, n);
      return getEmailT(locale).ti(key, guestCountSource(key.split(".").pop()!), { n });
    };

    expect(counted("pl", 1)).toBe("1 gość");
    expect(counted("pl", 3)).toBe("3 goście");
    expect(counted("pl", 5)).toBe("5 gości");
    expect(counted("ru", 2)).toBe("2 гостя");
    expect(counted("ru", 7)).toBe("7 гостей");
    expect(counted("sr", 2)).toBe("2 госта");
    expect(counted("ro", 3)).toBe("3 oaspeți");
    expect(counted("mk", 1)).toBe("1 гостин");

    for (const locale of SUPPORTED_EMAIL_LOCALES.filter((code) => code !== "en")) {
      for (const n of [1, 2, 3, 5, 11, 21]) {
        expect(counted(locale, n), `${locale} n=${n}`).not.toMatch(/guests?$/);
      }
    }
  });
});
