import { describe, expect, it } from "vitest";
import {
  LISTING_PRIMARY_DESTINATIONS,
  isCalendarWorkspaceStop,
  listingStopHref,
  withSelectionQuery,
} from "@/lib/host/listing-workspace";

describe("listing workspace navigation", () => {
  it("exposes only Details, Calendar, and Preview as primary destinations", () => {
    expect(
      LISTING_PRIMARY_DESTINATIONS.map(({ destination }) => destination),
    ).toEqual(["details", "calendar", "preview"]);
  });

  it.each(["availability", "pricing", "promotions"] as const)(
    "treats %s as a Calendar lens",
    (stop) => {
      expect(isCalendarWorkspaceStop(stop)).toBe(true);
    },
  );

  it("keeps the established routes and preserves selected dates", () => {
    expect(listingStopHref("listing-1", "preview")).toBe(
      "/host/listings/listing-1/edit?pane=preview",
    );
    expect(
      withSelectionQuery(
        listingStopHref("listing-1", "pricing"),
        "?from=2026-08-12&to=2026-08-15",
      ),
    ).toBe(
      "/host/listings/listing-1/pricing?from=2026-08-12&to=2026-08-15",
    );
  });
});
