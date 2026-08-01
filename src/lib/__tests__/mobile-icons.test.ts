import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** The mobile package has no test runner, and this failure is textual: a screen
 *  reaching for an emoji or a box-drawing character instead of the icon component.
 *  Those render differently on every platform, are unreachable to a screen reader,
 *  and read as placeholder art — the brief rules them out. */
const mobileSrc = join(process.cwd(), "mobile", "src");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

/** Comments are prose. "a 2×2 grid" is a description, not an icon; only what the
 *  app renders is in scope. The `:` lookbehind spares URLs. */
function stripComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const sources = sourceFiles(mobileSrc).map((path) => ({
  path: path.slice(mobileSrc.length + 1),
  text: stripComments(readFileSync(path, "utf8")),
}));

/** Pictographic emoji, then whole Unicode blocks of symbol characters rather than
 *  the handful the app happened to use — an enumerated list only catches the glyphs
 *  someone already thought of, and `◎` slipped through exactly that way. Arrows,
 *  geometric shapes, dingbats and the multiplication/minus signs pressed into
 *  service as × and −. Ordinary punctuation stays allowed: `•` and `·` are text
 *  separators, and typographic quotes are text. */
const EMOJI = /\p{Extended_Pictographic}/u;
const ICON_GLYPHS =
  /[×‹›←-⇿−⌂■-◿✀-➿]/;

describe("mobile screens use the icon component, not glyphs", () => {
  it("finds mobile sources to check", () => {
    expect(sources.length).toBeGreaterThan(0);
  });

  it("has no emoji in source", () => {
    for (const { path, text } of sources) {
      const offenders = text
        .split("\n")
        .map((line, index) => ({ line: index + 1, text: line.trim() }))
        .filter((entry) => EMOJI.test(entry.text));
      expect({ path, offenders }).toEqual({ path, offenders: [] });
    }
  });

  it("has no box-drawing or dingbat characters used as icons", () => {
    for (const { path, text } of sources) {
      const offenders = text
        .split("\n")
        .map((line, index) => ({ line: index + 1, text: line.trim() }))
        .filter((entry) => ICON_GLYPHS.test(entry.text));
      expect({ path, offenders }).toEqual({ path, offenders: [] });
    }
  });

  it("routes every icon through the shared component", () => {
    // Only components/icon.tsx may import the icon set; everything else goes
    // through Icon, so the set stays swappable and the names stay meaningful.
    const direct = sources.filter(
      ({ path, text }) =>
        text.includes("@expo/vector-icons") && path !== join("components", "icon.tsx")
    );
    expect(direct.map(({ path }) => path)).toEqual([]);
  });
});
