import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ listingFindFirst: vi.fn() }));

vi.mock("@/lib/db", () => ({
  db: { listing: { findFirst: mocks.listingFindFirst } },
}));

import { getListingArrivalGuideEditorData } from "@/lib/services/listing-arrival-guide.service";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listingFindFirst.mockResolvedValue({
    id: "listing-1",
    slug: "seaside-apartment",
    status: "APPROVED",
    checkInTime: "14:15",
    checkOutTime: null,
  });
});

describe("getListingArrivalGuideEditorData", () => {
  it("scopes the read to the signed-in host", async () => {
    await getListingArrivalGuideEditorData("listing-1", "host-1");

    expect(mocks.listingFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "listing-1", hostId: "host-1" } }),
    );
  });

  it("returns a read-only summary without losing imported minute-level times", async () => {
    await expect(
      getListingArrivalGuideEditorData("listing-1", "host-1"),
    ).resolves.toEqual({
      listing: { id: "listing-1", slug: "seaside-apartment", status: "APPROVED" },
      checkInTime: "14:15",
      checkOutTime: "",
    });
  });

  it("does not expose whether another host's listing exists", async () => {
    mocks.listingFindFirst.mockResolvedValue(null);

    await expect(
      getListingArrivalGuideEditorData("listing-1", "host-2"),
    ).resolves.toBeNull();
  });
});
