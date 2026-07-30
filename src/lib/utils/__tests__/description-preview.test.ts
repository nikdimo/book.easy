import { describe, expect, it } from "vitest";
import {
  DESCRIPTION_PREVIEW_LENGTH,
  LANDING_DESCRIPTION_PREVIEW_LENGTH,
  splitDescriptionPreviewTiers,
} from "@/lib/utils/description-preview";

function wordsToLength(length: number): string {
  return Array.from({ length: Math.ceil(length / 5) }, (_, index) =>
    `w${index}`
  ).join(" ");
}

describe("splitDescriptionPreviewTiers", () => {
  it("keeps a short description entirely in the landing preview", () => {
    expect(splitDescriptionPreviewTiers("A short and welcoming description.")).toEqual({
      landing: "A short and welcoming description.",
      property: "",
      expanded: "",
      landingTruncated: false,
      expandedTruncated: false,
    });
  });

  it("separates the landing excerpt from the property-page preview", () => {
    const description = wordsToLength(
      LANDING_DESCRIPTION_PREVIEW_LENGTH + 60
    );
    const result = splitDescriptionPreviewTiers(description);

    expect(result.landing.length).toBeLessThanOrEqual(
      LANDING_DESCRIPTION_PREVIEW_LENGTH
    );
    expect(result.property).not.toBe("");
    expect(result.expanded).toBe("");
    expect(result.landingTruncated).toBe(true);
    expect(result.expandedTruncated).toBe(false);
    expect(`${result.landing} ${result.property}`).toBe(description);
  });

  it("separates content that is only visible after Show more", () => {
    const description = wordsToLength(DESCRIPTION_PREVIEW_LENGTH + 100);
    const result = splitDescriptionPreviewTiers(description);

    expect(result.landing).not.toBe("");
    expect(result.property).not.toBe("");
    expect(result.expanded).not.toBe("");
    expect(result.landingTruncated).toBe(true);
    expect(result.expandedTruncated).toBe(true);
    expect(
      `${result.landing} ${result.property} ${result.expanded}`
    ).toBe(description);
  });
});
