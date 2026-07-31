import { describe, expect, it } from "vitest";
import { LISTING_STEPS } from "@/lib/constants/listing-steps";
import { mobileListingSteps } from "@/lib/mobile-listing-steps";

describe("mobileListingSteps", () => {
  // The mobile app builds its wizard from this payload and holds no list of its
  // own. If anyone replaces the derivation with a hand-written list, the two drift
  // the moment LISTING_STEPS is reordered — which is exactly what happened before.
  it("serves every wizard step, in the wizard's order", () => {
    expect(mobileListingSteps().map((step) => step.id)).toEqual(
      LISTING_STEPS.map((step) => step.id)
    );
  });

  it("gives every step the copy the client needs to render it", () => {
    for (const step of mobileListingSteps()) {
      expect(step.title.length).toBeGreaterThan(0);
      expect(step.description.length).toBeGreaterThan(0);
    }
  });
});
