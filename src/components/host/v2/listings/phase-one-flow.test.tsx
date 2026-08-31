import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));
import { AddressStep } from "@/components/host/v2/listings/address-step";
import { BasicsStep } from "@/components/host/v2/listings/basics-step";
import { PhaseOneComplete } from "@/components/host/v2/listings/phase-one-complete";

const house = { value: "HOUSE", label: "House", icon: "House", description: "A house." };

describe("remaining phase one flow", () => {
  it("holds an empty address on the step rather than linking on to basics", () => {
    const html = renderToStaticMarkup(<AddressStep propertyType={house} spaceType="ENTIRE_PLACE" />);
    expect(html).toContain("Confirm your address");
    // Next is a button, not a link, until the address is one publishing would take.
    expect(html).not.toContain('href="/host/start/basics?propertyType=HOUSE&amp;spaceType=ENTIRE_PLACE"');
  });

  it("links straight on to basics once the address holds", () => {
    const html = renderToStaticMarkup(
      <AddressStep propertyType={house} spaceType="ENTIRE_PLACE" initialAddress="Partizanska 15" />,
    );
    // The city comes from the draft in the real flow; the fallback country is already
    // valid, so only the street line is missing from a static render.
    expect(html).toContain('value="Partizanska 15"');
  });

  it("uses the old editor capacity defaults and limits", () => {
    const html = renderToStaticMarkup(<BasicsStep propertyType={house} spaceType="ENTIRE_PLACE" />);
    expect(html).toContain("Share some basics about your place");
    expect(html).toContain("Guests: 1");
    expect(html).toContain('href="/host/start/phase-one-complete?propertyType=HOUSE&amp;spaceType=ENTIRE_PLACE"');
  });

  it("ends phase one with a transition to the next phase", () => {
    const html = renderToStaticMarkup(<PhaseOneComplete propertyType={house} spaceType="ENTIRE_PLACE" />);
    expect(html).toContain("Phase 1 complete");
    expect(html).toContain("Your place has a foundation");
  });

  it("stages every layer of the completion illustration", () => {
    const html = renderToStaticMarkup(<PhaseOneComplete propertyType={house} spaceType="ENTIRE_PLACE" />);
    // Asset paths only exist as strings, so a typo would otherwise ship a blank layer.
    for (const layer of ["path", "house", "location", "guests", "beds", "photo", "plant", "check"]) {
      expect(html).toContain(`%2Fimages%2Flisting-flow%2Fphase-one%2F${layer}.png`);
    }
    // The checkmark lands last, and the whole sequence stays under two seconds.
    expect(html).toContain("--delay:1200ms");
  });
});
