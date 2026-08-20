import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  listingFindFirst: vi.fn(),
  amenityFindMany: vi.fn(),
  amenityDeleteMany: vi.fn(),
  amenityCreateMany: vi.fn(),
  transaction: vi.fn(),
  revalidatePath: vi.fn(),
  revalidatePublicListingCaches: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/db", () => ({
  db: {
    listing: { findFirst: mocks.listingFindFirst },
    amenity: { findMany: mocks.amenityFindMany },
    listingAmenity: {
      deleteMany: mocks.amenityDeleteMany,
      createMany: mocks.amenityCreateMany,
    },
    $transaction: mocks.transaction,
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/utils/revalidate-public-listing-caches", () => ({
  revalidatePublicListingCaches: mocks.revalidatePublicListingCaches,
}));

import { setListingAmenities } from "@/lib/actions/listing-amenities.actions";

const HOST = { user: { id: "host-1", isHost: true, role: "HOST" } };

/** The shape `db.amenity.findMany` returns for the pickability check. */
function row(id: string, isActive = true, categoryActive = true) {
  return { id, isActive, category: { isActive: categoryActive } };
}

function listing(amenityIds: string[], status = "APPROVED") {
  return {
    id: "listing-1",
    slug: "seaside-flat",
    status,
    amenities: amenityIds.map((amenityId) => ({ amenityId })),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue(HOST);
  mocks.transaction.mockResolvedValue([]);
  mocks.amenityDeleteMany.mockReturnValue({ op: "delete" });
  mocks.amenityCreateMany.mockReturnValue({ op: "create" });
});

describe("setListingAmenities — ownership", () => {
  it("scopes the listing lookup to the signed-in host", async () => {
    mocks.listingFindFirst.mockResolvedValue(listing([]));
    mocks.amenityFindMany.mockResolvedValue([row("am-1")]);

    await setListingAmenities("listing-1", ["am-1"]);

    expect(mocks.listingFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "listing-1", hostId: "host-1" },
      }),
    );
  });

  it("refuses a listing this host does not own, without writing", async () => {
    mocks.listingFindFirst.mockResolvedValue(null);

    const result = await setListingAmenities("someone-elses", ["am-1"]);

    expect(result).toEqual({ error: "Listing not found." });
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("rejects a caller who is not a host at all", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "guest-1", isHost: false, role: "USER" } });

    await expect(setListingAmenities("listing-1", ["am-1"])).rejects.toThrow(
      "Host access required",
    );
    expect(mocks.listingFindFirst).not.toHaveBeenCalled();
  });

  it("rejects a signed-out caller", async () => {
    mocks.auth.mockResolvedValue(null);

    await expect(setListingAmenities("listing-1", [])).rejects.toThrow(
      "You must be logged in to do this",
    );
  });
});

describe("setListingAmenities — mutations", () => {
  it("writes only the difference between the stored and requested sets", async () => {
    mocks.listingFindFirst.mockResolvedValue(listing(["am-keep", "am-drop"]));
    mocks.amenityFindMany.mockResolvedValue([row("am-keep"), row("am-add")]);

    const result = await setListingAmenities("listing-1", ["am-keep", "am-add"]);

    expect(result.error).toBeUndefined();
    expect(result.selectedIds).toEqual(["am-keep", "am-add"]);
    expect(mocks.amenityDeleteMany).toHaveBeenCalledWith({
      where: { listingId: "listing-1", amenityId: { in: ["am-drop"] } },
    });
    expect(mocks.amenityCreateMany).toHaveBeenCalledWith({
      data: [{ listingId: "listing-1", amenityId: "am-add" }],
      skipDuplicates: true,
    });
  });

  it("deselects everything when an empty set arrives", async () => {
    mocks.listingFindFirst.mockResolvedValue(listing(["am-1", "am-2"]));

    const result = await setListingAmenities("listing-1", []);

    expect(result.selectedIds).toEqual([]);
    // Nothing to look up, so the catalog is never queried.
    expect(mocks.amenityFindMany).not.toHaveBeenCalled();
    expect(mocks.amenityDeleteMany).toHaveBeenCalledWith({
      where: { listingId: "listing-1", amenityId: { in: ["am-1", "am-2"] } },
    });
    expect(mocks.amenityCreateMany).not.toHaveBeenCalled();
  });

  it("collapses duplicate ids rather than writing the same row twice", async () => {
    mocks.listingFindFirst.mockResolvedValue(listing([]));
    mocks.amenityFindMany.mockResolvedValue([row("am-1")]);

    const result = await setListingAmenities("listing-1", ["am-1", "am-1", "am-1"]);

    expect(result.selectedIds).toEqual(["am-1"]);
    expect(mocks.amenityCreateMany).toHaveBeenCalledWith({
      data: [{ listingId: "listing-1", amenityId: "am-1" }],
      skipDuplicates: true,
    });
  });

  it("does not touch the database when the selection is unchanged", async () => {
    mocks.listingFindFirst.mockResolvedValue(listing(["am-1"]));
    mocks.amenityFindMany.mockResolvedValue([row("am-1")]);

    const result = await setListingAmenities("listing-1", ["am-1"]);

    expect(result.selectedIds).toEqual(["am-1"]);
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});

describe("setListingAmenities — existing inactive selections", () => {
  it("keeps an amenity an admin has hidden that this listing already holds", async () => {
    mocks.listingFindFirst.mockResolvedValue(listing(["am-hidden"]));
    mocks.amenityFindMany.mockResolvedValue([row("am-hidden", false), row("am-new")]);

    const result = await setListingAmenities("listing-1", ["am-hidden", "am-new"]);

    expect(result.error).toBeUndefined();
    expect(mocks.amenityDeleteMany).not.toHaveBeenCalled();
    expect(mocks.amenityCreateMany).toHaveBeenCalledWith({
      data: [{ listingId: "listing-1", amenityId: "am-new" }],
      skipDuplicates: true,
    });
  });

  it("keeps a selection whose whole category has been deactivated", async () => {
    mocks.listingFindFirst.mockResolvedValue(listing(["am-in-hidden-category"]));
    mocks.amenityFindMany.mockResolvedValue([row("am-in-hidden-category", true, false)]);

    const result = await setListingAmenities("listing-1", ["am-in-hidden-category"]);

    expect(result.error).toBeUndefined();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("refuses to newly add a hidden amenity the listing does not already hold", async () => {
    mocks.listingFindFirst.mockResolvedValue(listing([]));
    mocks.amenityFindMany.mockResolvedValue([row("am-hidden", false)]);

    const result = await setListingAmenities("listing-1", ["am-hidden"]);

    expect(result.error).toMatch(/no longer available/);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});

describe("setListingAmenities — error handling", () => {
  it("rejects an id that does not exist and writes nothing", async () => {
    mocks.listingFindFirst.mockResolvedValue(listing(["am-1"]));
    mocks.amenityFindMany.mockResolvedValue([row("am-1")]);

    const result = await setListingAmenities("listing-1", ["am-1", "am-ghost"]);

    expect(result.error).toMatch(/no longer available/);
    expect(result.selectedIds).toBeUndefined();
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("refuses an absurdly large selection before it reaches the database", async () => {
    mocks.listingFindFirst.mockResolvedValue(listing([]));

    const result = await setListingAmenities(
      "listing-1",
      Array.from({ length: 501 }, (_, index) => `am-${index}`),
    );

    expect(result.error).toMatch(/more amenities/);
    expect(mocks.amenityFindMany).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("lets a database failure surface rather than reporting a save that did not happen", async () => {
    mocks.listingFindFirst.mockResolvedValue(listing([]));
    mocks.amenityFindMany.mockResolvedValue([row("am-1")]);
    mocks.transaction.mockRejectedValue(new Error("connection lost"));

    await expect(setListingAmenities("listing-1", ["am-1"])).rejects.toThrow(
      "connection lost",
    );
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});

describe("setListingAmenities — revalidation", () => {
  it("refreshes the host editor and the public listing when the listing is live", async () => {
    mocks.listingFindFirst.mockResolvedValue(listing([], "APPROVED"));
    mocks.amenityFindMany.mockResolvedValue([row("am-1")]);

    await setListingAmenities("listing-1", ["am-1"]);

    const paths = mocks.revalidatePath.mock.calls.map(([path]) => path);
    expect(paths).toEqual(
      expect.arrayContaining([
        "/host/v2/listings/listing-1/amenities",
        "/host/v2/listings/listing-1",
        "/host/listings/listing-1/edit",
        "/properties/seaside-flat",
      ]),
    );
    expect(mocks.revalidatePublicListingCaches).toHaveBeenCalled();
  });

  it("leaves the public caches alone for a draft, which has no guest-facing page", async () => {
    mocks.listingFindFirst.mockResolvedValue(listing([], "DRAFT"));
    mocks.amenityFindMany.mockResolvedValue([row("am-1")]);

    await setListingAmenities("listing-1", ["am-1"]);

    const paths = mocks.revalidatePath.mock.calls.map(([path]) => path);
    expect(paths).toContain("/host/v2/listings/listing-1/amenities");
    expect(paths).not.toContain("/properties/seaside-flat");
    expect(mocks.revalidatePublicListingCaches).not.toHaveBeenCalled();
  });
});
