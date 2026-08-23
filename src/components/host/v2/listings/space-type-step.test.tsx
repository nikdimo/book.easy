import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SpaceTypeStep } from "@/components/host/v2/listings/space-type-step";

const apartment = {
  value: "APARTMENT",
  label: "Apartment",
  icon: "Building2",
  description: "A private home in a larger residential building.",
};

describe("SpaceTypeStep", () => {
  it("shows the three booking modes that apply to a non-hotel", () => {
    const html = renderToStaticMarkup(<SpaceTypeStep propertyType={apartment} />);

    expect(html).toContain("What will guests book?");
    expect(html.match(/role="radio"/g)).toHaveLength(3);
    expect(html).toContain("Entire place");
    expect(html).toContain("Private room");
    expect(html).toContain("Shared room");
    expect(html).not.toContain("Hotel room");
    expect(html).toContain(
      'href="/host/start/property-type?propertyType=APARTMENT"',
    );
  });

  it("adds Hotel room when Hotel was selected in the previous step", () => {
    const html = renderToStaticMarkup(
      <SpaceTypeStep propertyType={{ ...apartment, value: "HOTEL", label: "Hotel" }} />,
    );

    expect(html.match(/role="radio"/g)).toHaveLength(4);
    expect(html).toContain("Hotel room");
  });

  it("does not submit or persist an answer", () => {
    const html = renderToStaticMarkup(<SpaceTypeStep propertyType={apartment} />);

    expect(html).not.toContain("<form");
    expect(html).not.toContain("<input");
    expect(html).toContain("disabled");
  });

  it("restores a selection and links to the location step", () => {
    const html = renderToStaticMarkup(
      <SpaceTypeStep propertyType={apartment} initialSpaceType="ENTIRE_PLACE" />,
    );

    expect(html).toContain('aria-checked="true"');
    expect(html).toContain(
      'href="/host/start/location?propertyType=APARTMENT&amp;spaceType=ENTIRE_PLACE"',
    );
  });
});
