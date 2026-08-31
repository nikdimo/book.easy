import { describe, expect, it } from "vitest";
import {
  FLOW_STEPS,
  flowStepHref,
  publishBlockers,
  readyToPublish,
  type FlowStepId,
} from "@/lib/host/v2/listing-publish-readiness";
import { MIN_PUBLISH_PHOTOS, RECOMMENDED_LISTING_PHOTOS } from "@/lib/host/v2/photo-draft";
import { emptyDepositPoliciesDraft } from "@/lib/host/v2/listing-deposit-draft";
import type { ListingDraftData } from "@/lib/types/listing-draft";

/** A draft that walked every step of the flow and answered everything. */
function completeDraft(overrides: Partial<ListingDraftData> = {}): ListingDraftData {
  return {
    propertyType: "HOUSE",
    spaceType: "ENTIRE_PLACE",
    address: "Partizanska 15",
    city: "Skopje",
    country: "MK",
    latitude: "41.9981",
    longitude: "21.4254",
    locationSource: "AUTOCOMPLETE",
    maxGuests: "4",
    bedrooms: "2",
    beds: "2",
    bathrooms: "1",
    mediaItems: Array.from({ length: MIN_PUBLISH_PHOTOS }, (_, index) => ({
      url: `/uploads/photo-${index}.jpg`,
      mediaType: "IMAGE" as const,
    })),
    title: "Sunny house near the old bazaar",
    description: "A bright two-bedroom house a short walk from the old bazaar and the river.",
    currency: "EUR",
    baseNightlyRate: "60",
    acceptedPaymentMethods: ["BANK_TRANSFER_LOCAL_SEPA", "PAYPAL"],
    paymentMethodOther: null,
    paymentInstructionTemplates: {},
    // Both sections off, but *present*: the host was asked and answered "neither".
    depositPolicies: emptyDepositPoliciesDraft(),
    freeCancellationDaysBeforeCheckIn: "7",
    checkInTime: "15:00",
    checkOutTime: "11:00",
    // The house rules the step refuses to move on without. A draft that walked the flow
    // has answered all four.
    petPolicy: "NOT_ALLOWED",
    smokingPolicy: "NOT_ALLOWED",
    eventPolicy: "NOT_ALLOWED",
    quietHoursPolicy: "NONE",
    prePublishPlan: {
      availabilityStart: { mode: "now" },
      blocks: [],
      openDates: [],
      datePrices: [],
      offers: [],
    },
    ...overrides,
  } as ListingDraftData;
}

function steps(data: ListingDraftData, today?: string): FlowStepId[] {
  return publishBlockers(data, { today }).map((blocker) => blocker.step);
}

describe("a draft that walked the flow", () => {
  it("has nothing left to fix", () => {
    expect(publishBlockers(completeDraft())).toEqual([]);
    expect(readyToPublish(completeDraft())).toBe(true);
  });
});

describe("legacy and imported drafts get useful blockers", () => {
  it("reports every unanswered section of an empty draft", () => {
    const found = steps({});

    for (const step of [
      "property-type",
      "space-type",
      "address",
      "location",
      "basics",
      "photos",
      "description",
      "price",
      "payment-arrangements",
      "availability",
    ] satisfies FlowStepId[]) {
      expect(found).toContain(step);
    }
  });

  it('reads a classic wizard draft\'s "" counts as unanswered, not as zero', () => {
    const blockers = publishBlockers(
      completeDraft({ maxGuests: "", bedrooms: "", beds: "", bathrooms: "" }),
    );

    expect(blockers.filter((blocker) => blocker.step === "basics")).toHaveLength(4);
    expect(blockers.some((blocker) => blocker.message.includes("how many guests"))).toBe(true);
  });

  it("reports an imported listing that arrived with no photos", () => {
    const blockers = publishBlockers(completeDraft({ mediaItems: [] }));

    expect(blockers).toEqual([
      { step: "photos", message: `Add at least ${MIN_PUBLISH_PHOTOS} photos before publishing.` },
    ]);
  });

  it("does not count a video towards the photo minimum", () => {
    const blockers = publishBlockers(
      completeDraft({
        mediaItems: [
          { url: "/uploads/a.jpg", mediaType: "IMAGE" },
          { url: "/uploads/b.jpg", mediaType: "IMAGE" },
          { url: "/uploads/c.mp4", mediaType: "VIDEO" },
        ],
      }),
    );

    // Two images and a video is three media items but two photos, and the schema counts
    // photos.
    expect(blockers.map((blocker) => blocker.step)).toEqual(["photos"]);
  });

  it("reports a short title and description against the description step", () => {
    expect(steps(completeDraft({ title: "Hi", description: "Too short." }))).toEqual([
      "description",
      "description",
    ]);
  });

  it("reports an address the publish schema would refuse", () => {
    expect(steps(completeDraft({ address: "", city: "X" }))).toEqual(["address", "address"]);
  });

  it("reports a missing pin against the Location step, not the Address step", () => {
    expect(steps(completeDraft({ latitude: "", longitude: "" }))).toEqual(["location"]);
  });

  it("reports an availability answer whose date has already passed", () => {
    const blockers = publishBlockers(
      completeDraft({
        prePublishPlan: {
          availabilityStart: { mode: "from", startDate: "2020-01-01" },
          blocks: [],
          openDates: [],
          datePrices: [],
          offers: [],
        },
      } as Partial<ListingDraftData>),
      { today: "2026-08-22" },
    );

    expect(blockers).toEqual([
      {
        step: "availability",
        message:
          "That availability start date has already passed. Choose today or a later date.",
      },
    ]);
  });

  it("reports a launch offer that no screen in this flow owns", () => {
    expect(
      steps(completeDraft({ promotionType: "PERCENT_DISCOUNT", promotionPercent: "80" })),
    ).toContain("price");
  });

  it("reports free cleaning offered on a listing with no cleaning fee", () => {
    const blockers = publishBlockers(
      completeDraft({ promotionFreeCleaning: "true", promotionMinimumNights: "3", cleaningFee: "0" }),
    );

    expect(blockers).toContainEqual({
      step: "price",
      message: "Add a cleaning fee before offering free cleaning.",
    });
  });

});

describe("cross-step conflicts", () => {
  it("catches a guest space that no longer matches the property type", () => {
    // HOTEL_ROOM is not among the space types a house may offer.
    expect(steps(completeDraft({ spaceType: "HOTEL_ROOM" }))).toEqual(["space-type"]);
  });
});

describe("the draft's own currency is preserved, never replaced", () => {
  it("does not apply the EUR typo ceiling to a DKK-denominated price", () => {
    expect(
      publishBlockers(
        completeDraft({ currency: "DKK", baseNightlyRate: "200000" }),
      ),
    ).toEqual([]);
  });

  it("accepts an imported USD draft without complaint", () => {
    expect(publishBlockers(completeDraft({ currency: "USD" }))).toEqual([]);
  });

  it("accepts a draft that carries no currency at all — publishing has a default", () => {
    expect(publishBlockers(completeDraft({ currency: undefined }))).toEqual([]);
  });

  it("reports a currency no PricingRule could hold", () => {
    expect(steps(completeDraft({ currency: "EURO" }))).toEqual(["price"]);
  });
});

describe("every blocker links to a real step of the flow", () => {
  it("only ever names a step the flow has a route for", () => {
    for (const blocker of publishBlockers({})) {
      expect(FLOW_STEPS).toContain(blocker.step);
    }
  });

  it("builds the step href with the flow's own query", () => {
    expect(flowStepHref("photos", "propertyType=HOUSE&spaceType=ENTIRE_PLACE")).toBe(
      "/host/start/photos?propertyType=HOUSE&spaceType=ENTIRE_PLACE",
    );
  });
});

describe("the photo floor is one number, and the recommendation is not a floor", () => {
  it("blocks only below the enforced minimum", () => {
    const short = Array.from({ length: MIN_PUBLISH_PHOTOS - 1 }, (_, index) => ({
      url: `/uploads/photo-${index}.jpg`,
      mediaType: "IMAGE" as const,
    }));

    expect(steps(completeDraft({ mediaItems: short }))).toEqual(["photos"]);
  });

  it("never blocks a draft that is merely short of the recommendation", () => {
    const between = Array.from({ length: RECOMMENDED_LISTING_PHOTOS - 1 }, (_, index) => ({
      url: `/uploads/photo-${index}.jpg`,
      mediaType: "IMAGE" as const,
    }));
    expect(between.length).toBeGreaterThanOrEqual(MIN_PUBLISH_PHOTOS);
    expect(between.length).toBeLessThan(RECOMMENDED_LISTING_PHOTOS);

    expect(publishBlockers(completeDraft({ mediaItems: between }))).toEqual([]);
  });
});

describe("house rules", () => {
  it("reports each unanswered policy against the step that asks it", () => {
    const blockers = publishBlockers(
      completeDraft({
        petPolicy: "",
        smokingPolicy: "",
        eventPolicy: "",
        quietHoursPolicy: "",
      }),
    );

    expect(blockers.map((blocker) => blocker.step)).toEqual([
      "house-rules",
      "house-rules",
      "house-rules",
      "house-rules",
    ]);
    expect(blockers.map((blocker) => blocker.message)).toEqual([
      "Say whether pets are allowed.",
      "Say whether smoking is allowed.",
      "Say whether parties and events are allowed.",
      "Say whether quiet hours apply.",
    ]);
  });

  it("blocks an imported draft, which arrives having answered nothing", () => {
    // Deliberately a blocker rather than a default: publishing an unanswered policy as
    // "not allowed" would put a rule on a live listing that its host never chose.
    expect(readyToPublish(completeDraft({ petPolicy: "" }))).toBe(false);
  });

  it("accepts an explicit refusal as an answer", () => {
    expect(readyToPublish(completeDraft({ petPolicy: "NOT_ALLOWED" }))).toBe(true);
  });

  it("requires both ends of a quiet-hours range", () => {
    const blockers = publishBlockers(
      completeDraft({
        quietHoursPolicy: "SET",
        quietHoursStart: "22:00",
        quietHoursEnd: "",
      }),
    );

    expect(blockers).toEqual([
      {
        step: "house-rules",
        message: "Set both a start and an end time for quiet hours.",
      },
    ]);
  });

  it("accepts a quiet-hours range that crosses midnight", () => {
    expect(
      readyToPublish(
        completeDraft({
          quietHoursPolicy: "SET",
          quietHoursStart: "22:00",
          quietHoursEnd: "08:00",
        }),
      ),
    ).toBe(true);
  });

  it("reports additional rules that are too long to store", () => {
    const blockers = publishBlockers(
      completeDraft({ additionalRules: "x".repeat(5_000) }),
    );

    expect(blockers).toEqual([
      { step: "house-rules", message: "Your additional house rules are too long." },
    ]);
  });
});

describe("the deposit question", () => {
  it("blocks a draft that was never asked it", () => {
    // Absent is not "no deposit". Publishing this freezes UNANSWERED terms onto every
    // booking the listing takes, and raises an incomplete payment-arrangements task
    // the moment it goes live.
    const { depositPolicies, ...withoutAnswer } = completeDraft();
    void depositPolicies;

    expect(publishBlockers(withoutAnswer)).toEqual([
      {
        step: "payment-arrangements",
        message: "Answer the advance payment and damage deposit questions.",
      },
    ]);
  });

  it("passes a host who explicitly asked for neither", () => {
    expect(publishBlockers(completeDraft({ depositPolicies: emptyDepositPoliciesDraft() }))).toEqual([]);
  });

  it("passes a host who asked for both", () => {
    const answer = emptyDepositPoliciesDraft();
    answer.currency = "EUR";
    answer.advancePayment = {
      enabled: true,
      amountType: "PERCENTAGE",
      value: "20",
      dueTiming: "AFTER_ACCEPTANCE",
      dueDaysBeforeCheckIn: null,
    };
    answer.damageDeposit = {
      enabled: true,
      amountType: "FIXED",
      value: "200",
      dueTiming: "AT_CHECK_IN",
      dueDaysBeforeCheckIn: null,
      returnDaysAfterCheckout: 7,
    };

    expect(publishBlockers(completeDraft({ depositPolicies: answer }))).toEqual([]);
  });

  it("blocks monetary terms reviewed before the listing currency changed", () => {
    const answer = emptyDepositPoliciesDraft();
    answer.currency = "EUR";
    answer.advancePayment = {
      enabled: true,
      amountType: "FIXED",
      value: "100",
      dueTiming: "AFTER_ACCEPTANCE",
      dueDaysBeforeCheckIn: null,
    };

    expect(
      publishBlockers(completeDraft({ currency: "MKD", depositPolicies: answer })),
    ).toEqual([
      {
        step: "payment-arrangements",
        message: "Review the deposit amounts after changing the listing currency.",
      },
    ]);
  });

  it("blocks an answer whose amounts no longer stand up", () => {
    const answer = emptyDepositPoliciesDraft();
    answer.currency = "EUR";
    answer.advancePayment = {
      enabled: true,
      amountType: "PERCENTAGE",
      value: "150",
      dueTiming: "AFTER_ACCEPTANCE",
      dueDaysBeforeCheckIn: null,
    };

    expect(publishBlockers(completeDraft({ depositPolicies: answer }))).toEqual([
      { step: "payment-arrangements", message: "Check the deposit amounts and timing." },
    ]);
  });
});
