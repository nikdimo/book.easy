import { describe, expect, it } from "vitest";
import {
  LISTING_PHASES,
  LISTING_STEP,
  LISTING_STEPS,
  listingPhaseAt,
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

describe("LISTING_PHASES", () => {
  it("covers every step exactly once, in step order", () => {
    expect(LISTING_PHASES.flatMap((phase) => [...phase.steps])).toEqual(
      LISTING_STEPS.map((step) => step.id)
    );
  });

  it("keeps each phase contiguous", () => {
    for (const phase of LISTING_PHASES) {
      const indexes = phase.steps.map((id) => LISTING_STEP[id]);
      expect(indexes).toEqual(
        indexes.map((_, offset) => indexes[0] + offset)
      );
    }
  });
});

describe("listingPhaseAt", () => {
  it("counts within the phase, not across the whole wizard", () => {
    expect(listingPhaseAt(LISTING_STEP.propertyType)).toMatchObject({
      position: 1,
      total: 2,
      phaseIndex: 0,
    });
    // Street View is the wizard's 7th screen but the 3rd of the Location phase.
    expect(listingPhaseAt(LISTING_STEP.streetView)).toMatchObject({
      position: 3,
      total: 3,
      phaseIndex: 2,
    });
  });

  it("reaches the last position of the last phase on the final step", () => {
    const last = listingPhaseAt(LISTING_STEPS.length - 1);
    expect(last.phaseIndex).toBe(LISTING_PHASES.length - 1);
    expect(last.position).toBe(last.total);
  });

  it("clamps out-of-range steps instead of throwing", () => {
    expect(listingPhaseAt(-1).phaseIndex).toBe(0);
    expect(listingPhaseAt(99).phaseIndex).toBe(LISTING_PHASES.length - 1);
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
