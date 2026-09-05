import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { HostListingOverviewItem } from "@/lib/services/host-listing-overview.service";

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  archiveListing: vi.fn(),
  unarchiveListing: vi.fn(),
  deleteListing: vi.fn(),
  submitForReview: vi.fn(),
  unpublishListing: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("@/lib/actions/listing.actions", () => ({
  archiveListing: mocks.archiveListing,
  unarchiveListing: mocks.unarchiveListing,
  deleteListing: mocks.deleteListing,
  submitForReview: mocks.submitForReview,
  unpublishListing: mocks.unpublishListing,
}));

import { ListingOverview } from "@/components/host/v2/listings/listing-overview";

function listing(
  overrides: Partial<HostListingOverviewItem> = {},
): HostListingOverviewItem {
  return {
    id: "listing-1",
    title: "Seaside apartment",
    slug: "seaside-apartment",
    status: "APPROVED",
    city: "Ohrid",
    imageUrl: null,
    moderationNote: null,
    needsReview: false,
    baseNightlyRate: 120,
    outOfBookableDates: false,
    photoCount: 5,
    photoTarget: 5,
    nextCheckIn: null,
    nightsBookedThisMonth: 0,
    failingFeedName: null,
    failingFeedSyncedAt: null,
    ...overrides,
  } as HostListingOverviewItem;
}

function render(listings: HostListingOverviewItem[], drafts: never[] = []) {
  return renderToStaticMarkup(
    <ListingOverview listings={listings} drafts={drafts} statusLabels={{}} />
  );
}

/**
 * A host who archives everything has an empty active list and an empty search box. The
 * list view answered that with "No listings match your search", a search they never ran
 * — while Today, reading the same data, greeted them with "you haven't listed a home
 * yet". The grid view had already been given the guard; the list view had not.
 *
 * `renderToStaticMarkup` takes the server snapshot of the remembered view, which is
 * always the list — so this renders exactly the branch that was wrong.
 */
describe("an overview with nothing left to show", () => {
  it("says the listings are archived rather than blaming a search", () => {
    const html = render([listing({ status: "ARCHIVED" })]);

    expect(html).toContain("Every listing you have is archived");
    expect(html).not.toContain("No listings match your search");
  });

  it("still offers the way to see them", () => {
    const html = render([listing({ status: "ARCHIVED" })]);
    expect(html).toContain("Show 1 archived listings");
  });

  it("keeps the first-listing screen for a host who has nothing at all", () => {
    const html = render([]);
    expect(html).toContain("Start your first listing");
    expect(html).not.toContain("Every listing you have is archived");
    expect(html).not.toContain("No listings match your search");
  });
});

/**
 * Publishing had one home in the entire panel: this switch, wrapped in `hidden sm:block`
 * and absent from the grid. On a phone there was no way to take a listing off the site.
 * The switch stays where there is room for it; the overflow menu — present at every
 * width and in both views — now names the same action.
 */
describe("where a host can change whether a listing is on the site", () => {
  it("keeps the grid action visible on touch-sized screens", () => {
    const source = readFileSync(
      path.join(process.cwd(), "src/components/host/v2/listings/listing-overview.tsx"),
      "utf8",
    );
    expect(source).toContain("opacity-100 shadow-sm transition-opacity sm:opacity-0");
  });

  it("keeps the switch on the row for widths that have room for it", () => {
    const html = render([listing()]);
    // The Switch renders its state as `aria-checked`, and APPROVED means listed.
    expect(html).toContain('aria-checked="true"');
    expect(html).toContain("Take Seaside apartment off the site");
  });

  it("shows an unlisted listing as unlisted", () => {
    const html = render([listing({ status: "UNPUBLISHED" })]);
    expect(html).toContain('aria-checked="false"');
    expect(html).toContain("Put Seaside apartment on the site");
  });

  it("offers no control at all for a status the host does not own", () => {
    // `submitForReview` and `unpublishListing` both refuse a suspended listing.
    const html = render([listing({ status: "SUSPENDED" })]);
    expect(html).not.toContain("aria-checked");
  });
});
