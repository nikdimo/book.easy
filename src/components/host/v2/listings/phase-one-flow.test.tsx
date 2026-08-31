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
  it("puts a visible map-pin checkpoint before guest capacity", () => {
    const html = renderToStaticMarkup(
      <AddressStep propertyType={house} spaceType="ENTIRE_PLACE" />,
    );
    expect(html).toContain("Is the pin in the right spot?");
    expect(html).toContain("Tap or move the map to place the property pin.");
    // Confirmation is saved first; this is deliberately a button, not a direct link
    // that could carry the host to Guests without recording the answer.
    expect(html).not.toContain(
      'href="/host/start/basics?propertyType=HOUSE&amp;spaceType=ENTIRE_PLACE"',
    );
  });

  it("explains that browsers never see the exact pin", () => {
    const html = renderToStaticMarkup(
      <AddressStep propertyType={house} spaceType="ENTIRE_PLACE" />,
    );
    expect(html).toContain("see only an approximate area, never this exact pin");
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
    for (const layer of ["path", "house", "location", "guests", "beds", "photo", "plant", "check"]) {
      expect(html).toContain(`%2Fimages%2Flisting-flow%2Fphase-one%2F${layer}.png`);
    }
    expect(html).toContain("--delay:1200ms");
  });
});
