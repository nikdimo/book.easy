import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PhaseTwoComplete } from "@/components/host/v2/listings/phase-two-complete";

const house = { value: "HOUSE", label: "House", icon: "House", description: "A house." };
const query = "propertyType=HOUSE&amp;spaceType=ENTIRE_PLACE";

function markup(): string {
  return renderToStaticMarkup(<PhaseTwoComplete propertyType={house} spaceType="ENTIRE_PLACE" />);
}

/** Every `style="width:N%"` in the progress line, in order: phase one, two, three. */
function progressBars(html: string): string[] {
  return [...html.matchAll(/style="width:(\d+)%"/g)].map((match) => match[1]);
}

describe("PhaseTwoComplete", () => {
  it("marks the phase as done and points at what phase three covers", () => {
    const html = markup();

    expect(html).toContain("Phase 2 complete");
    expect(html).toContain("Your place stands out");
    expect(html).toContain("your price, your availability and your house rules");
  });

  it("stages every layer of the completion illustration", () => {
    const html = markup();

    // Asset paths only exist as strings, so a typo would otherwise ship a blank layer.
    for (const layer of ["ring", "tile", "sparkle", "wifi", "photo", "text", "check"]) {
      expect(html).toContain(`%2Fimages%2Flisting-flow%2Fphase-two%2F${layer}.png`);
    }
    // The checkmark lands last, and the whole sequence stays under two seconds.
    expect(html).toContain("--delay:1120ms");
  });

  it("hands the flow between the description and the first phase-three step", () => {
    const html = markup();

    expect(html).toContain(`href="/host/start/description?${query}&amp;descriptionView=description"`);
    expect(html).toContain(`href="/host/start/price?${query}"`);
  });

  it("fills the first two progress segments and leaves the third empty", () => {
    const html = markup();

    expect(progressBars(html)).toEqual(["100", "100"]);
    expect(html.match(/h-1 flex-1 bg-slate-200/g)).toHaveLength(3);
  });

  it("keeps Back and Next in the same footer positions as every other step", () => {
    const html = markup();
    const back = html.indexOf(">Back<");
    const next = html.indexOf(">Next<");

    expect(back).toBeGreaterThan(-1);
    expect(next).toBeGreaterThan(back);
  });

  it("stays UI only — nothing is submitted or persisted", () => {
    const html = markup();

    expect(html).not.toContain("<form");
    expect(html).not.toContain('type="submit"');
    expect(html).not.toContain("action=");
  });
});
