import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * What a search result says about a listing that sells whole stays.
 *
 * The card is an async server component, so it is awaited into an element and rendered
 * statically — the repo's vitest environment is `node` and there is nothing to click.
 * Everything it needs from the request (the session, the saved set, the catalogs) is
 * mocked, because none of it is what these assertions are about.
 */

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  favorites: vi.fn(),
  propertyTypeLabel: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/services/favorite.service", () => ({
  getFavoriteListingIdSet: mocks.favorites,
}));
vi.mock("@/lib/services/property-type.service", () => ({
  getPropertyTypeLabel: mocks.propertyTypeLabel,
}));
// The real translator reads a cookie, which needs a request scope this suite has none
// of. This stands in for it and resolves every key to its English source, which is what
// the assertions below read.
vi.mock("@/lib/i18n/t", () => {
  const fill = (source: string, vars: Record<string, string | number> = {}) =>
    source.replace(/\{(\w+)\}/g, (match, name: string) =>
      name in vars ? String(vars[name]) : match,
    );
  const translator = {
    locale: "en",
    requestedLocale: "en",
    catalogReady: true,
    messages: {},
    resolve: (_key: string, source: string) => ({ text: source, translated: false }),
  };
  return {
    getT: async () => translator,
    getTForLocale: async () => translator,
    T: ({ source }: { source: string }) => source,
    TWithValues: ({
      source,
      values,
    }: {
      source: string;
      values?: Record<string, string | number>;
    }) => fill(source, values),
    ti: (
      _t: unknown,
      _key: string,
      source: string,
      vars: Record<string, string | number>,
    ) => ({ text: fill(source, vars), translated: false }),
    tPlural: (
      _t: unknown,
      _key: string,
      count: number,
      singular: string,
      plural: string,
    ) => ({
      text: fill(count === 1 ? singular : plural, { n: count }),
      translated: false,
    }),
  };
});

// The gallery is a client component that mounts the app router; it renders no fact this
// file asserts on, so it stands in as a stub carrying only the link it was given.
vi.mock("@/components/public/property-card-gallery", () => ({
  PropertyCardGallery: ({ href }: { href?: string }) => (
    <a data-gallery-link href={href} />
  ),
}));

import { PropertyCard } from "@/components/public/property-card";

const baseListing = {
  id: "listing-1",
  slug: "lake-house",
  title: "Lake House",
  maxGuests: 4,
  bedrooms: 2,
  bathrooms: 1,
  spaceType: "ENTIRE_PLACE" as const,
  property: { city: "Ohrid", area: null, propertyType: "APARTMENT" },
  images: [{ url: "/photo.jpg", alt: null }],
  video: null,
  pricingRule: {
    baseNightlyRate: 50,
    cleaningFee: 10,
    currency: "EUR",
    minNights: 3,
  },
  promotions: [],
  priceOverrides: [],
  nightlyRange: null,
};

const SEARCH =
  "city=Ohrid&checkIn=2029-06-09&checkOut=2029-06-16&guests=2&adults=2";

async function render(
  listing: Partial<typeof baseListing> & Record<string, unknown> = {},
  props: Record<string, unknown> = {},
) {
  const element = await PropertyCard({
    listing: { ...baseListing, ...listing } as never,
    searchQuery: SEARCH,
    ...props,
  } as never);
  return renderToStaticMarkup(element);
}

describe("a fixed-stay listing's card", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue(null);
    mocks.favorites.mockResolvedValue(new Set());
    mocks.propertyTypeLabel.mockResolvedValue("Apartment");
  });

  it("says only the host's whole stays can be booked", async () => {
    const html = await render({ bookingMode: "FIXED_STAYS" });
    expect(html).toContain("Fixed stays only");
  });

  it("never prints a minimum-night rule", async () => {
    const html = await render({
      bookingMode: "FIXED_STAYS",
      pricingRule: { ...baseListing.pricingRule, minNights: 7 },
    });
    expect(html).not.toContain("7-night min.");
    expect(html).not.toContain("night min.");
  });

  it("links to the stay a dated search matched, without the dates", async () => {
    const html = await render(
      {
        bookingMode: "FIXED_STAYS",
        matchedFixedStayPeriodId: "period-1",
      },
      { checkIn: "2029-06-09", checkOut: "2029-06-16", nightCount: 7 },
    );
    expect(html).toContain("fixedStayPeriodId=period-1");
    expect(html).not.toContain("checkIn=2029-06-09");
    expect(html).not.toContain("checkOut=2029-06-16");
    // Everything the search was otherwise about still travels.
    expect(html).toContain("city=Ohrid");
    expect(html).toContain("guests=2");
  });

  it("carries no stay id when the search matched none", async () => {
    const html = await render({ bookingMode: "FIXED_STAYS" });
    expect(html).not.toContain("fixedStayPeriodId");
  });

  it("shows the matched stay as an ordinary dated trip, with no price of its own", async () => {
    const html = await render(
      {
        bookingMode: "FIXED_STAYS",
        matchedFixedStayPeriodId: "period-1",
      },
      { checkIn: "2029-06-09", checkOut: "2029-06-16", nightCount: 7 },
    );
    // The dated card's own layout: the trip's dates, a nightly average and a total —
    // the same three a flexible dated card shows. (`LocalizedPrice` needs a currency
    // context this suite has none of, so the *figures* are asserted where they are
    // computed, against `computeStayQuote`, in `search-fixed-stays.service.test.ts`.)
    expect(html).toContain("Jun 9 – Jun 16");
    expect(html).toContain("per night");
    expect(html).toContain("total");
    expect(html.toLowerCase()).not.toContain("package");
  });

  it("does not grey out a matched stay shorter than the stored minimum", async () => {
    // The minimum is a flexible-calendar rule; the search already proved this bookable,
    // so the card must price it rather than fall back to a minimum-stay notice.
    const html = await render(
      {
        bookingMode: "FIXED_STAYS",
        matchedFixedStayPeriodId: "period-1",
        pricingRule: { ...baseListing.pricingRule, minNights: 30 },
      },
      { checkIn: "2029-06-09", checkOut: "2029-06-16", nightCount: 7 },
    );
    expect(html).toContain("Jun 9 – Jun 16");
    expect(html).toContain("total");
    expect(html).not.toContain("night min.");
  });
});

describe("a flexible listing's card is unchanged", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue(null);
    mocks.favorites.mockResolvedValue(new Set());
    mocks.propertyTypeLabel.mockResolvedValue("Apartment");
  });

  it("still prints its minimum-night rule", async () => {
    const html = await render({ bookingMode: "FLEXIBLE" });
    expect(html).toContain("3-night min.");
    expect(html).not.toContain("Fixed stays only");
  });

  it("still carries the search's dates on its link", async () => {
    const html = await render({ bookingMode: "FLEXIBLE" });
    expect(html).toContain("checkIn=2029-06-09");
    expect(html).toContain("checkOut=2029-06-16");
    expect(html).not.toContain("fixedStayPeriodId");
  });

  it("renders identically whether or not the mode is stated", async () => {
    // Every existing caller passes no `bookingMode` at all.
    expect(await render({ bookingMode: "FLEXIBLE" })).toBe(await render({}));
  });
});
