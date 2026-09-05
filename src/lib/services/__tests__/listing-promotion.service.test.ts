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

/**
 * #6: the weekly rule, which this check used to skip entirely.
 *
 * The `select` read `availabilityMode`, `minNights`/`maxNights` and the windows — but
 * neither `bookingMode` nor `changeoverWeekday`. A weekly host could therefore validate
 * and publish a Tue-to-Fri range to a Facebook group that `createBooking` refuses with
 * "Check-in must be on a Saturday": exactly the failure the doc above this function says
 * it exists to prevent.
 *
 * 2026-10-03 is a Saturday, and so is every seventh day from it.
 */
describe("checkPromotionRange on a weekly listing", () => {
  const weekly = (overrides: Record<string, unknown> = {}) =>
    openListing({
      bookingMode: "FIXED_STAYS",
      changeoverWeekday: "SATURDAY",
      pricingRule: { minNights: 7, maxNights: 28 },
      ...overrides,
    });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listingFindFirst.mockResolvedValue(weekly());
    mocks.blockFindFirst.mockResolvedValue(null);
  });

  it("reads the two columns the weekly shape is made of", async () => {
    await checkPromotionRange("host-1", "listing-1", "2026-10-03", "2026-10-10", TODAY);
    const [{ select }] = mocks.listingFindFirst.mock.calls[0];
    expect(select).toMatchObject({ bookingMode: true, changeoverWeekday: true });
  });

  it("accepts a whole week starting on the changeover day", async () => {
    expect(
      await checkPromotionRange("host-1", "listing-1", "2026-10-03", "2026-10-10", TODAY),
    ).toEqual({ ok: true, checkIn: "2026-10-03", checkOut: "2026-10-10", nights: 7 });
  });

  it("refuses a range starting on the wrong weekday", async () => {
    // Tuesday to Friday — the audit's example, published to a group before this fix.
    expect(
      await checkPromotionRange("host-1", "listing-1", "2026-10-06", "2026-10-09", TODAY),
    ).toEqual({ ok: false, reason: "WRONG_CHECK_IN_DAY" });
  });

  it("refuses a range that starts right but is not whole weeks", async () => {
    expect(
      await checkPromotionRange("host-1", "listing-1", "2026-10-03", "2026-10-09", TODAY),
    ).toEqual({ ok: false, reason: "WRONG_CHECK_OUT_DAY" });
  });

  it("fails closed when the host has not chosen a changeover day", async () => {
    mocks.listingFindFirst.mockResolvedValue(weekly({ changeoverWeekday: null }));

    expect(
      await checkPromotionRange("host-1", "listing-1", "2026-10-03", "2026-10-10", TODAY),
    ).toEqual({ ok: false, reason: "NO_CHANGEOVER_DAY" });
  });

  it("still enforces the listing's own stay limits", async () => {
    mocks.listingFindFirst.mockResolvedValue(
      weekly({ pricingRule: { minNights: 14, maxNights: 21 } }),
    );
    expect(
      await checkPromotionRange("host-1", "listing-1", "2026-10-03", "2026-10-10", TODAY),
    ).toEqual({ ok: false, reason: "BELOW_MINIMUM", minNights: 14 });
    expect(
      await checkPromotionRange("host-1", "listing-1", "2026-10-03", "2026-11-07", TODAY),
    ).toEqual({ ok: false, reason: "ABOVE_MAXIMUM", maxNights: 21 });
  });

  /** The weekday is the thing the host can act on, so it is reported ahead of length. */
  it("reports the weekday before the length when both are wrong", async () => {
    mocks.listingFindFirst.mockResolvedValue(
      weekly({ pricingRule: { minNights: 14, maxNights: 21 } }),
    );
    expect(
      await checkPromotionRange("host-1", "listing-1", "2026-10-06", "2026-10-08", TODAY),
    ).toEqual({ ok: false, reason: "WRONG_CHECK_IN_DAY" });
  });

  it("still applies the availability windows of a CLOSED weekly calendar", async () => {
    mocks.listingFindFirst.mockResolvedValue(
      weekly({ availabilityMode: "CLOSED", availabilityWindows: [] }),
    );
    expect(
      await checkPromotionRange("host-1", "listing-1", "2026-10-03", "2026-10-10", TODAY),
    ).toEqual({ ok: false, reason: "NOT_OPEN" });
  });
});

/**
 * The regression the audit warned about when centralising on the shared helper: routing
 * this check through `decideStayAvailability` before finding #4 landed would have
 * dropped minimum- and maximum-stay enforcement for *flexible* listings entirely,
 * letting one advertise a 2-night stay under a 5-night minimum.
 */
describe("checkPromotionRange keeps flexible stay limits after centralising", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.blockFindFirst.mockResolvedValue(null);
    mocks.listingFindFirst.mockResolvedValue(
      openListing({
        bookingMode: "FLEXIBLE",
        changeoverWeekday: null,
        pricingRule: { minNights: 5, maxNights: 14 },
      }),
    );
  });

  it("refuses a range under the flexible minimum", async () => {
    expect(
      await checkPromotionRange("host-1", "listing-1", "2026-10-01", "2026-10-03", TODAY),
    ).toEqual({ ok: false, reason: "BELOW_MINIMUM", minNights: 5 });
  });

  it("refuses a range over the flexible maximum", async () => {
    expect(
      await checkPromotionRange("host-1", "listing-1", "2026-10-01", "2026-10-20", TODAY),
    ).toEqual({ ok: false, reason: "ABOVE_MAXIMUM", maxNights: 14 });
  });

  it("accepts a range inside them, on any weekday", async () => {
    // A Thursday check-in: a flexible listing has no changeover rule to break.
    expect(
      await checkPromotionRange("host-1", "listing-1", "2026-10-01", "2026-10-08", TODAY),
    ).toEqual({ ok: true, checkIn: "2026-10-01", checkOut: "2026-10-08", nights: 7 });
  });

  it("treats a stored maximum of 0 as no cap", async () => {
    mocks.listingFindFirst.mockResolvedValue(
      openListing({
        bookingMode: "FLEXIBLE",
        changeoverWeekday: null,
        pricingRule: { minNights: 1, maxNights: 0 },
      }),
    );
    expect(
      (await checkPromotionRange("host-1", "listing-1", "2026-10-01", "2027-01-01", TODAY))
        .ok,
    ).toBe(true);
  });
});
