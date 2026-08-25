import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PriceStep } from "@/components/host/v2/listings/price-step";
import {
  NIGHTLY_PRICE_MAX,
  NIGHTLY_PRICE_MIN,
} from "@/lib/host/v2/listing-nightly-price";

const house = { value: "HOUSE", label: "House", icon: "House", description: "A house." };

function step(props: Partial<Parameters<typeof PriceStep>[0]> = {}): string {
  return renderToStaticMarkup(
    <PriceStep
      propertyType={house}
      spaceType="ENTIRE_PLACE"
      currency="EUR"
      {...props}
    />,
  );
}

/** Every `style="width:N%"` in the progress line: phase one, two, three. */
function progressBars(html: string): string[] {
  return [...html.matchAll(/style="width:(\d+)%"/g)].map((match) => match[1]);
}

describe("PriceStep", () => {
  it("renders the pricing copy and the reassurance that it is not final", () => {
    const html = step();

    expect(html).toContain("Now, set your price");
    expect(html).toContain("You can change it anytime.");
    expect(html).toContain("per night");
  });

  it("opens with an empty numeric field rather than an amount of its own", () => {
    // A seeded number cannot be currency-aware the way the ceilings are, so it would
    // read as €50 to one host and as 50 ден — about €0.80 — to another, with the floor
    // of 1 waving it through. Empty is the only honest opening state.
    const html = step();

    expect(html).toContain('inputMode="numeric"');
    expect(html).toContain('value=""');
    expect(html).not.toContain('value="50"');
  });

  it("labels the two amounts as rows rather than as one hero number", () => {
    const html = step();

    expect(html).toContain("Price per night");
    expect(html).toContain("Charge a cleaning fee");
  });

  it("names the listing currency by code and by name", () => {
    const html = step();

    expect(html).toContain("Prices in");
    expect(html).toContain("EUR");
    expect(html).toContain("Euro");
  });

  it("shows the currency beside the amount, per the listing's own currency", () => {
    expect(step()).toContain("€");
    expect(step({ currency: "USD" })).toContain("$");
  });

  it("states what a guest pays, formatted the way every other price is", () => {
    // The example stay is what states the amount back to the host now: it shows the
    // rate applied over nights, which the bare per-night line could not.
    expect(step({ initialPrice: "120" })).toContain("A 3-night stay costs €360.");
  });

  it("keeps only whole currency units out of what the host typed", () => {
    expect(step({ initialPrice: "1 200,50" })).toContain('value="120050"');
  });

  it("stays quiet about an unusable amount until the host tries to move on", () => {
    // Which is the state every host arrives in, now that the field starts empty: a
    // screen that opens already showing red is hostile.
    const html = step({ initialPrice: "" });

    expect(html).not.toContain("Guests need a nightly price to book.");
    expect(html).toContain('aria-invalid="false"');
  });

  it("holds the example stay back until there is a price to demonstrate", () => {
    expect(step()).not.toContain("A 3-night stay costs");
  });

  it("blocks Next while the amount is below the floor", () => {
    const html = step({ initialPrice: "0" });

    expect(html).toContain("<button");
    expect(html).not.toContain("/host/start/availability");
  });

  it("states the bounds as money once the host has tried to move on", () => {
    const html = renderToStaticMarkup(
      <PriceStep
        propertyType={house}
        spaceType="ENTIRE_PLACE"
        currency="EUR"
        initialPrice="0"
        initialTouched
      />,
    );

    expect(html).toContain("Your price must be at least €1.");
  });

  it("blocks Next while the amount is above the ceiling", () => {
    const html = step({ initialPrice: String(NIGHTLY_PRICE_MAX + 1) });

    expect(html).not.toContain("/host/start/availability");
  });

  it("accepts the floor the pricing service enforces", () => {
    expect(step({ initialPrice: String(NIGHTLY_PRICE_MIN) })).toContain(
      "/host/start/availability",
    );
  });

  it("goes on to availability with the flow's query parameters", () => {
    expect(step({ initialPrice: "120" })).toContain(
      'href="/host/start/availability?propertyType=HOUSE&amp;spaceType=ENTIRE_PLACE"',
    );
  });

  it("goes back to the end of phase two with the flow's query parameters", () => {
    expect(step()).toContain(
      'href="/host/start/phase-two-complete?propertyType=HOUSE&amp;spaceType=ENTIRE_PLACE"',
    );
  });

  it("shows both earlier phases complete and phase three started", () => {
    expect(progressBars(step())).toEqual(["100", "100", "20"]);
  });
});
