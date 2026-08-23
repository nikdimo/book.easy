import { describe, expect, it } from "vitest";
import { editorAttentionItems } from "./editor-overview";
import {
  EDITOR_COMPLETION_SECTIONS,
  editorCompletedSections,
} from "./editor-sections";

const everything = editorCompletedSections({
  photoCount: 5,
  basicsComplete: true,
  propertyDetailsComplete: true,
  locationComplete: true,
  houseRulesReviewed: true,
});

describe("editorAttentionItems", () => {
  it("says nothing needs attention when the listing is complete and priced", () => {
    expect(
      editorAttentionItems({ completeSections: everything, hasPricing: true }),
    ).toEqual([]);
  });

  it("flags exactly the sections the shared completion set left undone", () => {
    const complete = editorCompletedSections({
      photoCount: 5,
      basicsComplete: true,
      propertyDetailsComplete: false,
      locationComplete: true,
      houseRulesReviewed: true,
    });

    expect(
      editorAttentionItems({ completeSections: complete, hasPricing: true }).map(
        (item) => item.slug,
      ),
    ).toEqual(["rooms"]);
  });

  it("leads with a missing price, which blocks every booking", () => {
    const items = editorAttentionItems({
      completeSections: everything,
      hasPricing: false,
    });

    expect(items).toHaveLength(1);
    expect(items[0].slug).toBe("pricing");
    expect(items[0].source).toContain("no date can be booked");
  });

  it("orders the price above the unfinished sections", () => {
    const items = editorAttentionItems({ completeSections: [], hasPricing: false });
    expect(items[0].slug).toBe("pricing");
    expect(items.slice(1).map((item) => item.slug)).toEqual(
      EDITOR_COMPLETION_SECTIONS.map((section) => section.slug),
    );
  });

  it("never invents a warning from optional data", () => {
    // Amenities and Arrival guide are optional and have no stored "reviewed" state, so
    // an empty one is a legitimate listing rather than an open task. Pricing extras —
    // cleaning fee, promotions, minimum stay — are the same.
    const slugs = editorAttentionItems({
      completeSections: everything,
      hasPricing: true,
    }).map((item) => item.slug);
    expect(slugs).not.toContain("arrival-guide");
    expect(slugs).toEqual([]);
  });

  it("gives every item a section that exists and a reason of its own", () => {
    const items = editorAttentionItems({ completeSections: [], hasPricing: false });
    const known = new Set([
      ...EDITOR_COMPLETION_SECTIONS.map((section) => section.slug),
      "pricing",
    ]);
    for (const item of items) {
      expect(known.has(item.slug)).toBe(true);
      expect(item.key.startsWith("host.editor.overview.attention.")).toBe(true);
      expect(item.source.length).toBeGreaterThan(0);
    }
    expect(new Set(items.map((item) => item.key)).size).toBe(items.length);
  });
});
