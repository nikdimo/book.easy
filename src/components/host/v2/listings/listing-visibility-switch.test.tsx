import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  submitForReview: vi.fn(),
  unpublishListing: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("@/lib/actions/listing.actions", () => ({
  submitForReview: mocks.submitForReview,
  unpublishListing: mocks.unpublishListing,
}));

import {
  isVisibilitySwitchable,
  ListingVisibilitySwitch,
} from "@/components/host/v2/listings/listing-visibility-switch";
const listingTitle = "Seaside apartment";

// G2: publish/unpublish now call router.refresh() after a successful mutation so the
// /host/listings overview reflects the new status without a manual reload.
describe("ListingVisibilitySwitch", () => {
  it("renders as checked and labeled 'Listed' for an approved listing", () => {
    const html = renderToStaticMarkup(
      <ListingVisibilitySwitch listingId="listing-1" title={listingTitle} status="APPROVED" />
    );

    expect(html).toContain("Listed");
    expect(html).toContain('aria-checked="true"');
  });

  it("renders as unchecked and labeled 'Unlisted' for an unpublished listing", () => {
    const html = renderToStaticMarkup(
      <ListingVisibilitySwitch listingId="listing-1" title={listingTitle} status="UNPUBLISHED" />
    );

    expect(html).toContain("Unlisted");
    expect(html).toContain('aria-checked="false"');
  });
});

describe("isVisibilitySwitchable", () => {
  it("is switchable for host-recoverable and live states", () => {
    expect(isVisibilitySwitchable("APPROVED")).toBe(true);
    expect(isVisibilitySwitchable("UNPUBLISHED")).toBe(true);
    expect(isVisibilitySwitchable("DRAFT")).toBe(true);
    expect(isVisibilitySwitchable("REJECTED")).toBe(true);
  });

  it("is not switchable for admin-owned states", () => {
    expect(isVisibilitySwitchable("SUSPENDED")).toBe(false);
    expect(isVisibilitySwitchable("PENDING_REVIEW")).toBe(false);
    expect(isVisibilitySwitchable("ARCHIVED")).toBe(false);
  });
});
