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
  generateUniqueSlug: vi.fn(),
  archiveOrDeleteListing: vi.fn(),
  archiveOwnedListing: vi.fn(),
  unpublishOwnedListing: vi.fn(),
  enqueueUploadDeletions: vi.fn(async () => [] as string[]),
  sweepUploads: vi.fn(async () => ({ scanned: 0, deleted: 0, kept: 0, failed: 0 })),
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
    // The gallery rewrite and the cleanup queue commit together, so the action now runs
    // inside a transaction. Running the callback against the same delegates keeps these
    // tests about pricing ownership rather than about Prisma.
    $transaction: async (callback: (tx: unknown) => unknown) =>
      callback({
        listingImage: {
          deleteMany: mocks.imageDeleteMany,
          createMany: mocks.imageCreateMany,
        },
      }),
  },
}));
vi.mock("@/lib/storage/upload-cleanup", () => ({
  enqueueUploadDeletions: mocks.enqueueUploadDeletions,
  sweepUploads: mocks.sweepUploads,
}));
vi.mock("@/lib/currency/rates", () => ({
  getExchangeRates: mocks.getExchangeRates,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/utils/revalidate-public-listing-caches", () => ({
  revalidatePublicListingCaches: mocks.revalidatePublicListingCaches,
}));
vi.mock("@/lib/services/listing.service", () => ({
  generateUniqueSlug: mocks.generateUniqueSlug,
  archiveOrDeleteListing: mocks.archiveOrDeleteListing,
}));
vi.mock("@/lib/services/listing-lifecycle.service", () => ({
  archiveOwnedListing: mocks.archiveOwnedListing,
  unpublishOwnedListing: mocks.unpublishOwnedListing,
}));

import {
  archiveListing,
  deleteListing,
  submitForReview,
  unarchiveListing,
  unpublishListing,
  updateListing,
} from "@/lib/actions/listing.actions";

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
    mocks.archiveOwnedListing.mockResolvedValue({
      success: true,
      listingTitle: "Listing",
    });
    mocks.unpublishOwnedListing.mockResolvedValue({
      success: true,
      listingTitle: "Listing",
    });
  });

  it("accepts a detail edit with no standard-pricing fields", async () => {
    await expect(updateListing("listing-1", validDetailForm())).resolves.toEqual({
      success: true,
    });

    expect(mocks.pricingRuleUpdate).not.toHaveBeenCalled();
  });

  it("ignores stale standard-pricing values submitted by an older editor", async () => {
    const formData = validDetailForm();
    formData.set("baseNightlyRate", "80");
    formData.set("cleaningFee", "0");
    formData.set("minNights", "1");

    await expect(updateListing("listing-1", formData)).resolves.toEqual({
      success: true,
    });

    expect(mocks.pricingRuleUpdate).not.toHaveBeenCalled();
  });

  it("does not re-denominate stored prices from a forged currency field", async () => {
    const formData = validDetailForm();
    formData.set("currency", "MKD");

    await expect(updateListing("listing-1", formData)).resolves.toEqual({
      success: true,
    });

    expect(mocks.pricingRuleUpdate).not.toHaveBeenCalled();
  });
});

describe("submitForReview availability safety", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ user: { id: "host-1", isHost: true } });
    mocks.listingUpdate.mockResolvedValue({});
    mocks.archiveOwnedListing.mockResolvedValue({
      success: true,
      listingTitle: "Listing",
    });
    mocks.unpublishOwnedListing.mockResolvedValue({
      success: true,
      listingTitle: "Listing",
    });
  });

  function publishableListing(overrides: Record<string, unknown> = {}) {
    return {
      id: "listing-1",
      hostId: "host-1",
      status: "DRAFT",
      availabilityMode: "OPEN",
      publishedAt: null,
      pricingRule: { baseNightlyRate: 120 },
      images: [
        { mediaType: "IMAGE" },
        { mediaType: "IMAGE" },
        { mediaType: "IMAGE" },
      ],
      availabilityBlocks: [],
      ...overrides,
    };
  }

  it("refuses to publish a never-published OPEN legacy row without confirmation", async () => {
    mocks.listingFindFirst.mockResolvedValue(publishableListing());

    await expect(submitForReview("listing-1")).resolves.toEqual({
      error:
        "Confirm availability before publishing. Choose unavailable by default, or set a future availability start date.",
    });
    expect(mocks.listingUpdate).not.toHaveBeenCalled();
  });

  it("publishes a never-published listing that is unavailable by default", async () => {
    mocks.listingFindFirst.mockResolvedValue(
      publishableListing({ availabilityMode: "CLOSED" }),
    );

    await expect(submitForReview("listing-1")).resolves.toEqual({ success: true });
    expect(mocks.listingUpdate).toHaveBeenCalledWith({
      where: { id: "listing-1" },
      data: expect.objectContaining({ status: "APPROVED", needsReview: true }),
    });
  });

  it("restores a previously published listing with its existing calendar intact", async () => {
    mocks.listingFindFirst.mockResolvedValue(
      publishableListing({
        status: "UNPUBLISHED",
        publishedAt: new Date("2026-07-01T10:00:00.000Z"),
      }),
    );

    await expect(submitForReview("listing-1")).resolves.toEqual({ success: true });
    expect(mocks.listingUpdate).toHaveBeenCalledTimes(1);
  });

  // L4: moderation is post-publication. Both publish paths go straight to APPROVED with
  // the review flag raised — there is no queued state in between, and never was.
  it("republishes an unpublished listing as approved and flagged for review", async () => {
    mocks.listingFindFirst.mockResolvedValue(
      publishableListing({
        status: "UNPUBLISHED",
        publishedAt: new Date("2026-07-01T10:00:00.000Z"),
      }),
    );

    await expect(submitForReview("listing-1")).resolves.toEqual({ success: true });
    expect(mocks.listingUpdate).toHaveBeenCalledWith({
      where: { id: "listing-1" },
      data: expect.objectContaining({ status: "APPROVED", needsReview: true }),
    });
  });

  it("never writes a retired moderation status on any publish", async () => {
    for (const status of ["DRAFT", "UNPUBLISHED"]) {
      mocks.listingUpdate.mockClear();
      mocks.listingFindFirst.mockResolvedValue(
        publishableListing({ status, availabilityMode: "CLOSED" }),
      );

      await expect(submitForReview("listing-1")).resolves.toEqual({ success: true });
      const written = mocks.listingUpdate.mock.calls[0][0].data;
      expect(written.status).toBe("APPROVED");
      expect(["PENDING_REVIEW", "REJECTED"]).not.toContain(written.status);
    }
  });

  // L4: the retired statuses are not a route back onto the site, and neither are the
  // admin-owned ones. Only DRAFT and UNPUBLISHED publish.
  it.each(["PENDING_REVIEW", "REJECTED", "APPROVED", "SUSPENDED", "ARCHIVED"])(
    "refuses to publish a listing stored as %s",
    async (status) => {
      mocks.listingFindFirst.mockResolvedValue(
        publishableListing({ status, availabilityMode: "CLOSED" }),
      );

      await expect(submitForReview("listing-1")).resolves.toEqual({
        error: "Only draft or unpublished listings can be published",
      });
      expect(mocks.listingUpdate).not.toHaveBeenCalled();
    },
  );
});

// G2: the v2 listings overview stopped reflecting archive/unarchive/delete/publish/
// unpublish immediately because these actions only revalidated the v1 "/host/listings"
// path. Each one must now revalidate both paths so `router.refresh()` on the v2 overview
// page (see listing-actions-menu.tsx / listing-visibility-switch.tsx) picks up fresh data.
describe("overview revalidation targets both /host/listings and /host/listings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ user: { id: "host-1", isHost: true } });
    mocks.listingUpdate.mockResolvedValue({});
  });

  it("submitForReview revalidates both listings routes", async () => {
    mocks.listingFindFirst.mockResolvedValue({
      id: "listing-1",
      hostId: "host-1",
      status: "DRAFT",
      availabilityMode: "CLOSED",
      publishedAt: null,
      pricingRule: { baseNightlyRate: 120 },
      images: [{ mediaType: "IMAGE" }, { mediaType: "IMAGE" }, { mediaType: "IMAGE" }],
      availabilityBlocks: [],
    });

    await expect(submitForReview("listing-1")).resolves.toEqual({ success: true });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/host/listings");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/host/listings");
  });

  it("unpublishListing revalidates both listings routes", async () => {
    await expect(unpublishListing("listing-1")).resolves.toEqual({ success: true });
    expect(mocks.unpublishOwnedListing).toHaveBeenCalledWith("listing-1", "host-1");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/host/listings");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/host/listings");
  });

  it("unpublishListing surfaces a pending-request block without revalidation", async () => {
    mocks.unpublishOwnedListing.mockResolvedValue({
      success: false,
      error:
        "Accept or decline pending booking requests before unpublishing this listing.",
    });

    await expect(unpublishListing("listing-1")).resolves.toEqual({
      error:
        "Accept or decline pending booking requests before unpublishing this listing.",
    });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
    expect(mocks.revalidatePublicListingCaches).not.toHaveBeenCalled();
  });

  it("archiveListing revalidates both listings routes", async () => {
    await expect(archiveListing("listing-1")).resolves.toEqual({ success: true });
    expect(mocks.archiveOwnedListing).toHaveBeenCalledWith("listing-1", "host-1");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/host/listings");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/host/listings");
  });

  it("unarchiveListing revalidates both listings routes", async () => {
    mocks.listingFindFirst.mockResolvedValue({ id: "listing-1", hostId: "host-1", status: "ARCHIVED" });

    await expect(unarchiveListing("listing-1")).resolves.toEqual({ success: true });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/host/listings");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/host/listings");
  });

  it("deleteListing revalidates both listings routes", async () => {
    mocks.archiveOrDeleteListing.mockResolvedValue({ outcome: "deleted" });

    await expect(deleteListing("listing-1")).resolves.toEqual({
      success: true,
      outcome: "deleted",
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/host/listings");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/host/listings");
  });
});
