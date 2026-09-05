import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The last line of defence on the guest side.
 *
 * `listing-arrival-guide.service.test.ts` proves the entitlement rules; this proves the
 * component honours them — that a field the service withheld is not merely styled out of
 * sight but genuinely absent from the markup, and that a guest who is waiting for one is
 * told so rather than left thinking their host forgot.
 */

const mocks = vi.hoisted(() => ({ getGuestArrivalGuide: vi.fn() }));

vi.mock("@/lib/services/listing-arrival-guide.service", () => ({
  getGuestArrivalGuide: mocks.getGuestArrivalGuide,
}));
vi.mock("@/lib/i18n/t", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/i18n/t")>()),
  // The real one reads request cookies; the source locale is what an untranslated request
  // renders with and is all these assertions need.
  getT: async () => ({
    locale: "en",
    messages: {},
    resolve: (_key: string, source: string) => ({ text: source, translated: false }),
  }),
}));

import { BookingArrivalGuide } from "@/components/booking/booking-arrival-guide";
import type { GuestArrivalGuide } from "@/lib/services/listing-arrival-guide.service";

const CHECK_IN = new Date("2026-10-01T00:00:00.000Z");

/** Everything visible, as a confirmed guest sees it two days out. */
const OPEN: GuestArrivalGuide = {
  directions: "Second gate past the bakery.",
  checkInMethod: "KEYPAD" as const,
  checkInMethodInstructions: "The keypad code is 4821.",
  wifiNetwork: "Villa-Guest",
  wifiPassword: "correct-horse-battery",
  houseManual: "The boiler switch is behind the kitchen door.",
  checkoutInstructions: [{ kind: "LOCK_UP" as const, note: "" }],
  interactionPreference: "SAY_HELLO" as const,
  hasWithheldDirections: false,
  hasWithheldCredentials: false,
  credentialsUnlockAt: null,
};

async function render(
  guide: Partial<typeof OPEN>,
  status = "CONFIRMED",
): Promise<string> {
  mocks.getGuestArrivalGuide.mockResolvedValue({ ...OPEN, ...guide });
  return renderToStaticMarkup(
    await BookingArrivalGuide({
      listingId: "listing-1",
      booking: { status, checkIn: CHECK_IN },
    }),
  );
}

beforeEach(() => vi.clearAllMocks());

describe("BookingArrivalGuide", () => {
  it("shows the whole guide once the guest has earned it", async () => {
    const html = await render({});

    expect(html).toContain("Second gate past the bakery.");
    expect(html).toContain("The keypad code is 4821.");
    expect(html).toContain("Villa-Guest");
    expect(html).toContain("correct-horse-battery");
    expect(html).toContain("The boiler switch is behind the kitchen door.");
    expect(html).toContain("Lock up");
  });

  it("renders no trace of a field the service withheld", async () => {
    const html = await render({
      directions: null,
      checkInMethodInstructions: null,
      wifiNetwork: null,
      wifiPassword: null,
      houseManual: null,
      hasWithheldDirections: true,
      hasWithheldCredentials: true,
      credentialsUnlockAt: new Date("2026-09-29T00:00:00.000Z"),
    });

    expect(html).not.toContain("4821");
    expect(html).not.toContain("correct-horse-battery");
    expect(html).not.toContain("Villa-Guest");
    expect(html).not.toContain("bakery");
    // But it says what is coming and when, so the guest does not message at midnight.
    expect(html).toContain("appear here on");
  });

  it("tells an unconfirmed guest what confirmation will get them", async () => {
    const html = await render(
      {
        directions: null,
        checkInMethodInstructions: null,
        wifiNetwork: null,
        wifiPassword: null,
        houseManual: null,
        hasWithheldDirections: true,
        hasWithheldCredentials: true,
        credentialsUnlockAt: null,
      },
      "PENDING",
    );

    expect(html).toContain("Once the host confirms this booking");
  });

  it("renders nothing at all when the host has written nothing", async () => {
    mocks.getGuestArrivalGuide.mockResolvedValue({
      directions: null,
      checkInMethod: null,
      checkInMethodInstructions: null,
      wifiNetwork: null,
      wifiPassword: null,
      houseManual: null,
      checkoutInstructions: [],
      interactionPreference: null,
      hasWithheldDirections: false,
      hasWithheldCredentials: false,
      credentialsUnlockAt: null,
    });

    const rendered = await BookingArrivalGuide({
      listingId: "listing-1",
      booking: { status: "CONFIRMED", checkIn: CHECK_IN },
    });

    expect(rendered).toBeNull();
  });

  it("keeps a door code away from the machine translation layer", async () => {
    const html = await render({});

    // A "translated" keypad code is a wrong keypad code.
    expect(html).toMatch(/translate="no"[^>]*>correct-horse-battery|correct-horse-battery/);
    expect(html).toContain('translate="no"');
  });
});
