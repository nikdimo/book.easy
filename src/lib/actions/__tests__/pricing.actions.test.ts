import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  listingFindFirst: vi.fn(),
  pricingRuleUpdate: vi.fn(),
  promotionUpdateMany: vi.fn(),
  transaction: vi.fn(),
  createAuditLog: vi.fn(),
  revalidatePath: vi.fn(),
  revalidatePublicListingCaches: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/db", () => ({
  db: {
    listing: { findFirst: mocks.listingFindFirst },
    $transaction: mocks.transaction,
  },
}));
vi.mock("@/lib/services/audit.service", () => ({
  createAuditLog: mocks.createAuditLog,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/utils/revalidate-public-listing-caches", () => ({
  revalidatePublicListingCaches: mocks.revalidatePublicListingCaches,
}));

import { saveListingPricing } from "@/lib/actions/pricing.actions";

function pricingForm(cleaningFee: number) {
  const formData = new FormData();
  formData.set("baseNightlyRate", "120");
  formData.set("cleaningFee", String(cleaningFee));
  formData.set("minNights", "2");
  return formData;
}

describe("saveListingPricing promotion integrity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ user: { id: "host-1", isHost: true } });
    mocks.listingFindFirst.mockResolvedValue({
      id: "listing-1",
      slug: "seaside-home",
      pricingRule: { id: "pricing-1", maxNights: 30 },
    });
    mocks.pricingRuleUpdate.mockResolvedValue({});
    mocks.promotionUpdateMany.mockResolvedValue({ count: 2 });
    mocks.transaction.mockImplementation(async (callback) =>
      callback({
        pricingRule: { update: mocks.pricingRuleUpdate },
        listingPromotion: { updateMany: mocks.promotionUpdateMany },
      }),
    );
    mocks.createAuditLog.mockResolvedValue({});
  });

  it("atomically removes free cleaning from active promotions when the cleaning fee becomes zero", async () => {
    await expect(
      saveListingPricing("listing-1", {}, pricingForm(0)),
    ).resolves.toEqual({
      success:
        "Pricing saved. Free-cleaning benefits were removed from active promotions.",
    });

    expect(mocks.transaction).toHaveBeenCalledOnce();
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
  });

  it("does not alter promotions when saving a nonzero cleaning fee", async () => {
    await expect(
      saveListingPricing("listing-1", {}, pricingForm(35)),
    ).resolves.toEqual({ success: "Pricing saved." });

    expect(mocks.transaction).toHaveBeenCalledOnce();
    expect(mocks.pricingRuleUpdate).toHaveBeenCalledWith({
      where: { id: "pricing-1" },
      data: { baseNightlyRate: 120, cleaningFee: 35, minNights: 2 },
    });
    expect(mocks.promotionUpdateMany).not.toHaveBeenCalled();
  });
});
