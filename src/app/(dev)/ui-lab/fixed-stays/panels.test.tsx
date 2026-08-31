import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CALENDAR_BLOCKS, FIXED_PERIODS, FIXED_PERIODS_EMPTY } from "./fixtures";
import { GuestPanel } from "./guest-panel";
import { HostPanel } from "./host-panel";

/**
 * Markup-level checks for the states a reviewer is most likely to break: the empty
 * state, the two ways of adding stays, the four period states, and the promise that a
 * guest is never shown a switched-off or past stay. The repo's vitest environment is
 * `node`, so these render statically — the interaction rules they rest on are covered as
 * pure functions in `periods.test.ts` and `quick-setup.test.ts`.
 */

const noop = () => {};

const host = (over: Partial<Parameters<typeof HostPanel>[0]> = {}) =>
  renderToStaticMarkup(
    <HostPanel
      mode="fixed"
      onModeChange={noop}
      periods={FIXED_PERIODS}
      blocks={CALENDAR_BLOCKS}
      onPeriodsChange={noop}
      {...over}
    />,
  );

const guest = (over: Partial<Parameters<typeof GuestPanel>[0]> = {}) =>
  renderToStaticMarkup(
    <GuestPanel
      kind="fixed"
      periods={FIXED_PERIODS}
      blocks={CALENDAR_BLOCKS}
      {...over}
    />,
  );

describe("HostPanel", () => {
  it("offers both booking modes as one choice", () => {
    const html = host({ mode: "flexible" });
    expect(html).toContain("Flexible dates");
    expect(html).toContain("Fixed stays");
    expect(html).toContain("How can guests book these dates?");
  });

  it("shows the unchanged minimum-stay control in flexible mode, and no stay editor", () => {
    const html = host({ mode: "flexible" });
    expect(html).toContain("Minimum stay");
    expect(html).not.toContain("Add stays");
    expect(html).not.toContain("Quick setup");
  });

  it("offers Quick setup and adding one stay by hand", () => {
    const html = host();
    expect(html).toContain("Add stays");
    expect(html).toContain("Quick setup");
    expect(html).toContain("Add one");
  });

  it("asks Quick setup's four questions, with Saturday already chosen", () => {
    const html = host();
    expect(html).toContain("Season start");
    expect(html).toContain("Last checkout");
    expect(html).toContain("Changeover day");
    expect(html).toContain("Saturday");
    expect(html).toContain("Allowed stay duration");
    expect(html).toContain("7 nights");
    expect(html).toContain("14 nights");
    expect(html).toContain("Both");
    expect(html).toContain("Preview stays");
  });

  it("never shows a package-price field", () => {
    const html = host();
    expect(html).not.toContain("Package price");
    expect(html).not.toContain("package price");
  });

  it("lists every period with its state, including the ones guests never see", () => {
    const html = host();
    // The product's own words, not new ones: Booked and Blocked are the calendar
    // legend's, Hidden is the visibility control's, Past is a calendar day state.
    expect(html).toContain("Booked");
    expect(html).toContain("Blocked");
    expect(html).toContain("Hidden");
    expect(html).toContain("Past");
    // Seven of the nine are on offer; the past week and the switched-off fortnight
    // are the host's to see and nobody else's.
    expect(html).toContain("7 offered");
    expect(html).toContain("2 hidden from guests");
  });

  it("says why a stay guests cannot select is unavailable", () => {
    const html = host();
    expect(html).toContain("Marta P. has booked this stay");
    expect(html).toContain("Airbnb has");
  });

  it("shows an empty state when the host has added nothing yet", () => {
    const html = host({ periods: FIXED_PERIODS_EMPTY, blocks: [] });
    expect(html).toContain("No stay periods yet");
  });
});

describe("GuestPanel", () => {
  it("explains that the place is only bookable as whole stays", () => {
    const html = guest();
    expect(html).toContain("This place is booked as whole stays");
    expect(html).toContain("you can&#x27;t shorten, extend or join them");
  });

  it("offers the host's exact stays and nothing else — there is no date picker", () => {
    const html = guest();
    expect(html).toContain("Available stays");
    expect(html).toContain("7 nights");
    expect(html).toContain("14 nights");
    expect(html).not.toContain("Add dates");
  });

  it("shows a booked stay and an unavailable one, both unselectable", () => {
    const html = guest();
    expect(html).toContain("Booked");
    // A guest is never told "Blocked" — that is the host's word for the host's own
    // reasons. The night being gone is the whole of what a guest needs.
    expect(html).toContain("Unavailable");
    expect(html).not.toContain("Blocked");
    expect(html).toContain("disabled=\"\"");
  });

  it("hides the stays the host switched off and the ones already gone by", () => {
    const html = guest();
    // Asserted on dates only those two rows carry: "Aug 22" would be a false negative,
    // because it is also the checkout of the 15 August week, which a guest does see.
    expect(html).not.toContain("May"); // the 23–30 May week has gone by
    expect(html).not.toContain("Sep 5"); // the switched-off 22 Aug – 5 Sep fortnight
    expect(html).not.toContain("Hidden");
  });

  it("prices each stay from the listing's own nightly rates and cleaning fee", () => {
    const html = guest();
    // 4–11 July: seven nights at €160 plus the €60 cleaning fee.
    expect(html).toContain("€1,180");
    // 18–25 July carries the peak-rate nights.
    expect(html).toContain("€1,280");
    // The fortnight qualifies for the listing's existing "14 nights or more" offer.
    expect(html).toContain("€2,076");
    expect(html).toContain("offer applied");
    // No green anywhere: it is not part of this palette.
    expect(html).not.toContain("teal");
  });

  it("leads with the cheapest whole stay rather than a nightly rate", () => {
    const html = guest();
    expect(html).toContain("per stay");
    expect(html).toContain("Fixed stays only");
  });

  it("waits for a stay before filling the booking summary", () => {
    const html = guest();
    expect(html).toContain("Choose one of the stays to see your dates and total");
  });

  it("leaves the flexible listing exactly as it is today", () => {
    const html = guest({ kind: "flexible" });
    expect(html).toContain("Flexible dates — unchanged");
    expect(html).toContain("Pick your own check-in and checkout on the calendar");
    expect(html).not.toContain("Available stays");
  });

  it("shows an empty state when the host has opened no stays", () => {
    const html = guest({ periods: FIXED_PERIODS_EMPTY, blocks: [] });
    expect(html).toContain("No stays available");
  });
});
