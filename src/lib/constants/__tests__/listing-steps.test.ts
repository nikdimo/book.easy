import { describe, expect, it } from "vitest";
import {
  LISTING_STEP,
  LISTING_STEPS,
  listingStepId,
  normalizeListingStep,
  resumeListingStep,
} from "@/lib/constants/listing-steps";

describe("LISTING_STEP", () => {
  it("maps every step id to its own index", () => {
    expect(LISTING_STEPS.map((step) => LISTING_STEP[step.id])).toEqual(
      LISTING_STEPS.map((_, index) => index)
    );
  });

  it("keeps the location trio adjacent and in order", () => {
    expect(LISTING_STEP.address).toBe(LISTING_STEP.location + 1);
    expect(LISTING_STEP.streetView).toBe(LISTING_STEP.address + 1);
  });
});

describe("resumeListingStep", () => {
  it("resumes by id, whatever index that id currently sits at", () => {
    expect(resumeListingStep("pricing", 0)).toBe(LISTING_STEP.pricing);
    expect(resumeListingStep("photos", 99)).toBe(LISTING_STEP.photos);
  });

  it("prefers the id over a stale legacy index", () => {
    expect(resumeListingStep("streetView", 2)).toBe(LISTING_STEP.streetView);
  });

  it("falls back to the legacy index for drafts saved before ids existed", () => {
    expect(resumeListingStep(undefined, 3)).toBe(3);
    expect(resumeListingStep(undefined, undefined)).toBe(0);
  });

  it("falls back when the stored id no longer exists", () => {
    expect(resumeListingStep("a-step-we-removed", 2)).toBe(2);
  });
});

describe("listingStepId", () => {
  it("round-trips through resumeListingStep", () => {
    for (let index = 0; index < LISTING_STEPS.length; index++) {
      expect(resumeListingStep(listingStepId(index), undefined)).toBe(index);
    }
  });

  it("clamps out-of-range indexes instead of throwing", () => {
    expect(listingStepId(99)).toBe(LISTING_STEPS[LISTING_STEPS.length - 1].id);
    expect(listingStepId(-1)).toBe(LISTING_STEPS[0].id);
  });
});

describe("normalizeListingStep", () => {
  it("keeps valid step indexes", () => {
    expect(normalizeListingStep(0)).toBe(0);
    expect(normalizeListingStep("3")).toBe(3);
    expect(normalizeListingStep(LISTING_STEPS.length - 1)).toBe(
      LISTING_STEPS.length - 1
    );
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
