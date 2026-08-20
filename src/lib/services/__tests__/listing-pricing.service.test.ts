import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listingFindFirst: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: { listing: { findFirst: mocks.listingFindFirst } },
}));

import { getListingPricingSummary } from "@/lib/services/listing-pricing.service";

function utcDate(ymd: string): Date {
  return new Date(`${ymd}T00:00:00.000Z`);
}

describe("getListingPricingSummary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("scopes the query to the host, so another host's listing is not found", async () => {
    mocks.listingFindFirst.mockResolvedValue(null);

    const summary = await getListingPricingSummary("listing-1", "not-the-owner");

    expect(summary).toBeNull();
    expect(mocks.listingFindFirst).toHaveBeenCalledTimes(1);
    expect(mocks.listingFindFirst.mock.calls[0][0].where).toEqual({
      id: "listing-1",
      hostId: "not-the-owner",
    });
  });

  it("reads the current rule, live offers and date prices", async () => {
    mocks.listingFindFirst.mockResolvedValue({
      id: "listing-1",
      pricingRule: {
        currency: "MKD",
        baseNightlyRate: "4500.000",
        cleaningFee: "500.000",
        minNights: 2,
        maxNights: 28,
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
        },
      ],
      datePrices: [{ date: utcDate("2026-06-20") }, { date: utcDate("2026-06-21") }],
    });

    const summary = await getListingPricingSummary("listing-1", "host-1");

    expect(summary?.rule).toEqual({
      currency: "MKD",
      baseNightlyRate: 4500,
      cleaningFee: 500,
      minNights: 2,
      maxNights: 28,
    });
    expect(summary?.promotions).toHaveLength(1);
    expect(summary?.activePromotionCount).toBe(1);
    expect(summary?.datePriceCount).toBe(2);
    expect(summary?.datePriceRange).toEqual({ from: "2026-06-20", to: "2026-06-21" });
  });

  it("only asks for offers the host has not disabled", async () => {
    mocks.listingFindFirst.mockResolvedValue({
      id: "listing-1",
      pricingRule: null,
      promotions: [],
      datePrices: [],
    });

    await getListingPricingSummary("listing-1", "host-1");

    const select = mocks.listingFindFirst.mock.calls[0][0].select;
    expect(select.promotions.where).toEqual({ disabledAt: null });
  });

  it("returns a summary for a listing that has no pricing rule yet", async () => {
    mocks.listingFindFirst.mockResolvedValue({
      id: "listing-1",
      pricingRule: null,
      promotions: [],
      datePrices: [],
    });

    const summary = await getListingPricingSummary("listing-1", "host-1");

    expect(summary).not.toBeNull();
    expect(summary?.rule).toBeNull();
    expect(summary?.datePriceRange).toBeNull();
  });
});
