import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  HouseRulesStep,
  RulesHeader,
} from "@/components/host/v2/listings/house-rules-step";
import { HostStartDraftProvider } from "@/components/host/v2/listings/host-start-draft-provider";
import { MAX_GUESTS_MAX, MAX_GUESTS_MIN } from "@/lib/host/v2/listing-house-rules";
import { houseRulesDraftPatch } from "@/lib/host/v2/listing-house-rules-draft";
import type { ListingDraftData } from "@/lib/types/listing-draft";

const house = { value: "HOUSE", label: "House", icon: "House", description: "A house." };

/** A draft whose host has answered every rule the step requires. */
const ANSWERED: ListingDraftData = houseRulesDraftPatch({
  checkInTime: "15:00",
  checkInEndTime: "",
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
    expect(html).not.toContain('role="alert"');
    expect(html).not.toContain("Answer these house-rule questions to continue");
  });

  it("says up front that four answers are needed, and marks the rows that need them", () => {
    const html = step({}, UNANSWERED);

    expect(html).toContain(
      "Guests agree to these when they book, so all four need an answer before you continue.",
    );
    // One mark per required policy, and none on the row that is genuinely optional.
    expect((html.match(/>Required</g) ?? []).length).toBe(4);
    expect(html).toContain(">Optional<");
  });

  it("asks for an answer rather than reporting a blank", () => {
    const html = step({}, UNANSWERED);

    // "Not set" describes; four rows of it give a host no clue which ones are the
    // reason Next is not moving.
    expect(html).not.toContain("Not set");
    expect((html.match(/Choose an answer/g) ?? []).length).toBe(4);
  });

  it("says that the arrival times and party size already carry values", () => {
    expect(step({}, UNANSWERED)).toContain(
      "These start at the usual times and party size. Change any of them if yours are different.",
    );
  });

  it("counts the answers, and the count moves with them", () => {
    expect(step({}, UNANSWERED)).toContain("0 of 4 answered");
    expect(step({}, { ...UNANSWERED, petPolicy: "ALLOWED" })).toContain("1 of 4 answered");
    expect(
      step({}, { ...UNANSWERED, petPolicy: "ALLOWED", smokingPolicy: "NOT_ALLOWED" }),
    ).toContain("2 of 4 answered");
    expect(step({}, ANSWERED)).toContain("4 of 4 answered");
  });

  it("does not count 'set quiet hours' with a missing end as an answer", () => {
    const html = step({}, {
      ...ANSWERED,
      quietHoursPolicy: "SET",
      quietHoursStart: "22:00",
      quietHoursEnd: "",
    });

    expect(html).toContain("3 of 4 answered");
  });

  it("keeps the last card clear of the sticky footer at every width", () => {
    expect(step()).toContain("pb-40 pt-6 md:px-8 md:pb-32");
  });
});

describe("the house-rules error summary", () => {
  const goTo = vi.fn();

  it("names every unanswered rule in one alert", () => {
    const html = renderToStaticMarkup(
      <RulesHeader
        answered={1}
        showIssues
        saveFailed={false}
        onGoToRow={goTo}
        issues={{
          petPolicy: "REQUIRED",
          eventPolicy: "REQUIRED",
          quietHoursPolicy: "REQUIRED",
        }}
      />,
    );

    expect(html).toContain("Answer these house-rule questions to continue");
    expect(html).toContain(">Pets<");
    expect(html).toContain(">Parties and events<");
    expect(html).toContain(">Quiet hours<");
    expect(html).not.toContain(">Smoking<");
    // One live region for the whole screen. Four rows each announcing the same refusal
    // is what a screen-reader user was left assembling the page from.
    expect((html.match(/role="alert"/g) ?? []).length).toBe(1);
    // Each entry is a control, so the rule it names is one press away.
    expect((html.match(/<button/g) ?? []).length).toBe(3);
  });

  it("lists a half-set quiet-hours range once, not twice", () => {
    const html = renderToStaticMarkup(
      <RulesHeader
        answered={3}
        showIssues
        saveFailed={false}
        onGoToRow={goTo}
        issues={{ quietHoursStart: "REQUIRED", quietHoursEnd: "REQUIRED" }}
      />,
    );

    expect((html.match(/>Quiet hours</g) ?? []).length).toBe(1);
  });

  it("takes the cursor, so its announcement has somewhere to land", () => {
    const html = renderToStaticMarkup(
      <RulesHeader
        answered={4}
        showIssues={false}
        saveFailed
        onGoToRow={goTo}
        issues={{}}
      />,
    );

    expect(html).toContain('id="house-rules-error-summary"');
    expect(html).toContain('tabindex="-1"');
  });

  it("says a failed save lost nothing and can be retried", () => {
    const html = renderToStaticMarkup(
      <RulesHeader
        answered={4}
        showIssues={false}
        saveFailed
        onGoToRow={goTo}
        issues={{}}
      />,
    );

    expect(html).toContain("Your house rules were not saved");
    expect(html).toContain(
      "Nothing you answered was lost. Check your connection and try again.",
    );
  });

  it("stays quiet, and marks the step done, once all four are in", () => {
    const html = renderToStaticMarkup(
      <RulesHeader
        answered={4}
        showIssues
        saveFailed={false}
        onGoToRow={goTo}
        issues={{}}
      />,
    );

    expect(html).toContain("4 of 4 answered");
    expect(html).not.toContain('role="alert"');
  });
});
