import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The booking card, rendered statically in each mode.
 *
 * The repo's vitest environment is `node`, so nothing here is clicked, and the overlay
 * that holds the stay list is a dialog which renders nothing until it is opened. What
 * this file pins down is therefore the *resting* card in each mode: what it asks for,
 * what it refuses to advertise, whether its button can be pressed at all, and — the one
 * that matters most — that a flexible listing renders exactly the card it always has.
 *
 * The stay list itself is asserted where it can be rendered on its own, in
 * `fixed-stay-options.test.tsx`; the selection, payload and resume rules in
 * `src/lib/__tests__/fixed-stay-options.test.ts`,
 * `src/lib/__tests__/booking-stay-form-fields.test.ts` and
 * `src/lib/booking-resume-fixed-stay.test.ts`.
 */

const mocks = vi.hoisted(() => ({
  useSession: vi.fn(),
  useRouter: vi.fn(),
  createBookingAction: vi.fn(),
  useSheetEnabled: vi.fn(),
}));

vi.mock("next-auth/react", () => ({ useSession: mocks.useSession }));
vi.mock("next/navigation", () => ({ useRouter: mocks.useRouter }));
vi.mock("@/lib/actions/booking.actions", () => ({
  createBookingAction: mocks.createBookingAction,
}));
vi.mock("@/components/marketplace/results-sheet", () => ({
  useSheetEnabled: mocks.useSheetEnabled,
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { BookingWidget } from "@/components/public/booking-widget";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { GuestFixedStayOption } from "@/lib/fixed-stay-options";

const option = (
  id: string,
  checkIn: string,
  checkOut: string,
  nights: number,
  selectable = true,
): GuestFixedStayOption => ({ id, checkIn, checkOut, nights, selectable });

const season = [
  option("week-1", "2029-06-09", "2029-06-16", 7),
  option("fortnight", "2029-06-09", "2029-06-23", 14),
  option("week-2", "2029-06-16", "2029-06-23", 7, false),
];

function render(props: Partial<Parameters<typeof BookingWidget>[0]> = {}) {
  return renderToStaticMarkup(
    // The card's request-to-book tooltip needs Radix's provider, which the real page
    // supplies from the layout above it.
    <TooltipProvider>
    <BookingWidget
      listingId="listing-1"
      maxGuests={4}
      nightlyRate={50}
      cleaningFee={10}
      currency="EUR"
      minNights={3}
      maxNights={30}
      disabledDateRanges={[]}
      requestToBookTooltip={{ text: "Send a booking request.", translated: false }}
      acceptedPaymentMethods={{ reviewedAt: null, methodCodes: [], otherLabel: null }}
      depositPolicies={{
        version: 2,
        status: "UNANSWERED",
        advancePayment: null,
        damageDeposit: null,
      }}
      houseRulesVersion={"a".repeat(64)}
      {...props}
    />
    </TooltipProvider>,
  );
}

describe("the booking card", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useSession.mockReturnValue({ data: null, status: "unauthenticated" });
    mocks.useRouter.mockReturnValue({ push: vi.fn(), refresh: vi.fn() });
    mocks.useSheetEnabled.mockReturnValue(false);
  });

  it("asks the guest to choose a stay rather than to select dates", () => {
    const html = render({ bookingMode: "FIXED_STAYS", fixedStayOptions: season });
    expect(html).toContain("Choose a stay");
    expect(html).not.toContain("Select dates");
    // Seven ordinary nights at 50 plus the listing's 10 cleaning fee. This is a
    // calculated stay total, not a separate package price.
    expect(html).toContain("360");
    expect(html).toContain("per stay");
    expect(html).toContain("2 stays available");
    expect(html).not.toContain("/ night");
  });

  it("lets the guest view the season when every stay is unavailable", () => {
    const html = render({
      bookingMode: "FIXED_STAYS",
      fixedStayOptions: season.map((o) => ({ ...o, selectable: false })),
    });
    expect(html).toContain("View stays");
    expect(html).not.toMatch(/disabled=""[^>]*>View stays/);
    // The row still names what opens; the primary action is what changes to viewing
    // the sold-out season rather than pretending a guest can choose one.
    expect(html).toContain("Choose a stay");
  });

  it("says the same for a fixed-stay listing with no stays at all", () => {
    const html = render({ bookingMode: "FIXED_STAYS", fixedStayOptions: [] });
    expect(html).toContain("No stays are open right now");
    expect(html).toContain("disabled");
  });

  it("offers the action while at least one stay is still open", () => {
    const html = render({ bookingMode: "FIXED_STAYS", fixedStayOptions: season });
    expect(html).toContain("Choose a stay");
    expect(html).not.toContain("No stays are open right now");
  });

  it("never advertises a minimum stay on a fixed-stay listing", () => {
    const html = render({
      bookingMode: "FIXED_STAYS",
      fixedStayOptions: season,
      minNights: 5,
    });
    expect(html).not.toContain("Minimum stay");
  });
});

describe("a stay deep-linked from a dated search", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useSession.mockReturnValue({ data: null, status: "unauthenticated" });
    mocks.useRouter.mockReturnValue({ push: vi.fn(), refresh: vi.fn() });
    mocks.useSheetEnabled.mockReturnValue(false);
  });

  /** The resting card names the stay it opened on, which is how a selection shows here. */
  const opensOn = (html: string) => html.includes("Jun 9");

  it("opens on a stay this listing is currently offering", () => {
    const html = render({
      bookingMode: "FIXED_STAYS",
      fixedStayOptions: season,
      initialFixedStayPeriodId: "week-1",
      initialCheckIn: "2029-06-09",
      initialCheckOut: "2029-06-16",
    });
    expect(opensOn(html)).toBe(true);
  });

  it.each([
    ["an id this listing has never offered", "from-another-listing"],
    ["an id of a stay someone else has taken", "week-2"],
    ["a malformed id", "../../etc/passwd"],
    ["an empty id", ""],
  ])("selects nothing for %s", (_label, id) => {
    const html = render({
      bookingMode: "FIXED_STAYS",
      fixedStayOptions: season,
      initialFixedStayPeriodId: id,
    });
    // The card asks for a stay, exactly as it would with no link at all.
    expect(html).toContain("Choose a stay");
    expect(opensOn(html)).toBe(false);
  });

  it("selects nothing once the listing has switched back to flexible", () => {
    // The link was made when the listing sold whole stays; its page no longer does.
    const html = render({
      fixedStayOptions: season,
      initialFixedStayPeriodId: "week-1",
    });
    expect(html).toContain("Select dates");
    expect(html).not.toContain("Choose a stay");
  });

  it("renders the same card as arriving with no link at all", () => {
    expect(
      render({
        bookingMode: "FIXED_STAYS",
        fixedStayOptions: season,
        initialFixedStayPeriodId: "no-such-stay",
      }),
    ).toBe(
      render({ bookingMode: "FIXED_STAYS", fixedStayOptions: season }),
    );
  });
});

describe("a flexible listing is untouched", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useSession.mockReturnValue({ data: null, status: "unauthenticated" });
    mocks.useRouter.mockReturnValue({ push: vi.fn(), refresh: vi.fn() });
    mocks.useSheetEnabled.mockReturnValue(false);
  });

  it("still asks the guest to select dates", () => {
    const html = render();
    expect(html).toContain("Select dates");
    expect(html).not.toContain("Choose a stay");
    expect(html).not.toContain("No stays are open right now");
  });

  it("still states the minimum stay under the price", () => {
    expect(render({ minNights: 5 })).toContain("Minimum stay is 5 nights");
  });

  it("leaves its button pressable", () => {
    // Only `isPending` disables it, exactly as before — a flexible listing has no
    // "nothing on offer" state for the fixed-stay rule to reach.
    const html = render();
    expect(html).toContain("Select dates");
    expect(html).not.toMatch(/disabled=""[^>]*>Select dates/);
  });

  it("renders identically whether or not stays are passed alongside", () => {
    // A listing that switched back to flexible still owns its stored stays. They must
    // change nothing about the card it renders.
    expect(render({ fixedStayOptions: season })).toBe(render());
    expect(render({ bookingMode: "FLEXIBLE", fixedStayOptions: season })).toBe(
      render(),
    );
  });
});
