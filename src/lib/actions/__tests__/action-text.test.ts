import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import catalog from "@/lib/i18n/generated-ui-strings.json";
import { actionPlural, actionText } from "@/lib/actions/action-text";

/**
 * Every sentence a server action hands back used to be a bare English literal going
 * straight into `toast.error`. Nothing downstream could rescue them: in a catalog
 * language the root layout marks the document `translate="no"`, precisely so Google does
 * not re-translate copy the catalog already owns — so a Macedonian host reading a fully
 * translated screen got "Please set pricing before submitting" in English.
 */

/** The action modules a host can reach from the panel. */
const HOST_ACTION_MODULES = [
  "booking.actions.ts",
  "calendar-sync.actions.ts",
  "calendar-v2.actions.ts",
  "calendar.actions.ts",
  "fixed-stay.actions.ts",
  "listing-amenities.actions.ts",
  "listing-basics.actions.ts",
  "listing-house-rules.actions.ts",
  "listing-location.actions.ts",
  "listing-photos.actions.ts",
  "listing-property-details.actions.ts",
  "listing.actions.ts",
  "pricing.actions.ts",
  "promotion.actions.ts",
  "suggestion.actions.ts",
];

function actionSource(file: string): string {
  return readFileSync(path.join(process.cwd(), "src/lib/actions", file), "utf8");
}

describe("actionText", () => {
  it("returns the English source when there is no request to read a locale from", async () => {
    // A unit test calling an action directly has no cookies, and so no language
    // preference to honour. Falling back rather than throwing is what keeps a
    // validation message from becoming a 500.
    await expect(actionText("action.error.listing_not_found", "Listing not found")).resolves.toBe(
      "Listing not found",
    );
  });

  it("substitutes placeholders into the fallback", async () => {
    await expect(
      actionText("test.only.placeholder", "Up to {max} calendars.", { max: 5 }),
    ).resolves.toBe("Up to 5 calendars.");
  });

  it("resolves through the catalog when a request supplies one", async () => {
    vi.resetModules();
    vi.doMock("@/lib/i18n/t", async (importOriginal) => ({
      ...(await importOriginal<typeof import("@/lib/i18n/t")>()),
      getT: async () => ({
        locale: "mk",
        requestedLocale: "mk",
        catalogReady: true,
        messages: {},
        resolve: (key: string, source: string) =>
          key === "action.error.listing_not_found"
            ? { text: "Огласот не е пронајден", translated: true }
            : { text: source, translated: false },
      }),
    }));
    const { actionText: scoped } = await import("@/lib/actions/action-text");

    await expect(scoped("action.error.listing_not_found", "Listing not found")).resolves.toBe(
      "Огласот не е пронајден",
    );
    vi.doUnmock("@/lib/i18n/t");
    vi.resetModules();
  });
});

describe("actionPlural", () => {
  it("picks the English form and fills the count when there is no catalog", async () => {
    await expect(
      actionPlural("test.only.nights", 1, "{n} night blocked.", "{n} nights blocked."),
    ).resolves.toBe("1 night blocked.");
    await expect(
      actionPlural("test.only.nights", 4, "{n} night blocked.", "{n} nights blocked."),
    ).resolves.toBe("4 nights blocked.");
  });

  it("carries extra values alongside the count", async () => {
    await expect(
      actionPlural(
        "test.only.nights_from",
        2,
        "{n} night blocked from {events} reservations.",
        "{n} nights blocked from {events} reservations.",
        { events: 3 },
      ),
    ).resolves.toBe("2 nights blocked from 3 reservations.");
  });
});

describe("the host panel's server actions", () => {
  it.each(HOST_ACTION_MODULES)("hands %s no bare English sentence back", (file) => {
    const source = actionSource(file);
    // `error: someExpression` is fine — a pass-through, a schema message, a code. A
    // *literal* is the thing that could never be translated.
    const literals = [...source.matchAll(/\berror:\s*("(?:[^"\\]|\\.)*"|`[^`]*`)/g)]
      .map((match) => match[1])
      .filter((value) => /[A-Za-z]{3}/.test(value))
      // A declared union member (`{ error: string }`) is a type, not a message.
      .filter((value) => value !== '"error"');

    expect(literals, `${file} still returns English directly`).toEqual([]);
  });

  it("keeps every action sentence in the extracted catalog", () => {
    const keys = new Set(catalog.map((entry) => entry.key));
    const used = new Set<string>();
    for (const file of HOST_ACTION_MODULES) {
      const source = actionSource(file);
      for (const match of source.matchAll(/actionText\(\s*"([^"]+)"/g)) used.add(match[1]);
      // Plurals expand into one key per CLDR category.
      for (const match of source.matchAll(/actionPlural\(\s*"([^"]+)"/g)) {
        for (const category of ["zero", "one", "two", "few", "many", "other"]) {
          used.add(`${match[1]}.${category}`);
        }
      }
    }

    expect(used.size).toBeGreaterThan(50);
    expect([...used].filter((key) => !keys.has(key))).toEqual([]);
  });
});

/**
 * The extractor is what makes the above stay true: it reads `actionText`'s literal
 * key/source pair the same way it reads `resolve`'s, and it lints the live host route
 * groups — which it previously did not, listing only the retired `(host)` one.
 */
describe("the extraction guardrail", () => {
  const script = readFileSync(
    path.join(process.cwd(), "scripts/extract-ui-strings.ts"),
    "utf8",
  );

  it.each(["src/app/(host-v2)/", "src/app/(host-editor)/", "src/app/(host-start)/"])(
    "lints raw English under %s",
    (scope) => {
      expect(script).toContain(`"${scope}"`);
    },
  );

  it("knows the helper the actions resolve through", () => {
    expect(script).toContain('name === "actionText"');
    expect(script).toContain('name === "actionPlural"');
  });
});
