import { describe, expect, it } from "vitest";
import {
  mergeMobileListingDraft,
  parseMobileListingDraftPatch,
} from "@/lib/mobile-listing-draft";

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

  it("accepts partial draft data and normalizes the current step", () => {
    expect(
      parseMobileListingDraftPatch({
        currentStep: 6,
        amenityIds: ["wifi", "parking"],
      })
    ).toEqual({
      data: {
        currentStep: 6,
        amenityIds: ["wifi", "parking"],
      },
    });
  });
});
