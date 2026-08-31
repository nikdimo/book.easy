import { describe, expect, it } from "vitest";
import { LISTING_STEP, LISTING_STEPS } from "@/lib/constants/listing-steps";
import {
  HOST_START_ROUTES,
  hostStartQuery,
  hostStartResumeHref,
  hostStartResumeRoute,
  hostStartRouteOf,
  isHostStartRoute,
  type HostStartRoute,
} from "@/lib/host-start-draft";

describe("host start draft routing", () => {
  it("preserves the choices needed by every resumed page", () => {
    expect(hostStartQuery({ propertyType: "HOUSE", spaceType: "PRIVATE_ROOM" }))
      .toBe("propertyType=HOUSE&spaceType=PRIVATE_ROOM");
  });

  it("resumes on the wizard's own route, carrying the flow's query", () => {
    expect(
      hostStartResumeHref({
        currentRoute: "house-rules",
        propertyType: "HOUSE",
        spaceType: "ENTIRE_PLACE",
      }),
    ).toBe("/host/start/house-rules?propertyType=HOUSE&spaceType=ENTIRE_PLACE");
  });

  it("resumes every screen of the flow at itself", () => {
    // The bug this replaced: four screens shared one step id, so a host who finished
    // house rules resumed two screens back and one who finished pricing resumed past
    // the payment question. Every route now round-trips.
    for (const route of HOST_START_ROUTES) {
      expect(hostStartResumeRoute({ currentRoute: route }), route).toBe(route);
      expect(hostStartResumeHref({ currentRoute: route }), route).toBe(
        `/host/start/${route}`,
      );
    }
  });

  it("covers the whole flow — price through review included", () => {
    // Spelled out rather than derived, so reordering or renaming a screen has to be
    // stated here too. These are addresses a running host lands on.
    expect([...HOST_START_ROUTES]).toEqual([
      "property-type",
      "space-type",
      "location",
      "address",
      "basics",
      "phase-one-complete",
      "amenities",
      "photos",
      "description",
      "phase-two-complete",
      "price",
      "payment-arrangements",
      "availability",
      "house-rules",
      "review",
    ] satisfies HostStartRoute[]);
  });

  it("prefers the wizard's route over a stale shared step id", () => {
    // The mobile vocabulary's `specialOffer` cannot say "house rules". When both are
    // present the one that can name the screen wins.
    expect(
      hostStartResumeRoute({ currentRoute: "house-rules", currentStepId: "specialOffer" }),
    ).toBe("house-rules");
  });
});

describe("drafts this wizard did not write", () => {
  it("maps every shared step id onto a real screen", () => {
    for (const step of LISTING_STEPS) {
      const route = hostStartResumeRoute({ currentStepId: step.id });
      expect(isHostStartRoute(route), `${step.id} -> ${route}`).toBe(true);
    }
  });

  it("resumes the classic vocabulary where that question is now asked", () => {
    expect(hostStartResumeRoute({ currentStepId: "photos" })).toBe("photos");
    expect(hostStartResumeRoute({ currentStepId: "pricing" })).toBe("price");
    expect(hostStartResumeRoute({ currentStepId: "streetView" })).toBe("basics");
    expect(hostStartResumeRoute({ currentStepId: "details" })).toBe("basics");
  });

  it("sends the ambiguous legacy id back to the earliest screen that wrote it", () => {
    // Four screens used to write `specialOffer`, and nothing says which one meant it.
    // Backwards is the safe direction: at worst the host re-answers a question, where
    // forwards would publish a listing with no payment methods and no deposit answer.
    expect(hostStartResumeRoute({ currentStepId: "specialOffer" })).toBe(
      "payment-arrangements",
    );
  });

  it("falls back to the legacy numeric index when there is no id", () => {
    expect(hostStartResumeRoute({ currentStep: LISTING_STEP.amenities })).toBe("amenities");
  });

  it("starts a draft with nothing to go on at the first screen", () => {
    expect(hostStartResumeHref({})).toBe("/host/start/property-type");
    expect(hostStartResumeHref({ currentStepId: "unknown" })).toBe("/host/start/property-type");
    expect(hostStartResumeHref({ currentRoute: "not-a-screen" })).toBe(
      "/host/start/property-type",
    );
  });

  it("ignores an out-of-range legacy index rather than throwing", () => {
    expect(hostStartResumeRoute({ currentStep: 99 })).toBe("payment-arrangements");
    expect(hostStartResumeRoute({ currentStep: -4 })).toBe("property-type");
  });
});

describe("reading a route back off a wizard link", () => {
  it("recognises a step href with and without the flow's query", () => {
    expect(hostStartRouteOf("/host/start/availability?propertyType=HOUSE")).toBe(
      "availability",
    );
    expect(hostStartRouteOf("/host/start/review")).toBe("review");
  });

  it("returns nothing for a link that leaves the flow", () => {
    expect(hostStartRouteOf("/host/listings")).toBeUndefined();
    expect(hostStartRouteOf("/host/start/somewhere-else?x=1")).toBeUndefined();
  });
});
