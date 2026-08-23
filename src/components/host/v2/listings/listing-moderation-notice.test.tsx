import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import {
  ListingModerationNotice,
  isModerationBlocked,
} from "@/components/host/v2/listings/listing-moderation-notice";

const NOTE = "The bedroom photos show another property.";

describe("ListingModerationNotice", () => {
  it("shows the status and the moderator's words for a rejected listing", () => {
    const html = renderToStaticMarkup(
      <ListingModerationNotice status="REJECTED" note={NOTE} />
    );
    expect(html).toContain("Rejected by our team");
    expect(html).toContain(NOTE);
  });

  // Suspension is the branch that actually writes moderationNote today (see
  // suspendListing), so it has to read as an explanation rather than as a rejection.
  it("labels a suspension as suspended, not rejected", () => {
    const html = renderToStaticMarkup(
      <ListingModerationNotice status="SUSPENDED" note={NOTE} />
    );
    expect(html).toContain("Suspended by our team");
    expect(html).not.toContain("Rejected by our team");
    expect(html).toContain(NOTE);
  });

  it.each([null, undefined, "", "   "])(
    "tells the host what to do when the note is %p",
    (note) => {
      const html = renderToStaticMarkup(
        <ListingModerationNotice status="REJECTED" note={note} />
      );
      expect(html).toContain("Rejected by our team");
      expect(html).toContain("Contact support");
      // No empty red box under the heading, and no literal "null"/"undefined".
      expect(html).not.toContain("undefined");
      expect(html).not.toContain(">null<");
    }
  );

  it.each(["APPROVED", "PENDING_REVIEW", "DRAFT", "UNPUBLISHED", "ARCHIVED"])(
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

  it("clamps the note in the grid tile and keeps the full text on hover", () => {
    const html = renderToStaticMarkup(
      <ListingModerationNotice status="REJECTED" note={NOTE} compact />
    );
    expect(html).toContain("line-clamp-2");
    expect(html).toContain(`title="${NOTE}"`);
  });
});
