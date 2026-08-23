import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireHost: vi.fn(),
  listingFindFirst: vi.fn(),
  listingUpdate: vi.fn(),
  revalidatePath: vi.fn(),
  revalidatePublicListingCaches: vi.fn(),
}));

vi.mock("@/lib/auth-helpers", () => ({ requireHost: mocks.requireHost }));
vi.mock("@/lib/db", () => ({
  db: {
    listing: { findFirst: mocks.listingFindFirst, update: mocks.listingUpdate },
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/utils/revalidate-public-listing-caches", () => ({
  revalidatePublicListingCaches: mocks.revalidatePublicListingCaches,
}));

import { updateListingBasics } from "@/lib/actions/listing-basics.actions";

const VALID = {
  title: "Seaside apartment",
  description:
    "A bright apartment two streets from the water, with a balcony over the square.",
};

function listing(overrides: Record<string, unknown> = {}) {
  return {
    id: "listing-1",
    slug: "seaside-apartment",
    status: "DRAFT",
    title: "Old title",
    description: "An older description that was long enough to have been stored.",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireHost.mockResolvedValue({ id: "host-1", isHost: true });
  mocks.listingFindFirst.mockResolvedValue(listing());
  mocks.listingUpdate.mockResolvedValue({});
});

describe("updateListingBasics ownership", () => {
  it("scopes the read to the signed-in host", async () => {
    await updateListingBasics("listing-1", VALID);

    expect(mocks.listingFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "listing-1", hostId: "host-1" } }),
    );
  });

  it("refuses a listing this host does not own, without writing", async () => {
    mocks.listingFindFirst.mockResolvedValue(null);

    const result = await updateListingBasics("someone-elses", VALID);

    expect(result).toEqual({ error: "Listing not found." });
    expect(mocks.listingUpdate).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("lets an unauthenticated caller be rejected before anything is read", async () => {
    mocks.requireHost.mockRejectedValue(new Error("Not authorized"));

    await expect(updateListingBasics("listing-1", VALID)).rejects.toThrow(
      "Not authorized",
    );
    expect(mocks.listingFindFirst).not.toHaveBeenCalled();
  });
});

describe("updateListingBasics validation", () => {
  it("rejects a short title and a short description together, without writing", async () => {
    const result = await updateListingBasics("listing-1", {
      title: "Sea",
      description: "Too short.",
    });

    expect(result).toEqual({
      issues: { title: "TOO_SHORT", description: "TOO_SHORT" },
    });
    expect(mocks.listingUpdate).not.toHaveBeenCalled();
  });

  it("refuses over-long text rather than truncating the host's words", async () => {
    const result = await updateListingBasics("listing-1", {
      title: VALID.title,
      description: "b".repeat(5001),
    });

    expect(result.issues).toEqual({ description: "TOO_LONG" });
    expect(mocks.listingUpdate).not.toHaveBeenCalled();
  });
});

describe("updateListingBasics success", () => {
  it("stores the host's text trimmed, and reports the section complete", async () => {
    const result = await updateListingBasics("listing-1", {
      title: `  ${VALID.title}  `,
      description: `\n${VALID.description}\n`,
    });

    expect(mocks.listingUpdate).toHaveBeenCalledWith({
      where: { id: "listing-1" },
      data: { title: VALID.title, description: VALID.description },
    });
    expect(result).toEqual({
      title: VALID.title,
      description: VALID.description,
      complete: true,
    });
  });

  it("does not write, or revalidate, when nothing actually changed", async () => {
    mocks.listingFindFirst.mockResolvedValue(listing(VALID));

    const result = await updateListingBasics("listing-1", VALID);

    expect(mocks.listingUpdate).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
    expect(result.complete).toBe(true);
  });

  it("revalidates the editor and the overview, but not a draft's public page", async () => {
    await updateListingBasics("listing-1", VALID);

    const paths = mocks.revalidatePath.mock.calls.map(([path]) => path);
    expect(paths).toContain("/host/listings/listing-1/basics");
    expect(paths).toContain("/host/listings/listing-1");
    expect(paths).toContain("/host/listings");
    expect(paths).not.toContain("/properties/seaside-apartment");
    expect(mocks.revalidatePublicListingCaches).not.toHaveBeenCalled();
  });
});

describe("updateListingBasics moderation", () => {
  it("flags a live listing for re-review and rebuilds its public page", async () => {
    mocks.listingFindFirst.mockResolvedValue(listing({ status: "APPROVED" }));

    await updateListingBasics("listing-1", VALID);

    expect(mocks.listingUpdate).toHaveBeenCalledWith({
      where: { id: "listing-1" },
      data: { title: VALID.title, description: VALID.description, needsReview: true },
    });
    const paths = mocks.revalidatePath.mock.calls.map(([path]) => path);
    expect(paths).toContain("/properties/seaside-apartment");
    expect(mocks.revalidatePublicListingCaches).toHaveBeenCalled();
  });

  it("leaves a listing that is not live out of the review queue", async () => {
    mocks.listingFindFirst.mockResolvedValue(listing({ status: "UNPUBLISHED" }));

    await updateListingBasics("listing-1", VALID);

    expect(mocks.listingUpdate.mock.calls[0][0].data).not.toHaveProperty("needsReview");
  });
});
