import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BasicsStep } from "@/components/host/v2/listings/basics-step";
import { HostStartDraftProvider } from "@/components/host/v2/listings/host-start-draft-provider";
import { HouseRulesStep } from "@/components/host/v2/listings/house-rules-step";
import { PropertyTypeStep } from "@/components/host/v2/listings/property-type-step";
import { SpaceTypeStep } from "@/components/host/v2/listings/space-type-step";
import {
  returnsToReview,
  reviewHref,
  stepNextTarget,
  withReviewReturn,
} from "@/lib/host/v2/listing-flow-return";
import { houseRulesDraftPatch } from "@/lib/host/v2/listing-house-rules-draft";
import type { ListingDraftData } from "@/lib/types/listing-draft";

const house = { value: "HOUSE", label: "House", icon: "House", description: "A house." };
const QUERY = "propertyType=HOUSE&amp;spaceType=ENTIRE_PLACE";
const REVIEW = `href="/host/start/review?${QUERY}"`;

function withDraft(node: React.ReactNode, data: ListingDraftData = {}) {
  return renderToStaticMarkup(
    <HostStartDraftProvider initialDraftId="draft-1" initialData={data}>
      {node}
    </HostStartDraftProvider>,
  );
}

describe("listing-flow-return", () => {
  it("reads the marker off a search param, in either shape", () => {
    expect(returnsToReview("review")).toBe(true);
    expect(returnsToReview(["review"])).toBe(true);
    expect(returnsToReview(undefined)).toBe(false);
    expect(returnsToReview("photos")).toBe(false);
  });

  it("sends a marked step back to Review and says so", () => {
    const query = "propertyType=HOUSE&spaceType=ENTIRE_PLACE";

    // `route` is the same destination named as a wizard route, for the step to record
    // on the draft so a host who leaves resumes where they were going.
    expect(stepNextTarget(true, query, "/host/start/photos?x")).toEqual({
      href: `/host/start/review?${query}`,
      label: "Save and review",
      route: "review",
    });
    expect(stepNextTarget(false, query, "/host/start/photos?x")).toEqual({
      href: "/host/start/photos?x",
      label: "Next",
      route: "photos",
    });
  });

  it("keeps the marker off the Review address it returns to", () => {
    // Otherwise Review would render every edit link with the marker doubled up.
    expect(reviewHref("a=1")).toBe("/host/start/review?a=1");
    expect(withReviewReturn("a=1", true)).toBe("a=1&returnTo=review");
    expect(withReviewReturn("a=1", false)).toBe("a=1");
  });
});

describe("a step reached from Review", () => {
  it("returns there from Basics instead of walking on to the next phase", () => {
    const html = withDraft(
      <BasicsStep propertyType={house} spaceType="ENTIRE_PLACE" returnToReview />,
    );

    expect(html).toContain(REVIEW);
    expect(html).toContain("Save and review");
    expect(html).not.toContain("phase-one-complete");
  });

  it("returns there from House rules, which already ended at Review", () => {
    const answered = houseRulesDraftPatch({
      checkInTime: "15:00",
      checkOutTime: "11:00",
      maxGuests: 4,
      petPolicy: "NOT_ALLOWED",
      smokingPolicy: "NOT_ALLOWED",
      eventPolicy: "NOT_ALLOWED",
      quietHoursPolicy: "SET",
      quietHoursStart: "22:00",
      quietHoursEnd: "08:00",
      additionalRules: "",
    });
    const html = withDraft(
      <HouseRulesStep propertyType={house} spaceType="ENTIRE_PLACE" returnToReview />,
      answered,
    );

    // Back is the change: the CTA was always Review, but Back was the step before it.
    expect(html).toContain("Save and review");
    expect(html).not.toContain("availability?");
  });

  it("hands the property type on to the space type rather than returning early", () => {
    // A changed property type can leave the stored space type disallowed, so the pair
    // is walked and the second screen is the one that returns.
    const html = withDraft(
      <PropertyTypeStep
        propertyTypes={[house]}
        initialPropertyType="HOUSE"
        spaceType="ENTIRE_PLACE"
        returnToReview
      />,
    );

    expect(html).toContain(
      'href="/host/start/space-type?propertyType=HOUSE&amp;spaceType=ENTIRE_PLACE&amp;returnTo=review"',
    );
    // Back is Review, not the flow's first screen.
    expect(html).toContain(REVIEW);
  });

  it("returns from the space type once one is picked", () => {
    const html = withDraft(
      <SpaceTypeStep
        propertyType={house}
        initialSpaceType="ENTIRE_PLACE"
        returnToReview
      />,
    );

    expect(html).toContain(REVIEW);
    expect(html).toContain("Save and review");
    expect(html).not.toContain("/host/start/location");
  });
});

describe("a step reached in sequence", () => {
  it("still advances to the next step", () => {
    const html = withDraft(<BasicsStep propertyType={house} spaceType="ENTIRE_PLACE" />);

    expect(html).toContain("phase-one-complete");
    expect(html).not.toContain("Save and review");
    expect(html).not.toContain("/host/start/review");
  });
});
