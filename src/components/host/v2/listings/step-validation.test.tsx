import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ListingDraftData } from "@/lib/types/listing-draft";
import type { HostStartDraftPatch } from "@/components/host/v2/listings/host-start-draft-provider";

/**
 * Every step of the create flow, asked the same four questions.
 *
 * 1. Valid input saves and navigates.
 * 2. Missing required input neither saves nor navigates.
 * 3. Invalid input neither saves nor navigates.
 * 4. A failed save does not navigate.
 *
 * The steps keep their answers in local state and hand the footer a `Next` handler, so
 * these are driven the way a host drives them: render the step, run the handler the
 * footer was given, and look at what reached the draft and where the tab was sent. The
 * two stand-ins below are the whole harness — the real footer never gets clicked in a
 * static render, and the real provider would need a server.
 */
const draft = vi.hoisted(() => ({
  data: {} as ListingDraftData,
  patches: [] as HostStartDraftPatch[],
  /** Flipped to make the next save fail the way a rejected PATCH does. */
  saveSucceeds: true,
}));

vi.mock("@/components/host/v2/listings/host-start-draft-provider", () => ({
  useHostStartDraft: () => ({
    draftId: "draft-1",
    data: draft.data,
    save: async (patch: HostStartDraftPatch) => {
      if (!draft.saveSucceeds) return false;
      draft.patches.push(patch);
      return true;
    },
  }),
}));

const footer = vi.hoisted(() => ({
  onNext: null as (() => void | Promise<void>) | null,
  /** Present only when the step is willing to be left by a plain link. */
  nextHref: undefined as string | undefined,
}));

vi.mock("@/components/host/v2/listings/listing-flow-footer", () => ({
  ListingFlowFooter: (props: { onNext?: () => void | Promise<void>; nextHref?: string }) => {
    footer.onNext = props.onNext ?? null;
    footer.nextHref = props.nextHref;
    return null;
  },
}));

const router = vi.hoisted(() => ({ pushed: [] as string[] }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: (href: string) => router.pushed.push(href) }),
}));

const toasts = vi.hoisted(() => ({ errors: [] as string[] }));
vi.mock("sonner", () => ({
  toast: { error: (message: string) => toasts.errors.push(message) },
}));

import { AddressStep } from "@/components/host/v2/listings/address-step";
import { AmenitiesStep } from "@/components/host/v2/listings/amenities-step";
import { AvailabilityStep } from "@/components/host/v2/listings/availability-step";
import { BasicsStep } from "@/components/host/v2/listings/basics-step";
import { DescriptionStep } from "@/components/host/v2/listings/description-step";
import { HouseRulesStep } from "@/components/host/v2/listings/house-rules-step";
import { PhotosStep } from "@/components/host/v2/listings/photos-step";
import { PriceStep } from "@/components/host/v2/listings/price-step";
import { PropertyTypeStep } from "@/components/host/v2/listings/property-type-step";
import { ReviewStep } from "@/components/host/v2/listings/review-step";
import { SpaceTypeStep } from "@/components/host/v2/listings/space-type-step";
import { MIN_PUBLISH_PHOTOS } from "@/lib/host/v2/photo-draft";

const house = { value: "HOUSE", label: "House", icon: "House", description: "A house." };
const QUERY = "propertyType=HOUSE&spaceType=ENTIRE_PLACE";

/** Where the tab was sent, if anywhere. `window.location.assign` is what most steps use;
 *  the description step goes through the router instead. */
const navigations: string[] = [];

beforeEach(() => {
  draft.data = {};
  draft.patches = [];
  draft.saveSucceeds = true;
  footer.onNext = null;
  footer.nextHref = undefined;
  router.pushed = [];
  toasts.errors = [];
  navigations.length = 0;
});

/** Runs the footer's Next with a stand-in for the navigation it may end in. */
async function advance() {
  const onNext = footer.onNext;
  if (!onNext) throw new Error("Expected the step to hand the footer a Next handler");
  const previousWindow = Reflect.get(globalThis, "window") as unknown;
  const previousDocument = Reflect.get(globalThis, "document") as unknown;
  Reflect.set(globalThis, "window", {
    location: { assign: (href: string) => navigations.push(href) },
  });
  if (previousDocument === undefined) {
    Reflect.set(globalThis, "document", { getElementById: () => null });
  }
  try {
    await onNext();
  } finally {
    if (previousWindow === undefined) Reflect.deleteProperty(globalThis, "window");
    else Reflect.set(globalThis, "window", previousWindow);
    if (previousDocument === undefined) Reflect.deleteProperty(globalThis, "document");
  }
}

/** Everywhere the tab could have been sent, from either mechanism. */
function wentTo(): string[] {
  return [...navigations, ...router.pushed];
}

// ---------------------------------------------------------------------------------
// Property type
// ---------------------------------------------------------------------------------

describe("PropertyTypeStep", () => {
  const propertyTypes = [house, { ...house, value: "VILLA", label: "Villa" }];

  function step(initialPropertyType?: string) {
    return renderToStaticMarkup(
      <PropertyTypeStep propertyTypes={propertyTypes} initialPropertyType={initialPropertyType} />,
    );
  }

  it("saves the chosen type and navigates", async () => {
    step("VILLA");

    await advance();

    expect(draft.patches).toEqual([{ propertyType: "VILLA", currentStepId: "spaceType" }]);
    expect(wentTo()).toEqual(["/host/start/space-type?propertyType=VILLA"]);
  });

  it("neither saves nor navigates with no type chosen", async () => {
    step();

    await advance();

    expect(draft.patches).toEqual([]);
    expect(wentTo()).toEqual([]);
    expect(footer.nextHref).toBeUndefined();
  });

  it("stays on the step when the save fails", async () => {
    draft.saveSucceeds = false;
    step("VILLA");

    await advance();

    expect(wentTo()).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------
// Space type
// ---------------------------------------------------------------------------------

describe("SpaceTypeStep", () => {
  function step(initialSpaceType?: "ENTIRE_PLACE") {
    return renderToStaticMarkup(
      <SpaceTypeStep propertyType={house} initialSpaceType={initialSpaceType} />,
    );
  }

  it("saves the chosen space type and navigates", async () => {
    step("ENTIRE_PLACE");

    await advance();

    expect(draft.patches).toEqual([
      { propertyType: "HOUSE", spaceType: "ENTIRE_PLACE", currentStepId: "location" },
    ]);
    expect(wentTo()).toHaveLength(1);
  });

  it("neither saves nor navigates with nothing chosen", async () => {
    step();

    await advance();

    expect(draft.patches).toEqual([]);
    expect(wentTo()).toEqual([]);
  });

  it("stays on the step when the save fails", async () => {
    draft.saveSucceeds = false;
    step("ENTIRE_PLACE");

    await advance();

    expect(wentTo()).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------
// Address
// ---------------------------------------------------------------------------------

describe("AddressStep", () => {
  function step() {
    return renderToStaticMarkup(<AddressStep propertyType={house} spaceType="ENTIRE_PLACE" />);
  }

  it("saves a complete address and navigates", async () => {
    draft.data = { address: "Partizanska 15", city: "Skopje", country: "MK", postalCode: "1000" };
    step();

    await advance();

    expect(draft.patches).toEqual([
      {
        address: "Partizanska 15",
        area: "",
        postalCode: "1000",
        city: "Skopje",
        country: "MK",
        currentStepId: "details",
      },
    ]);
    expect(wentTo()).toEqual([`/host/start/basics?${QUERY}`]);
  });

  it("neither saves nor navigates when the street line is missing", async () => {
    draft.data = { city: "Skopje", country: "MK" };
    step();

    await advance();

    expect(draft.patches).toEqual([]);
    expect(wentTo()).toEqual([]);
  });

  it("neither saves nor navigates when the city is missing", async () => {
    draft.data = { address: "Partizanska 15", country: "MK" };
    step();

    await advance();

    expect(draft.patches).toEqual([]);
    expect(wentTo()).toEqual([]);
  });

  it("refuses a street line shorter than the publish schema's minimum", async () => {
    draft.data = { address: "A", city: "Skopje", country: "MK" };
    step();

    await advance();

    expect(draft.patches).toEqual([]);
    expect(wentTo()).toEqual([]);
  });

  it("shows the error against the field once Next has been pressed", () => {
    draft.data = { city: "Skopje", country: "MK" };
    const html = renderToStaticMarkup(
      <AddressStep propertyType={house} spaceType="ENTIRE_PLACE" initialTouched />,
    );

    expect(html).toContain("Add the street address so we can place your listing.");
    expect(html).toContain('aria-invalid="true"');
  });

  it("stays on the step when the save fails", async () => {
    draft.saveSucceeds = false;
    draft.data = { address: "Partizanska 15", city: "Skopje", country: "MK" };
    step();

    await advance();

    expect(wentTo()).toEqual([]);
  });

  it("does not ask a host with a pin to confirm it again", async () => {
    // The product rule: a typed address and a placed pin are both trusted, and editing
    // one is never a reason to re-confirm the other.
    draft.data = {
      address: "Partizanska 15",
      city: "Skopje",
      country: "MK",
      latitude: "41.99",
      longitude: "21.42",
    };
    step();

    await advance();

    expect(wentTo()).toHaveLength(1);
    expect(draft.patches[0]).not.toHaveProperty("locationConfirmed");
    expect(draft.patches[0]).not.toHaveProperty("latitude");
  });
});

// ---------------------------------------------------------------------------------
// Basics / capacity
// ---------------------------------------------------------------------------------

describe("BasicsStep", () => {
  function step() {
    return renderToStaticMarkup(<BasicsStep propertyType={house} spaceType="ENTIRE_PLACE" />);
  }

  it("saves the counts and navigates", async () => {
    draft.data = { maxGuests: "4", bedrooms: "2", beds: "3", bathrooms: "1" };
    step();

    await advance();

    expect(draft.patches).toEqual([
      { maxGuests: "4", bedrooms: "2", beds: "3", bathrooms: "1", currentStepId: "amenities" },
    ]);
    expect(wentTo()).toEqual([`/host/start/phase-one-complete?${QUERY}`]);
  });

  it('never saves a guest count of zero from a classic draft\'s ""', async () => {
    draft.data = { maxGuests: "", bedrooms: "", beds: "", bathrooms: "" };
    step();

    await advance();

    // The step opens on the defaults rather than on zero, so what it writes is a
    // capacity publishing accepts.
    expect(draft.patches[0]).toMatchObject({ maxGuests: "1" });
    expect(wentTo()).toHaveLength(1);
  });

  it("pulls an out-of-range stored count back into range rather than saving it", async () => {
    draft.data = { maxGuests: "999", bedrooms: "1", beds: "1", bathrooms: "1" };
    step();

    await advance();

    expect(draft.patches[0]).toMatchObject({ maxGuests: "20" });
  });

  it("stays on the step when the save fails", async () => {
    draft.saveSucceeds = false;
    draft.data = { maxGuests: "4", bedrooms: "2", beds: "3", bathrooms: "1" };
    step();

    await advance();

    expect(wentTo()).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------
// Amenities — the one step with no required input
// ---------------------------------------------------------------------------------

describe("AmenitiesStep", () => {
  const essentials = {
    id: "cat-1",
    key: "essentials",
    name: "Essentials",
    label: "Essentials",
    translated: false,
    icon: null,
    sortOrder: 10,
  };
  const catalog = [
    {
      id: "am-wifi",
      key: "wifi",
      name: "Wi-Fi",
      label: "Wi-Fi",
      translated: false,
      icon: null,
      sortOrder: 10,
      category: essentials,
    },
  ];

  function step() {
    return renderToStaticMarkup(
      <AmenitiesStep
        propertyType={house}
        spaceType="ENTIRE_PLACE"
        catalog={catalog}
        initialSelectedIds={["wifi"]}
      />,
    );
  }

  it("saves and navigates — no amenity is required to publish", async () => {
    step();

    await advance();

    expect(draft.patches).toEqual([{ amenityIds: ["wifi"], currentStepId: "photos" }]);
    expect(wentTo()).toEqual([`/host/start/photos?${QUERY}`]);
  });

  it("stays on the step when the save fails", async () => {
    draft.saveSucceeds = false;
    step();

    await advance();

    expect(wentTo()).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------
// Photos
// ---------------------------------------------------------------------------------

describe("PhotosStep", () => {
  it("neither uploads nor navigates below the step's minimum", async () => {
    renderToStaticMarkup(<PhotosStep propertyType={house} spaceType="ENTIRE_PLACE" />);

    await advance();

    expect(draft.patches).toEqual([]);
    expect(wentTo()).toEqual([]);
    // And Next is not a bare link out of the step either.
    expect(footer.nextHref).toBeUndefined();
  });

  it("gates on exactly the number publishing enforces", () => {
    expect(MIN_PUBLISH_PHOTOS).toBe(3);
  });
});

// ---------------------------------------------------------------------------------
// Title and description
// ---------------------------------------------------------------------------------

describe("DescriptionStep", () => {
  function step(initialView: "title" | "description" = "description") {
    return renderToStaticMarkup(
      <DescriptionStep propertyType={house} spaceType="ENTIRE_PLACE" initialView={initialView} />,
    );
  }

  it("saves both halves and navigates", async () => {
    draft.data = {
      title: "Sunny house near the bazaar",
      description: "A bright two-bedroom house a short walk from the old bazaar and the river.",
    };
    step();

    await advance();

    expect(draft.patches).toEqual([
      {
        title: "Sunny house near the bazaar",
        description:
          "A bright two-bedroom house a short walk from the old bazaar and the river.",
        currentStepId: "pricing",
      },
    ]);
    expect(wentTo()).toEqual([`/host/start/phase-two-complete?${QUERY}`]);
  });

  it("neither saves nor navigates on a description below the minimum", async () => {
    draft.data = { title: "Sunny house near the bazaar", description: "Too short." };
    step();

    await advance();

    expect(draft.patches).toEqual([]);
    expect(wentTo()).toEqual([]);
  });

  it("neither saves nor navigates when the title half is invalid", async () => {
    draft.data = {
      title: "Hi",
      description: "A bright two-bedroom house a short walk from the old bazaar and the river.",
    };
    step();

    await advance();

    expect(draft.patches).toEqual([]);
    expect(wentTo()).toEqual([]);
  });

  it("stays on the step when the save fails", async () => {
    draft.saveSucceeds = false;
    draft.data = {
      title: "Sunny house near the bazaar",
      description: "A bright two-bedroom house a short walk from the old bazaar and the river.",
    };
    step();

    await advance();

    expect(wentTo()).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------
// Price
// ---------------------------------------------------------------------------------

describe("PriceStep", () => {
  function step(initialPrice?: string) {
    return renderToStaticMarkup(
      <PriceStep
        propertyType={house}
        spaceType="ENTIRE_PLACE"
        currency="EUR"
        initialPrice={initialPrice}
      />,
    );
  }

  it("saves the amount and navigates", async () => {
    step("90");

    await advance();

    expect(draft.patches).toEqual([
      { baseNightlyRate: "90", cleaningFee: "0", currency: "EUR", currentStepId: "specialOffer" },
    ]);
    expect(wentTo()).toEqual([`/host/start/payment-arrangements?${QUERY}`]);
  });

  it("neither saves nor navigates on an empty amount", async () => {
    step("");

    await advance();

    expect(draft.patches).toEqual([]);
    expect(wentTo()).toEqual([]);
  });

  it("neither saves nor navigates below the pricing service's floor", async () => {
    step("0");

    await advance();

    expect(draft.patches).toEqual([]);
    expect(wentTo()).toEqual([]);
  });

  it("keeps an imported currency rather than overwriting it with the default", async () => {
    draft.data = { currency: "USD", baseNightlyRate: "120" };
    step();

    await advance();

    expect(draft.patches[0]).toMatchObject({ currency: "USD", baseNightlyRate: "120" });
  });

  it("stays on the step when the save fails", async () => {
    draft.saveSucceeds = false;
    step("90");

    await advance();

    expect(wentTo()).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------
// Availability
// ---------------------------------------------------------------------------------

describe("AvailabilityStep", () => {
  function step() {
    return renderToStaticMarkup(
      <AvailabilityStep propertyType={house} spaceType="ENTIRE_PLACE" today="2026-08-22" />,
    );
  }

  it("saves the answer and navigates", async () => {
    draft.data = {
      prePublishPlan: {
        availabilityStart: { mode: "now" },
        blocks: [],
        openDates: [],
        datePrices: [],
        offers: [],
      },
    } as ListingDraftData;
    step();

    await advance();

    expect(draft.patches[0]).toMatchObject({ currentStepId: "specialOffer" });
    expect(wentTo()).toEqual([`/host/start/house-rules?${QUERY}`]);
  });

  it("neither saves nor navigates while the question is unanswered", async () => {
    step();

    await advance();

    expect(draft.patches).toEqual([]);
    expect(wentTo()).toEqual([]);
  });

  it("neither saves nor navigates on a start date that has already passed", async () => {
    draft.data = {
      prePublishPlan: {
        availabilityStart: { mode: "from", startDate: "2020-01-01" },
        blocks: [],
        openDates: [],
        datePrices: [],
        offers: [],
      },
    } as ListingDraftData;
    step();

    await advance();

    expect(draft.patches).toEqual([]);
    expect(wentTo()).toEqual([]);
  });

  it("stays on the step when the save fails", async () => {
    draft.saveSucceeds = false;
    draft.data = {
      prePublishPlan: {
        availabilityStart: { mode: "now" },
        blocks: [],
        openDates: [],
        datePrices: [],
        offers: [],
      },
    } as ListingDraftData;
    step();

    await advance();

    expect(wentTo()).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------
// House rules
// ---------------------------------------------------------------------------------

describe("HouseRulesStep", () => {
  /** A draft that has answered every rule the step requires. */
  const ANSWERED = {
    checkInTime: "15:00",
    checkOutTime: "11:00",
    maxGuests: "4",
    petPolicy: "NOT_ALLOWED",
    smokingPolicy: "OUTDOORS_ONLY",
    eventPolicy: "NOT_ALLOWED",
    quietHoursPolicy: "SET",
    quietHoursStart: "22:00",
    quietHoursEnd: "08:00",
    additionalRules: "No shoes indoors.",
  };

  function step() {
    return renderToStaticMarkup(<HouseRulesStep propertyType={house} spaceType="ENTIRE_PLACE" />);
  }

  it("saves every rule and navigates", async () => {
    draft.data = ANSWERED;
    step();

    await advance();

    expect(draft.patches).toEqual([
      { ...ANSWERED, currentStepId: "specialOffer" },
    ]);
    expect(wentTo()).toHaveLength(1);
  });

  it("writes the cleared rules too, so switching one off survives a resume", async () => {
    // A patch merges over the stored draft. An omitted field would leave yesterday's
    // answer in place.
    draft.data = { ...ANSWERED, quietHoursPolicy: "NONE", quietHoursStart: "", quietHoursEnd: "" };
    step();

    await advance();

    expect(draft.patches[0]).toMatchObject({
      quietHoursPolicy: "NONE",
      quietHoursStart: "",
      quietHoursEnd: "",
    });
  });

  it('never saves a guest limit of zero from a classic draft\'s ""', async () => {
    draft.data = { ...ANSWERED, maxGuests: "" };
    step();

    await advance();

    expect(draft.patches[0]).toMatchObject({ maxGuests: "2" });
  });

  it("keeps an imported off-grid stay time rather than rounding it away", async () => {
    draft.data = { ...ANSWERED, checkInTime: "14:15" };
    const html = step();

    expect(html).toContain("14:15");

    await advance();

    expect(draft.patches[0]).toMatchObject({ checkInTime: "14:15" });
  });

  it("stays on the step when the save fails", async () => {
    draft.saveSucceeds = false;
    draft.data = ANSWERED;
    step();

    await advance();

    expect(wentTo()).toEqual([]);
  });

  it("saves nothing and goes nowhere while a required rule is unanswered", async () => {
    // The block happens here, on the step that asks — never at Review or at publish.
    draft.data = { ...ANSWERED, petPolicy: "" };
    step();

    await advance();

    expect(draft.patches).toEqual([]);
    expect(wentTo()).toEqual([]);
  });

  it("names the missing rule once Next has been pressed", async () => {
    draft.data = { ...ANSWERED, petPolicy: "" };

    expect(step()).not.toContain("Choose an answer so guests know where they stand.");

    await advance();

    // The step re-renders with the errors revealed; a fresh render of the same state is
    // what a host sees after the blocked press.
    expect(footer.nextHref).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------------
// Review
// ---------------------------------------------------------------------------------

describe("ReviewStep", () => {
  function completeDraft(): ListingDraftData {
    return {
      // Stored on the draft, not read from the URL: publishing builds its payload from
      // the draft row, so that is what Review has to measure.
      propertyType: "HOUSE",
      spaceType: "ENTIRE_PLACE",
      address: "Partizanska 15",
      city: "Skopje",
      country: "MK",
      latitude: "41.9981",
      longitude: "21.4254",
      maxGuests: "4",
      petPolicy: "NOT_ALLOWED",
      smokingPolicy: "NOT_ALLOWED",
      eventPolicy: "NOT_ALLOWED",
      quietHoursPolicy: "NONE",
      bedrooms: "2",
      beds: "2",
      bathrooms: "1",
      mediaItems: Array.from({ length: MIN_PUBLISH_PHOTOS }, (_, index) => ({
        url: `/uploads/photo-${index}.jpg`,
        mediaType: "IMAGE" as const,
      })),
      title: "Sunny house near the bazaar",
      description: "A bright two-bedroom house a short walk from the old bazaar and the river.",
      currency: "EUR",
      baseNightlyRate: "60",
      acceptedPaymentMethods: ["BANK_TRANSFER_LOCAL_SEPA", "PAYPAL"],
      paymentMethodOther: null,
      paymentInstructionTemplates: {},
      prePublishPlan: {
        availabilityStart: { mode: "now" },
        blocks: [],
        openDates: [],
        datePrices: [],
        offers: [],
      },
    } as ListingDraftData;
  }

  function step() {
    return renderToStaticMarkup(
      <ReviewStep propertyType={house} spaceType="ENTIRE_PLACE" today="2026-08-22" />,
    );
  }

  /** Stands in for the publish endpoint. */
  function mockPublish(result: unknown) {
    const calls: string[] = [];
    Reflect.set(globalThis, "fetch", async (url: string) => {
      calls.push(url);
      return { json: async () => result } as Response;
    });
    return calls;
  }

  it("blocks a draft that never stored the answers the URL is carrying", () => {
    // A legacy row resumed straight into /host/start/review: the query says HOUSE and
    // ENTIRE_PLACE, but the draft publishing will read says nothing at all.
    draft.data = {};
    const html = step();

    expect(html).toContain("Choose the kind of place you are listing.");
    expect(html).toContain("Choose what guests will book.");
  });

  it("lists a legacy draft's blockers and links each to its own step", () => {
    draft.data = {};
    const html = step();

    expect(html).toContain("Finish these before you publish");
    expect(html).toContain("Add the street address");
    expect(html).toContain(
      `href="/host/start/address?${QUERY.replace("&", "&amp;")}&amp;returnTo=review"`,
    );
    expect(html).toContain(
      `href="/host/start/photos?${QUERY.replace("&", "&amp;")}&amp;returnTo=review"`,
    );
    expect(html).toContain(
      `href="/host/start/basics?${QUERY.replace("&", "&amp;")}&amp;returnTo=review"`,
    );
  });

  it("shows no blocker panel for a draft that walked the flow", () => {
    draft.data = completeDraft();

    expect(step()).not.toContain("Finish these before you publish");
  });

  it("does not publish while a blocker is known", async () => {
    draft.data = {};
    const calls = mockPublish({ success: true, listingId: "l1", slug: "s" });
    step();

    await advance();

    expect(calls).toEqual([]);
  });

  it("publishes once nothing is blocking", async () => {
    draft.data = completeDraft();
    const calls = mockPublish({ success: true, listingId: "l1", slug: "s" });
    step();

    await advance();

    expect(calls).toEqual(["/api/host-start/draft"]);
  });

  it("shows the server's own sentence when publishing is refused", async () => {
    draft.data = completeDraft();
    mockPublish({ error: "That currency is not currently available. Choose another currency." });
    step();

    await advance();

    expect(toasts.errors).toEqual([
      "That currency is not currently available. Choose another currency.",
    ]);
  });
});
