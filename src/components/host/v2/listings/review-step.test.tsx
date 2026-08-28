import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ReviewStep } from "@/components/host/v2/listings/review-step";

const house = { value: "HOUSE", label: "House", icon: "House", description: "A house." };

function step(props: Partial<Parameters<typeof ReviewStep>[0]> = {}): string {
  return renderToStaticMarkup(
    <ReviewStep propertyType={house} spaceType="ENTIRE_PLACE" {...props} />,
  );
}

describe("ReviewStep — summary", () => {
  it("lists every section of the flow", () => {
    const html = step();

    for (const label of [
      "Property and guest space",
      "Location",
      "Guests, bedrooms and beds",
      "Amenities",
      "Photos",
      "Title and description",
      "Price",
      "Availability",
      "House rules",
    ]) {
      expect(html).toContain(label);
    }
  });

  it("shows the two answers the flow actually carries", () => {
    expect(step()).toContain("House · Entire place");
    expect(step({ spaceType: "PRIVATE_ROOM" })).toContain("House · Private room");
  });

  it("shows persisted-field fallbacks and explains that publishing is real", () => {
    const html = step();

    expect(html).toContain("Not provided");
    expect(html).toContain("Publishing makes this listing live");
  });

  it("links each row back to its own step, marked as a return trip", () => {
    const html = step();

    for (const path of [
      "property-type",
      "location",
      "basics",
      "amenities",
      "photos",
      "description",
      "price",
      "availability",
      "house-rules",
    ]) {
      // `returnTo=review` is what makes the step's CTA come back here rather than
      // walking the host through every screen after the one they corrected.
      expect(html).toContain(
        `href="/host/start/${path}?propertyType=HOUSE&amp;spaceType=ENTIRE_PLACE&amp;returnTo=review"`,
      );
    }
  });

  it("offers Publish listing as the primary action, and Back to house rules", () => {
    const html = step();

    expect(html).toContain("Publish listing");
    expect(html).toContain(
      'href="/host/start/house-rules?propertyType=HOUSE&amp;spaceType=ENTIRE_PLACE"',
    );
  });
});

describe("ReviewStep — confirmation", () => {
  it("confirms that the listing was published", () => {
    const html = step({ initialPublished: true });

    expect(html).toContain("Guests can now find your listing");
    expect(html).toContain("Listing published");
    expect(html).toContain("Back to listings");
  });

  it("replaces the summary rather than sitting under it", () => {
    const html = step({ initialPublished: true });

    expect(html).not.toContain("Publish listing");
    expect(html).not.toContain("Review your listing");
  });

  it("returns to the summary in place, on the same route", () => {
    expect(step({ initialPublished: true })).toContain(
      'href="/host/start/review?propertyType=HOUSE&amp;spaceType=ENTIRE_PLACE"',
    );
  });
});

describe("ReviewStep — no persistence", () => {
  it("publishes nothing: no form, no submit, no action", () => {
    for (const html of [step(), step({ initialPublished: true })]) {
      expect(html).not.toContain("<form");
      expect(html).not.toContain('type="submit"');
      expect(html).not.toContain("action=");
    }
  });
});
