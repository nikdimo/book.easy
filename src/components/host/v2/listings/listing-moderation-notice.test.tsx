import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import {
  ListingModerationNotice,
  isModerationBlocked,
} from "@/components/host/v2/listings/listing-moderation-notice";

const NOTE = "The bedroom photos show another property.";

describe("ListingModerationNotice", () => {
  // Suspension is the only branch that writes moderationNote (see suspendListing):
  // moderation runs after publication, so an unreviewed listing is live, not blocked.
  it("shows the status and the moderator's words for a suspended listing", () => {
    const html = renderToStaticMarkup(
      <ListingModerationNotice status="SUSPENDED" note={NOTE} />
    );
    expect(html).toContain("Suspended by our team");
    expect(html).toContain(NOTE);
  });

  it.each([null, undefined, "", "   "])(
    "tells the host what to do when the note is %p",
    (note) => {
      const html = renderToStaticMarkup(
        <ListingModerationNotice status="SUSPENDED" note={note} />
      );
      expect(html).toContain("Suspended by our team");
      expect(html).toContain("Contact support");
      // No empty red box under the heading, and no literal "null"/"undefined".
      expect(html).not.toContain("undefined");
      expect(html).not.toContain(">null<");
    }
  );

  it.each(["APPROVED", "DRAFT", "UNPUBLISHED", "ARCHIVED"])(
    "renders nothing for a %s listing even if a stale note survives",
    (status) => {
      expect(isModerationBlocked(status)).toBe(false);
      expect(
        renderToStaticMarkup(
          <ListingModerationNotice status={status} note={NOTE} />
        )
      ).toBe("");
    }
  );

  // L4: PENDING_REVIEW and REJECTED are gone from ListingStatus. A legacy string must
  // not revive a moderation branch — and nothing may still say "Rejected by our team".
  it.each(["PENDING_REVIEW", "REJECTED"])(
    "has no branch left for the retired status %s",
    (status) => {
      expect(isModerationBlocked(status)).toBe(false);
      expect(
        renderToStaticMarkup(
          <ListingModerationNotice status={status} note={NOTE} />
        )
      ).toBe("");
    }
  );

  it("never renders a rejection heading for any status", () => {
    for (const status of ["SUSPENDED", "APPROVED", "REJECTED", "PENDING_REVIEW"]) {
      expect(
        renderToStaticMarkup(
          <ListingModerationNotice status={status} note={NOTE} />
        )
      ).not.toContain("Rejected by our team");
    }
  });

  it("clamps the note in the grid tile and keeps the full text on hover", () => {
    const html = renderToStaticMarkup(
      <ListingModerationNotice status="SUSPENDED" note={NOTE} compact />
    );
    expect(html).toContain("line-clamp-2");
    expect(html).toContain(`title="${NOTE}"`);
  });
});
