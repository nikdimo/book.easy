import { describe, expect, it } from "vitest";
import {
  buildHostActionQueue,
  daysUntil,
  formatCountdown,
  type HostActionBooking,
} from "../booking-action-queue";

const NOW = new Date("2026-08-12T12:00:00.000Z");

function booking(overrides: Partial<HostActionBooking> = {}): HostActionBooking {
  return {
    id: "b1",
    status: "CONFIRMED",
    checkIn: new Date("2026-09-01T00:00:00.000Z"),
    responseDueAt: new Date("2026-08-13T12:00:00.000Z"),
    unreadCount: 0,
    ratingDueAt: null,
    ...overrides,
  };
}

describe("buildHostActionQueue", () => {
  it("leaves out bookings that need nothing", () => {
    expect(buildHostActionQueue([booking()], NOW)).toEqual([]);
  });

  it("skips a pending request whose window has already closed", () => {
    const queue = buildHostActionQueue(
      [booking({ status: "PENDING", responseDueAt: new Date("2026-08-12T11:00:00.000Z") })],
      NOW,
    );
    expect(queue).toEqual([]);
  });

  it("ranks a pending request above an unread message, a check-in and a rating", () => {
    const queue = buildHostActionQueue(
      [
        booking({ id: "rate", ratingDueAt: new Date("2026-08-20T00:00:00.000Z") }),
        booking({ id: "checkin", checkIn: new Date("2026-08-12T00:00:00.000Z") }),
        booking({ id: "unread", unreadCount: 3 }),
        booking({
          id: "request",
          status: "PENDING",
          responseDueAt: new Date("2026-08-13T11:00:00.000Z"),
        }),
      ],
      NOW,
    );
    expect(queue.map((item) => item.bookingId)).toEqual([
      "request",
      "unread",
      "checkin",
      "rate",
    ]);
  });

  it("orders same-kind items by soonest deadline", () => {
    const queue = buildHostActionQueue(
      [
        booking({
          id: "later",
          status: "PENDING",
          responseDueAt: new Date("2026-08-13T10:00:00.000Z"),
        }),
        booking({
          id: "sooner",
          status: "PENDING",
          responseDueAt: new Date("2026-08-12T14:00:00.000Z"),
        }),
      ],
      NOW,
    );
    expect(queue.map((item) => item.bookingId)).toEqual(["sooner", "later"]);
  });

  it("marks a request as critical only inside the final six hours", () => {
    const critical = buildHostActionQueue(
      [booking({ status: "PENDING", responseDueAt: new Date("2026-08-12T15:00:00.000Z") })],
      NOW,
    );
    const soon = buildHostActionQueue(
      [booking({ status: "PENDING", responseDueAt: new Date("2026-08-13T06:00:00.000Z") })],
      NOW,
    );
    expect(critical[0].urgency).toBe("critical");
    expect(soon[0].urgency).toBe("soon");
  });

  it("gives one booking a single card and lists the rest as secondary reasons", () => {
    const queue = buildHostActionQueue(
      [
        booking({
          status: "PENDING",
          unreadCount: 2,
          ratingDueAt: new Date("2026-08-20T00:00:00.000Z"),
        }),
      ],
      NOW,
    );
    expect(queue).toHaveLength(1);
    expect(queue[0].kind).toBe("RESPOND_TO_REQUEST");
    expect(queue[0].alsoNeeds).toEqual(["REPLY_TO_GUEST", "RATE_GUEST"]);
  });

  it("only surfaces confirmed check-ins today and tomorrow", () => {
    const ids = buildHostActionQueue(
      [
        booking({ id: "today", checkIn: new Date("2026-08-12T00:00:00.000Z") }),
        booking({ id: "tomorrow", checkIn: new Date("2026-08-13T00:00:00.000Z") }),
        booking({ id: "in-two-days", checkIn: new Date("2026-08-14T00:00:00.000Z") }),
        booking({ id: "yesterday", checkIn: new Date("2026-08-11T00:00:00.000Z") }),
        booking({
          id: "pending-tomorrow",
          status: "PENDING",
          checkIn: new Date("2026-08-13T00:00:00.000Z"),
          responseDueAt: new Date("2026-08-11T00:00:00.000Z"),
        }),
      ],
      NOW,
    ).map((item) => item.bookingId);
    expect(ids).toEqual(["today", "tomorrow"]);
  });

  it("keeps an accepted send-later payment request in the action queue", () => {
    const queue = buildHostActionQueue(
      [booking({ paymentInstructionsStatus: "PENDING" })],
      NOW,
    );

    expect(queue).toMatchObject([
      {
        bookingId: "b1",
        kind: "SEND_PAYMENT_INSTRUCTIONS",
        urgency: "soon",
      },
    ]);
  });
});

describe("daysUntil", () => {
  it("counts whole UTC days regardless of the time of day", () => {
    expect(daysUntil(new Date("2026-08-12T23:30:00.000Z"), NOW)).toBe(0);
    expect(daysUntil(new Date("2026-08-13T00:00:00.000Z"), NOW)).toBe(1);
    expect(daysUntil(new Date("2026-08-10T00:00:00.000Z"), NOW)).toBe(-2);
  });
});

describe("formatCountdown", () => {
  it("shortens granularity as the deadline gets further away", () => {
    expect(formatCountdown(42 * 60_000)).toBe("42m");
    expect(formatCountdown(3 * 3_600_000 + 12 * 60_000)).toBe("3h 12m");
    expect(formatCountdown(19 * 3_600_000)).toBe("19h");
    expect(formatCountdown(3 * 86_400_000)).toBe("3d");
  });

  it("never renders a zero or negative remainder as a duration", () => {
    expect(formatCountdown(30_000)).toBe("1m");
    expect(formatCountdown(0)).toBe("any moment");
    expect(formatCountdown(-5_000)).toBe("any moment");
  });
});
