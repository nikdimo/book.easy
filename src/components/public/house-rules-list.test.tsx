import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { HouseRulesList } from "@/components/public/house-rules-list";
import { houseRulesSnapshot } from "@/lib/host/v2/listing-house-rules";
import type { Translator } from "@/lib/i18n/t";

/** Untranslated English, which is what every locale falls back to before review. */
const t: Translator = {
  locale: "en",
  requestedLocale: "en",
  catalogReady: true,
  messages: {},
  resolve: (_key, source) => ({ text: source, translated: false }),
};

function rules(overrides: Record<string, unknown> = {}) {
  return houseRulesSnapshot({
    checkInTime: "15:00",
    checkOutTime: "11:00",
    maxGuests: 4,
    petPolicy: "ASK_HOST",
    smokingPolicy: "OUTDOORS_ONLY",
    eventPolicy: "NOT_ALLOWED",
    quietHoursPolicy: "SET",
    quietHoursStart: "22:00",
    quietHoursEnd: "08:00",
    additionalRules: "No shoes indoors.",
    ...overrides,
  });
}

function render(overrides: Record<string, unknown> = {}) {
  return renderToStaticMarkup(<HouseRulesList t={t} rules={rules(overrides)} />);
}

describe("HouseRulesList", () => {
  it("shows every rule the host answered", () => {
    const html = render();

    expect(html).toContain("Check-in");
    expect(html).toContain("15:00");
    expect(html).toContain("Check-out");
    expect(html).toContain("11:00");
    expect(html).toContain("Maximum guests");
    expect(html).toContain("Pets");
    expect(html).toContain("Ask the host");
    expect(html).toContain("Smoking");
    expect(html).toContain("Outdoors only");
    expect(html).toContain("Parties and events");
    expect(html).toContain("Quiet hours");
    expect(html).toContain("22:00–08:00");
  });

  it("prints the host's own written rules exactly as stored", () => {
    // Never a machine translation of them: what the host typed is what a guest agrees to.
    const written = "Молиме извадете ги чевлите.";

    const html = render({ additionalRules: written });
    expect(html).toContain(written);
    expect(html).toContain("data-user-generated-content");
    expect(html).toContain('translate="yes"');
  });

  it("leaves out a rule the host never answered rather than showing a blank", () => {
    // A guest has no use for the knowledge that a host skipped a question, and a row
    // saying so invites them to read it as a restriction.
    const html = render({
      petPolicy: null,
      smokingPolicy: null,
      eventPolicy: null,
      quietHoursPolicy: null,
      quietHoursStart: null,
      quietHoursEnd: null,
      additionalRules: null,
    });

    expect(html).not.toContain("Pets");
    expect(html).not.toContain("Smoking");
    expect(html).not.toContain("Not set");
    expect(html).not.toContain("Not allowed");
  });

  it("never turns an unanswered rule into a refusal", () => {
    const html = render({ smokingPolicy: null });

    expect(html).not.toContain("Smoking");
  });

  it("prints nothing for an arrival time the host left flexible", () => {
    const html = render({ checkInTime: null, checkOutTime: null });

    expect(html).not.toContain("Check-in");
    expect(html).not.toContain("Check-out");
    // The guest limit is always there: a listing cannot exist without one.
    expect(html).toContain("Maximum guests");
  });

  it("says so plainly when the host chose to have no quiet hours", () => {
    // Different from silence: this host answered, and the answer was none.
    const html = render({
      quietHoursPolicy: "NONE",
      quietHoursStart: null,
      quietHoursEnd: null,
    });

    expect(html).toContain("No quiet hours");
  });

  it("renders a booking's frozen snapshot the same way as a listing's live rules", () => {
    // Same component, same shape — which is what lets a confirmation page show the rules
    // that booking agreed to rather than today's.
    const frozen = rules({ petPolicy: "ALLOWED" });

    expect(renderToStaticMarkup(<HouseRulesList t={t} rules={frozen} />)).toContain(
      "Allowed",
    );
  });
});
