import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  push: vi.fn(),
  createListingPricing: vi.fn(),
  runMutationSteps: vi.fn(),
  setListingBookingMode: vi.fn(),
  setListingChangeoverWeekday: vi.fn(),
  setListingStayLimits: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh, push: mocks.push }),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/lib/actions/pricing.actions", () => ({
  createListingPricing: mocks.createListingPricing,
}));
vi.mock("@/components/host/v2/calendar/calendar-actions", () => ({
  runMutationSteps: mocks.runMutationSteps,
}));
vi.mock("@/lib/actions/fixed-stay.actions", () => ({
  setListingBookingMode: mocks.setListingBookingMode,
  setListingChangeoverWeekday: mocks.setListingChangeoverWeekday,
  setListingStayLimits: mocks.setListingStayLimits,
}));

import { BookingRulesEditor } from "@/components/host/v2/editor/booking-rules-editor";
import { PricingDefaultsEditor } from "@/components/host/v2/editor/pricing-defaults-editor";
import { PricingOverview } from "@/components/host/v2/editor/pricing-overview";
import { buildCalendarFormats } from "@/lib/host/v2/calendar-format";
import { buildListingCalendarIndex } from "@/lib/host/v2/calendar-model";
import { defaultsDraft, defaultsFormOf } from "@/lib/host/v2/calendar-listing-draft";
import {
  buildListingReviewPlan,
  type ListingChange,
} from "@/lib/host/v2/calendar-review";
import { HORIZON_END, makeListing, TODAY } from "@/lib/host/v2/__tests__/fixtures";
import type {
  HostCalendarListing,
  HostCalendarListingContext,
} from "@/lib/host/v2/calendar-types";
import type { ListingPricingSummary } from "@/lib/host/v2/pricing-summary";
import type { Translator } from "@/lib/i18n/t";

/**
 * One editable home for the minimum and maximum stay.
 *
 * Two sections are the whole of what a host can reach: Pricing, which owns money, and
 * Availability → Booking rules, which owns when and how guests may book. A stay limit
 * that appears on both is a number with two answers — and, because a pricing save used
 * to carry `minNights`, a number whose older copy could win. These tests hold the
 * boundary from both sides at once: nothing on Pricing shows or edits a stay limit,
 * everything that edits one is on Booking rules, and a pricing change cannot carry one
 * even when it is handed one.
 */

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

function planFor(listing: HostCalendarListing, change: ListingChange) {
  return buildListingReviewPlan({
    listing,
    index: buildListingCalendarIndex(listing),
    change,
    today: TODAY,
    horizonEnd: HORIZON_END,
    horizonMonths: 18,
  });
}

/** Source-locale translator: every key renders its English literal. */
const t: Translator = {
  locale: "en",
  requestedLocale: "en",
  catalogReady: true,
  messages: {},
  resolve: (_key, source) => ({ text: source, translated: false }),
};

const summary: ListingPricingSummary = {
  listingId: "listing-1",
  rule: {
    currency: "EUR",
    baseNightlyRate: 120,
    cleaningFee: 25,
    minNights: 3,
    maxNights: 28,
  },
  promotions: [],
  activePromotionCount: 0,
  upcomingPromotionCount: 0,
  datePriceCount: 0,
  datePriceRange: null,
};

/** What the host actually reads, with markup and SVG path data stripped out. */
function visibleText(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

/** Every surface the Pricing section is made of: priced, unpriced, and weekly. */
function pricingSurfaces(): string[] {
  return [
    renderToStaticMarkup(
      <PricingOverview
        summary={summary}
        defaultsEditor={<PricingDefaultsEditor context={context()} />}
        offersEditor={<div translate="no">Ongoing offers form</div>}
        t={t}
      />,
    ),
    renderToStaticMarkup(
      <PricingOverview
        summary={{ ...summary, rule: null }}
        defaultsEditor={
          <PricingDefaultsEditor context={context({ pricing: null })} />
        }
        offersEditor={null}
        t={t}
      />,
    ),
    renderToStaticMarkup(
      <PricingDefaultsEditor
        context={context({
          bookingMode: "FIXED_STAYS",
          changeoverWeekday: "SATURDAY",
          pricing: pricingWith({ minNights: 10, maxNights: 28 }),
        })}
      />,
    ),
  ];
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Pricing owns money and says nothing about stay length", () => {
  it("renders no minimum or maximum stay, as a control or as a summary", () => {
    for (const html of pricingSurfaces()) {
      const text = visibleText(html);
      expect(text).not.toContain("Minimum stay");
      expect(text).not.toContain("Maximum stay");
      // Not the steppers Booking rules uses, and not a disabled stand-in for them.
      expect(html).not.toContain("data-stay-limits");
      expect(html).not.toContain("Decrease minimum stay");
      expect(html).not.toContain("Increase maximum stay");
      expect(html).not.toContain('name="minNights"');
      expect(html).not.toContain('name="maxNights"');
    }
  });

  it("keeps the price example honest by reading the limits it refuses to edit", () => {
    // Reading them is the point: a weekly listing with a 10-night minimum accepts a
    // fortnight at the shortest, and quoting anything shorter would tell the host
    // something untrue about their own listing. Reading is not writing.
    const weekly = visibleText(
      renderToStaticMarkup(
        <PricingDefaultsEditor
          context={context({
            bookingMode: "FIXED_STAYS",
            changeoverWeekday: "SATURDAY",
            pricing: pricingWith({ minNights: 10, maxNights: 28 }),
          })}
        />,
      ),
    );
    expect(weekly).toContain("A 14-night stay");

    const flexible = visibleText(
      renderToStaticMarkup(
        <PricingDefaultsEditor
          context={context({ pricing: pricingWith({ minNights: 3 }) })}
        />,
      ),
    );
    expect(flexible).toContain("A 3-night stay");
  });

  it("stages a money-only change, whatever the listing's stay limits are", () => {
    const listing = makeListing({
      pricing: pricingWith({ minNights: 5, maxNights: 21 }),
    });
    const draft = defaultsDraft(
      { ...defaultsFormOf(listing), baseNightlyRate: "150" },
      listing,
    )!;
    expect(draft).toEqual({
      kind: "DEFAULT_PRICING",
      to: { baseNightlyRate: 150 },
    });
    expect(planFor(listing, draft).steps).toEqual([
      { type: "SET_DEFAULT_PRICING", baseNightlyRate: 150, cleaningFee: 30 },
    ]);
  });

  it("cannot be made to save a stay limit by a page rendered before one changed", () => {
    // The stale tab: Pricing was rendered when the minimum was 2, the host set 5 from
    // Availability in another tab, and the old tab now saves a price. Its 2 goes
    // nowhere — the mutation names two amounts and nothing else.
    const current = makeListing({
      pricing: pricingWith({ minNights: 5, maxNights: 21 }),
    });
    const plan = planFor(current, {
      kind: "DEFAULT_PRICING",
      to: { baseNightlyRate: 150, minNights: 2, maxNights: 365 },
    } as never);
    expect(plan.steps).toEqual([
      { type: "SET_DEFAULT_PRICING", baseNightlyRate: 150, cleaningFee: 30 },
    ]);
    expect(plan.rows.map((row) => row.field)).toEqual(["base_price"]);
  });
});

describe("Booking rules is the one place a stay limit is edited", () => {
  it("carries both limits, as real controls, on the Availability page", () => {
    const html = renderToStaticMarkup(<BookingRulesEditor context={context()} />);
    expect(html).toContain("data-booking-rules");
    expect(html).toContain("data-stay-limits");
    expect(html).toContain("Minimum stay");
    expect(html).toContain("Maximum stay");
    expect(html).toContain('aria-label="Increase minimum stay"');
    expect(html).toContain('aria-label="Decrease maximum stay"');
  });

  it("writes nothing while rendering, on either side of the boundary", () => {
    renderToStaticMarkup(<BookingRulesEditor context={context()} />);
    for (const html of pricingSurfaces()) expect(html).toBeTruthy();
    expect(mocks.setListingStayLimits).not.toHaveBeenCalled();
    expect(mocks.createListingPricing).not.toHaveBeenCalled();
    expect(mocks.runMutationSteps).not.toHaveBeenCalled();
  });
});
