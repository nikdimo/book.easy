import { describe, expect, it } from "vitest";
import { resolveListingState } from "@/lib/host/listing-state";
import type { HostListingOverviewItem } from "@/lib/services/host-listing-overview.service";

/** A listing with nothing wrong with it — every case below breaks exactly one thing, so
 *  a failure names the rule that moved rather than the fixture that drifted. */
function listing(
  overrides: Partial<HostListingOverviewItem> = {}
): HostListingOverviewItem {
  return {
    id: "l1",
    slug: "l1",
    title: "Apartment",
    status: "APPROVED",
    updatedAt: new Date(),
    createdAt: new Date(),
    needsReview: false,
    moderationNote: null,
    city: "Ohrid",
    imageUrl: null,
    photoCount: 8,
    photoTarget: 5,
    bookingCount: 3,
    baseNightlyRate: 45,
    currency: "EUR",
    failingFeedName: null,
    failingFeedSyncedAt: null,
    outOfBookableDates: false,
    nextCheckIn: null,
    upcomingNights: 0,
    upcomingWindowDays: 30,
    ...overrides,
  };
}

describe("resolveListingState", () => {
  it("reports a healthy listing's trading position rather than nothing", () => {
    expect(resolveListingState(listing()).code).toBe("NO_BOOKINGS");
    expect(resolveListingState(listing({ upcomingNights: 6 })).code).toBe(
      "NIGHTS_BOOKED"
    );
    expect(
      resolveListingState(listing({ nextCheckIn: new Date(), upcomingNights: 6 })).code
    ).toBe("NEXT_CHECK_IN");
  });

  it("puts a broken calendar feed above every other problem", () => {
    const state = resolveListingState(
      listing({
        failingFeedName: "Airbnb",
        baseNightlyRate: null,
        photoCount: 1,
        needsReview: true,
        outOfBookableDates: true,
      })
    );
    expect(state.code).toBe("SYNC_FAILED");
    expect(state.tone).toBe("error");
  });

  it("ranks blocked ahead of waiting", () => {
    // A listing that cannot take money is more urgent than one waiting on our review.
    expect(
      resolveListingState(listing({ baseNightlyRate: null, needsReview: true })).code
    ).toBe("NO_PRICE");
    expect(
      resolveListingState(listing({ outOfBookableDates: true, needsReview: true })).code
    ).toBe("OUT_OF_DATES");
  });

  it("only warns about photos and dates for a listing that is actually live", () => {
    // An unpublished listing with four photos is mid-setup, not misconfigured — telling
    // the host it is underperforming before it is on the site would be noise.
    expect(resolveListingState(listing({ status: "UNPUBLISHED", photoCount: 1 })).code).toBe(
      "HIDDEN"
    );
    expect(
      resolveListingState(listing({ status: "UNPUBLISHED", outOfBookableDates: true })).code
    ).toBe("HIDDEN");
    expect(resolveListingState(listing({ photoCount: 1 })).code).toBe("FEW_PHOTOS");
  });

  it("never nags an archived listing about setup it will never use", () => {
    expect(
      resolveListingState(listing({ status: "ARCHIVED", baseNightlyRate: null })).code
    ).toBe("ARCHIVED");
  });

  it("treats an admin decision as an error the host must see", () => {
    expect(resolveListingState(listing({ status: "SUSPENDED" })).code).toBe("SUSPENDED");
    expect(resolveListingState(listing({ status: "SUSPENDED" })).tone).toBe("error");
  });

  // L4: moderation is post-publication. A listing awaiting review is APPROVED with
  // `needsReview`, so NEEDS_REVIEW must come from the flag and from nothing else.
  it("derives 'waiting for review' from needsReview, not from a status", () => {
    expect(resolveListingState(listing({ needsReview: true })).code).toBe("NEEDS_REVIEW");
    expect(resolveListingState(listing({ needsReview: false })).code).not.toBe(
      "NEEDS_REVIEW"
    );
  });

  it("has no listing state left that reports a rejection", () => {
    const codes = [
      listing(),
      listing({ needsReview: true }),
      listing({ status: "SUSPENDED" }),
      listing({ status: "UNPUBLISHED" }),
      listing({ status: "DRAFT" }),
      listing({ status: "ARCHIVED" }),
      listing({ baseNightlyRate: null }),
      listing({ outOfBookableDates: true }),
      listing({ photoCount: 1 }),
      listing({ failingFeedName: "Airbnb" }),
    ].map((item) => resolveListingState(item).code);
    expect(codes).not.toContain("REJECTED");
  });
});
