import { describe, expect, it } from "vitest";
import catalog from "@/lib/i18n/generated-ui-strings.json";
import { resolveEditorLabel } from "@/lib/i18n/editor-label";
import { editorAttentionItems } from "@/lib/host/v2/editor-overview";
import {
  EDITOR_NAV_GROUPS,
  EDITOR_NAV_ITEMS,
} from "@/lib/host/v2/editor-sections";

/** Reports the source text it was asked to fall back to. */
const passthrough = {
  resolve: (_key: string, source: string) => ({ text: source, translated: false }),
};

const catalogSource = new Map(
  (catalog as { key: string; sourceText: string }[]).map((entry) => [
    entry.key,
    entry.sourceText,
  ]),
);

/** Every string the editor's navigation and overview carry as data. */
const declared = [
  ...EDITOR_NAV_GROUPS.map((group) => ({ key: group.key, source: group.source })),
  ...EDITOR_NAV_ITEMS.map((item) => ({ key: item.key, source: item.source })),
  ...editorAttentionItems({ completeSections: [], hasPricing: false }),
];

describe("resolveEditorLabel", () => {
  it("returns the caller's text for every editor label", () => {
    for (const { key, source } of declared) {
      expect(resolveEditorLabel(passthrough, key, source).text).toBe(source);
    }
  });

  it("declares every navigation and attention string in the catalog", () => {
    // The extractor only sees literal `resolve` calls, and these labels are rendered
    // from variables. Without a declaration in `editor-label.ts` they would silently
    // fall back to English for every host who reads the panel in another language.
    for (const { key, source } of declared) {
      expect(catalogSource.get(key)).toBe(source);
    }
  });

  it("still resolves a key it does not know", () => {
    expect(
      resolveEditorLabel(passthrough, "host.editor.section.something_new", "Something new")
        .text,
    ).toBe("Something new");
  });

  it("passes the translated text through when there is one", () => {
    const translator = {
      resolve: (key: string) => ({ text: `[${key}]`, translated: true }),
    };
    const resolved = resolveEditorLabel(
      translator,
      "host.editor.nav.open_calendar",
      "Open calendar",
    );
    expect(resolved).toEqual({ text: "[host.editor.nav.open_calendar]", translated: true });
  });
});
