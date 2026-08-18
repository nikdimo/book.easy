import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  listingFindFirst: vi.fn(),
  saveDefaultPricing: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/db", () => ({
  db: { listing: { findFirst: mocks.listingFindFirst } },
}));
vi.mock("@/lib/services/pricing-promotion-mutation.service", () => ({
  saveDefaultPricingForManagedListing: mocks.saveDefaultPricing,
}));

import { saveListingPricing } from "@/lib/actions/pricing.actions";

function pricingForm() {
  const formData = new FormData();
  formData.set("baseNightlyRate", "120");
  formData.set("cleaningFee", "35");
  formData.set("minNights", "2");
  return formData;
}

describe("saveListingPricing web wrapper", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ user: { id: "host-1", isHost: true } });
    mocks.listingFindFirst.mockResolvedValue({
      id: "listing-1",
      slug: "lake-house",
      availabilityMode: "OPEN",
    });
    mocks.saveDefaultPricing.mockResolvedValue({ success: "Pricing saved." });
  });

  it("authenticates, scopes ownership, and delegates to the canonical core", async () => {
    await expect(
      saveListingPricing("listing-1", {}, pricingForm()),
    ).resolves.toEqual({ success: "Pricing saved." });
    expect(mocks.listingFindFirst).toHaveBeenCalledWith({
      where: { id: "listing-1", hostId: "host-1" },
      select: { id: true, slug: true, availabilityMode: true },
    });
    expect(mocks.saveDefaultPricing).toHaveBeenCalledWith(
      { id: "listing-1", slug: "lake-house", availabilityMode: "OPEN" },
      "host-1",
      { baseNightlyRate: 120, cleaningFee: 35, minNights: 2 },
    );
  });

  it("does not expose the core to unauthenticated or non-owner callers", async () => {
    mocks.auth.mockResolvedValue(null);
    await expect(saveListingPricing("listing-1", {}, pricingForm())).resolves.toEqual({
      error: "Not authorized.",
    });
    mocks.auth.mockResolvedValue({ user: { id: "host-1", isHost: true } });
    mocks.listingFindFirst.mockResolvedValue(null);
    await expect(saveListingPricing("listing-1", {}, pricingForm())).resolves.toEqual({
      error: "Listing not found.",
    });
    expect(mocks.saveDefaultPricing).not.toHaveBeenCalled();
  });
});
