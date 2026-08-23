import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PropertyTypeStep } from "@/components/host/v2/listings/property-type-step";

const propertyTypes = [
  {
    value: "APARTMENT",
    label: "Apartment",
    icon: "Building2",
    description: "A private home in a larger residential building.",
  },
  {
    value: "VILLA",
    label: "Villa",
    icon: "Castle",
    description: "A spacious standalone home.",
  },
];

describe("PropertyTypeStep", () => {
  it("renders the catalog as one accessible choice", () => {
    const html = renderToStaticMarkup(
      <PropertyTypeStep propertyTypes={propertyTypes} />,
    );

    expect(html).toContain("What kind of place are you listing?");
    expect(html).toContain('role="radiogroup"');
    expect(html.match(/role="radio"/g)).toHaveLength(2);
    expect(html).toContain("Apartment");
    expect(html).toContain("Villa");
    expect(html).toContain('href="/host/start"');
  });

  it("does not create or submit anything before the host chooses", () => {
    const html = renderToStaticMarkup(
      <PropertyTypeStep propertyTypes={propertyTypes} />,
    );

    expect(html).not.toContain("<form");
    expect(html).not.toContain("<input");
    expect(html).toContain("disabled");
  });

  it("carries a restored selection into the next UI-only step", () => {
    const html = renderToStaticMarkup(
      <PropertyTypeStep
        propertyTypes={propertyTypes}
        initialPropertyType="VILLA"
      />,
    );

    expect(html).toContain(
      'href="/host/start/space-type?propertyType=VILLA"',
    );
    expect(html).toContain('aria-checked="true"');
  });

  it("explains when the admin catalog is empty", () => {
    const html = renderToStaticMarkup(<PropertyTypeStep propertyTypes={[]} />);

    expect(html).toContain("Property types are not available right now.");
    expect(html).not.toContain('role="radiogroup"');
  });
});
