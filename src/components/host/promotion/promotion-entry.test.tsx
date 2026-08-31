import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const mocks = vi.hoisted(() => ({
  getWorkspace: vi.fn(),
  listDestinations: vi.fn(),
}));

// The workspace's server actions pull next-auth in through a module graph vitest's node
// environment cannot resolve, and the same is true of the listing row's own actions.
// Stubbed the way listing-actions-menu.test.tsx stubs them: what is under test here is
// which control renders for which listing status, not what the actions do.
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/actions/listing.actions", () => ({
  archiveListing: vi.fn(),
  unarchiveListing: vi.fn(),
  deleteListing: vi.fn(),
  deleteListingDraft: vi.fn(),
  submitForReview: vi.fn(),
  unpublishListing: vi.fn(),
}));
vi.mock("@/lib/actions/favorite.actions", () => ({ toggleFavorite: vi.fn() }));
vi.mock("@/lib/actions/facebook-promotion.actions", () => ({
  getPromotionWorkspaceAction: mocks.getWorkspace,
  listFacebookDestinationsAction: mocks.listDestinations,
  checkPromotionRangeAction: vi.fn(),
  createFacebookDestinationAction: vi.fn(),
  updateFacebookDestinationAction: vi.fn(),
  deleteFacebookDestinationAction: vi.fn(),
  markFacebookDestinationUsedAction: vi.fn(),
}));

import { Dialog } from "@/components/ui/dialog";
import { TooltipProvider } from "@/components/ui/tooltip";
import { FacebookPromoteButton } from "@/components/host/facebook-promote-button";
import { ListingActions } from "@/components/public/listing-actions";
import { ListingOverview } from "@/components/host/v2/listings/listing-overview";
import { PromotionWorkspace } from "@/components/host/promotion/promotion-workspace";
import type { HostListingOverviewItem } from "@/lib/services/host-listing-overview.service";

// A JSX `title` attribute is one the i18n extractor treats as visible copy, so the
// fixture goes through a variable the way the sibling component tests do.
const listingTitle = "Apartment";

function listing(
  overrides: Partial<HostListingOverviewItem> = {},
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

function renderOverview(listings: HostListingOverviewItem[]) {
  return renderToStaticMarkup(
    <ListingOverview
      listings={listings}
      drafts={[]}
      statusLabels={{ APPROVED: "Approved", UNPUBLISHED: "Unpublished" }}
    />,
  );
}

describe("promotion entry points", () => {
  it("offers the promotion control on a published listing row", () => {
    expect(renderOverview([listing()])).toContain("Promote Apartment on Facebook");
  });

  it("withholds it from a listing that has no public page to promote", () => {
    for (const status of ["DRAFT", "UNPUBLISHED", "SUSPENDED", "ARCHIVED"] as const) {
      expect(
        renderOverview([listing({ status })]),
        status,
      ).not.toContain("Promote Apartment on Facebook");
    }
  });

  it("opens a dialog rather than linking straight out to Facebook", () => {
    // The old control was an anchor at facebook.com/sharer, which took the host away
    // before they had written anything. The trigger is now a button on a closed dialog.
    const html = renderToStaticMarkup(
      <FacebookPromoteButton listingId="l1" title={listingTitle} compact />,
    );

    expect(html).toContain('data-state="closed"');
    expect(html).not.toContain("facebook.com/sharer");
  });

  it("gives a host on their own public page Promote instead of the guest Share", () => {
    // The root layout mounts the provider; only this isolated render needs its own.
    const own = renderToStaticMarkup(
      <TooltipProvider>
        <ListingActions
          title={listingTitle}
          listingId="l1"
          isAuthenticated
          isOwnListing
        />
      </TooltipProvider>,
    );
    expect(own).toContain("Promote");
    expect(own).not.toContain(">Share<");

    const guest = renderToStaticMarkup(
      <TooltipProvider>
        <ListingActions title={listingTitle} listingId="l1" isAuthenticated />
      </TooltipProvider>,
    );
    expect(guest).toContain(">Share<");
    expect(guest).not.toContain("Promote");
  });
});

describe("PromotionWorkspace states", () => {
  it("shows a labelled loading state while the listing is being read", () => {
    mocks.getWorkspace.mockReturnValue(new Promise(() => {}));
    mocks.listDestinations.mockReturnValue(new Promise(() => {}));

    // The workspace always lives inside a Dialog: Radix labels the dialog from the
    // title it renders, which every state — this one included — has to provide.
    const html = renderToStaticMarkup(
      <Dialog open>
        <PromotionWorkspace listingId="l1" />
      </Dialog>,
    );

    expect(html).toContain("Promote your property");
    // A spinner alone says nothing to a screen reader, so the state carries a name.
    expect(html).toContain("Loading promotion tools");
  });
});
