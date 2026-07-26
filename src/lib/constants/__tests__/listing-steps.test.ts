import { describe, expect, it } from "vitest";
import {
  LISTING_STEPS,
  normalizeListingStep,
} from "@/lib/constants/listing-steps";

describe("normalizeListingStep", () => {
  it("keeps valid step indexes", () => {
    expect(normalizeListingStep(0)).toBe(0);
    expect(normalizeListingStep("3")).toBe(3);
    expect(normalizeListingStep(LISTING_STEPS.length - 1)).toBe(6);
  });

  it("clamps out-of-range values", () => {
    expect(normalizeListingStep(-1)).toBe(0);
    expect(normalizeListingStep(99)).toBe(LISTING_STEPS.length - 1);
  });

  it("falls back to the first step for missing or invalid values", () => {
    expect(normalizeListingStep(undefined)).toBe(0);
    expect(normalizeListingStep("not-a-step")).toBe(0);
    expect(normalizeListingStep(1.5)).toBe(0);
  });
});
