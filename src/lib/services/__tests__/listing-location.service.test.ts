import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ listingFindFirst: vi.fn() }));

vi.mock("@/lib/db", () => ({
  db: { listing: { findFirst: mocks.listingFindFirst } },
}));

import { getListingLocationEditorData } from "@/lib/services/listing-location.service";

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: "listing-1",
    slug: "seaside-apartment",
    status: "APPROVED",
    property: {
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
      ...overrides,
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getListingLocationEditorData", () => {
  it("scopes the read to the host rather than checking ownership afterwards", async () => {
    mocks.listingFindFirst.mockResolvedValue(null);

    const data = await getListingLocationEditorData("listing-1", "host-1");

    expect(data).toBeNull();
    expect(mocks.listingFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "listing-1", hostId: "host-1" } }),
    );
  });

  it("returns the stored address and pin, and marks the section complete", async () => {
    mocks.listingFindFirst.mockResolvedValue(row());

    const data = await getListingLocationEditorData("listing-1", "host-1");

    expect(data?.listing).toEqual({
      id: "listing-1",
      slug: "seaside-apartment",
      status: "APPROVED",
    });
    expect(data?.stored.address).toBe("Partizanski odredi 15");
    expect(data?.stored.latitude).toBe(41.9981);
    expect(data?.stored.streetViewPanoId).toBe("pano-1");
    expect(data?.complete).toBe(true);
  });

  it("presents the nullable text columns as empty strings for the form", async () => {
    mocks.listingFindFirst.mockResolvedValue(
      row({
        area: null,
        postalCode: null,
        locationSource: null,
        geocodingProvider: null,
        geocodingPlaceId: null,
      }),
    );

    const data = await getListingLocationEditorData("listing-1", "host-1");

    expect(data?.stored.area).toBe("");
    expect(data?.stored.postalCode).toBe("");
    expect(data?.stored.locationSource).toBe("");
    expect(data?.stored.geocodingProvider).toBe("");
    expect(data?.stored.geocodingPlaceId).toBe("");
  });

  it("reports a property with no pin as incomplete", async () => {
    mocks.listingFindFirst.mockResolvedValue(
      row({ latitude: null, longitude: null }),
    );

    const data = await getListingLocationEditorData("listing-1", "host-1");

    expect(data?.complete).toBe(false);
  });

  it("never reads the always-empty geocodingConfidence column", async () => {
    mocks.listingFindFirst.mockResolvedValue(row());

    await getListingLocationEditorData("listing-1", "host-1");

    const select = mocks.listingFindFirst.mock.calls[0][0].select;
    expect(select.property.select).not.toHaveProperty("geocodingConfidence");
  });
});
