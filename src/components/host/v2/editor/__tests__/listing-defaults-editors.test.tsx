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

/** The fixture's pricing rule with only the named fields changed. */
function pricingWith(
  overrides: Partial<NonNullable<HostCalendarListing["pricing"]>>,
): NonNullable<HostCalendarListing["pricing"]> {
  return { ...makeListing().pricing!, ...overrides };
}

/** What the host reads, with markup and SVG path data stripped out. */
function visibleText(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
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
  it("edits the base price and the cleaning fee, and nothing else", () => {
    const html = renderToStaticMarkup(
      <PricingDefaultsEditor context={context()} />,
    );

    expect(html).toContain("Base price");
    expect(html).toContain("Cleaning fee");
    expect(html).toContain('value="120"');
    expect(html).toContain('value="30"');
    // No heading and no card of its own. The Price tab above names it and the panel's
    // one sentence describes it; a bordered box around the only thing on the panel is a
    // container drawn around a container.
    expect(html).not.toContain("Default pricing");
    expect(html).not.toContain("rounded-2xl border");
  });

  /**
   * The fee is the same kind of decision as the rate above it — a host raising their
   * nightly price by a tenth is usually weighing the same move on cleaning — so it gets
   * the same three controls rather than a lone number field.
   */
  it("gives the cleaning fee the same percentage and slider as the base price", () => {
    const html = renderToStaticMarkup(
      <PricingDefaultsEditor context={context()} />,
    );

    expect(html).toContain("Percent against your saved base price");
    expect(html).toContain("Percent against your saved cleaning fee");
    expect(html).toContain("Change against your saved base price");
    expect(html).toContain("Change against your saved cleaning fee");
  });

  /**
   * A percentage of nothing is nothing at every position on the slider. On a listing
   * that charges no cleaning those two controls would visibly not work, so they wait
   * until there is a fee to be a percentage of.
   */
  it("withholds the cleaning percentage and slider while the fee is zero", () => {
    const html = renderToStaticMarkup(
      <PricingDefaultsEditor
        context={context({ pricing: pricingWith({ cleaningFee: 0 }) })}
      />,
    );

    expect(html).toContain("Cleaning fee");
    expect(html).not.toContain("Percent against your saved cleaning fee");
    expect(html).not.toContain("Change against your saved cleaning fee");
    // The base price keeps both, so this is the fee's own rule and not a broken render.
    expect(html).toContain("Change against your saved base price");
  });

  it("is only about money: no stay length, editable or otherwise", () => {
    for (const html of [
      renderToStaticMarkup(<PricingDefaultsEditor context={context()} />),
      // The first-price form too — a listing with no rule yet is where a stay-length
      // field is most tempting to add back.
      renderToStaticMarkup(
        <PricingDefaultsEditor context={context({ pricing: null })} />,
      ),
    ]) {
      const text = visibleText(html);
      expect(text).not.toContain("Minimum stay");
      expect(text).not.toContain("Maximum stay");
      // Not even as a disabled field explaining that it lives somewhere else. A
      // control the host cannot operate is a signpost wearing the costume of an input.
      expect(text).not.toContain("This is managed with how the listing sells");
      expect(text).not.toContain("Change it in Calendar");
      expect(html).not.toContain("data-stay-limits");
    }
  });

  it("describes itself as money, not as how long a guest may stay", () => {
    const html = renderToStaticMarkup(
      <PricingDefaultsEditor context={context()} />,
    );
    // The sentence itself belongs to the Price tab now, in `PricingOverview`; what is
    // asserted here is that this editor still says nothing about stay length.
    expect(visibleText(html)).not.toContain("the least a guest can book");
    expect(visibleText(html)).not.toContain("night minimum");
  });

  it("prices its example at the shortest stay a flexible listing accepts", () => {
    const html = renderToStaticMarkup(
      <PricingDefaultsEditor
        context={context({ pricing: pricingWith({ minNights: 3 }) })}
      />,
    );
    expect(visibleText(html)).toContain("A 3-night stay");
  });

  it("never implies a 1-night stay on a listing whose rules forbid one", () => {
    // A weekly listing with a stored 1-night minimum still refuses everything shorter
    // than one whole changeover-to-changeover week. Quoting "A 1-night stay" here would
    // be the example telling the host something untrue about their own listing.
    const html = renderToStaticMarkup(
      <PricingDefaultsEditor
        context={context({
          bookingMode: "FIXED_STAYS",
          changeoverWeekday: "SATURDAY",
          pricing: pricingWith({ minNights: 1, maxNights: 28 }),
        })}
      />,
    );
    const text = visibleText(html);
    expect(text).not.toContain("A 1-night stay");
    expect(text).toContain("A 7-night stay");
  });

  it("rounds a weekly listing's example up to whole weeks", () => {
    const html = renderToStaticMarkup(
      <PricingDefaultsEditor
        context={context({
          bookingMode: "FIXED_STAYS",
          changeoverWeekday: "SATURDAY",
          pricing: pricingWith({ minNights: 10, maxNights: 28 }),
        })}
      />,
    );
    // Ten nights is not a whole number of weeks; the shortest stay this listing will
    // actually take is a fortnight.
    expect(visibleText(html)).toContain("A 14-night stay");
  });

  it("prices nothing when the limits leave no bookable length", () => {
    const html = renderToStaticMarkup(
      <PricingDefaultsEditor
        context={context({
          bookingMode: "FIXED_STAYS",
          changeoverWeekday: "SATURDAY",
          // The shortest whole week satisfying a 16-night minimum is three weeks,
          // and three weeks is over the 20-night maximum — so nothing is bookable.
          pricing: pricingWith({ minNights: 16, maxNights: 20 }),
        })}
      />,
    );
    const text = visibleText(html);
    expect(text).not.toMatch(/A \d+-night stay/);
    expect(text).toContain("leave no bookable length");
  });

  it("uses one explicit review for the grouped change", () => {
    const html = renderToStaticMarkup(
      <PricingDefaultsEditor context={context()} />,
    );

    expect(html).toContain("Review and save pricing");
    // Disabled until something differs from the stored rule. `ag-save` keeps the button
    // in place and grey rather than hiding it, so a host can see that saving is a thing
    // that happens here before they have typed anything — which is also why the
    // sentence that used to sit beside it explaining as much is gone.
    expect(html).toContain("disabled");
    expect(html).toContain("ag-save");
    expect(html).not.toContain("These are the current values.");
    expect(html).not.toContain("Nothing changes until you confirm.");
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
    // The price and the fee, and no third question: stay length is a booking rule.
    expect(html).toContain('id="host-v2-first-cleaning-fee"');
    expect(visibleText(html)).not.toContain("Minimum stay");
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

    expect(html).toContain("New promotion");
    // The heading, the lead sentence and the card are the Promotions tab's, in
    // `PricingOverview`. This is the form and nothing else.
    expect(html).not.toContain("Ongoing offers");
    expect(html).not.toContain("rounded-2xl border");
    // "How offers work" is a "?" popup on that tab now, not six bullets under here.
    expect(html).not.toContain("How offers work");
    expect(html).not.toContain("Promotions apply night by night.");
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
