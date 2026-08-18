import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  pricingRuleFindUnique: vi.fn(),
  pricingRuleUpdate: vi.fn(),
  promotionUpdateMany: vi.fn(),
  listingFindUnique: vi.fn(),
  promotionCreate: vi.fn(),
  promotionUpdate: vi.fn(),
  transaction: vi.fn(),
  audit: vi.fn(),
  revalidatePath: vi.fn(),
  revalidatePublic: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    pricingRule: { findUnique: mocks.pricingRuleFindUnique },
    listing: { findUnique: mocks.listingFindUnique },
    listingPromotion: {
      create: mocks.promotionCreate,
      update: mocks.promotionUpdate,
      updateMany: mocks.promotionUpdateMany,
    },
    $transaction: mocks.transaction,
  },
}));
vi.mock("@/lib/services/audit.service", () => ({ createAuditLog: mocks.audit }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/utils/revalidate-public-listing-caches", () => ({
  revalidatePublicListingCaches: mocks.revalidatePublic,
}));

import {
  removePromotionForManagedListing,
  saveDefaultPricingForManagedListing,
  savePromotionForManagedListing,
} from "@/lib/services/pricing-promotion-mutation.service";

const listing = {
  id: "listing-1",
  slug: "lake-house",
  availabilityMode: "OPEN" as const,
};

describe("pricing and promotion mutation service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.pricingRuleFindUnique.mockResolvedValue({ id: "pricing-1", maxNights: 30 });
    mocks.pricingRuleUpdate.mockResolvedValue({});
    mocks.promotionUpdateMany.mockResolvedValue({ count: 0 });
    mocks.transaction.mockImplementation(async (run) =>
      run({
        pricingRule: { update: mocks.pricingRuleUpdate },
        listingPromotion: { updateMany: mocks.promotionUpdateMany },
      }),
    );
    mocks.audit.mockResolvedValue({});
    mocks.listingFindUnique.mockResolvedValue({
      id: "listing-1",
      status: "APPROVED",
      pricingRule: {
        cleaningFee: 25,
        minNights: 1,
        maxNights: 30,
      },
      promotions: [],
    });
    mocks.promotionCreate.mockResolvedValue({
      id: "promotion-1",
      discountPercent: 20,
      minimumNights: 2,
      freeCleaning: false,
      roundToWholeUnit: true,
      startDate: null,
      endDate: null,
    });
  });

  it("rejects invalid pricing before writing", async () => {
    await expect(
      saveDefaultPricingForManagedListing(listing, "host-1", {
        baseNightlyRate: 0,
        cleaningFee: -1,
        minNights: 0,
      }),
    ).resolves.toEqual({ error: "Nightly rate must be at least 1." });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("saves valid pricing and removes impossible free-cleaning benefits atomically", async () => {
    mocks.promotionUpdateMany.mockResolvedValue({ count: 2 });
    await expect(
      saveDefaultPricingForManagedListing(listing, "host-1", {
        baseNightlyRate: 120,
        cleaningFee: 0,
        minNights: 2,
      }),
    ).resolves.toEqual({
      success:
        "Pricing saved. Free-cleaning benefits were removed from active promotions.",
    });
    expect(mocks.pricingRuleUpdate).toHaveBeenCalledWith({
      where: { id: "pricing-1" },
      data: { baseNightlyRate: 120, cleaningFee: 0, minNights: 2 },
    });
    expect(mocks.promotionUpdateMany).toHaveBeenCalledWith({
      where: {
        listingId: "listing-1",
        disabledAt: null,
        freeCleaning: true,
      },
      data: { freeCleaning: false },
    });
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "host-1", action: "listing.pricing_updated" }),
    );
  });

  it("rejects invalid and overlapping promotions without writing", async () => {
    await expect(
      savePromotionForManagedListing(listing, "host-1", {
        discountPercent: 51,
        minimumNights: 2,
        freeCleaning: false,
        roundToWholeUnit: true,
      }),
    ).resolves.toEqual(expect.objectContaining({ error: expect.any(String) }));
    expect(mocks.promotionCreate).not.toHaveBeenCalled();

    mocks.listingFindUnique.mockResolvedValue({
      id: "listing-1",
      status: "APPROVED",
      pricingRule: { cleaningFee: 25, minNights: 1, maxNights: 30 },
      promotions: [
        {
          id: "existing",
          minimumNights: 2,
          startDate: new Date("2026-09-01T00:00:00.000Z"),
          endDate: new Date("2026-09-20T00:00:00.000Z"),
        },
      ],
    });
    await expect(
      savePromotionForManagedListing(listing, "host-1", {
        discountPercent: 20,
        minimumNights: 2,
        freeCleaning: false,
        roundToWholeUnit: true,
        startDate: "2026-09-10",
        endDate: "2026-09-25",
      }),
    ).resolves.toEqual({
      error:
        "Another promotion already uses this minimum stay for an overlapping date scope.",
    });
    expect(mocks.promotionCreate).not.toHaveBeenCalled();
  });

  it("creates and removes valid promotions with actor audit attribution", async () => {
    await expect(
      savePromotionForManagedListing(listing, "host-1", {
        discountPercent: 20,
        minimumNights: 2,
        freeCleaning: false,
        roundToWholeUnit: true,
      }),
    ).resolves.toEqual({ success: "Promotion created." });
    expect(mocks.promotionCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        listingId: "listing-1",
        discountPercent: 20,
        minimumNights: 2,
        roundToWholeUnit: true,
      }),
    });

    mocks.listingFindUnique.mockResolvedValue({
      id: "listing-1",
      status: "APPROVED",
      pricingRule: { cleaningFee: 25, minNights: 1, maxNights: 30 },
      promotions: [{ id: "promotion-1" }],
    });
    mocks.promotionUpdate.mockResolvedValue({});
    await expect(
      removePromotionForManagedListing(listing, "host-1", "promotion-1"),
    ).resolves.toEqual({ success: "Promotion removed." });
    expect(mocks.promotionUpdate).toHaveBeenCalledWith({
      where: { id: "promotion-1", listingId: "listing-1" },
      data: { disabledAt: expect.any(Date) },
    });
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "host-1", action: "listing.promotion_disabled" }),
    );
  });
});
