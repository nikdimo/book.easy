import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { Translator } from "@/lib/i18n/t";

// The workspace imports the server action, which would drag the real Prisma client into
// a render test. Nothing here clicks anything, so a stub is enough.
vi.mock("@/lib/actions/listing-house-rules.actions", () => ({
  updateListingHouseRules: vi.fn(),
}));

import { HouseRulesWorkspace } from "@/components/host/v2/editor/house-rules/house-rules-workspace";
import { HouseRulesElsewhere } from "@/components/host/v2/editor/house-rules/house-rules-elsewhere";
import {
  emptyListingHouseRules,
  type ListingHouseRulesInput,
} from "@/lib/host/v2/listing-house-rules";

/** Untranslated English, which is what every locale falls back to before review. */
const t: Translator = {
  locale: "en",
  requestedLocale: "en",
  catalogReady: true,
  messages: {},
  resolve: (_key, source) => ({ text: source, translated: false }),
};

/** A listing whose host has answered everything. */
const ANSWERED: ListingHouseRulesInput = {
  checkInTime: "15:00",
  checkInEndTime: "",
  checkOutTime: "11:00",
  maxGuests: 4,
  petPolicy: "ASK_HOST",
  smokingPolicy: "OUTDOORS_ONLY",
  eventPolicy: "NOT_ALLOWED",
  quietHoursPolicy: "SET",
  quietHoursStart: "22:00",
  quietHoursEnd: "08:00",
  additionalRules: "No shoes indoors.",
};

function workspace(
  overrides: {
    rules?: Partial<ListingHouseRulesInput>;
    largestUpcomingParty?: number;
  } = {},
) {
  return renderToStaticMarkup(
    <HouseRulesWorkspace
      listingId="listing-1"
      rules={{ ...ANSWERED, ...overrides.rules }}
      largestUpcomingParty={overrides.largestUpcomingParty ?? 0}
    />,
  );
}

describe("HouseRulesWorkspace rows", () => {
  it("lays the rules out in the sections the design groups them into", () => {
    const html = workspace();

    expect(html).toContain("Arrival");
    expect(html).toContain("Guests");
    expect(html).toContain("House rules");
    expect(html).toContain("Additional rules");
  });

  it("shows every rule with the answer the listing currently holds", () => {
    const html = workspace();

    expect(html).toContain("Check-in");
    expect(html).toContain("15:00");
    expect(html).toContain("Check-out");
    expect(html).toContain("11:00");
    expect(html).toContain(">4</span>");
    expect(html).toContain("Ask the host");
    expect(html).toContain("Outdoors only");
    expect(html).toContain("22:00–08:00");
    expect(html).toContain("No shoes indoors.");
  });

  it("gives each rule a row that opens it, not a control on the page", () => {
    const html = workspace();

    for (const id of [
      "house-rules-check-in",
      "house-rules-check-out",
      "house-rules-pets",
      "house-rules-smoking",
      "house-rules-events",
      "house-rules-quiet-hours",
      "house-rules-additional-rules",
    ]) {
      expect(html).toContain(`id="${id}"`);
    }
  });

  it("says a rule is unset rather than saying it is not allowed", () => {
    // The distinction the whole feature rests on: a listing published before these
    // columns existed has answered nothing, and must not be made to say "no".
    const html = workspace({ rules: emptyListingHouseRules() });

    expect(html).toContain("Not set");
    expect(html).not.toContain("Not allowed");
  });

  it("reads a flexible arrival time as flexible, not as a blank", () => {
    const html = workspace({ rules: { checkInTime: "", checkOutTime: "" } });

    expect(html).toContain("Flexible");
  });

  it("shows a host with no quiet hours that they have none", () => {
    const html = workspace({
      rules: { quietHoursPolicy: "NONE", quietHoursStart: "", quietHoursEnd: "" },
    });

    expect(html).toContain("No quiet hours");
  });

  it("prompts for the written rules a host has not added", () => {
    expect(workspace({ rules: { additionalRules: "" } })).toContain(
      "Add any other rules guests should know",
    );
  });

  it("keeps the guest stepper inline, stopping at the ends of the range", () => {
    expect(workspace({ rules: { maxGuests: 1 } })).toContain(
      'aria-label="One guest fewer" disabled',
    );
    expect(workspace({ rules: { maxGuests: 20 } })).toContain(
      'aria-label="One guest more" disabled',
    );
    // `disabled:` utility classes are on the buttons at every count, so this looks for
    // the attribute rather than the substring.
    expect(workspace({ rules: { maxGuests: 4 } })).not.toMatch(
      /aria-label="One guest [a-z]+" disabled/,
    );
  });

  it("offers the explanation behind a More info control rather than on the page", () => {
    const html = workspace();

    expect(html).toContain("More info");
    // The sheet is unmounted until it is opened, so none of its copy is on the page.
    expect(html).not.toContain("About house rules");
  });
});

describe("HouseRulesWorkspace booked-party warning", () => {
  it("warns when the limit is below a party already on the books", () => {
    const html = workspace({ rules: { maxGuests: 2 }, largestUpcomingParty: 5 });

    expect(html).toContain("You already have an upcoming request or stay for 5 guests");
  });

  it("stays quiet when the limit still covers every booked stay", () => {
    expect(
      workspace({ rules: { maxGuests: 6 }, largestUpcomingParty: 5 }),
    ).not.toContain("You already have an upcoming request or stay");
  });
});

describe("HouseRulesWorkspace save reporting", () => {
  it("says changes save on their own before anything has been touched", () => {
    const html = workspace();

    expect(html).toContain("Changes save on their own.");
    expect(html).toContain('aria-live="polite"');
  });

  it("shows no unanswered-rule errors: the editor asks nothing of an old listing", () => {
    // `requireAnswers` belongs to the create flow. Opening this tab on a listing that
    // predates these columns must not present it as broken.
    const html = workspace({ rules: emptyListingHouseRules() });

    expect(html).not.toContain("Choose an answer so guests know where they stand.");
  });

  it("does not import the create flow's Required marks onto an existing listing", () => {
    // The flow marks these four Required and calls an unanswered one "Choose an
    // answer", because the flow is the screen doing the asking. Carrying that here
    // would tell a host of a listing published years ago that it is now incomplete.
    const html = workspace({ rules: emptyListingHouseRules() });

    expect(html).not.toContain(">Required<");
    expect(html).not.toContain("Choose an answer");
    expect(html).not.toContain("of 4 answered");
    expect(html).not.toContain("Answer these house-rule questions to continue");
    // It still says what it always said: nothing was set, and nothing is refused.
    expect((html.match(/Not set/g) ?? []).length).toBe(4);
  });

  it("keeps announcing its own row errors, having no summary to defer to", () => {
    // The flow silences these because it raises one alert for the whole screen. The
    // editor has no such summary, so a row that goes wrong here has to speak.
    const html = workspace({
      rules: { ...ANSWERED, quietHoursStart: "", quietHoursEnd: "" },
    });

    expect(html).toContain('role="alert"');
  });
});

describe("HouseRulesElsewhere", () => {
  function html() {
    return renderToStaticMarkup(<HouseRulesElsewhere listingId="listing-1" t={t} />);
  }

  it("sends each rule that is genuinely stored elsewhere to the section that owns it", () => {
    const markup = html();

    expect(markup).toContain('href="/host/listings/listing-1/pricing"');
    expect(markup).toContain('href="/host/calendar?listing=listing-1"');
  });

  it("no longer sends pets to Amenities, because pets are stored on this screen", () => {
    const markup = html();

    expect(markup).not.toContain('href="/host/listings/listing-1/amenities"');
    expect(markup).not.toContain("stored as an amenity");
  });

  it("no longer tells hosts to write their rules into the description", () => {
    const markup = html();

    expect(markup).not.toContain("We don&#x27;t store these as separate settings yet");
    expect(markup).not.toContain("Write them into your description");
    expect(markup).not.toContain('href="/host/listings/listing-1/basics"');
  });

  it("offers no control of its own — every row is a handoff", () => {
    const markup = html();

    expect(markup).not.toContain("<input");
    expect(markup).not.toContain("<button");
    expect(markup).not.toContain("<select");
  });
});
