import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  PricingOverview,
  calendarPricingHref,
  datedPromotionHref,
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

const ongoing = {
  id: "promo-1",
  type: "PERCENT_DISCOUNT" as const,
  discountPercent: 15,
  minimumNights: 5,
  freeCleaning: false,
  startDate: null,
  endDate: null,
  phase: "ACTIVE" as const,
};

const dated = {
  id: "promo-2",
  type: "FREE_CLEANING" as const,
  discountPercent: 0,
  minimumNights: null,
  freeCleaning: true,
  startDate: "2026-09-01",
  endDate: "2026-09-30",
  phase: "UPCOMING" as const,
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
  promotions: [ongoing, dated],
  activePromotionCount: 1,
  upcomingPromotionCount: 1,
  datePriceCount: 12,
  datePriceRange: { from: "2026-07-01", to: "2026-08-15" },
};

/** Stands in for the client editors the page mounts; this file is about the report.
 *  `translate="no"` because this is scaffolding, not product copy the catalog should
 *  ever be asked to carry. */
const defaultsEditor = <div translate="no">Default pricing form</div>;
const offersEditor = <div translate="no">Ongoing offers form</div>;

function render(data: ListingPricingSummary = summary): string {
  return renderToStaticMarkup(
    <PricingOverview
      summary={data}
      defaultsEditor={defaultsEditor}
      offersEditor={offersEditor}
      t={t}
    />,
  );
}

describe("calendarPricingHref", () => {
  it("opens Calendar on the listing, ready for the job that sent the host", () => {
    expect(calendarPricingHref("listing-1")).toBe(
      "/host/calendar?listing=listing-1&intent=pricing",
    );
    expect(calendarPricingHref("listing-1", "promotion")).toBe(
      "/host/calendar?listing=listing-1&intent=promotion",
    );
  });

  it("escapes an id that would otherwise break the query string", () => {
    expect(calendarPricingHref("a b&c")).toBe(
      "/host/calendar?listing=a+b%26c&intent=pricing",
    );
  });
});

describe("datedPromotionHref", () => {
  it("carries the offer's own nights, so the calendar opens on them", () => {
    // Stored ends are exclusive, so a 1–30 September offer's last covered night is
    // the 29th — which is what the grid has to select.
    expect(datedPromotionHref("listing-1", dated)).toBe(
      "/host/calendar?listing=listing-1&intent=promotion&from=2026-09-01&to=2026-09-29",
    );
  });

  it("falls back to the plain promotion intent for an offer with no range", () => {
    expect(datedPromotionHref("listing-1", ongoing)).toBe(
      "/host/calendar?listing=listing-1&intent=promotion",
    );
  });
});

describe("PricingOverview", () => {
  it("mounts the editable default pricing and ongoing offers", () => {
    const html = render();
    expect(html).toContain("Default pricing form");
    expect(html).toContain("Ongoing offers form");
    expect(html).toContain("Set what this listing charges by default here.");
  });

  it("keeps currency and maximum stay as context it does not edit", () => {
    const html = render();
    expect(html).toContain("Currency");
    expect(html).toContain("EUR");
    expect(html).toContain("Maximum stay");
    expect(html).toContain("30 nights");
    expect(html).toContain("Contact support to change either of these.");
  });

  it("keeps date-specific price counts and ranges visible, with a link that says why", () => {
    const html = render();
    expect(html).toContain("12 upcoming nights carry a price of their own");
    expect(html).toContain("Set prices for specific dates");
    expect(html).toContain(
      'href="/host/calendar?listing=listing-1&amp;intent=pricing"',
    );
  });

  it("shows dated offers for discoverability but does not edit them here", () => {
    const html = render();
    expect(html).toContain("Date-based offers");
    expect(html).toContain("Free cleaning");
    expect(html).toContain("Sep 1, 2026 – Sep 29, 2026");
    // Selecting one leaves for the calendar with its own range preselected.
    expect(html).toContain(
      'href="/host/calendar?listing=listing-1&amp;intent=promotion&amp;from=2026-09-01&amp;to=2026-09-29"',
    );
    expect(html).toContain("Create a date-based offer");
  });

  it("does not list an ongoing offer among the dated ones", () => {
    // The always-active offer is edited in the form above, so listing it down here
    // would give one offer two places to be changed from.
    const html = render();
    expect(html).not.toContain("stays of 5 nights or more");
    expect(html).not.toContain("All dates");
  });

  it("never offers a generic 'Open calendar' CTA", () => {
    const html = render();
    expect(html).not.toContain("Open calendar");
    expect(html).not.toContain("Manage pricing in Calendar");
  });

  it("says nothing is date-priced when nothing is", () => {
    const html = render({
      ...summary,
      promotions: [],
      activePromotionCount: 0,
      upcomingPromotionCount: 0,
      datePriceCount: 0,
      datePriceRange: null,
    });
    expect(html).toContain("No dates are priced differently.");
    expect(html).toContain("No offer is running for particular dates.");
  });

  it("withholds the offers form until the listing has a price to discount", () => {
    const html = render({
      listingId: "listing-2",
      rule: null,
      promotions: [],
      activePromotionCount: 0,
      upcomingPromotionCount: 0,
      datePriceCount: 0,
      datePriceRange: null,
    });

    // The defaults editor is always mounted — it is what asks for the first price.
    expect(html).toContain("Default pricing form");
    expect(html).not.toContain("Ongoing offers form");
    // And the fixed-context card has nothing truthful to say without a rule.
    expect(html).not.toContain("Maximum stay");
  });
});
