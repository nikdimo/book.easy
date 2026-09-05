import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  OptionToggle,
  StandardPricingSummary,
} from "@/components/host/calendar-editor-ui";

describe("StandardPricingSummary", () => {
  it("shows only money settings with one edit action", () => {
    const html = renderToStaticMarkup(
      <StandardPricingSummary
        baseNightlyRate={125}
        cleaningFee={30}
        currency="EUR"
        locale="en"
        onEdit={() => undefined}
      />,
    );

    expect(html).toContain("Standard pricing");
    expect(html).toContain("Base price");
    expect(html).toContain("Cleaning fee");
    expect(html).not.toContain("Minimum stay");
    expect(html).not.toContain("Maximum stay");
    expect(html).toContain("€125.00");
    expect(html).toContain("€30.00");
    expect(html.match(/>Edit</g)).toHaveLength(1);
  });
});

describe("OptionToggle", () => {
  it("exposes an unavailable promotion benefit as disabled", () => {
    const html = renderToStaticMarkup(
      <OptionToggle
        checked={false}
        label="Add free cleaning"
        description="There is no cleaning fee to waive."
        onChange={() => undefined}
        disabled
      />,
    );

    expect(html).toContain("disabled");
    expect(html).toContain('role="switch"');
    expect(html).toContain('aria-checked="false"');
    expect(html).toContain("There is no cleaning fee to waive.");
  });
});
