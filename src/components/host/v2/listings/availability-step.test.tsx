import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AvailabilityStep } from "@/components/host/v2/listings/availability-step";

const house = { value: "HOUSE", label: "House", icon: "House", description: "A house." };

const TODAY = "2026-08-20";

/** The date control is a `DatePickerField` trigger now, not `<input type="date">`, so
 *  its presence is its id rather than an input type. */
const DATE_FIELD = 'id="listing-flow-availability-date"';

function step(props: Partial<Parameters<typeof AvailabilityStep>[0]> = {}): string {
  return renderToStaticMarkup(
    <AvailabilityStep
      propertyType={house}
      spaceType="ENTIRE_PLACE"
      today={TODAY}
      {...props}
    />,
  );
}

/** Every `style="width:N%"` in the progress line, in phase order. */
function progressBars(html: string): string[] {
  return [...html.matchAll(/style="width:(\d+)%"/g)].map((match) => match[1]);
}

describe("AvailabilityStep", () => {
  it("asks the question the pre-publish screen asks, in the same words", () => {
    const html = step();

    expect(html).toContain("When can guests book?");
    expect(html).toContain(
      "This decides when your listing starts taking booking requests.",
    );
  });

  it("offers the three canonical answers", () => {
    const html = step();

    expect(html).toContain("Available now");
    expect(html).toContain("Available from a specific date");
    expect(html).toContain("Only on dates I open");
    expect(html).toContain(
      "Everything stays closed until you open dates in your calendar later.",
    );
  });

  it("starts with nothing chosen and nothing to complain about", () => {
    const html = step();

    expect(html).not.toContain("checked");
    expect(html).not.toContain("Choose when guests can start booking.");
  });

  it("keeps the date field out of the way until its own option is picked", () => {
    expect(step()).not.toContain(DATE_FIELD);
    expect(step({ initialMode: "now" })).not.toContain(DATE_FIELD);
    expect(step({ initialMode: "selected" })).not.toContain(DATE_FIELD);
  });

  it("reveals the date field under the option that asks for it", () => {
    const html = step({ initialMode: "from" });

    expect(html).toContain(DATE_FIELD);
    expect(html).toContain("First date guests can check in");
  });

  it("floors the date field at today in the marketplace's zone", () => {
    expect(step({ initialMode: "from" })).toContain(`data-min="${TODAY}"`);
  });

  it("shows a chosen date in words rather than an input mask", () => {
    expect(step({ initialMode: "from", initialStartDate: "2026-09-01" })).toContain(
      "September 1, 2026",
    );
  });
});

describe("AvailabilityStep — navigation", () => {
  it("goes back to price carrying the flow's property and space type", () => {
    expect(step()).toContain(
      'href="/host/start/price?propertyType=HOUSE&amp;spaceType=ENTIRE_PLACE"',
    );
  });

  it("offers no link forward while the question is unanswered", () => {
    const html = step();

    expect(html).not.toContain("/host/start/house-rules");
    expect(html).toContain("<button");
  });

  it("links forward to house rules once an answer holds", () => {
    expect(step({ initialMode: "now" })).toContain(
      'href="/host/start/house-rules?propertyType=HOUSE&amp;spaceType=ENTIRE_PLACE"',
    );
  });

  it("holds the host back while the chosen date is still missing", () => {
    expect(step({ initialMode: "from" })).not.toContain("/host/start/house-rules");
  });

  it("lets a valid future date through", () => {
    expect(step({ initialMode: "from", initialStartDate: "2026-09-01" })).toContain(
      "/host/start/house-rules",
    );
  });

  it("holds the host back on a date that has already passed", () => {
    expect(step({ initialMode: "from", initialStartDate: "2026-08-19" })).not.toContain(
      "/host/start/house-rules",
    );
  });

  it("fills both earlier segments and advances phase three", () => {
    expect(progressBars(step())).toEqual(["100", "100", "40"]);
  });
});

describe("AvailabilityStep — minimum stay", () => {
  it("uses the calendar editor's control and words", () => {
    const html = step();

    expect(html).toContain("Minimum stay");
    expect(html).toContain("Fewer nights");
    expect(html).toContain("More nights");
  });

  it("reads as any length at one night", () => {
    const html = step();

    expect(html).toContain("any length");
    expect(html).not.toContain("nights minimum");
  });

  it("counts nights once the host raises it", () => {
    const html = step({ initialMinNights: 3 });

    expect(html).toContain("nights minimum");
    expect(html).not.toContain("any length");
  });

  it("clamps an out-of-range starting value into the editor's bounds", () => {
    expect(step({ initialMinNights: 0 })).toContain("any length");
    expect(step({ initialMinNights: 9000 })).toContain("365");
  });
});
