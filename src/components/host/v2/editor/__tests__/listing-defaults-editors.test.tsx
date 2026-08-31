import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
  createListingPricing: vi.fn(),
  runMutationSteps: vi.fn(),
}));

// The editors are client components. Only the router and the server actions need
// standing in for; everything else — the i18n context, `useTransition`, the review
// model — works as it does in the browser under a server render.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
}));
vi.mock("@/lib/actions/pricing.actions", () => ({
  createListingPricing: mocks.createListingPricing,
}));
vi.mock("@/components/host/v2/calendar/calendar-actions", () => ({
  runMutationSteps: mocks.runMutationSteps,
}));

import { AvailabilityDefaultEditor } from "@/components/host/v2/editor/availability-default-editor";
import { PricingDefaultsEditor } from "@/components/host/v2/editor/pricing-defaults-editor";
import { OngoingOffersEditor } from "@/components/host/v2/editor/ongoing-offers-editor";
import { buildCalendarFormats } from "@/lib/host/v2/calendar-format";
import type {
  HostCalendarListing,
  HostCalendarListingContext,
} from "@/lib/host/v2/calendar-types";
import { HORIZON_END, makeListing, promotion, TODAY } from "@/lib/host/v2/__tests__/fixtures";

function context(
  overrides: Partial<HostCalendarListing> = {},
): HostCalendarListingContext {
  const listing = makeListing(overrides);
  return {
    today: TODAY,
    horizonEnd: HORIZON_END,
    horizonMonths: 18,
    formats: buildCalendarFormats("en", [listing.pricing?.currency ?? "EUR"]),
    listing,
  };
}

describe("AvailabilityDefaultEditor", () => {
  it("offers the two plain-language choices with their explanations", () => {
    const html = renderToStaticMarkup(
      <AvailabilityDefaultEditor context={context()} />,
    );

    expect(html).toContain("Available by default");
    expect(html).toContain("Future dates can be booked unless you block them.");
    expect(html).toContain("Only dates I open");
    expect(html).toContain("Future dates cannot be booked until you open them.");
  });

  it("never uses the schema's words for the setting", () => {
    const html = renderToStaticMarkup(
      <AvailabilityDefaultEditor context={context({ availabilityMode: "CLOSED" })} />,
    );

    expect(html).not.toContain("availability mode");
    expect(html).not.toContain("Availability mode");
    expect(html).not.toContain(">OPEN<");
    expect(html).not.toContain(">CLOSED<");
  });

  it("is one radio group, with each answer describing itself programmatically", () => {
    const html = renderToStaticMarkup(
      <AvailabilityDefaultEditor context={context()} />,
    );

    expect(html).toContain('role="radiogroup"');
    expect(html).toContain('type="radio"');
    // Two answers to one question, so they share a name and each points at its own
    // explanation rather than leaving a screen reader with two bare labels.
    expect(html.match(/aria-describedby="/g)).toHaveLength(2);
  });

  it("starts on the stored answer, with the review action disabled", () => {
    // Nothing to confirm until the host actually changes something: this setting moves
    // every future date at once, so it must never autosave on arrival.
    const html = renderToStaticMarkup(
      <AvailabilityDefaultEditor context={context({ availabilityMode: "CLOSED" })} />,
    );

    expect(html).toContain("Review this change");
    expect(html).toContain("disabled");
    expect(html).toContain("This is the current setting.");
    // A save is what the confirmation does; nothing has been written by rendering.
    expect(mocks.runMutationSteps).not.toHaveBeenCalled();
  });

  it("requires confirmation rather than saving on selection", () => {
    const html = renderToStaticMarkup(
      <AvailabilityDefaultEditor context={context()} />,
    );

    // The review dialog is not in the tree until a change is staged, so the initial
    // render cannot possibly be a save.
    expect(html).not.toContain("What happens when you save");
    expect(html).toContain("Review this change");
  });
});

describe("PricingDefaultsEditor", () => {
  it("edits the base price, cleaning fee and minimum stay from the listing editor", () => {
    const html = renderToStaticMarkup(
      <PricingDefaultsEditor context={context()} />,
    );

    expect(html).toContain("Default pricing");
    expect(html).toContain("Base price");
    expect(html).toContain("Cleaning fee");
    expect(html).toContain("Minimum stay");
    expect(html).toContain('value="120"');
    expect(html).toContain('value="30"');
  });

  it("uses one explicit review for the grouped change", () => {
    const html = renderToStaticMarkup(
      <PricingDefaultsEditor context={context()} />,
    );

    expect(html).toContain("Review and save pricing");
    expect(html).toContain("These are the current values.");
    // Disabled until something differs from the stored rule.
    expect(html).toContain("disabled");
  });

  it("states that hand-priced dates keep their own price", () => {
    const html = renderToStaticMarkup(
      <PricingDefaultsEditor
        context={context({
          datePrices: [
            { date: "2026-07-01", nightlyRate: 200 },
            { date: "2026-07-02", nightlyRate: 200 },
          ],
        })}
      />,
    );

    expect(html).toContain("2 dates you priced yourself will not change.");
  });

  it("offers a working first price instead of a dead end when there is no rule", () => {
    const html = renderToStaticMarkup(
      <PricingDefaultsEditor context={context({ pricing: null })} />,
    );

    expect(html).toContain("Set your nightly price");
    expect(html).toContain(
      "This listing has no price yet, so no date can be booked.",
    );
    expect(html).toContain("Save nightly price");
    // A real form, not a sentence pointing back at the calendar.
    expect(html).toContain('id="host-v2-first-base-price"');
    expect(html).not.toContain("Open Calendar to set a nightly rate");
  });
});

describe("OngoingOffersEditor", () => {
  const ongoing = promotion({
    id: "ongoing-1",
    discountPercent: 15,
    minimumNights: 5,
  });
  const dated = promotion({
    id: "dated-1",
    discountPercent: 10,
    minimumNights: 2,
    startDate: "2026-09-01",
    endDate: "2026-09-30",
  });

  it("is where an always-active offer is created", () => {
    const html = renderToStaticMarkup(
      <OngoingOffersEditor context={context()} />,
    );

    expect(html).toContain("Ongoing offers");
    expect(html).toContain(
      "Discounts that run on every date until you end them.",
    );
    expect(html).toContain("New promotion");
  });

  it("lists ongoing offers only; dated offers are reported in Particular dates", () => {
    const html = renderToStaticMarkup(
      <OngoingOffersEditor context={context({ promotions: [ongoing, dated] })} />,
    );

    expect(html).toContain("15%");
    expect(html).not.toContain("10%");
    expect(html).toContain("Add another promotion");
  });

  it("does not edit a dated offer here", () => {
    // The list is for discoverability; a dated offer belongs to its nights, and
    // choosing one leaves for the calendar rather than opening a form on this page.
    const html = renderToStaticMarkup(
      <OngoingOffersEditor context={context({ promotions: [dated] })} />,
    );

    expect(html).not.toContain("Also waive the cleaning fee");
    expect(html).not.toContain("Remove this promotion");
  });
});
