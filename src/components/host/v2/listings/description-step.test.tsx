import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// The description half advances through the router so its minimum can run first; a
// static render has no app-router context to read.
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { DescriptionStep } from "@/components/host/v2/listings/description-step";
import {
  DESCRIPTION_MAX,
  DESCRIPTION_MIN,
  TITLE_MAX,
  TITLE_MIN,
} from "@/lib/host/v2/listing-basics";

const house = { value: "HOUSE", label: "House", icon: "House", description: "A house." };

function step(
  props: Partial<Parameters<typeof DescriptionStep>[0]> = {},
): string {
  return renderToStaticMarkup(
    <DescriptionStep propertyType={house} spaceType="ENTIRE_PLACE" {...props} />,
  );
}

/** Every `style="width:N%"` in the progress line, in order: phase one, phase two. */
function progressBars(html: string): string[] {
  return [...html.matchAll(/style="width:(\d+)%"/g)].map((match) => match[1]);
}

describe("DescriptionStep — title view", () => {
  it("renders the title copy and a large single-line field", () => {
    const html = step();

    expect(html).toContain("Give your place a title");
    expect(html).toContain("Short titles work best. You can change it anytime.");
    expect(html).toContain('type="text"');
    expect(html).not.toContain("Create your description");
  });

  it("counts up to the minimum while the title is short", () => {
    expect(step({ initialTitle: "Sea" })).toContain(`3/${TITLE_MIN} minimum`);
  });

  it("counts against the ceiling once the minimum is met", () => {
    const html = step({ initialTitle: "Sunny loft by the old bazaar" });

    expect(html).toContain(`28/${TITLE_MAX}`);
    expect(html).not.toContain("minimum");
  });

  it("ignores surrounding whitespace in the count, like the editor does", () => {
    expect(step({ initialTitle: "   Sunny loft   " })).toContain(`10/${TITLE_MAX}`);
  });

  it("caps the field at the title limit the editor enforces", () => {
    expect(step()).toContain(`maxLength="${TITLE_MAX}"`);
  });

  it("stays quiet about an empty title until the host tries to move on", () => {
    const html = step();

    expect(html).not.toContain("Guests need this to book.");
    expect(html).toContain('aria-invalid="false"');
  });

  it("goes back to the photos with the flow's query parameters", () => {
    expect(step()).toContain(
      'href="/host/start/photos?propertyType=HOUSE&amp;spaceType=ENTIRE_PLACE"',
    );
  });

  it("sits inside the second progress segment with phase one full", () => {
    expect(progressBars(step())).toEqual(["100", "60"]);
  });
});

describe("DescriptionStep — description view", () => {
  it("renders the description copy and a multiline field", () => {
    const html = step({ initialView: "description" });

    expect(html).toContain("Create your description");
    expect(html).toContain("Share what makes your place special.");
    expect(html).toContain("<textarea");
    expect(html).not.toContain("Give your place a title");
  });

  it("counts up to the minimum while the description is short", () => {
    const html = step({ initialView: "description", initialDescription: "A quiet loft." });

    expect(html).toContain(`13/${DESCRIPTION_MIN} minimum`);
  });

  it("counts against the ceiling once the minimum is met", () => {
    const html = step({
      initialView: "description",
      initialDescription: "x".repeat(DESCRIPTION_MIN),
    });

    expect(html).toContain(`${DESCRIPTION_MIN}/${DESCRIPTION_MAX}`);
    expect(html).not.toContain("minimum");
  });

  it("caps the field at the description limit the editor enforces", () => {
    expect(step({ initialView: "description" })).toContain(`maxLength="${DESCRIPTION_MAX}"`);
  });

  it("keeps back on the same route, so returning to the title is a local move", () => {
    expect(step({ initialView: "description" })).toContain(
      'href="/host/start/description?propertyType=HOUSE&amp;spaceType=ENTIRE_PLACE"',
    );
  });

  it("advances the second progress segment past the title view", () => {
    expect(progressBars(step({ initialView: "description" }))).toEqual(["100", "80"]);
  });

  it("stays quiet about a short description until the host tries to move on", () => {
    const html = step({ initialView: "description", initialDescription: "Too short." });

    expect(html).not.toContain("Needs at least");
    expect(html).toContain('aria-invalid="false"');
  });

  it("gates the step forward on a handler rather than a link out of the flow", () => {
    const html = step({ initialView: "description" });

    // The CTA is a button, so the minimum runs before the host leaves the screen. Its
    // label sits in a wrapper the footer never unmounts, so look for a button holding
    // the label rather than for one whose only child is the word.
    const buttons = html.match(/<button[\s\S]*?<\/button>/g) ?? [];
    expect(buttons.some((button) => button.includes(">Next<"))).toBe(true);
    expect(html).not.toContain('href="/host/start/phase-two-complete');
    expect(html).not.toContain('href="/host/listings"');
  });
});

describe("DescriptionStep — no persistence", () => {
  it("keeps both views UI-only: no form, no submit, no action", () => {
    for (const html of [step(), step({ initialView: "description" })]) {
      expect(html).not.toContain("<form");
      expect(html).not.toContain('type="submit"');
      expect(html).not.toContain("action=");
    }
  });

  it("never sends the host's text through the translation widget", () => {
    for (const html of [step(), step({ initialView: "description" })]) {
      expect(html).toContain("notranslate");
      expect(html).toContain('translate="no"');
    }
  });
});
