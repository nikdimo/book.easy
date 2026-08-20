import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CatalogAmenity, CatalogCategory } from "@/lib/types/amenity-catalog";

const mocks = vi.hoisted(() => ({
  listingFindFirst: vi.fn(),
  amenityFindMany: vi.fn(),
  getAmenityCatalogIncluding: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    listing: { findFirst: mocks.listingFindFirst },
    amenity: { findMany: mocks.amenityFindMany },
  },
}));
vi.mock("@/lib/services/amenity.service", () => ({
  getAmenityCatalogIncluding: mocks.getAmenityCatalogIncluding,
}));

import { getListingAmenitiesEditorData } from "@/lib/services/listing-amenities.service";

const KITCHEN: CatalogCategory = {
  id: "cat-kitchen",
  key: "kitchen",
  name: "Kitchen",
  label: "Kitchen",
  translated: false,
  icon: null,
  sortOrder: 10,
};

function amenity(id: string): CatalogAmenity {
  return {
    id,
    key: id,
    name: id,
    label: id,
    translated: false,
    icon: null,
    sortOrder: 10,
    category: KITCHEN,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.amenityFindMany.mockResolvedValue([]);
  mocks.getAmenityCatalogIncluding.mockResolvedValue([]);
});

describe("getListingAmenitiesEditorData", () => {
  it("scopes the read to the owning host", async () => {
    mocks.listingFindFirst.mockResolvedValue({
      id: "listing-1",
      slug: "seaside-flat",
      status: "APPROVED",
      amenities: [],
    });

    await getListingAmenitiesEditorData("listing-1", "host-1");

    expect(mocks.listingFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "listing-1", hostId: "host-1" } }),
    );
  });

  it("returns null for a listing this host does not own, without loading the catalog", async () => {
    mocks.listingFindFirst.mockResolvedValue(null);

    await expect(
      getListingAmenitiesEditorData("listing-1", "someone-else"),
    ).resolves.toBeNull();
    expect(mocks.getAmenityCatalogIncluding).not.toHaveBeenCalled();
  });

  it("asks the catalog to include the ids this listing already holds", async () => {
    mocks.listingFindFirst.mockResolvedValue({
      id: "listing-1",
      slug: "seaside-flat",
      status: "APPROVED",
      amenities: [{ amenityId: "am-hidden" }, { amenityId: "am-oven" }],
    });
    mocks.getAmenityCatalogIncluding.mockResolvedValue([
      amenity("am-oven"),
      amenity("am-hidden"),
    ]);
    mocks.amenityFindMany.mockResolvedValue([{ id: "am-hidden" }]);

    const data = await getListingAmenitiesEditorData("listing-1", "host-1");

    expect(mocks.getAmenityCatalogIncluding).toHaveBeenCalledWith([
      "am-hidden",
      "am-oven",
    ]);
    expect(data?.selectedIds).toEqual(["am-hidden", "am-oven"]);
    expect(data?.catalog.map((row) => row.id)).toEqual(["am-oven", "am-hidden"]);
  });

  it("flags a selection that is hidden, or sits in a deactivated category", async () => {
    mocks.listingFindFirst.mockResolvedValue({
      id: "listing-1",
      slug: "seaside-flat",
      status: "APPROVED",
      amenities: [{ amenityId: "am-hidden" }, { amenityId: "am-oven" }],
    });
    mocks.amenityFindMany.mockResolvedValue([{ id: "am-hidden" }]);

    const data = await getListingAmenitiesEditorData("listing-1", "host-1");

    expect(mocks.amenityFindMany).toHaveBeenCalledWith({
      where: {
        id: { in: ["am-hidden", "am-oven"] },
        OR: [{ isActive: false }, { category: { isActive: false } }],
      },
      select: { id: true },
    });
    expect(data?.hiddenSelectedIds).toEqual(["am-hidden"]);
  });

  it("skips the hidden-row query entirely when nothing is selected", async () => {
    mocks.listingFindFirst.mockResolvedValue({
      id: "listing-1",
      slug: "seaside-flat",
      status: "DRAFT",
      amenities: [],
    });

    const data = await getListingAmenitiesEditorData("listing-1", "host-1");

    expect(mocks.amenityFindMany).not.toHaveBeenCalled();
    expect(data).toMatchObject({
      listing: { id: "listing-1", slug: "seaside-flat", status: "DRAFT" },
      selectedIds: [],
      hiddenSelectedIds: [],
    });
  });
});
