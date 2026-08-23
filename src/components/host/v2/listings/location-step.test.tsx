import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LocationStep } from "@/components/host/v2/listings/location-step";

const apartment = {
  value: "APARTMENT",
  label: "Apartment",
  icon: "Building2",
  description: "A private home in a larger residential building.",
};

describe("LocationStep", () => {
  it("shows the address input and preserves earlier choices in the back link", () => {
    const html = renderToStaticMarkup(
      <LocationStep propertyType={apartment} spaceType="ENTIRE_PLACE" />,
    );

    expect(html).toContain("Set up your listing");
    expect(html).toContain('id="listing-address"');
    expect(html).toContain('autoComplete="street-address"');
    expect(html).toContain(
      'href="/host/start/space-type?propertyType=APARTMENT&amp;spaceType=ENTIRE_PLACE"',
    );
  });

  it("allows UI testing without an address and does not persist one", () => {
    const html = renderToStaticMarkup(
      <LocationStep propertyType={apartment} spaceType="ENTIRE_PLACE" />,
    );

    expect(html).not.toContain("<form");
    expect(html).toContain("Continue");
    expect(html).toContain("%2Fimages%2Flisting-animation-coastal-building.png");
    expect(html).toContain("%2Fimages%2Flisting-animation-coastal-phone.png");
  });

  it("keeps language and currency reachable when the desktop header is hidden", () => {
    const html = renderToStaticMarkup(
      <LocationStep propertyType={apartment} spaceType="ENTIRE_PLACE" />,
    );

    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toContain("Language and currency");
    expect(html).toContain("lg:hidden");
  });
});
