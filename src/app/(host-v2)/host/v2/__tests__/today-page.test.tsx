import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The Today page is the first screen of the V2 panel, so every link on it has to stay
 * inside the V2 shell. Two of them did not: "Damage reports" opened the classic
 * `/host/inbox`, and "Explore promotions" opened the classic promotion page. These
 * assertions are about the destinations, not the wording.
 */

const mocks = vi.hoisted(() => ({
  requireHostPage: vi.fn(),
  getHostAttentionSummary: vi.fn(),
}));

vi.mock("@/lib/auth-helpers", () => ({ requireHostPage: mocks.requireHostPage }));
vi.mock("@/lib/services/attention.service", () => ({
  getHostAttentionSummary: mocks.getHostAttentionSummary,
}));
vi.mock("@/lib/i18n/t", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/i18n/t")>()),
  // The real one reads request cookies; the source locale is what an untranslated
  // request renders with and is all these assertions need.
  getT: async () => ({
    locale: "en",
    messages: {},
    resolve: (_key: string, source: string) => ({ text: source, translated: false }),
  }),
}));

import HostV2TodayPage from "../page";

type Attention = Awaited<
  ReturnType<typeof import("@/lib/services/attention.service").getHostAttentionSummary>
>;

const calmDay: Attention = {
  total: 0,
  pendingBookings: 0,
  unreadThreads: 0,
  damageReports: 0,
  damageReportConversationId: null,
  recentNotifications: [],
  firstActiveListing: null,
  incompletePaymentArrangements: null,
  incompletePaymentArrangementCount: 0,
  confirmedBookingCount: 0,
  upcomingStay: null,
};

function attention(overrides: Partial<Attention> = {}): Attention {
  return { ...calmDay, ...overrides };
}

async function render() {
  return renderToStaticMarkup(await HostV2TodayPage());
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireHostPage.mockResolvedValue({ id: "host-1", name: "Elena Host" });
  mocks.getHostAttentionSummary.mockResolvedValue(calmDay);
});

describe("the Damage reports row", () => {
  it("opens the host's own thread when the service found one", async () => {
    mocks.getHostAttentionSummary.mockResolvedValue(
      attention({ damageReports: 2, damageReportConversationId: "conv-1", total: 2 })
    );

    const html = await render();

    expect(html).toContain('href="/host/messages/conv-1"');
    expect(html).not.toContain("/host/inbox");
  });

  it("opens the V2 inbox when there is no thread it can safely open", async () => {
    // No conversation the host is a participant of — a thread link would 404, so the
    // row lands on the inbox rather than on a dead end.
    mocks.getHostAttentionSummary.mockResolvedValue(
      attention({ damageReports: 1, damageReportConversationId: null, total: 1 })
    );

    const html = await render();

    expect(html).toContain('href="/host/messages"');
    expect(html).not.toContain("/host/inbox");
  });

  it("keeps its count and stays hidden when there is nothing to report", async () => {
    mocks.getHostAttentionSummary.mockResolvedValue(
      attention({ damageReports: 3, damageReportConversationId: "conv-1", total: 3 })
    );
    const withReports = await render();
    expect(withReports).toContain("Damage reports");
    expect(withReports).toContain(">3<");

    mocks.getHostAttentionSummary.mockResolvedValue(attention({ damageReports: 0 }));
    const withoutReports = await render();
    expect(withoutReports).not.toContain("Damage reports");
  });

  it("reads nothing until the host is signed in", async () => {
    mocks.requireHostPage.mockRejectedValue(new Error("NEXT_REDIRECT"));

    await expect(render()).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.getHostAttentionSummary).not.toHaveBeenCalled();
  });

  it("scopes the read to the signed-in host", async () => {
    await render();
    expect(mocks.getHostAttentionSummary).toHaveBeenCalledWith("host-1");
  });
});

describe("the caught-up suggestion", () => {
  it("offers promotions on the V2 calendar for an active listing with no bookings", async () => {
    mocks.getHostAttentionSummary.mockResolvedValue(
      attention({
        firstActiveListing: { id: "listing-1" },
        confirmedBookingCount: 0,
      })
    );

    const html = await render();

    expect(html).toContain("Explore promotions");
    expect(html).toContain('href="/host/calendar?listing=listing-1"');
    expect(html).not.toContain("/host/listings/listing-1/promotion");
    expect(html).not.toContain("/promotion");
  });

  it("keeps the promotion card away once a booking is confirmed", async () => {
    mocks.getHostAttentionSummary.mockResolvedValue(
      attention({
        firstActiveListing: { id: "listing-1" },
        confirmedBookingCount: 1,
      })
    );

    const html = await render();

    expect(html).not.toContain("Explore promotions");
  });

  it("shows the upcoming stay instead when there is one and bookings exist", async () => {
    mocks.getHostAttentionSummary.mockResolvedValue(
      attention({
        firstActiveListing: { id: "listing-1" },
        confirmedBookingCount: 1,
        upcomingStay: { checkIn: new Date("2026-09-04T00:00:00Z"), listingId: "listing-2" },
      })
    );

    const html = await render();

    expect(html).toContain("View calendar");
    // The date is interpolated into the title in the resolved locale's own order.
    expect(html).toContain("Your next guest arrives on September 4.");
    expect(html).toContain('href="/host/calendar?listing=listing-2"');
  });

  it("says nothing when there is neither a listing to promote nor a stay ahead", async () => {
    const html = await render();

    expect(html).toContain("Enjoy the quiet moment");
    expect(html).not.toContain("Explore promotions");
    expect(html).not.toContain("View calendar");
  });

  it("gives way to the attention rows whenever there is something to act on", async () => {
    mocks.getHostAttentionSummary.mockResolvedValue(
      attention({
        pendingBookings: 1,
        total: 1,
        firstActiveListing: { id: "listing-1" },
        confirmedBookingCount: 0,
      })
    );

    const html = await render();

    expect(html).toContain("Booking requests");
    expect(html).not.toContain("Explore promotions");
  });
});

describe("the payment-arrangements task", () => {
  it("takes priority as one actionable task and opens the unfinished listing", async () => {
    mocks.getHostAttentionSummary.mockResolvedValue(
      attention({
        incompletePaymentArrangements: { id: "listing-payment", title: "Lake House" },
        incompletePaymentArrangementCount: 2,
      })
    );

    const html = await render();

    expect(html).toContain("Complete payment arrangements");
    expect(html).toContain(
      "Tell guests how they can pay and whether a deposit is required for Lake House.",
    );
    expect(html).toContain('href="/host/listings/listing-payment/payment-arrangements"');
    expect(html).toContain(">2<");
  });

  it("does not show the task after both payment answers were reviewed", async () => {
    const html = await render();

    expect(html).not.toContain("Complete payment arrangements");
  });

  it("keeps the payment task visible beside booking work", async () => {
    mocks.getHostAttentionSummary.mockResolvedValue(
      attention({
        incompletePaymentArrangements: { id: "listing-payment", title: "Lake House" },
        incompletePaymentArrangementCount: 1,
        pendingBookings: 1,
        total: 1,
      })
    );

    const html = await render();

    expect(html).toContain("Complete payment arrangements");
    expect(html).toContain("Booking requests");
  });
});

describe("the rest of the Today page", () => {
  it("leaves the other attention rows on their V2 routes", async () => {
    mocks.getHostAttentionSummary.mockResolvedValue(
      attention({
        pendingBookings: 2,
        unreadThreads: 4,
        damageReports: 1,
        damageReportConversationId: "conv-1",
        total: 7,
      })
    );

    const html = await render();

    expect(html).toContain('href="/host/reservations"');
    expect(html).toContain('href="/host/messages"');
    expect(html).toContain("Booking requests");
    expect(html).toContain("Unread messages");
    // Nothing on this screen may expose the internal version URL or classic labels.
    expect(html).not.toContain('href="/host/v2');
    expect(html).not.toContain('href="/host/bookings');
    expect(html).not.toContain('href="/host/inbox');
  });
});
