import { describe, expect, it } from "vitest";
import {
  mergeMobileListingDraft,
  parseMobileListingDraftPatch,
} from "@/lib/mobile-listing-draft";
import { LISTING_STEP, LISTING_STEPS } from "@/lib/constants/listing-steps";

describe("mobile listing draft patches", () => {
  it("merges stable native fields without overwriting web location or photos", () => {
    const existing = {
      title: "Before",
      address: "Web-owned address",
      latitude: "41.99",
      mediaItems: [{ url: "/uploads/photo.jpg", mediaType: "IMAGE" }],
    };

    expect(
      mergeMobileListingDraft(existing, {
        title: "After",
        currentStep: 5,
      })
    ).toEqual({
      title: "After",
      currentStep: 5,
      address: "Web-owned address",
      latitude: "41.99",
      mediaItems: [{ url: "/uploads/photo.jpg", mediaType: "IMAGE" }],
    });
  });

  it("rejects location and media fields from the native patch contract", () => {
    expect(
      parseMobileListingDraftPatch({
        title: "Allowed",
        address: "Must not be accepted",
        mediaItems: [],
      })
    ).toEqual({ error: "Invalid listing draft data" });
  });

  it("accepts partial draft data and records the step by id", () => {
    expect(
      parseMobileListingDraftPatch({
        currentStepId: "specialOffer",
        amenityIds: ["wifi", "parking"],
      })
    ).toEqual({
      data: {
        // Both are written so the web wizard resumes correctly whichever it reads.
        currentStep: LISTING_STEP.specialOffer,
        currentStepId: "specialOffer",
        amenityIds: ["wifi", "parking"],
      },
    });
  });

  it("accepts every step the wizard defines", () => {
    for (const step of LISTING_STEPS) {
      expect(
        parseMobileListingDraftPatch({ currentStepId: step.id })
      ).toEqual({
        data: { currentStep: LISTING_STEP[step.id], currentStepId: step.id },
      });
    }
  });

  it("lets the id win over a stale index sent alongside it", () => {
    expect(
      parseMobileListingDraftPatch({ currentStepId: "pricing", currentStep: 1 })
    ).toEqual({
      data: { currentStep: LISTING_STEP.pricing, currentStepId: "pricing" },
    });
  });

  it("still accepts a bare legacy index, clamped into range", () => {
    // Older builds shipped a seven-step list and sent only the index. The value is
    // ambiguous, so it is clamped rather than translated — the host's answers are
    // untouched either way.
    expect(parseMobileListingDraftPatch({ currentStep: 99 })).toEqual({
      data: {
        currentStep: LISTING_STEPS.length - 1,
        currentStepId: LISTING_STEPS[LISTING_STEPS.length - 1].id,
      },
    });
  });

  it("rejects a step id the wizard does not define", () => {
    expect(
      parseMobileListingDraftPatch({ currentStepId: "a-step-we-removed" })
    ).toEqual({ error: "Invalid listing draft data" });
  });

  it("leaves the step untouched when the patch does not mention one", () => {
    expect(parseMobileListingDraftPatch({ title: "Just a title" })).toEqual({
      data: { title: "Just a title" },
    });
  });
});
