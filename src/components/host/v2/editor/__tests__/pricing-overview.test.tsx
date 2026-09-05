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

/** What the host reads, with markup stripped out. */
function visibleText(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

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
  it("mounts both editors, one per tab, with the price tab open first", () => {
    const html = render();
    expect(html).toContain("Default pricing form");
    expect(html).toContain("Ongoing offers form");
    // Both panels are rendered and the inactive one is `hidden` rather than absent:
    // each owns an unsaved draft and its own review dialog, and unmounting one would
    // silently discard a base price the host had typed but not yet confirmed.
    expect(html).toContain('aria-selected="true"');
    expect(html).toMatch(/id="[^"]*panel-promotions"[^>]*hidden=""/);
  });

  /**
   * The whole reason for the tabs. Offers used to be the third bordered card down a
   * scrolling column, so a host could use this page for months without learning that a
   * promotion is created here. The tab is at the top and it carries the count.
   */
  it("counts active and upcoming offers on the promotions tab itself", () => {
    expect(render()).toContain(">2</span>");
  });

  it("puts no count on the tab when the listing runs no offers", () => {
    const html = render({
      ...summary,
      promotions: [],
      activePromotionCount: 0,
      upcomingPromotionCount: 0,
    });
    expect(visibleText(html)).toContain("Promotions");
    expect(html).not.toContain(">0</span>");
  });

  it("names the currency in a line rather than a section of its own", () => {
    const html = render();
    const text = visibleText(html);
    expect(text).toContain("Currency · EUR");
    // The bordered "Fixed for this listing" card, its heading and its paragraph are
    // gone: every input on the panel already prints the symbol, so this only has to
    // name it.
    expect(text).not.toContain("Fixed for this listing");
    expect(text).not.toContain("Contact support to change it");
  });

  /**
   * Pricing is money. Stay length is a booking rule with one editable home, under
   * Availability → Booking rules, and this page must not restate it — a "Maximum stay"
   * line here is read as a setting that lives here, which is the belief the split
   * exists to prevent.
   */
  it("states no stay limit at all, not even as read-only context", () => {
    const text = visibleText(render());
    expect(text).not.toContain("Maximum stay");
    expect(text).not.toContain("Minimum stay");
    // Not the value either: the rule's 30-night maximum must not surface as "30 nights".
    expect(text).not.toContain("30 nights");
  });

  it("says nothing about stay length whatever the rule's limits are", () => {
    const text = visibleText(
      render({
        ...summary,
        rule: { ...summary.rule!, minNights: 7, maxNights: 28 },
      }),
    );
    expect(text).not.toContain("28 nights");
    expect(text).not.toContain("7 nights");
    expect(text).not.toContain("Maximum stay");
    expect(text).not.toContain("Minimum stay");
  });

  it("keeps date-specific price counts and ranges, under the link that opens them", () => {
    const html = render();
    expect(html).toContain(
      "12 dates already have a price of their own, Jul 1, 2026 – Aug 15, 2026.",
    );
    expect(html).toContain("Set prices for specific dates");
    expect(html).toContain(
      'href="/host/calendar?listing=listing-1&amp;intent=pricing"',
    );
  });

  it("shows dated offers for discoverability but does not edit them here", () => {
    const html = render();
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

  /**
   * A list of nothing is nothing. The old page spent two paragraphs saying that no date
   * was priced and no dated offer was running; the links below each already offer to
   * create one, which is the only thing a host can do about it.
   */
  it("says nothing at all when there is nothing dated to report", () => {
    const text = visibleText(
      render({
        ...summary,
        promotions: [],
        activePromotionCount: 0,
        upcomingPromotionCount: 0,
        datePriceCount: 0,
        datePriceRange: null,
      }),
    );
    expect(text).not.toContain("No dates are priced differently");
    expect(text).not.toContain("No offer is running for particular dates");
    expect(text).toContain("Set prices for specific dates");
    expect(text).toContain("Create a date-based offer");
  });

  it("withholds the tabs until the listing has a price to discount", () => {
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
    // And a tab strip over a single empty panel would be furniture: a listing with no
    // rule has no offers to run and nothing for the calendar to report.
    expect(html).not.toContain('role="tablist"');
    expect(html).not.toContain("Currency");
  });
});
