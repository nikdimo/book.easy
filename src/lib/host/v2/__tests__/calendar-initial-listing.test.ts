import { describe, expect, it } from "vitest";
import { initialCalendarListingId } from "@/lib/host/v2/calendar-model";
import type { CalendarFormats } from "@/lib/host/v2/calendar-format";
import type { HostCalendarWorkspaceData } from "@/lib/host/v2/calendar-types";
import { HORIZON_END, TODAY, makeListing } from "./fixtures";

/** The formats are resolved on the server and none of this rule reads them. */
const formats = {} as CalendarFormats;

function workspace(
  listings: HostCalendarWorkspaceData["listings"],
): HostCalendarWorkspaceData {
  return { today: TODAY, horizonEnd: HORIZON_END, horizonMonths: 18, formats, listings };
}

const mine = makeListing({ id: "mine-1" });
const alsoMine = makeListing({ id: "mine-2", slug: "second" });

describe("initialCalendarListingId", () => {
  it("opens on the listing the link asked for", () => {
    expect(initialCalendarListingId(workspace([mine, alsoMine]), "mine-2")).toBe(
      "mine-2",
    );
  });

  it("opens on the host's default listing when nothing was requested", () => {
    expect(initialCalendarListingId(workspace([mine, alsoMine]), null)).toBe("mine-1");
  });

  it("falls back safely when the requested listing is not the host's", () => {
    // The payload is scoped to the signed-in host, so a listing belonging to someone
    // else is simply absent from it — and the calendar shows the host's own default
    // rather than an empty calendar that would confirm the other listing exists.
    expect(
      initialCalendarListingId(workspace([mine, alsoMine]), "someone-elses-listing"),
    ).toBe("mine-1");
  });

  it("falls back safely for a listing that has since been deleted", () => {
    expect(initialCalendarListingId(workspace([mine]), "deleted-listing")).toBe("mine-1");
  });

  it("prefers a listing the host can actually sell", () => {
    const draft = makeListing({ id: "draft-1", status: "DRAFT" });
    expect(initialCalendarListingId(workspace([draft, mine]), null)).toBe("mine-1");
  });

  it("selects nothing when the host has no listings at all", () => {
    expect(initialCalendarListingId(workspace([]), "mine-1")).toBeNull();
    expect(initialCalendarListingId(workspace([]), null)).toBeNull();
  });
});
