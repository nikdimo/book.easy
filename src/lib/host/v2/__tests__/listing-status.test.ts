import { describe, expect, it } from "vitest";
import {
  buildListingCalendarIndex,
  countDates,
} from "@/lib/host/v2/calendar-model";
import {
  canHide,
  canPublish,
  isPublishableStatus,
  listingVisibility,
  publishBlockers,
  summarizeListingStatus,
} from "@/lib/host/v2/listing-status";
import { HORIZON_END, makeListing, manualBlock, TODAY } from "./fixtures";

function summarize(listing = makeListing()) {
  const index = buildListingCalendarIndex(listing);
  const counts = countDates(listing, index, TODAY, HORIZON_END);
  return summarizeListingStatus({ listing, counts, horizonMonths: 18 });
}

describe("listingVisibility", () => {
  it("maps each stored status to what a guest would experience", () => {
    expect(listingVisibility("APPROVED")).toBe("LIVE");
    expect(listingVisibility("UNPUBLISHED")).toBe("HIDDEN");
    expect(listingVisibility("DRAFT")).toBe("DRAFT");
    expect(listingVisibility("SUSPENDED")).toBe("SUSPENDED");
    expect(listingVisibility("ARCHIVED")).toBe("ARCHIVED");
  });

  // L4: moderation is post-publication, so no stored status maps to a review queue.
  // An unknown label must fall back to DRAFT rather than resurrect a moderation state.
  it.each(["PENDING_REVIEW", "REJECTED", "WHATEVER"])(
    "falls back to DRAFT for the retired status %s",
    (status) => {
      expect(listingVisibility(status)).toBe("DRAFT");
    },
  );
});

describe("summarizeListingStatus", () => {
  it("calls an open, live listing bookable and discoverable", () => {
    const summary = summarize();
    expect(summary).toMatchObject({
      visibility: "LIVE",
      live: true,
      discoverability: "SEARCH_AND_DATES",
      bookability: "BOOKABLE",
      tone: "positive",
      liveButUnbookable: false,
    });
  });

  it("does not call a closed-by-default listing undiscoverable, only dated", () => {
    const summary = summarize(
      makeListing({
        availabilityMode: "CLOSED",
        availabilityWindows: [
          { id: "w", startDate: TODAY, endDate: "2026-04-01" },
        ],
      }),
    );
    expect(summary.discoverability).toBe("DATED_SEARCH_ONLY");
    expect(summary.bookability).toBe("BOOKABLE");
  });

  it("warns when a live listing has no bookable date at all", () => {
    const summary = summarize(
      makeListing({ blocks: [manualBlock(TODAY, "2100-01-01")] }),
    );
    expect(summary).toMatchObject({
      live: true,
      bookability: "NONE_BOOKABLE",
      liveButUnbookable: true,
      tone: "warning",
    });
    expect(summary.counts.bookable).toBe(0);
  });

  it("never derives bookability from the approved status alone", () => {
    // Hidden, yet no date is blocked. The open dates must be counted as open-but-
    // unbookable, never as bookable — a hidden listing sells nothing.
    const summary = summarize(makeListing({ status: "UNPUBLISHED" }));
    expect(summary.counts.bookable).toBe(0);
    expect(summary.counts.openNotBookable).toBeGreaterThan(0);
    expect(summary.counts.blocked).toBe(0);
    expect(summary.bookability).toBe("NOT_LIVE");
    expect(summary.discoverability).toBe("NOT_DISCOVERABLE");
    expect(summary.tone).toBe("neutral");
  });

  it("reports an unpriced listing as open but unbookable, never as available", () => {
    const summary = summarize(makeListing({ pricing: null }));
    expect(summary.counts.bookable).toBe(0);
    expect(summary.counts.openNotBookable).toBe(summary.counts.total);
    expect(summary.bookability).toBe("NO_PRICING");
  });

  it("reports missing pricing ahead of everything else", () => {
    const summary = summarize(makeListing({ pricing: null }));
    expect(summary.bookability).toBe("NO_PRICING");
  });
});

describe("listing action guards", () => {
  it("mirrors what the publish and unpublish actions accept", () => {
    expect(canPublish(makeListing({ status: "DRAFT" }))).toBe(true);
    expect(canPublish(makeListing({ status: "UNPUBLISHED" }))).toBe(true);
    expect(canPublish(makeListing({ status: "APPROVED" }))).toBe(false);
    expect(canHide(makeListing({ status: "APPROVED" }))).toBe(true);
    expect(canHide(makeListing({ status: "DRAFT" }))).toBe(false);
  });

  // L4: the retired moderation statuses must not be a way back onto the site.
  it.each(["PENDING_REVIEW", "REJECTED", "SUSPENDED", "ARCHIVED"])(
    "refuses to publish from %s",
    (status) => {
      expect(publishBlockers(makeListing({ status }))).toContain("STATUS");
      expect(isPublishableStatus(makeListing({ status }))).toBe(false);
      expect(canPublish(makeListing({ status }))).toBe(false);
    },
  );

  it("still treats the two host-recoverable states as publishable", () => {
    expect(isPublishableStatus(makeListing({ status: "DRAFT" }))).toBe(true);
    expect(isPublishableStatus(makeListing({ status: "UNPUBLISHED" }))).toBe(true);
  });
});
