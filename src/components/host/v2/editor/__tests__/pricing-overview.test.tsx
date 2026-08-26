import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  PricingOverview,
  calendarPricingHref,
} from "@/components/host/v2/editor/pricing-overview";
import type { ListingPricingSummary } from "@/lib/host/v2/pricing-summary";
import type { Translator } from "@/lib/i18n/t";

/** Source-locale translator: every key falls back to its English literal, which is
 *  what an untranslated request renders with. */
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
    minNights: 2,
    maxNights: 30,
  },
  promotions: [
    {
      id: "promo-1",
      type: "PERCENT_DISCOUNT",
      discountPercent: 15,
      minimumNights: 5,
      freeCleaning: false,
      startDate: null,
      endDate: null,
      phase: "ACTIVE",
    },
    {
      id: "promo-2",
      type: "FREE_CLEANING",
      discountPercent: 0,
      minimumNights: null,
      freeCleaning: true,
      startDate: "2026-09-01",
      endDate: "2026-09-30",
      phase: "UPCOMING",
    },
  ],
  activePromotionCount: 1,
  upcomingPromotionCount: 1,
  datePriceCount: 12,
  datePriceRange: { from: "2026-07-01", to: "2026-08-15" },
};

describe("calendarPricingHref", () => {
  it("opens Calendar on the listing being edited", () => {
    expect(calendarPricingHref("listing-1")).toBe("/host/calendar?listing=listing-1");
  });

  it("escapes an id that would otherwise break the query string", () => {
    expect(calendarPricingHref("a b&c")).toBe("/host/calendar?listing=a%20b%26c");
  });
});

describe("PricingOverview", () => {
  it("summarises every current pricing value", () => {
    const html = renderToStaticMarkup(<PricingOverview summary={summary} t={t} />);

    expect(html).toContain("Currency");
    expect(html).toContain("EUR");
    expect(html).toContain("Base nightly rate");
    expect(html).toContain("120");
    expect(html).toContain("Cleaning fee");
    expect(html).toContain("25");
    expect(html).toContain("Minimum stay");
    expect(html).toContain("2 nights");
    expect(html).toContain("Maximum stay");
    expect(html).toContain("30 nights");
  });

  it("reports promotions and date-specific prices", () => {
    const html = renderToStaticMarkup(<PricingOverview summary={summary} t={t} />);

    expect(html).toContain("1 running now, 1 scheduled.");
    expect(html).toContain("15% off");
    expect(html).toContain("Free cleaning");
    expect(html).toContain("stays of 5 nights or more");
    expect(html).toContain("12 upcoming nights carry a price of their own");
  });

  it("explains that Calendar is where pricing changes, and links to it", () => {
    const html = renderToStaticMarkup(<PricingOverview summary={summary} t={t} />);

    expect(html).toContain("The base nightly rate applies to every night");
    expect(html).toContain("select those dates in Calendar");
    expect(html).toContain("Promotions are created and ended in Calendar");
    expect(html).toContain("Manage pricing in Calendar");
    expect(html).toContain('href="/host/calendar?listing=listing-1"');
  });

  it("stays read-only: no inputs, no form, no submit control", () => {
    const html = renderToStaticMarkup(<PricingOverview summary={summary} t={t} />);

    expect(html).not.toContain("<input");
    expect(html).not.toContain("<form");
    expect(html).not.toContain("<textarea");
    expect(html).not.toContain("<select");
    expect(html).not.toContain("<button");
  });

  it("says so plainly when the listing has no pricing rule yet", () => {
    const html = renderToStaticMarkup(
      <PricingOverview
        summary={{
          listingId: "listing-2",
          rule: null,
          promotions: [],
          activePromotionCount: 0,
          upcomingPromotionCount: 0,
          datePriceCount: 0,
          datePriceRange: null,
        }}
        t={t}
      />,
    );

    expect(html).toContain("No prices have been set for this listing yet.");
    expect(html).toContain("No promotions are running or scheduled.");
    expect(html).toContain("No dates are priced differently.");
    expect(html).toContain('href="/host/calendar?listing=listing-2"');
    expect(html).not.toContain("Base nightly rate");
  });
});
