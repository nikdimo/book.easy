import { describe, expect, it } from "vitest";
import {
  buildActionQueue,
  countsByFilter,
  daysFromToday,
  groupOf,
  groupReservations,
  matchesFilter,
  matchesQuery,
  selectReservations,
  summarizeProperty,
} from "@/lib/host/v2/reservation-model";
import type { HostReservation } from "@/lib/host/v2/reservation-types";

const TODAY = "2026-08-16";
/** Midday, so a "16 hours left" deadline lands tomorrow morning rather than tonight. */
const NOW = new Date("2026-08-16T12:00:00.000Z");

function reservation(
  overrides: Partial<HostReservation> & Pick<HostReservation, "id">,
): HostReservation {
  return {
    reference: `LH-${overrides.id}`,
    status: "CONFIRMED",
    listingId: "listing-1",
    guest: { id: "guest-1", name: "Ana Petrovska", image: null },
    checkIn: "2026-08-24",
    checkOut: "2026-08-28",
    nights: 4,
    guestCount: 2,
    currency: "EUR",
    nightlyRate: 100,
    cleaningFee: 20,
    serviceFee: 0,
    discountAmount: 0,
    total: 420,
    paymentStatus: "UNTRACKED",
    paymentInstructionsStatus: "NOT_DECIDED",
    selectedPaymentMethod: null,
    paymentMethodOtherLabel: null,
    advancePaymentStatus: "UNTRACKED",
    damageDepositStatus: "UNTRACKED",
    advancePaymentAmount: null,
    damageDepositAmount: null,
    depositPolicies: null,
    paymentStatusEvents: [],
    guestNote: null,
    cancellationReason: null,
    createdAt: "2026-08-01T10:00:00.000Z",
    respondedAt: null,
    responseDueAt: "2026-08-02T10:00:00.000Z",
    ratingDueAt: null,
    unreadCount: 0,
    conversationId: null,
    checkInTime: "15:00",
    checkOutTime: "11:00",
    ...overrides,
  };
}

const NO_ACTIONS: ReadonlySet<string> = new Set();
const TITLES = new Map([
  ["listing-1", "Bright apartment with sea view"],
  ["listing-2", "Cozy 2BR Garden Apartment"],
]);

describe("daysFromToday", () => {
  it("counts whole civil days in both directions", () => {
    expect(daysFromToday("2026-08-16", TODAY)).toBe(0);
    expect(daysFromToday("2026-08-17", TODAY)).toBe(1);
    expect(daysFromToday("2026-08-01", TODAY)).toBe(-15);
  });

  it("crosses a month and a year boundary", () => {
    expect(daysFromToday("2026-09-01", TODAY)).toBe(16);
    expect(daysFromToday("2027-01-01", TODAY)).toBe(138);
  });
});

describe("groupOf", () => {
  it("puts a stay that has not started under upcoming", () => {
    expect(groupOf(reservation({ id: "a" }), TODAY)).toBe("upcoming");
  });

  it("puts a stay in progress, and one arriving today, under today", () => {
    const arriving = reservation({
      id: "a",
      checkIn: TODAY,
      checkOut: "2026-08-22",
    });
    const midStay = reservation({
      id: "b",
      checkIn: "2026-08-12",
      checkOut: "2026-08-20",
    });
    expect(groupOf(arriving, TODAY)).toBe("today");
    expect(groupOf(midStay, TODAY)).toBe("today");
  });

  it("treats check-out as exclusive, so a stay ending today is already over", () => {
    const leaving = reservation({
      id: "a",
      checkIn: "2026-08-12",
      checkOut: TODAY,
    });
    expect(groupOf(leaving, TODAY)).toBe("earlier");
  });

  it("files a cancellation as history even when its dates are still ahead", () => {
    // Listing next month's cancellation under "Upcoming" would put a stay nobody is
    // coming for among the ones the host is preparing for.
    const cancelled = reservation({
      id: "a",
      status: "CANCELLED_BY_GUEST",
      checkIn: "2026-09-20",
      checkOut: "2026-09-24",
    });
    expect(groupOf(cancelled, TODAY)).toBe("earlier");
  });
});

describe("matchesFilter", () => {
  const pending = reservation({ id: "pending", status: "PENDING" });
  const staying = reservation({
    id: "staying",
    checkIn: "2026-08-14",
    checkOut: "2026-08-20",
  });
  const completed = reservation({ id: "done", status: "COMPLETED" });
  const expired = reservation({ id: "expired", status: "EXPIRED" });

  it("counts a request that has not started as upcoming", () => {
    expect(matchesFilter(pending, "upcoming", TODAY, NO_ACTIONS)).toBe(true);
  });

  it("keeps a stay in progress out of upcoming and inside staying", () => {
    expect(matchesFilter(staying, "upcoming", TODAY, NO_ACTIONS)).toBe(false);
    expect(matchesFilter(staying, "staying", TODAY, NO_ACTIONS)).toBe(true);
  });

  it("never counts a request as staying, however its dates fall", () => {
    // An unanswered request holds dates but no guest has been let in.
    const requestedNow = reservation({
      id: "now",
      status: "PENDING",
      checkIn: "2026-08-14",
      checkOut: "2026-08-20",
    });
    expect(matchesFilter(requestedNow, "staying", TODAY, NO_ACTIONS)).toBe(false);
  });

  it("separates completed from cancelled", () => {
    expect(matchesFilter(completed, "completed", TODAY, NO_ACTIONS)).toBe(true);
    expect(matchesFilter(completed, "cancelled", TODAY, NO_ACTIONS)).toBe(false);
    expect(matchesFilter(expired, "cancelled", TODAY, NO_ACTIONS)).toBe(true);
  });

  it("reads the action filter from the queue, not from the status", () => {
    const ids = new Set(["pending"]);
    expect(matchesFilter(pending, "action", TODAY, ids)).toBe(true);
    expect(matchesFilter(completed, "action", TODAY, ids)).toBe(false);
  });
});

describe("matchesQuery", () => {
  const target = reservation({
    id: "a",
    reference: "LH-2026-DQ7JN4DQ",
    guest: { id: "g", name: "Ana Petrovska", image: null },
  });

  it("matches the guest, the reference and the property title", () => {
    expect(matchesQuery(target, "petrovska", "Bright apartment")).toBe(true);
    expect(matchesQuery(target, "dq7jn4dq", "Bright apartment")).toBe(true);
    expect(matchesQuery(target, "bright", "Bright apartment")).toBe(true);
  });

  it("requires every word, so a second word narrows the result", () => {
    expect(matchesQuery(target, "ana bright", "Bright apartment")).toBe(true);
    expect(matchesQuery(target, "ana garden", "Bright apartment")).toBe(false);
  });

  it("searches the translated status the host is actually reading", () => {
    const cancelled = reservation({ id: "b", status: "CANCELLED_BY_GUEST" });
    expect(matchesQuery(cancelled, "откажано", "Стан", "Откажано од гостин")).toBe(
      true,
    );
  });

  it("treats an empty query as no filter at all", () => {
    expect(matchesQuery(target, "   ", "Bright apartment")).toBe(true);
  });
});

describe("selectReservations", () => {
  const soonest = reservation({ id: "soon", checkIn: "2026-08-18", checkOut: "2026-08-20" });
  const later = reservation({ id: "later", checkIn: "2026-09-10", checkOut: "2026-09-14" });
  const justPast = reservation({
    id: "just-past",
    status: "COMPLETED",
    checkIn: "2026-08-10",
    checkOut: "2026-08-14",
  });
  const longPast = reservation({
    id: "long-past",
    status: "COMPLETED",
    checkIn: "2026-05-10",
    checkOut: "2026-05-14",
  });
  const all = [longPast, later, justPast, soonest];

  function ids(sort: "priority" | "soonest" | "newest" | "highest") {
    return selectReservations(all, {
      propertyId: null,
      filter: "all",
      sort,
      query: "",
      today: TODAY,
      actionIds: NO_ACTIONS,
      propertyTitles: TITLES,
    }).map((row) => row.id);
  }

  it("opens on the next arrival, then walks the past backwards", () => {
    expect(ids("soonest")).toEqual(["soon", "later", "just-past", "long-past"]);
  });

  it("leads with the queue, in the queue's own order, then falls back to soonest", () => {
    const rows = selectReservations(all, {
      propertyId: null,
      filter: "all",
      sort: "priority",
      query: "",
      today: TODAY,
      actionIds: new Set(["long-past", "later"]),
      // Deliberately the reverse of every date order, so the result can only come
      // from the rank and not from the dates agreeing with it by accident.
      actionRank: new Map([
        ["long-past", 0],
        ["later", 1],
      ]),
      propertyTitles: TITLES,
    });
    expect(rows.map((row) => row.id)).toEqual([
      "long-past",
      "later",
      "soon",
      "just-past",
    ]);
  });

  it("is plain soonest order when nothing needs the host", () => {
    expect(ids("priority")).toEqual(["soon", "later", "just-past", "long-past"]);
  });

  it("sorts by total, highest first", () => {
    const rows = selectReservations(
      [
        reservation({ id: "cheap", total: 100 }),
        reservation({ id: "dear", total: 900 }),
      ],
      {
        propertyId: null,
        filter: "all",
        sort: "highest",
        query: "",
        today: TODAY,
        actionIds: NO_ACTIONS,
        propertyTitles: TITLES,
      },
    );
    expect(rows.map((row) => row.id)).toEqual(["dear", "cheap"]);
  });

  it("scopes to one property when one is selected", () => {
    const rows = selectReservations(
      [
        reservation({ id: "mine", listingId: "listing-1" }),
        reservation({ id: "theirs", listingId: "listing-2" }),
      ],
      {
        propertyId: "listing-2",
        filter: "all",
        sort: "soonest",
        query: "",
        today: TODAY,
        actionIds: NO_ACTIONS,
        propertyTitles: TITLES,
      },
    );
    expect(rows.map((row) => row.id)).toEqual(["theirs"]);
  });

  it("searches the title of the property each row belongs to", () => {
    const rows = selectReservations(
      [
        reservation({ id: "sea", listingId: "listing-1" }),
        reservation({ id: "garden", listingId: "listing-2" }),
      ],
      {
        propertyId: null,
        filter: "all",
        sort: "soonest",
        query: "garden",
        today: TODAY,
        actionIds: NO_ACTIONS,
        propertyTitles: TITLES,
      },
    );
    expect(rows.map((row) => row.id)).toEqual(["garden"]);
  });
});

describe("groupReservations", () => {
  it("drops empty sections instead of drawing an empty heading", () => {
    const sections = groupReservations(
      [reservation({ id: "a", checkIn: "2026-09-01", checkOut: "2026-09-04" })],
      TODAY,
    );
    expect(sections.map((section) => section.group)).toEqual(["upcoming"]);
  });

  it("orders history most recent first, including a future cancellation", () => {
    const sections = groupReservations(
      [
        reservation({
          id: "old",
          status: "COMPLETED",
          checkIn: "2026-05-01",
          checkOut: "2026-05-04",
        }),
        reservation({
          id: "cancelled-ahead",
          status: "CANCELLED_BY_HOST",
          checkIn: "2026-09-20",
          checkOut: "2026-09-24",
        }),
        reservation({
          id: "recent",
          status: "COMPLETED",
          checkIn: "2026-08-01",
          checkOut: "2026-08-05",
        }),
      ],
      TODAY,
    );
    const earlier = sections.find((section) => section.group === "earlier");
    expect(earlier?.reservations.map((row) => row.id)).toEqual([
      "cancelled-ahead",
      "recent",
      "old",
    ]);
  });

  it("keeps the sections in stream order", () => {
    const sections = groupReservations(
      [
        reservation({ id: "past", status: "COMPLETED", checkIn: "2026-08-01", checkOut: "2026-08-05" }),
        reservation({ id: "ahead", checkIn: "2026-09-01", checkOut: "2026-09-04" }),
        reservation({ id: "now", checkIn: "2026-08-15", checkOut: "2026-08-20" }),
      ],
      TODAY,
    );
    expect(sections.map((section) => section.group)).toEqual([
      "today",
      "upcoming",
      "earlier",
    ]);
  });
});

describe("countsByFilter", () => {
  it("counts each chip over the same list, with all as the total", () => {
    const rows = [
      reservation({ id: "req", status: "PENDING" }),
      reservation({ id: "ahead" }),
      reservation({ id: "done", status: "COMPLETED" }),
      reservation({ id: "gone", status: "CANCELLED_BY_GUEST" }),
    ];
    const counts = countsByFilter(rows, TODAY, new Set(["req"]));
    expect(counts.all).toBe(4);
    expect(counts.action).toBe(1);
    expect(counts.upcoming).toBe(2);
    expect(counts.completed).toBe(1);
    expect(counts.cancelled).toBe(1);
    expect(counts.staying).toBe(0);
  });
});

describe("summarizeProperty", () => {
  it("reports the next arrival and only confirmed money", () => {
    const summary = summarizeProperty(
      [
        reservation({ id: "req", status: "PENDING", checkIn: "2026-08-18", checkOut: "2026-08-20", total: 300 }),
        reservation({ id: "ahead", checkIn: "2026-09-01", checkOut: "2026-09-04", total: 500 }),
        reservation({ id: "done", status: "COMPLETED", checkIn: "2026-07-01", checkOut: "2026-07-04", total: 900 }),
      ],
      TODAY,
      new Set(["req"]),
    );
    expect(summary.total).toBe(3);
    expect(summary.action).toBe(1);
    expect(summary.upcoming).toBe(2);
    expect(summary.nextCheckIn).toBe("2026-08-18");
    // The request is not money yet — it is a question the host has not answered.
    expect(summary.upcomingValue).toBe(500);
  });

  it("reports no next arrival when nothing is coming", () => {
    const summary = summarizeProperty(
      [reservation({ id: "done", status: "COMPLETED" })],
      TODAY,
      NO_ACTIONS,
    );
    expect(summary.nextCheckIn).toBeNull();
    expect(summary.upcoming).toBe(0);
  });
});

describe("buildActionQueue", () => {
  it("ranks an expiring request above an unread message", () => {
    const queue = buildActionQueue(
      [
        reservation({ id: "unread", unreadCount: 2 }),
        reservation({
          id: "request",
          status: "PENDING",
          responseDueAt: "2026-08-17T04:00:00.000Z",
        }),
      ],
      NOW,
    );
    expect(queue.map((item) => item.bookingId)).toEqual(["request", "unread"]);
    expect(queue[0].kind).toBe("RESPOND_TO_REQUEST");
  });

  it("gives one card per reservation, carrying its other reasons", () => {
    const queue = buildActionQueue(
      [
        reservation({
          id: "both",
          status: "PENDING",
          unreadCount: 1,
          responseDueAt: "2026-08-17T04:00:00.000Z",
        }),
      ],
      NOW,
    );
    expect(queue).toHaveLength(1);
    expect(queue[0].alsoNeeds).toEqual(["REPLY_TO_GUEST"]);
  });

  it("leaves a quiet confirmed stay out of the queue entirely", () => {
    const queue = buildActionQueue(
      [reservation({ id: "quiet", checkIn: "2026-09-01", checkOut: "2026-09-05" })],
      NOW,
    );
    expect(queue).toEqual([]);
  });

  it("stops asking about a request whose deadline has already passed", () => {
    // `expirePendingBookings` sweeps these; until it runs they must not be shown with
    // a countdown that has run out.
    const queue = buildActionQueue(
      [
        reservation({
          id: "stale",
          status: "PENDING",
          responseDueAt: "2026-08-15T04:00:00.000Z",
        }),
      ],
      NOW,
    );
    expect(queue).toEqual([]);
  });
});
