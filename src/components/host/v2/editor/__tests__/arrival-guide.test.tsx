import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// The section imports both server actions, which would drag the real Prisma client into a
// render test. Nothing here clicks anything, so stubs are enough.
vi.mock("@/lib/actions/listing-arrival-guide.actions", () => ({
  updateListingArrivalGuide: vi.fn(),
}));
vi.mock("@/lib/actions/listing-house-rules.actions", () => ({
  updateListingHouseRules: vi.fn(),
}));

import { ArrivalGuideSection } from "@/components/host/v2/editor/arrival-guide/arrival-guide-section";
import {
  ARRIVAL_GUIDE_TOPICS,
  emptyListingArrivalGuide,
  type ListingArrivalGuideInput,
} from "@/lib/host/v2/listing-arrival-guide";
import {
  emptyListingHouseRules,
  type ListingHouseRulesInput,
} from "@/lib/host/v2/listing-house-rules";

function render(
  overrides: {
    topic?: string | null;
    guide?: Partial<ListingArrivalGuideInput>;
    rules?: Partial<ListingHouseRulesInput>;
    status?: string;
  } = {},
) {
  return renderToStaticMarkup(
    <ArrivalGuideSection
      listingId="listing-1"
      slug="seaside-flat"
      status={overrides.status ?? "APPROVED"}
      topic={overrides.topic ?? null}
      guide={{ ...emptyListingArrivalGuide(), ...overrides.guide }}
      rules={{ ...emptyListingHouseRules(), ...overrides.rules }}
      largestUpcomingParty={0}
    />,
  );
}

describe("ArrivalGuideSection", () => {
  it("lists every card, each at its own URL", () => {
    const html = render();

    for (const topic of ARRIVAL_GUIDE_TOPICS) {
      expect(html).toContain(`/host/listings/listing-1/arrival-guide/${topic.slug}`);
    }
    // The check-in card prints the two times instead of a title, exactly as Airbnb's
    // does, so it is the one card whose own name does not appear in the list.
    for (const topic of ARRIVAL_GUIDE_TOPICS.filter(
      (entry) => entry.slug !== "check-in-checkout",
    )) {
      expect(html).toContain(topic.source);
    }
  });

  it("opens on check-in and checkout when the URL names no card", () => {
    const html = render();

    expect(html).toContain("Check-in window");
    expect(html).toContain("Start time");
    expect(html).toContain("End time");
  });

  it("renders the card the URL names", () => {
    const html = render({ topic: "house-manual" });

    expect(html).toContain(
      "Give guests tips about your space, like how to access the internet and use the TV.",
    );
  });

  it("says who will read each field, on the field's own screen", () => {
    expect(render({ topic: "directions" })).toContain("Shared once a booking is confirmed");
    expect(render({ topic: "wifi-details" })).toContain("Shared 48 hours before check-in");
    expect(render({ topic: "checkout-instructions" })).toContain(
      "Anyone can read this before they book",
    );
  });

  it("prompts for a check-in method before asking for the code", () => {
    const chooser = render({ topic: "check-in-method" });
    expect(chooser).toContain("Select a check-in method");
    expect(chooser).toContain("Guests will use the code you provide");

    const chosen = render({ topic: "check-in-method", guide: { checkInMethod: "LOCKBOX" } });
    expect(chosen).toContain("Where the lockbox is and the code that opens it.");
    // The warning belongs to the methods that need a credential, and only to them.
    expect(chosen).toContain("This is the only place a door code belongs");
    expect(
      render({ topic: "check-in-method", guide: { checkInMethod: "IN_PERSON" } }),
    ).not.toContain("This is the only place a door code belongs");
  });

  it("never prints a stored credential on the card list", () => {
    const html = render({
      guide: {
        wifiNetwork: "Villa-Guest",
        wifiPassword: "hunter2-actual-password",
        checkInMethod: "KEYPAD",
        checkInMethodInstructions: "The keypad code is 4821.",
      },
    });

    expect(html).not.toContain("hunter2-actual-password");
    expect(html).not.toContain("4821");
    // The network name is not a secret and is what tells the host the card is filled in.
    expect(html).toContain("Villa-Guest");
  });

  it("summarises the stay times and the house rules the way Airbnb's cards do", () => {
    const html = render({
      rules: { checkInTime: "15:00", checkInEndTime: "20:00", checkOutTime: "11:00", maxGuests: 4 },
    });

    expect(html).toContain("15:00");
    expect(html).toContain("11:00");
    expect(html).toContain("Arrive between 15:00 and 20:00");
    expect(html).toContain("4 guests maximum");
  });

  it("falls back to an open-ended arrival line when there is no window end", () => {
    const html = render({ rules: { checkInTime: "15:00", checkInEndTime: "" } });

    expect(html).toContain("Check-in after 15:00");
    expect(html).not.toContain("Arrive between");
  });

  it("invites the host to fill in a card that has nothing in it", () => {
    expect(render()).toContain("Add details");
  });

  it("offers the public preview only for a listing that has a public page", () => {
    expect(render({ status: "APPROVED" })).toContain("/properties/seaside-flat");
    expect(render({ status: "DRAFT" })).not.toContain("/properties/seaside-flat");
  });

  it("keeps the rest of the editor reachable without the rail", () => {
    const html = render();

    // "Your space" and the back arrow both return to the editor's index, and the gear
    // menu carries the sections the rail used to list.
    expect(html).toContain('href="/host/listings/listing-1"');
    expect(html).toContain("Your space");
    expect(html).toContain("Listing sections");
  });
});
