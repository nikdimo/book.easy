import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  listingFindFirst: vi.fn(),
  savePromotion: vi.fn(),
  removePromotion: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/db", () => ({
  db: { listing: { findFirst: mocks.listingFindFirst } },
}));
vi.mock("@/lib/services/pricing-promotion-mutation.service", () => ({
  savePromotionForManagedListing: mocks.savePromotion,
  removePromotionForManagedListing: mocks.removePromotion,
  disableAllPromotionsForManagedListing: vi.fn(),
}));

import {
  disableListingPromotion,
  upsertListingPromotion,
} from "@/lib/actions/promotion.actions";

const input = {
  discountPercent: 20,
  minimumNights: 2,
  freeCleaning: false,
  roundToWholeUnit: true,
};

describe("promotion web action wrappers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ user: { id: "host-1", isHost: true } });
    mocks.listingFindFirst.mockResolvedValue({
      id: "listing-1",
      slug: "lake-house",
      availabilityMode: "OPEN",
    });
    mocks.savePromotion.mockResolvedValue({ success: "Promotion created." });
    mocks.removePromotion.mockResolvedValue({ success: "Promotion removed." });
  });

  it("authenticates and scopes ownership before entering promotion cores", async () => {
    await upsertListingPromotion("listing-1", input);
    await disableListingPromotion("listing-1", "promotion-1");
    expect(mocks.auth).toHaveBeenCalledTimes(2);
    expect(mocks.listingFindFirst).toHaveBeenCalledWith({
      where: { id: "listing-1", hostId: "host-1" },
      select: { id: true, slug: true, availabilityMode: true },
    });
    expect(mocks.savePromotion).toHaveBeenCalledWith(
      { id: "listing-1", slug: "lake-house", availabilityMode: "OPEN" },
      "host-1",
      input,
    );
    expect(mocks.removePromotion).toHaveBeenCalledWith(
      { id: "listing-1", slug: "lake-house", availabilityMode: "OPEN" },
      "host-1",
      "promotion-1",
    );
  });

  it("never calls internal cores for unauthenticated or not-owned listings", async () => {
    mocks.auth.mockResolvedValue(null);
    expect(await upsertListingPromotion("listing-1", input)).toEqual({
      error: "Not authorized.",
    });
    mocks.auth.mockResolvedValue({ user: { id: "host-1", isHost: true } });
    mocks.listingFindFirst.mockResolvedValue(null);
    expect(await disableListingPromotion("listing-1", "promotion-1")).toEqual({
      error: "Listing not found.",
    });
    expect(mocks.savePromotion).not.toHaveBeenCalled();
    expect(mocks.removePromotion).not.toHaveBeenCalled();
  });
});
