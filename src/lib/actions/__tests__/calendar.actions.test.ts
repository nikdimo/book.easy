import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  verifyManager: vi.fn(),
  mutateAvailability: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/services/availability-mutation.service", () => ({
  verifyAvailabilityManager: mocks.verifyManager,
  mutateAvailabilityForManagedListing: mocks.mutateAvailability,
}));
vi.mock("@/lib/actions/availability.actions", () => ({
  removeListingDatePriceRange: vi.fn(),
  setListingAvailabilityMode: vi.fn(),
  upsertListingDatePriceRange: vi.fn(),
}));
vi.mock("@/lib/actions/listing.actions", () => ({
  submitForReview: vi.fn(),
  unpublishListing: vi.fn(),
}));
vi.mock("@/lib/actions/pricing.actions", () => ({ saveListingPricing: vi.fn() }));
vi.mock("@/lib/actions/promotion.actions", () => ({
  disableListingPromotion: vi.fn(),
  upsertListingPromotion: vi.fn(),
}));

import {
  blockCalendarFuture,
  blockCalendarRange,
  openCalendarFuture,
  openCalendarRange,
} from "@/lib/actions/calendar.actions";

describe("authenticated web calendar availability actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ user: { id: "host-1", role: "HOST" } });
    mocks.mutateAvailability.mockResolvedValue({ success: true });
  });

  it.each(["OPEN", "CLOSED"] as const)(
    "retains authentication and ownership checks for %s mode",
    async (availabilityMode) => {
      const listing = { id: "listing-1", slug: "lake-house", availabilityMode };
      mocks.verifyManager.mockResolvedValue(listing);

      await openCalendarRange("listing-1", {
        startDate: "2026-09-10",
        endDate: "2026-09-13",
      });
      await blockCalendarRange("listing-1", {
        startDate: "2026-09-10",
        endDate: "2026-09-13",
        reason: "Owner stay",
      });
      await openCalendarFuture("listing-1");
      await blockCalendarFuture("listing-1");

      expect(mocks.auth).toHaveBeenCalledTimes(4);
      expect(mocks.verifyManager).toHaveBeenCalledWith(
        { id: "host-1", role: "HOST" },
        "listing-1",
      );
      expect(mocks.mutateAvailability).toHaveBeenNthCalledWith(
        1,
        listing,
        "OPEN_RANGE",
        { startDate: "2026-09-10", endDate: "2026-09-13" },
      );
      expect(mocks.mutateAvailability).toHaveBeenNthCalledWith(
        2,
        listing,
        "BLOCK_RANGE",
        {
          startDate: "2026-09-10",
          endDate: "2026-09-13",
          reason: "Owner stay",
        },
      );
      expect(mocks.mutateAvailability).toHaveBeenNthCalledWith(
        3,
        listing,
        "OPEN_FUTURE",
      );
      expect(mocks.mutateAvailability).toHaveBeenNthCalledWith(
        4,
        listing,
        "BLOCK_FUTURE",
      );
    },
  );

  it("refuses unauthenticated and not-owned web mutations", async () => {
    mocks.auth.mockResolvedValue(null);
    expect(
      await openCalendarRange("listing-1", {
        startDate: "2026-09-10",
        endDate: "2026-09-13",
      }),
    ).toEqual({ error: "Not authorized" });
    expect(mocks.mutateAvailability).not.toHaveBeenCalled();

    mocks.auth.mockResolvedValue({ user: { id: "host-1", role: "HOST" } });
    mocks.verifyManager.mockResolvedValue(null);
    expect(await openCalendarFuture("listing-1")).toEqual({
      error: "Listing not found",
    });
    expect(mocks.mutateAvailability).not.toHaveBeenCalled();
  });
});
