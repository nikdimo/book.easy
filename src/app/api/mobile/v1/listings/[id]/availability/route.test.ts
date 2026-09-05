import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listingFindFirst: vi.fn(),
  blockFindMany: vi.fn(),
  windowFindMany: vi.fn(),
  priceFindMany: vi.fn(),
  requireMobileHost: vi.fn(),
  verifyAvailabilityManager: vi.fn(),
  mutateAvailability: vi.fn(),
  removeManualBlock: vi.fn(),
  setDatePriceRange: vi.fn(),
  resetDatePriceRange: vi.fn(),
  saveDefaultPricing: vi.fn(),
  savePromotion: vi.fn(),
  removePromotion: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    listing: { findFirst: mocks.listingFindFirst },
    availabilityBlock: { findMany: mocks.blockFindMany },
    listingAvailabilityWindow: { findMany: mocks.windowFindMany },
    listingDatePrice: { findMany: mocks.priceFindMany },
  },
}));

vi.mock("@/lib/mobile-api", () => ({
  requireMobileHost: mocks.requireMobileHost,
  mobileJson: (_request: Request, body: unknown, init?: ResponseInit) =>
    Response.json(body, init),
  mobileOptions: vi.fn(),
}));

vi.mock("@/lib/actions/availability.actions", () => ({
  removeListingDatePriceRange: vi.fn(),
  upsertListingDatePriceRange: vi.fn(),
}));

vi.mock("@/lib/actions/calendar.actions", () => ({
  removeCalendarPromotion: vi.fn(),
  saveCalendarDefaultPricing: vi.fn(),
  saveCalendarPromotion: vi.fn(),
}));

vi.mock("@/lib/services/availability-mutation.service", () => ({
  verifyAvailabilityManager: mocks.verifyAvailabilityManager,
  mutateAvailabilityForManagedListing: mocks.mutateAvailability,
  removeManualBlockForManagedListing: mocks.removeManualBlock,
  setDatePriceRangeForManagedListing: mocks.setDatePriceRange,
  resetDatePriceRangeForManagedListing: mocks.resetDatePriceRange,
}));

vi.mock("@/lib/services/pricing-promotion-mutation.service", () => ({
  saveDefaultPricingForManagedListing: mocks.saveDefaultPricing,
  savePromotionForManagedListing: mocks.savePromotion,
  removePromotionForManagedListing: mocks.removePromotion,
}));

import { GET, POST } from "@/app/api/mobile/v1/listings/[id]/availability/route";

const context = { params: Promise.resolve({ id: "listing-1" }) };

describe("mobile availability API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireMobileHost.mockResolvedValue({
      user: { id: "host-1", role: "HOST", isHost: true },
    });
    mocks.listingFindFirst.mockResolvedValue({
      id: "listing-1",
      slug: "lake-house",
      title: "Lake house",
      status: "APPROVED",
      availabilityMode: "CLOSED",
      pricingRule: {
        baseNightlyRate: 100,
        cleaningFee: 20,
        minNights: 2,
        maxNights: 30,
        currency: "EUR",
      },
      promotions: [],
    });
    mocks.blockFindMany.mockResolvedValue([]);
    mocks.windowFindMany.mockResolvedValue([
      {
        id: "window-1",
        startDate: new Date("2026-09-10T00:00:00.000Z"),
        endDate: new Date("2026-09-13T00:00:00.000Z"),
      },
    ]);
    mocks.priceFindMany.mockResolvedValue([]);
    mocks.verifyAvailabilityManager.mockResolvedValue({
      id: "listing-1",
      slug: "lake-house",
      availabilityMode: "CLOSED",
    });
    mocks.mutateAvailability.mockResolvedValue({ success: true });
    mocks.setDatePriceRange.mockResolvedValue({ success: true });
    mocks.resetDatePriceRange.mockResolvedValue({ success: true });
    mocks.saveDefaultPricing.mockResolvedValue({ success: "Pricing saved." });
    mocks.savePromotion.mockResolvedValue({ success: "Promotion created." });
    mocks.removePromotion.mockResolvedValue({ success: "Promotion removed." });
  });

  it("returns the listing mode and explicit open windows", async () => {
    const response = await GET(
      new Request("http://localhost/api/mobile/v1/listings/listing-1/availability"),
      context,
    );
    if (!response) throw new Error("Expected a response");
    const body = await response.json();

    expect(body.listing.availabilityMode).toBe("CLOSED");
    expect(body.availabilityWindows).toEqual([
      {
        id: "window-1",
        startDate: "2026-09-10T00:00:00.000Z",
        endDate: "2026-09-13T00:00:00.000Z",
      },
    ]);
  });

  it.each([
    ["OPEN", "makeAvailable", "OPEN_RANGE"],
    ["CLOSED", "makeAvailable", "OPEN_RANGE"],
    ["OPEN", "block", "BLOCK_RANGE"],
    ["CLOSED", "block", "BLOCK_RANGE"],
    ["OPEN", "makeAllFutureAvailable", "OPEN_FUTURE"],
    ["CLOSED", "makeAllFutureAvailable", "OPEN_FUTURE"],
    ["OPEN", "blockAllFuture", "BLOCK_FUTURE"],
    ["CLOSED", "blockAllFuture", "BLOCK_FUTURE"],
  ] as const)(
    "authorizes bearer host and dispatches %s %s through the internal service",
    async (availabilityMode, action, operation) => {
      const listing = { id: "listing-1", slug: "lake-house", availabilityMode };
      mocks.verifyAvailabilityManager.mockResolvedValue(listing);
      const response = await post({
        action,
        startDate: "2026-09-10",
        endDate: "2026-09-13",
      });

      expect(response.status).toBe(200);
      expect(mocks.verifyAvailabilityManager).toHaveBeenCalledWith(
        { id: "host-1", role: "HOST" },
        "listing-1",
      );
      if (operation.endsWith("RANGE")) {
        expect(mocks.mutateAvailability).toHaveBeenCalledWith(
          listing,
          operation,
          expect.objectContaining({
            startDate: "2026-09-10",
            endDate: "2026-09-13",
          }),
        );
      } else {
        expect(mocks.mutateAvailability).toHaveBeenCalledWith(listing, operation);
      }
    },
  );

  it("returns the bearer authentication failure without attempting a mutation", async () => {
    mocks.requireMobileHost.mockResolvedValue({
      response: Response.json({ error: "Authentication required" }, { status: 401 }),
    });
    const response = await post({ action: "makeAvailable" });

    expect(response.status).toBe(401);
    expect(mocks.verifyAvailabilityManager).not.toHaveBeenCalled();
    expect(mocks.mutateAvailability).not.toHaveBeenCalled();
    expect(mocks.setDatePriceRange).not.toHaveBeenCalled();
    expect(mocks.saveDefaultPricing).not.toHaveBeenCalled();
    expect(mocks.savePromotion).not.toHaveBeenCalled();
  });

  it("does not mutate a listing the bearer host does not manage", async () => {
    mocks.verifyAvailabilityManager.mockResolvedValue(null);
    const response = await post({ action: "makeAvailable" });

    expect(response.status).toBe(404);
    expect(mocks.mutateAvailability).not.toHaveBeenCalled();
    expect(mocks.setDatePriceRange).not.toHaveBeenCalled();
    expect(mocks.saveDefaultPricing).not.toHaveBeenCalled();
    expect(mocks.savePromotion).not.toHaveBeenCalled();
  });

  it("dispatches bearer-authenticated date and default pricing mutations", async () => {
    const listing = await mocks.verifyAvailabilityManager();
    expect((await post({
      action: "setPrice",
      startDate: "2026-09-10",
      endDate: "2026-09-13",
      nightlyRate: 145,
    })).status).toBe(200);
    expect(mocks.setDatePriceRange).toHaveBeenCalledWith(listing, {
      startDate: "2026-09-10",
      endDate: "2026-09-13",
      nightlyRate: 145,
    });

    expect((await post({
      action: "resetPrice",
      startDate: "2026-09-10",
      endDate: "2026-09-13",
    })).status).toBe(200);
    expect(mocks.resetDatePriceRange).toHaveBeenCalledWith(listing, {
      startDate: "2026-09-10",
      endDate: "2026-09-13",
    });

    // A `minNights` in the body is ignored rather than forwarded: an older build of
    // the app still sends one, and a price save must never write a stay rule the host
    // set under Availability → Booking rules.
    expect((await post({
      action: "saveDefaultPricing",
      baseNightlyRate: 120,
      cleaningFee: 25,
      minNights: 2,
    })).status).toBe(200);
    expect(mocks.saveDefaultPricing).toHaveBeenCalledWith(listing, "host-1", {
      baseNightlyRate: 120,
      cleaningFee: 25,
    });
  });

  it("dispatches bearer-authenticated promotion save/removal and returns validation errors", async () => {
    const listing = await mocks.verifyAvailabilityManager();
    expect((await post({
      action: "savePromotion",
      discountPercent: 20,
      minimumNights: 2,
      freeCleaning: false,
      roundToWholeUnit: true,
    })).status).toBe(200);
    expect(mocks.savePromotion).toHaveBeenCalledWith(
      listing,
      "host-1",
      expect.objectContaining({ discountPercent: 20, minimumNights: 2 }),
    );

    expect((await post({
      action: "removePromotion",
      promotionId: "promotion-1",
    })).status).toBe(200);
    expect(mocks.removePromotion).toHaveBeenCalledWith(
      listing,
      "host-1",
      "promotion-1",
    );

    mocks.savePromotion.mockResolvedValueOnce({ error: "Invalid promotion." });
    expect((await post({ action: "savePromotion" })).status).toBe(400);
  });
});

async function post(body: Record<string, unknown>) {
  const response = await POST(
    new Request("http://localhost/api/mobile/v1/listings/listing-1/availability", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer token" },
      body: JSON.stringify(body),
    }),
    context,
  );
  if (!response) throw new Error("Expected a response");
  return response;
}
