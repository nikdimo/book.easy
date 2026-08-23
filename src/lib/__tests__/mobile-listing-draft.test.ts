import { describe, expect, it } from "vitest";
import {
  listingDraftData,
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

  it("accepts the location and media fields the native steps now own", () => {
    // These were refused while those steps only existed on the web. The mobile
    // wizard edits them natively now, so refusing them would drop the host's work.
    expect(
      parseMobileListingDraftPatch({
        address: "Bulevar Partizanski Odredi 1",
        city: "Skopje",
        latitude: "41.9981",
        longitude: "21.4254",
        locationConfirmed: "true",
        streetViewHeading: "180",
        mediaItems: [{ url: "/uploads/a.jpg", mediaType: "IMAGE" }],
      })
    ).toEqual({
      data: {
        address: "Bulevar Partizanski Odredi 1",
        city: "Skopje",
        latitude: "41.9981",
        longitude: "21.4254",
        locationConfirmed: "true",
        streetViewHeading: "180",
        mediaItems: [{ url: "/uploads/a.jpg", mediaType: "IMAGE" }],
      },
    });
  });

  it("still rejects fields that are not part of the draft shape", () => {
    expect(
      parseMobileListingDraftPatch({ title: "Allowed", sneaky: "nope" })
    ).toEqual({ error: "Invalid listing draft data" });
  });

  it("rejects a media item with an unknown media type", () => {
    expect(
      parseMobileListingDraftPatch({
        mediaItems: [{ url: "/uploads/a.jpg", mediaType: "AUDIO" }],
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

  it("round-trips a complete native pre-publish plan", () => {
    const prePublishPlan = {
      blocks: [{ startDate: "2026-09-10", endDate: "2026-09-12" }],
      openDates: [{ startDate: "2026-10-01", endDate: "2026-10-05" }],
      datePrices: [
        { startDate: "2026-10-01", endDate: "2026-10-02", nightlyRate: 125 },
      ],
      offers: [
        {
          startDate: "2026-10-01",
          endDate: "2026-10-05",
          discountPercent: 10,
          freeCleaning: false,
        },
      ],
      availabilityStart: { mode: "selected" },
    };

    expect(parseMobileListingDraftPatch({ prePublishPlan })).toEqual({
      data: { prePublishPlan },
    });
  });

  it("resumes malformed or legacy availability as unanswered, never now", () => {
    expect(
      parseMobileListingDraftPatch({
        prePublishPlan: {
          blocks: [],
          openDates: [],
          datePrices: [],
          offers: [],
          availabilityStart: { mode: "from", startDate: "not-a-date" },
        },
      })
    ).toEqual({
      data: {
        prePublishPlan: {
          blocks: [],
          openDates: [],
          datePrices: [],
          offers: [],
          availabilityStart: null,
        },
      },
    });
  });

  it("normalizes a malformed web-written plan when native resumes the draft", () => {
    expect(
      listingDraftData({
        title: "Older draft",
        prePublishPlan: {
          availabilityStart: { mode: "something-unknown" },
        },
      })
    ).toEqual({
      title: "Older draft",
      prePublishPlan: {
        blocks: [],
        openDates: [],
        datePrices: [],
        offers: [],
        availabilityStart: null,
      },
    });
  });

  it("makes legacy imageUrls visible to Host V2 and publishing in stored order", () => {
    expect(
      listingDraftData({
        imageUrls: ["/uploads/cover.jpg", "/uploads/room.jpg", "/uploads/cover.jpg"],
      }).mediaItems,
    ).toEqual([
      { url: "/uploads/cover.jpg", mediaType: "IMAGE", alt: null },
      { url: "/uploads/room.jpg", mediaType: "IMAGE", alt: null },
    ]);
  });

  it("keeps ordered mediaItems authoritative when both draft shapes exist", () => {
    const mediaItems = [{ url: "/uploads/current.jpg", mediaType: "IMAGE" as const }];

    expect(
      listingDraftData({ mediaItems, imageUrls: ["/uploads/stale.jpg"] }).mediaItems,
    ).toEqual(mediaItems);
  });
});

describe("house rules in the mobile draft contract", () => {
  it("accepts every rule the shared House rules screen writes", () => {
    const parsed = parseMobileListingDraftPatch({
      checkInTime: "16:00",
      checkOutTime: "10:00",
      maxGuests: "6",
      petPolicy: "ASK_HOST",
      smokingPolicy: "OUTDOORS_ONLY",
      eventPolicy: "NOT_ALLOWED",
      quietHoursPolicy: "SET",
      quietHoursStart: "22:00",
      quietHoursEnd: "08:00",
      additionalRules: "No shoes indoors.",
    });

    expect(parsed).toEqual({
      data: {
        checkInTime: "16:00",
        checkOutTime: "10:00",
        maxGuests: "6",
        petPolicy: "ASK_HOST",
        smokingPolicy: "OUTDOORS_ONLY",
        eventPolicy: "NOT_ALLOWED",
        quietHoursPolicy: "SET",
        quietHoursStart: "22:00",
        quietHoursEnd: "08:00",
        additionalRules: "No shoes indoors.",
      },
    });
  });

  it('accepts "" for a policy, which is how a client clears an answer', () => {
    // Unanswered is a real state — the one every listing starts in — so it has to be
    // sendable, not just absent.
    expect(
      parseMobileListingDraftPatch({ petPolicy: "", quietHoursPolicy: "" }),
    ).toEqual({ data: { petPolicy: "", quietHoursPolicy: "" } });
  });

  it("refuses a policy outside the closed set rather than storing it", () => {
    // A value that could never be published is better refused here than carried to a
    // screen further along that has to fail on it instead.
    expect(parseMobileListingDraftPatch({ petPolicy: "MAYBE" })).toEqual({
      error: "Invalid listing draft data",
    });
    expect(parseMobileListingDraftPatch({ smokingPolicy: "SOMETIMES" })).toEqual({
      error: "Invalid listing draft data",
    });
  });

  it("refuses additional rules longer than the column stores", () => {
    expect(
      parseMobileListingDraftPatch({ additionalRules: "x".repeat(5_000) }),
    ).toEqual({ error: "Invalid listing draft data" });
  });

  it("keeps an imported off-grid quiet-hours time rather than rejecting it", () => {
    expect(
      parseMobileListingDraftPatch({ quietHoursStart: "22:15" }),
    ).toEqual({ data: { quietHoursStart: "22:15" } });
  });

  it("leaves a web-written rule alone when the app patches something else", () => {
    // The two clients share one draft row; a patch carries only what its screen touched.
    expect(
      mergeMobileListingDraft(
        { petPolicy: "ASK_HOST", additionalRules: "No shoes indoors." },
        { title: "After" },
      ),
    ).toEqual({
      petPolicy: "ASK_HOST",
      additionalRules: "No shoes indoors.",
      title: "After",
    });
  });

  it("reads the rules back off a stored draft unchanged", () => {
    expect(
      listingDraftData({
        petPolicy: "ALLOWED",
        quietHoursPolicy: "NONE",
        additionalRules: "Bins out on Tuesday.",
      }),
    ).toMatchObject({
      petPolicy: "ALLOWED",
      quietHoursPolicy: "NONE",
      additionalRules: "Bins out on Tuesday.",
    });
  });
});
