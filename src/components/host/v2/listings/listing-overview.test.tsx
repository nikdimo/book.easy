import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// The row's controls are server actions, which drag next-auth in through a module graph
// that vitest's node environment cannot resolve. The overview under test only needs them
// to render, so they are stubbed the same way listing-actions-menu.test.tsx stubs them.
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/actions/listing.actions", () => ({
  archiveListing: vi.fn(),
  unarchiveListing: vi.fn(),
  deleteListing: vi.fn(),
  deleteListingDraft: vi.fn(),
  submitForReview: vi.fn(),
  unpublishListing: vi.fn(),
}));

import { ListingOverview } from "@/components/host/v2/listings/listing-overview";
import { HOST_START_IMPORT_HREF } from "@/components/host/v2/listings/add-listing-menu";
import type { HostListingOverviewItem } from "@/lib/services/host-listing-overview.service";

/**
 * `useSyncExternalStore` falls back to the server snapshot here, which is the list view —
 * the grid's half of the same behaviour is covered directly in
 * listing-moderation-notice.test.tsx and add-listing-menu.test.tsx.
 */
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

const labels = { APPROVED: "Approved", REJECTED: "Rejected", SUSPENDED: "Suspended" };

function render(listings: HostListingOverviewItem[]) {
  return renderToStaticMarkup(
    <ListingOverview listings={listings} drafts={[]} statusLabels={labels} />
  );
}

describe("ListingOverview add-listing entry point", () => {
  it("offers the import route from the empty state", () => {
    const html = render([]);
    expect(html).toContain("Start your first listing");
    expect(html).toContain(HOST_START_IMPORT_HREF);
  });

  // The toolbar is rendered above the rows, so the same menu is present whether the host
  // is in list or grid view — the trigger is what the test can see without a DOM.
  it("keeps the add-listing menu in the toolbar once listings exist", () => {
    const html = render([listing()]);
    expect(html).toContain("Add a listing");
  });
});

describe("ListingOverview rejected listings", () => {
  it("shows the moderator's note on the rejected row instead of sending the host away", () => {
    const html = render([
      listing({ status: "REJECTED", moderationNote: "Photos show another property." }),
    ]);
    expect(html).toContain("Rejected by our team");
    expect(html).toContain("Photos show another property.");
    // The old line told the host to go and look; the note is now right here.
    expect(html).not.toContain("open the listing to see why");
  });

  it("falls back to guidance when the note is blank", () => {
    const html = render([listing({ status: "REJECTED", moderationNote: "  " })]);
    expect(html).toContain("Rejected by our team");
    expect(html).toContain("Contact support");
  });

  it("keeps a broken calendar visible on a rejected listing", () => {
    const html = render([
      listing({
        status: "REJECTED",
        moderationNote: "Photos show another property.",
        failingFeedName: "Airbnb",
      }),
    ]);
    expect(html).toContain("Airbnb");
    expect(html).toContain("Photos show another property.");
  });

  it("shows no moderation note on a healthy listing", () => {
    const html = render([listing()]);
    expect(html).not.toContain("Rejected by our team");
    expect(html).not.toContain("Suspended by our team");
  });
});
