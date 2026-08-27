import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireHost: vi.fn(), findFirst: vi.fn(), typeFind: vi.fn(), propertyUpdate: vi.fn(), listingUpdate: vi.fn(), transaction: vi.fn(), revalidatePath: vi.fn(), publicCaches: vi.fn() }));
vi.mock("@/lib/auth-helpers", () => ({ requireHost: mocks.requireHost }));
vi.mock("@/lib/db", () => ({ db: { listing: { findFirst: mocks.findFirst, update: mocks.listingUpdate }, property: { update: mocks.propertyUpdate }, propertyType: { findUnique: mocks.typeFind }, $transaction: mocks.transaction } }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/utils/revalidate-public-listing-caches", () => ({ revalidatePublicListingCaches: mocks.publicCaches }));
import { updateListingPropertyDetails } from "../listing-property-details.actions";

const input = { propertyType: "HOUSE", spaceType: "ENTIRE_PLACE" as const, bedrooms: 2, beds: 3, bathrooms: 1 };
beforeEach(() => { vi.clearAllMocks(); mocks.requireHost.mockResolvedValue({ id: "host-1" }); mocks.findFirst.mockResolvedValue({ id: "listing-1", slug: "home", status: "DRAFT", propertyId: "property-1", spaceType: "PRIVATE_ROOM", bedrooms: 1, beds: 1, bathrooms: 1, property: { propertyType: "HOUSE" } }); mocks.typeFind.mockResolvedValue({ value: "HOUSE" }); mocks.transaction.mockResolvedValue([]); });

describe("property details action", () => {
  it("checks ownership inside the listing query", async () => {
    await updateListingPropertyDetails("listing-1", input);
    expect(mocks.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "listing-1", hostId: "host-1" } }));
  });
  it("never writes the derived bedroom and bathroom counts", async () => {
    await updateListingPropertyDetails("listing-1", input);
    const [[call]] = mocks.listingUpdate.mock.calls;
    expect(call.data).not.toHaveProperty("bedrooms");
    expect(call.data).not.toHaveProperty("bathrooms");
    expect(call.data).toMatchObject({ beds: 3 });
  });
  it("rejects invalid input and unknown property types without writing", async () => {
    expect((await updateListingPropertyDetails("listing-1", { ...input, beds: 99 })).issues).toEqual({ beds: "OUT_OF_RANGE" });
    mocks.typeFind.mockResolvedValue(null);
    expect((await updateListingPropertyDetails("listing-1", input)).issues).toEqual({ propertyType: "INVALID" });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it("keeps an approved listing live, marks review, and invalidates every affected surface", async () => {
    mocks.findFirst.mockResolvedValue({ id: "listing-1", slug: "home", status: "APPROVED", propertyId: "property-1", spaceType: "PRIVATE_ROOM", bedrooms: 1, beds: 1, bathrooms: 1, property: { propertyType: "HOUSE" } });
    const result = await updateListingPropertyDetails("listing-1", input);
    expect(mocks.listingUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ needsReview: true }) }));
    // Bedrooms and bathrooms come back from the listing row, not from the input: they
    // are a copy of the room count now, and this save is not what moves them.
    expect(result).toMatchObject({ stored: { ...input, bedrooms: 1, bathrooms: 1 }, complete: true });
    const paths = mocks.revalidatePath.mock.calls.map(([path]) => path);
    expect(paths).toEqual(expect.arrayContaining(["/host/listings/listing-1/rooms", "/host/listings/listing-1", "/host/listings", "/host/listings/listing-1/edit", "/properties/home"]));
    expect(mocks.publicCaches).toHaveBeenCalled();
  });
});
