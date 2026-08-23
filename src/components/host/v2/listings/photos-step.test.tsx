import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PhotosStep } from "@/components/host/v2/listings/photos-step";
import { PHOTO_INPUT_ACCEPT } from "@/lib/host/v2/photo-draft";

const house = { value: "HOUSE", label: "House", icon: "House", description: "A house." };

function markup() {
  return renderToStaticMarkup(
    <PhotosStep propertyType={house} spaceType="ENTIRE_PLACE" />,
  );
}

describe("PhotosStep", () => {
  it("opens on the empty upload state", () => {
    const html = markup();

    expect(html).toContain("Add some photos of your place");
    expect(html).toContain(
      "Add at least 3 photos — listings with 5 or more get more bookings. Put your best photo first; you can reorder them at any time.",
    );
    expect(html).toContain("Drag your photos here");
    expect(html).toContain("Upload from your device");
    expect(html).toContain("border-dashed");
    // Nothing is picked yet, so there is no grid and no cover to mark.
    expect(html).not.toContain("Cover photo");
    expect(html).not.toContain("Add more");
  });

  it("offers a multi-select image file input", () => {
    const html = markup();

    expect(html).toContain('type="file"');
    expect(html).toContain("multiple");
    expect(html).toContain(`accept="${PHOTO_INPUT_ACCEPT}"`);
    // Hidden rather than absent: the styled upload area drives it.
    expect(html).toMatch(/<input[^>]*class="sr-only"/);
  });

  it("starts the five-photo counter at zero", () => {
    const html = markup();

    expect(html).toContain("0 of 3 photos added");
    expect(html).not.toContain("Minimum reached");
    expect(html).toContain("width:0%");
  });

  it("keeps Back and Next in the flow positions, with progress in the second segment", () => {
    const html = markup();
    const back = html.indexOf(">Back<");
    const next = html.indexOf(">Next<");

    expect(back).toBeGreaterThan(-1);
    expect(next).toBeGreaterThan(back);
    expect(html).toContain('href="/host/start/amenities?propertyType=HOUSE&amp;spaceType=ENTIRE_PLACE"');
    // Next is a button while the minimum is unmet — it never links on to phase two with
    // an empty picker, and it never drops out to the listing list either.
    expect(html).not.toContain('href="/host/start/description?propertyType=HOUSE&amp;spaceType=ENTIRE_PLACE"');
    expect(html).not.toContain('href="/host/listings"');
    // First segment full, second part-filled, third untouched.
    expect(html).toContain("width:100%");
    expect(html).toContain("width:40%");
    expect(html.match(/h-1 flex-1 bg-slate-200/g)).toHaveLength(3);
  });

  it("stays UI only — nothing is submitted, uploaded or persisted", () => {
    const html = markup();

    expect(html).not.toContain("<form");
    expect(html).not.toContain("action=");
  });
});
