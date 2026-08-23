import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HouseRulesStep } from "@/components/host/v2/listings/house-rules-step";
import { HostStartDraftProvider } from "@/components/host/v2/listings/host-start-draft-provider";
import { MAX_GUESTS_MAX, MAX_GUESTS_MIN } from "@/lib/host/v2/listing-house-rules";
import { houseRulesDraftPatch } from "@/lib/host/v2/listing-house-rules-draft";
import type { ListingDraftData } from "@/lib/types/listing-draft";

const house = { value: "HOUSE", label: "House", icon: "House", description: "A house." };

/** A draft whose host has answered every rule the step requires. */
const ANSWERED: ListingDraftData = houseRulesDraftPatch({
  checkInTime: "15:00",
  checkOutTime: "11:00",
  maxGuests: 4,
  petPolicy: "NOT_ALLOWED",
  smokingPolicy: "NOT_ALLOWED",
  eventPolicy: "NOT_ALLOWED",
  quietHoursPolicy: "SET",
  quietHoursStart: "22:00",
  quietHoursEnd: "08:00",
  additionalRules: "",
});

function step(
  props: Partial<Parameters<typeof HouseRulesStep>[0]> = {},
  draft: ListingDraftData = ANSWERED,
): string {
  return renderToStaticMarkup(
    <HostStartDraftProvider initialDraftId="draft-1" initialData={draft}>
      <HouseRulesStep propertyType={house} spaceType="ENTIRE_PLACE" {...props} />
    </HostStartDraftProvider>,
  );
}

/** Every `style="width:N%"` in the progress line, in order: phases one, two, three. */
function progressBars(html: string): string[] {
  return [...html.matchAll(/style="width:(\d+)%"/g)].map((match) => match[1]);
}

describe("HouseRulesStep", () => {
  it("renders the step copy and the rules the design groups", () => {
    const html = step();

    expect(html).toContain("House rules");
    expect(html).toContain("Set expectations for guests staying at your place.");
    expect(html).toContain("Arrival");
    expect(html).toContain("Check-in");
    expect(html).toContain("Check-out");
    expect(html).toContain("Maximum guests");
    expect(html).toContain("Pets");
    expect(html).toContain("Smoking");
    expect(html).toContain("Parties and events");
    expect(html).toContain("Quiet hours");
    expect(html).toContain("Additional rules");
  });

  it("shows the answers the draft is carrying", () => {
    const html = step();

    expect(html).toContain("15:00");
    expect(html).toContain("11:00");
    expect(html).toContain(">4</span>");
    expect(html).toContain("22:00–08:00");
  });

  it("keeps an off-grid imported time rather than rounding it away", () => {
    const html = step({}, { ...ANSWERED, checkInTime: "14:15" });

    expect(html).toContain("14:15");
  });

  it("stops the guest stepper at the limits the editor enforces", () => {
    expect(step({}, { ...ANSWERED, maxGuests: String(MAX_GUESTS_MIN) })).toContain(
      'aria-label="One guest fewer" disabled',
    );
    expect(step({}, { ...ANSWERED, maxGuests: String(MAX_GUESTS_MAX) })).toContain(
      'aria-label="One guest more" disabled',
    );
    expect(step({}, { ...ANSWERED, maxGuests: "4" })).not.toMatch(
      /aria-label="One guest [a-z]+" disabled/,
    );
  });

  it("no longer tells hosts to write these rules into their description", () => {
    const html = step();

    expect(html).not.toContain("Smoking, parties, quiet hours and your own rules");
    expect(html).not.toContain("Write them into your description");
    expect(html).not.toContain("would not survive a reload");
  });

  it("offers the same More info explanation the editor does", () => {
    const html = step();

    expect(html).toContain("More info");
    // The sheet is unmounted until it is opened.
    expect(html).not.toContain("About house rules");
  });

  it("goes back to availability, and on to review once the rules are answered", () => {
    const html = step();

    expect(html).toContain(
      'href="/host/start/availability?propertyType=HOUSE&amp;spaceType=ENTIRE_PLACE"',
    );
    expect(html).toContain(
      'href="/host/start/review?propertyType=HOUSE&amp;spaceType=ENTIRE_PLACE"',
    );
  });

  it("sits inside the third progress segment, with the two behind it full", () => {
    expect(progressBars(step())).toEqual(["100", "100", "60"]);
  });

  it("stays UI-only: no form, no submit, no action", () => {
    const html = step();

    expect(html).not.toContain("<form");
    expect(html).not.toContain('type="submit"');
    expect(html).not.toContain("action=");
  });
});

describe("HouseRulesStep required answers", () => {
  /** A draft that has reached this step without answering anything — a fresh listing,
   *  an import, or a draft started in the mobile app. */
  const UNANSWERED: ListingDraftData = { maxGuests: "4" };

  it("does not let Next lead to Review while a rule is unanswered", () => {
    const html = step({}, UNANSWERED);

    // The CTA has no destination at all, so there is nothing to click through to.
    expect(html).not.toContain('href="/host/start/review');
    // Back still works: a blocked step is not a trap.
    expect(html).toContain('href="/host/start/availability');
  });

  it("lets Next through once every required rule has an answer", () => {
    expect(step({}, ANSWERED)).toContain('href="/host/start/review');
  });

  it("counts an explicit 'not allowed' as an answer", () => {
    const html = step({}, {
      ...ANSWERED,
      petPolicy: "NOT_ALLOWED",
      smokingPolicy: "NOT_ALLOWED",
      eventPolicy: "NOT_ALLOWED",
    });

    expect(html).toContain('href="/host/start/review');
  });

  it("accepts 'no quiet hours' as an answer to whether quiet hours apply", () => {
    const html = step({}, {
      ...ANSWERED,
      quietHoursPolicy: "NONE",
      quietHoursStart: "",
      quietHoursEnd: "",
    });

    expect(html).toContain('href="/host/start/review');
  });

  it("blocks a half-set quiet-hours range", () => {
    const html = step({}, {
      ...ANSWERED,
      quietHoursPolicy: "SET",
      quietHoursStart: "22:00",
      quietHoursEnd: "",
    });

    expect(html).not.toContain('href="/host/start/review');
  });

  it("blocks each required rule on its own", () => {
    for (const field of [
      "petPolicy",
      "smokingPolicy",
      "eventPolicy",
      "quietHoursPolicy",
    ] as const) {
      const html = step({}, { ...ANSWERED, [field]: "" });

      expect(html).not.toContain('href="/host/start/review');
    }
  });

  it("does not open onto red errors before the host has been asked anything", () => {
    // The errors appear when Next is pressed, not when the screen loads.
    const html = step({}, UNANSWERED);

    expect(html).not.toContain("Choose an answer so guests know where they stand.");
  });
});
