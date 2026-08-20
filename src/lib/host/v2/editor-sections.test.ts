import { describe, expect, it } from "vitest";
import {
  EDITOR_COMPLETION_SECTIONS,
  EDITOR_SECTIONS,
  editorCompletedSections,
  editorCompletionCount,
} from "./editor-sections";

describe("listing editor navigation", () => {
  it("keeps the final order, labels, and calendar grouping", () => {
    expect(EDITOR_SECTIONS.map(({ slug }) => slug)).toEqual([
      "photos", "basics", "rooms", "amenities", "location", "house-rules", "arrival-guide", "pricing", "availability",
    ]);
    expect(EDITOR_SECTIONS.map(({ source }) => source)).toEqual([
      "Photos", "Title & description", "Property details", "Amenities", "Location", "House rules", "Arrival guide", "Pricing", "Availability",
    ]);
    expect(EDITOR_SECTIONS.filter((section) => section.group === "calendar").map(({ slug }) => slug)).toEqual(["pricing", "availability"]);
  });

  it("excludes Calendar-managed sections from completion totals", () => {
    expect(EDITOR_COMPLETION_SECTIONS.map(({ slug }) => slug)).toEqual([
      "photos", "basics", "rooms", "amenities", "location", "house-rules", "arrival-guide",
    ]);
    expect(editorCompletionCount(["photos", "basics", "pricing", "availability"])).toBe(2);
  });

  it("keeps shared completion checks stable across routes", () => {
    expect(editorCompletedSections({ photoCount: 3, basicsComplete: true })).toEqual([
      "photos",
      "basics",
    ]);
    expect(editorCompletedSections({ photoCount: 0, basicsComplete: false })).toEqual([]);
  });
});
