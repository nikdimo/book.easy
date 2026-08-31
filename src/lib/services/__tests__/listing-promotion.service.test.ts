import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listingFindFirst: vi.fn(),
  blockFindFirst: vi.fn(),
  blockedRanges: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    listing: { findFirst: mocks.listingFindFirst },
    availabilityBlock: { findFirst: mocks.blockFindFirst },
  },
}));
vi.mock("@/lib/services/availability.service", () => ({
  getBlockedDateRangesForListing: mocks.blockedRanges,
}));

import {
  checkPromotionRange,
  getPromotionListing,
} from "@/lib/services/listing-promotion.service";

const TODAY = "2026-08-30";

/** An OPEN calendar with a 2-night minimum and a 30-night cap, nothing booked. */
function openListing(overrides: Record<string, unknown> = {}) {
  return {
    id: "listing-1",
    availabilityMode: "OPEN",
    pricingRule: { minNights: 2, maxNights: 30 },
    availabilityWindows: [],
    ...overrides,
  };
}

describe("getPromotionListing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.blockedRanges.mockResolvedValue([]);
  });

  it("only loads a published listing the caller actually owns", async () => {
    mocks.listingFindFirst.mockResolvedValue(null);

    expect(await getPromotionListing("host-1", "listing-1")).toBeNull();
    expect(mocks.listingFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "listing-1", hostId: "host-1", status: "APPROVED" },
      }),
    );
  });

  it("resolves a stored zero maximum as 'no cap' rather than 'never bookable'", async () => {
    mocks.listingFindFirst.mockResolvedValue({
      id: "listing-1",
      slug: "slice-of-paradise",
      title: "Slice of Paradise",
      description: "By the sea.",
      maxGuests: 4,
      property: { city: "Ohrid" },
      images: [
        { id: "m1", url: "/photo.jpg", mediaType: "IMAGE", isPrimary: true },
      ],
      pricingRule: {
        baseNightlyRate: "80",
        currency: "EUR",
        minNights: 2,
        maxNights: 0,
      },
    });

    const view = await getPromotionListing("host-1", "listing-1");

    expect(view?.maxNights).toBeNull();
    expect(view?.minNights).toBe(2);
    expect(view?.baseNightlyRate).toBe(80);
    expect(view?.imageUrl).toBe("/photo.jpg");
  });

  it("carries every asset for the host to take away, cover first", async () => {
    // Instagram cannot be posted without a file, and a group post does better with real
    // photos than with a link card — so the workspace needs the whole set, not just the
    // one image the Open Graph tags already use.
    mocks.listingFindFirst.mockResolvedValue({
      id: "listing-1",
      slug: "slice-of-paradise",
      title: "Slice of Paradise",
      description: "By the sea.",
      maxGuests: 4,
      property: { city: "Ohrid" },
      images: [
        { id: "m1", url: "/terrace.mp4", mediaType: "VIDEO", isPrimary: true },
        { id: "m2", url: "/photo.jpg", mediaType: "IMAGE", isPrimary: false },
      ],
      pricingRule: null,
    });

    const view = await getPromotionListing("host-1", "listing-1");

    expect(view?.media.map((item) => item.id)).toEqual(["m1", "m2"]);
    // The cover is the first *image*: a listing whose primary asset is a clip still
    // needs a still for the header and for the link-card preview.
    expect(view?.imageUrl).toBe("/photo.jpg");
  });
});

describe("checkPromotionRange", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listingFindFirst.mockResolvedValue(openListing());
    mocks.blockFindFirst.mockResolvedValue(null);
  });

  it("accepts a bookable range and counts its nights off calendar days", async () => {
    expect(
      await checkPromotionRange("host-1", "listing-1", "2026-10-01", "2026-10-08", TODAY),
    ).toEqual({ ok: true, checkIn: "2026-10-01", checkOut: "2026-10-08", nights: 7 });
  });

  it("rejects a range that a booking or a manual block now overlaps", async () => {
    mocks.blockFindFirst.mockResolvedValue({ id: "block-1" });

    expect(
      await checkPromotionRange("host-1", "listing-1", "2026-10-01", "2026-10-08", TODAY),
    ).toEqual({ ok: false, reason: "ALREADY_BOOKED" });
  });

  it("rejects dates outside the open windows of a CLOSED calendar", async () => {
    mocks.listingFindFirst.mockResolvedValue(
      openListing({ availabilityMode: "CLOSED", availabilityWindows: [] }),
    );

    expect(
      await checkPromotionRange("host-1", "listing-1", "2026-10-01", "2026-10-08", TODAY),
    ).toEqual({ ok: false, reason: "NOT_OPEN" });
  });

  it("accepts a CLOSED calendar range its windows do cover", async () => {
    mocks.listingFindFirst.mockResolvedValue(
      openListing({
        availabilityMode: "CLOSED",
        availabilityWindows: [
          {
            startDate: new Date("2026-09-01T00:00:00.000Z"),
            endDate: new Date("2026-11-01T00:00:00.000Z"),
          },
        ],
      }),
    );

    const result = await checkPromotionRange(
      "host-1",
      "listing-1",
      "2026-10-01",
      "2026-10-08",
      TODAY,
    );
    expect(result.ok).toBe(true);
  });

  it("enforces the host's own minimum stay", async () => {
    expect(
      await checkPromotionRange("host-1", "listing-1", "2026-10-01", "2026-10-02", TODAY),
    ).toEqual({ ok: false, reason: "BELOW_MINIMUM", minNights: 2 });
  });

  it("enforces the host's own maximum stay", async () => {
    expect(
      await checkPromotionRange("host-1", "listing-1", "2026-10-01", "2026-12-01", TODAY),
    ).toEqual({ ok: false, reason: "ABOVE_MAXIMUM", maxNights: 30 });
  });

  it("refuses a range that has already started", async () => {
    expect(
      await checkPromotionRange("host-1", "listing-1", "2026-08-01", "2026-08-10", TODAY),
    ).toEqual({ ok: false, reason: "IN_THE_PAST" });
    // Nothing is read for a range that cannot be advertised on its face.
    expect(mocks.listingFindFirst).not.toHaveBeenCalled();
  });

  it("refuses a malformed or inverted range", async () => {
    for (const [checkIn, checkOut] of [
      ["2026-10-08", "2026-10-01"],
      ["2026-10-01", "2026-10-01"],
      ["not-a-date", "2026-10-08"],
    ]) {
      expect(
        await checkPromotionRange("host-1", "listing-1", checkIn, checkOut, TODAY),
      ).toEqual({ ok: false, reason: "INVALID_DATES" });
    }
  });

  it("refuses to validate dates for a listing this host does not own or has unpublished", async () => {
    mocks.listingFindFirst.mockResolvedValue(null);

    expect(
      await checkPromotionRange("host-2", "listing-1", "2026-10-01", "2026-10-08", TODAY),
    ).toEqual({ ok: false, reason: "LISTING_NOT_PROMOTABLE" });
    expect(mocks.blockFindFirst).not.toHaveBeenCalled();
  });
});
