import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  listingFindFirst: vi.fn(),
  listingUpdate: vi.fn(),
  propertyUpdate: vi.fn(),
  pricingRuleUpdate: vi.fn(),
  amenityDeleteMany: vi.fn(),
  amenityCreateMany: vi.fn(),
  imageFindMany: vi.fn(),
  imageDeleteMany: vi.fn(),
  imageCreateMany: vi.fn(),
  getExchangeRates: vi.fn(),
  revalidatePath: vi.fn(),
  revalidatePublicListingCaches: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/db", () => ({
  db: {
    listing: {
      findFirst: mocks.listingFindFirst,
      update: mocks.listingUpdate,
    },
    property: { update: mocks.propertyUpdate },
    pricingRule: { update: mocks.pricingRuleUpdate },
    listingAmenity: {
      deleteMany: mocks.amenityDeleteMany,
      createMany: mocks.amenityCreateMany,
    },
    listingImage: {
      findMany: mocks.imageFindMany,
      deleteMany: mocks.imageDeleteMany,
      createMany: mocks.imageCreateMany,
    },
  },
}));
vi.mock("@/lib/currency/rates", () => ({
  getExchangeRates: mocks.getExchangeRates,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/utils/revalidate-public-listing-caches", () => ({
  revalidatePublicListingCaches: mocks.revalidatePublicListingCaches,
}));

import { updateListing } from "@/lib/actions/listing.actions";

function validDetailForm() {
  const formData = new FormData();
  const fields: Record<string, string> = {
    title: "Updated seaside apartment",
    description: "A comfortable apartment with enough detail for guests.",
    propertyType: "APARTMENT",
    address: "1 Harbor Street",
    city: "Copenhagen",
    country: "Denmark",
    latitude: "55.6761",
    longitude: "12.5683",
    locationSource: "MANUAL",
    locationConfirmed: "true",
    maxGuests: "4",
    bedrooms: "2",
    bathrooms: "1",
    beds: "2",
    currency: "EUR",
  };
  for (const [key, value] of Object.entries(fields)) formData.set(key, value);
  return formData;
}

describe("updateListing pricing ownership", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ user: { id: "host-1", isHost: true } });
    mocks.listingFindFirst.mockResolvedValue({
      id: "listing-1",
      propertyId: "property-1",
      status: "APPROVED",
      property: {},
      pricingRule: {
        currency: "EUR",
        baseNightlyRate: 240,
        cleaningFee: 45,
        minNights: 3,
      },
    });
    mocks.getExchangeRates.mockResolvedValue({ rates: {} });
    mocks.propertyUpdate.mockResolvedValue({});
    mocks.listingUpdate.mockResolvedValue({});
    mocks.pricingRuleUpdate.mockResolvedValue({});
    mocks.amenityDeleteMany.mockResolvedValue({ count: 0 });
    mocks.amenityCreateMany.mockResolvedValue({ count: 0 });
    mocks.imageFindMany.mockResolvedValue([]);
    mocks.imageDeleteMany.mockResolvedValue({ count: 0 });
    mocks.imageCreateMany.mockResolvedValue({ count: 0 });
  });

  it("accepts a detail edit with no standard-pricing fields", async () => {
    await expect(updateListing("listing-1", validDetailForm())).resolves.toEqual({
      success: true,
    });

    expect(mocks.pricingRuleUpdate).toHaveBeenCalledWith({
      where: { listingId: "listing-1" },
      data: { currency: "EUR" },
    });
  });

  it("ignores stale standard-pricing values submitted by an older editor", async () => {
    const formData = validDetailForm();
    formData.set("baseNightlyRate", "80");
    formData.set("cleaningFee", "0");
    formData.set("minNights", "1");

    await expect(updateListing("listing-1", formData)).resolves.toEqual({
      success: true,
    });

    expect(mocks.pricingRuleUpdate).toHaveBeenCalledWith({
      where: { listingId: "listing-1" },
      data: { currency: "EUR" },
    });
  });
});
