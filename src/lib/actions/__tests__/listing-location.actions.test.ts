import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireHost: vi.fn(),
  listingFindFirst: vi.fn(),
  listingUpdateMany: vi.fn(),
  propertyUpdate: vi.fn(),
  revalidatePath: vi.fn(),
  revalidatePublicListingCaches: vi.fn(),
}));

vi.mock("@/lib/auth-helpers", () => ({ requireHost: mocks.requireHost }));
vi.mock("@/lib/db", () => ({
  db: {
    listing: { findFirst: mocks.listingFindFirst, updateMany: mocks.listingUpdateMany },
    property: { update: mocks.propertyUpdate },
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/utils/revalidate-public-listing-caches", () => ({
  revalidatePublicListingCaches: mocks.revalidatePublicListingCaches,
}));

import { updateListingLocation } from "@/lib/actions/listing-location.actions";
import type { ListingLocationInput } from "@/lib/host/v2/listing-location";

const PROPERTY = {
  address: "Partizanski odredi 15",
  city: "Skopje",
  area: "Centar",
  postalCode: "1000",
  country: "North Macedonia",
  latitude: 41.9981,
  longitude: 21.4254,
  locationSource: "AUTOCOMPLETE",
  geocodingProvider: "GOOGLE_PLACES",
  geocodingPlaceId: "place-1",
  streetViewHeading: 120,
  streetViewPitch: 5,
  streetViewPanoId: "pano-1",
};

function listing(overrides: Record<string, unknown> = {}) {
  const status = typeof overrides.status === "string" ? overrides.status : "DRAFT";
  const { property, ...rest } = overrides as {
    property?: Record<string, unknown>;
  };
  return {
    id: "listing-1",
    slug: "seaside-apartment",
    status,
    propertyId: "property-1",
    property: {
      ...PROPERTY,
      ownerId: "host-1",
      listings: [{ id: "listing-1", slug: "seaside-apartment", status }],
      ...property,
    },
    ...rest,
  };
}

function input(overrides: Partial<ListingLocationInput> = {}): ListingLocationInput {
  return {
    address: PROPERTY.address,
    city: PROPERTY.city,
    area: PROPERTY.area,
    postalCode: PROPERTY.postalCode,
    country: PROPERTY.country,
    pin: null,
    streetView: { heading: 120, pitch: 5, panoId: "pano-1" },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireHost.mockResolvedValue({ id: "host-1", isHost: true });
  mocks.listingFindFirst.mockResolvedValue(listing());
  mocks.propertyUpdate.mockResolvedValue({});
  mocks.listingUpdateMany.mockResolvedValue({ count: 0 });
});

describe("updateListingLocation ownership", () => {
  it("scopes the read to the signed-in host", async () => {
    await updateListingLocation("listing-1", input({ city: "Ohrid" }));

    expect(mocks.listingFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "listing-1", hostId: "host-1" } }),
    );
  });

  it("refuses a listing this host does not own, without writing", async () => {
    mocks.listingFindFirst.mockResolvedValue(null);

    const result = await updateListingLocation("someone-elses", input());

    expect(result).toEqual({ error: "Listing not found." });
    expect(mocks.propertyUpdate).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("rejects an unauthenticated caller before anything is read", async () => {
    mocks.requireHost.mockRejectedValue(new Error("Host access required"));

    await expect(updateListingLocation("listing-1", input())).rejects.toThrow(
      "Host access required",
    );
    expect(mocks.listingFindFirst).not.toHaveBeenCalled();
  });
});

describe("updateListingLocation validation", () => {
  it("refuses a half-filled address without writing", async () => {
    const result = await updateListingLocation(
      "listing-1",
      input({ address: "", city: "" }),
    );

    expect(result).toEqual({ issues: { address: "EMPTY", city: "EMPTY" } });
    expect(mocks.propertyUpdate).not.toHaveBeenCalled();
  });

  it("refuses a save that would leave the listing with no pin", async () => {
    mocks.listingFindFirst.mockResolvedValue(
      listing({ property: { latitude: null, longitude: null } }),
    );

    const result = await updateListingLocation("listing-1", input());

    expect(result.issues).toEqual({ pin: "NO_PIN" });
    expect(mocks.propertyUpdate).not.toHaveBeenCalled();
  });
});

describe("updateListingLocation coordinates", () => {
  it("leaves the pin and its geocoding identity alone when only the address changed", async () => {
    await updateListingLocation(
      "listing-1",
      input({ address: "Partizanski odredi 15/3" }),
    );

    expect(mocks.propertyUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "property-1" } }),
    );
    const data = mocks.propertyUpdate.mock.calls[0][0].data;
    expect(data.address).toBe("Partizanski odredi 15/3");
    expect(data.latitude).toBe(41.9981);
    expect(data.longitude).toBe(21.4254);
    expect(data.locationSource).toBe("AUTOCOMPLETE");
    expect(data.geocodingPlaceId).toBe("place-1");
    expect(data.streetViewPanoId).toBe("pano-1");
  });

  it("writes a pin the host actually placed, and drops the old Street View angle", async () => {
    await updateListingLocation(
      "listing-1",
      input({
        address: "Nikola Vapcarov 3",
        city: "Ohrid",
        pin: {
          latitude: 41.1231,
          longitude: 20.8016,
          source: "MANUAL_PIN",
          provider: "GEOAPIFY",
          placeId: "place-2",
        },
      }),
    );

    const data = mocks.propertyUpdate.mock.calls[0][0].data;
    expect(data.latitude).toBe(41.1231);
    expect(data.longitude).toBe(20.8016);
    expect(data.locationSource).toBe("MANUAL_PIN");
    expect(data.geocodingProvider).toBe("GEOAPIFY");
    expect(data.streetViewPanoId).toBeNull();
    expect(data.streetViewHeading).toBeNull();
  });

  it("stores an empty optional line as null rather than blank text", async () => {
    await updateListingLocation("listing-1", input({ area: "", postalCode: "" }));

    const data = mocks.propertyUpdate.mock.calls[0][0].data;
    expect(data.area).toBeNull();
    expect(data.postalCode).toBeNull();
  });

  it("does not write, or revalidate, when nothing actually changed", async () => {
    const result = await updateListingLocation("listing-1", input());

    expect(mocks.propertyUpdate).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
    expect(result.complete).toBe(true);
    expect(result.stored?.latitude).toBe(41.9981);
  });
});

describe("updateListingLocation moderation and caches", () => {
  it("keeps a private-only correction out of the review queue and off the public caches", async () => {
    mocks.listingFindFirst.mockResolvedValue(listing({ status: "APPROVED" }));

    await updateListingLocation(
      "listing-1",
      input({ address: "Partizanski odredi 15/3", postalCode: "1001" }),
    );

    expect(mocks.listingUpdateMany).not.toHaveBeenCalled();
    expect(mocks.revalidatePublicListingCaches).not.toHaveBeenCalled();
    const paths = mocks.revalidatePath.mock.calls.map(([path]) => path);
    expect(paths).not.toContain("/properties/seaside-apartment");
    expect(paths).toContain("/host/listings/listing-1/location");
  });

  it("flags a live listing for re-review when the public line changes", async () => {
    mocks.listingFindFirst.mockResolvedValue(listing({ status: "APPROVED" }));

    await updateListingLocation("listing-1", input({ city: "Ohrid" }));

    expect(mocks.listingUpdateMany).toHaveBeenCalledWith({
      where: { id: { in: ["listing-1"] } },
      data: { needsReview: true },
    });
    const paths = mocks.revalidatePath.mock.calls.map(([path]) => path);
    expect(paths).toContain("/properties/seaside-apartment");
    expect(mocks.revalidatePublicListingCaches).toHaveBeenCalled();
  });

  it("leaves a draft out of the review queue even for a public change", async () => {
    await updateListingLocation("listing-1", input({ city: "Ohrid" }));

    expect(mocks.listingUpdateMany).not.toHaveBeenCalled();
    expect(mocks.revalidatePublicListingCaches).not.toHaveBeenCalled();
  });

  it("reports what the property holds after the write", async () => {
    const result = await updateListingLocation(
      "listing-1",
      input({ city: "Ohrid" }),
    );

    expect(result.error).toBeUndefined();
    expect(result.issues).toBeUndefined();
    expect(result.stored?.city).toBe("Ohrid");
    expect(result.complete).toBe(true);
  });

  it("revalidates and re-flags every live listing backed by the shared property", async () => {
    mocks.listingFindFirst.mockResolvedValue(
      listing({
        status: "APPROVED",
        property: {
          listings: [
            { id: "listing-1", slug: "seaside-apartment", status: "APPROVED" },
            { id: "listing-2", slug: "seaside-room", status: "APPROVED" },
          ],
        },
      }),
    );

    await updateListingLocation("listing-1", input({ city: "Ohrid" }));

    expect(mocks.listingUpdateMany).toHaveBeenCalledWith({
      where: { id: { in: ["listing-1", "listing-2"] } },
      data: { needsReview: true },
    });
    const paths = mocks.revalidatePath.mock.calls.map(([path]) => path);
    expect(paths).toContain("/properties/seaside-apartment");
    expect(paths).toContain("/properties/seaside-room");
    expect(paths).toContain("/host/listings/listing-2/location");
    expect(mocks.revalidatePublicListingCaches).toHaveBeenCalledTimes(1);
  });
});
