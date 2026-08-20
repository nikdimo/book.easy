import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ listingFindFirst: vi.fn() }));

vi.mock("@/lib/db", () => ({
  db: { listing: { findFirst: mocks.listingFindFirst } },
}));

import { getListingBasicsEditorData } from "@/lib/services/listing-basics.service";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getListingBasicsEditorData", () => {
  it("scopes the read to the host rather than checking ownership afterwards", async () => {
    mocks.listingFindFirst.mockResolvedValue(null);

    const data = await getListingBasicsEditorData("listing-1", "host-1");

    expect(data).toBeNull();
    expect(mocks.listingFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "listing-1", hostId: "host-1" } }),
    );
  });

  it("returns the host's text untouched, with the section marked complete", async () => {
    mocks.listingFindFirst.mockResolvedValue({
      id: "listing-1",
      slug: "seaside-apartment",
      status: "APPROVED",
      title: "Seaside apartment",
      description:
        "A bright apartment two streets from the water, with a balcony over the square.",
    });

    const data = await getListingBasicsEditorData("listing-1", "host-1");

    expect(data).toEqual({
      listing: { id: "listing-1", slug: "seaside-apartment", status: "APPROVED" },
      title: "Seaside apartment",
      description:
        "A bright apartment two streets from the water, with a balcony over the square.",
      complete: true,
    });
  });

  it("reports a listing whose stored copy is too short as incomplete", async () => {
    mocks.listingFindFirst.mockResolvedValue({
      id: "listing-1",
      slug: "seaside-apartment",
      status: "DRAFT",
      title: "Seaside apartment",
      description: "Too short.",
    });

    const data = await getListingBasicsEditorData("listing-1", "host-1");

    expect(data?.complete).toBe(false);
  });
});
