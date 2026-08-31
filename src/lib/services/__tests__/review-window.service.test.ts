import { afterEach, describe, expect, it } from "vitest";
import type { Prisma } from "@prisma/client";
import { readFileSync } from "node:fs";
import path from "node:path";
import { db } from "@/lib/db";
import {
  cleanupTestFixtures,
  createTestGuest,
  createTestHostAndListing,
  type TestFixtures,
} from "./test-helpers";
import { completePastBookings } from "@/lib/services/booking.service";
import {
  ensureReviewInvitationsForBooking,
  getPostStayReviewContext,
  submitReview,
} from "@/lib/services/review.service";
import {
  DEFAULT_CHECKOUT_TIME,
  REVIEW_WINDOW_DAYS,
  checkoutTimeForBooking,
  reviewWindowForBooking,
  reviewWindowOpensAt,
} from "@/lib/services/review-window";
import { houseRulesSnapshot } from "@/lib/host/v2/listing-house-rules";
import {
  addDaysToYmd,
  todayYmd,
  ymdToDbDate,
  zonedTimeToInstant,
} from "@/lib/utils/date-only";

/**
 * L7: the review window opens when the guest actually leaves.
 *
 * M6 had already stopped completion landing a day late. What survived it was subtler
 * and pointed the other way: completion happened at the *start* of the checkout
 * calendar day while the deadline was measured from an assumed 10:00 **UTC**, so the
 * window opened before checkout and the fourteen days it promised were counted from a
 * different instant than the one that opened it. These pin the single rule that
 * replaced both halves — see `review-window.ts`.
 *
 * Integration tests, like the rest of this directory: they hit the real local Postgres.
 * Run `npm run db:docker` first if the container isn't up.
 */

const HOUSE_RULES_ROW = {
  checkInTime: "15:00",
  checkOutTime: null as string | null,
  maxGuests: 4,
  petPolicy: null,
  smokingPolicy: null,
  eventPolicy: null,
  quietHoursPolicy: null,
  quietHoursStart: null,
  quietHoursEnd: null,
  additionalRules: null,
};

const snapshotWithCheckOut = (checkOutTime: string | null) =>
  houseRulesSnapshot({ ...HOUSE_RULES_ROW, checkOutTime });

/** Same cast `createBooking` uses: a JSON column takes an index-signature type and the
 *  snapshot is a named interface. The shape written is exactly `HouseRulesSnapshot`. */
const storedSnapshot = (checkOutTime: string | null) =>
  snapshotWithCheckOut(checkOutTime) as unknown as Prisma.InputJsonObject;

// ── The rule itself ───────────────────────────────────────────────────────────────

describe("the checkout instant a review window opens at", () => {
  it("uses the booking's own frozen checkout time", () => {
    const booking = {
      checkOut: ymdToDbDate("2026-07-10"),
      houseRulesSnapshot: snapshotWithCheckOut("18:30"),
    };
    expect(checkoutTimeForBooking(booking)).toBe("18:30");
    // 18:30 in Skopje in July is CEST, UTC+2.
    expect(reviewWindowOpensAt(booking).toISOString()).toBe("2026-07-10T16:30:00.000Z");
  });

  it("follows the frozen snapshot, which a later listing edit cannot move", () => {
    const frozen = snapshotWithCheckOut("10:00");
    expect(
      reviewWindowOpensAt({
        checkOut: ymdToDbDate("2026-07-10"),
        houseRulesSnapshot: frozen,
      }).toISOString(),
    ).toBe("2026-07-10T08:00:00.000Z");
  });

  it.each([
    ["a legacy booking with no snapshot at all", null],
    ["a snapshot that is not a v1 object", { checkOutTime: "18:00" }],
    ["a flexible checkout, stored as null", snapshotWithCheckOut(null)],
    ["a flexible checkout, stored as the empty string", snapshotWithCheckOut("")],
    [
      "an invalid wall-clock time",
      { ...snapshotWithCheckOut(null), checkOutTime: "25:61" },
    ],
    [
      "a checkout time that is not a time",
      { ...snapshotWithCheckOut(null), checkOutTime: "noon" },
    ],
  ])("falls back to the marketplace 10:00 for %s", (_label, snapshot) => {
    const booking = { checkOut: ymdToDbDate("2026-07-10"), houseRulesSnapshot: snapshot };
    expect(checkoutTimeForBooking(booking)).toBe(DEFAULT_CHECKOUT_TIME);
    expect(reviewWindowOpensAt(booking).toISOString()).toBe("2026-07-10T08:00:00.000Z");
  });

  it("reads the wall time in the marketplace zone, never as UTC", () => {
    // The old rule was `setUTCHours(10)`, which is 12:00 in Skopje in summer. Two hours
    // of a guest's window, every year, on the wrong side of the clock.
    const opensAt = reviewWindowOpensAt({
      checkOut: ymdToDbDate("2026-07-10"),
      houseRulesSnapshot: null,
    });
    expect(opensAt.getTime()).not.toBe(new Date("2026-07-10T10:00:00.000Z").getTime());
  });

  describe("daylight saving", () => {
    // Europe/Skopje springs forward on 2026-03-29 and falls back on 2026-10-25.
    it.each([
      ["the day before spring forward (CET, +1)", "2026-03-28", "2026-03-28T09:00:00.000Z"],
      ["the spring-forward day itself (CEST, +2)", "2026-03-29", "2026-03-29T08:00:00.000Z"],
      ["the day after spring forward", "2026-03-30", "2026-03-30T08:00:00.000Z"],
      ["the day before falling back (CEST, +2)", "2026-10-24", "2026-10-24T08:00:00.000Z"],
      ["the fall-back day itself (CET, +1)", "2026-10-25", "2026-10-25T09:00:00.000Z"],
      ["the day after falling back", "2026-10-26", "2026-10-26T09:00:00.000Z"],
    ])("places 10:00 correctly on %s", (_label, checkOutYmd, expected) => {
      expect(
        reviewWindowOpensAt({
          checkOut: ymdToDbDate(checkOutYmd),
          houseRulesSnapshot: null,
        }).toISOString(),
      ).toBe(expected);
    });

    it("keeps the opening on the checkout day itself, whatever the offset", () => {
      for (const ymd of ["2026-03-29", "2026-10-25", "2026-01-01", "2026-12-31"]) {
        const opensAt = reviewWindowOpensAt({
          checkOut: ymdToDbDate(ymd),
          houseRulesSnapshot: null,
        });
        // Read back in the marketplace zone it is the same calendar day at 10:00 —
        // never the day before, never the day after.
        expect(
          new Intl.DateTimeFormat("en-CA", {
            timeZone: "Europe/Skopje",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          }).format(opensAt),
        ).toBe(`${ymd}, 10:00`);
      }
    });

    it("gives the same instant from a server in any zone", () => {
      const previous = process.env.TZ;
      const readings: string[] = [];
      try {
        for (const zone of [
          "UTC",
          "America/Chicago",
          "Pacific/Kiritimati",
          "Europe/Skopje",
        ]) {
          process.env.TZ = zone;
          readings.push(
            reviewWindowOpensAt({
              checkOut: ymdToDbDate("2026-10-25"),
              houseRulesSnapshot: snapshotWithCheckOut("02:30"),
            }).toISOString(),
          );
        }
      } finally {
        process.env.TZ = previous;
      }
      expect(new Set(readings).size).toBe(1);
    });

    it("moves a nonexistent spring-forward wall time to just after the jump", () => {
      const instant = zonedTimeToInstant("2026-03-29", "02:30");
      expect(instant.toISOString()).toBe("2026-03-29T01:30:00.000Z");
      expect(
        new Intl.DateTimeFormat("en-GB", {
          timeZone: "Europe/Skopje",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        }).format(instant),
      ).toBe("03:30");
    });

    it("uses the later occurrence of a repeated fall-back wall time", () => {
      // Local 02:30 occurs at both 00:30Z (summer offset) and 01:30Z (winter
      // offset). Waiting for the latter cannot open checkout-dependent flows early.
      expect(zonedTimeToInstant("2026-10-25", "02:30").toISOString()).toBe(
        "2026-10-25T01:30:00.000Z",
      );
    });
  });

  it("closes exactly fourteen full days after it opens", () => {
    for (const ymd of ["2026-07-10", "2026-03-29", "2026-10-25"]) {
      const { opensAt, deadline } = reviewWindowForBooking({
        checkOut: ymdToDbDate(ymd),
        houseRulesSnapshot: null,
      });
      expect(deadline.getTime() - opensAt.getTime()).toBe(
        REVIEW_WINDOW_DAYS * 24 * 60 * 60 * 1000,
      );
    }
  });
});

// ── Scheduler independence ────────────────────────────────────────────────────────

describe("completion is not owned by one timer", () => {
  const scriptSource = (name: string) =>
    readFileSync(path.join(process.cwd(), "scripts", name), "utf8");

  it("runs booking completion from the normal booking-processing job", () => {
    const source = scriptSource("process-booking-requests.ts");
    expect(source).toMatch(/await\s+completePastBookings\(\)/);
  });

  it("still runs it from the review-reminder job, so neither is the only one", () => {
    expect(scriptSource("send-review-reminders.ts")).toMatch(
      /await\s+completePastBookings\(\)/,
    );
  });
});

// ── Against the database ──────────────────────────────────────────────────────────

describe("completion and review access around the checkout instant", () => {
  const fixtures: TestFixtures[] = [];
  afterEach(async () => {
    while (fixtures.length > 0) {
      const next = fixtures.pop()!;
      await db.auditLog.deleteMany({
        where: { userId: { in: [next.hostId, ...next.extraUserIds] } },
      });
      await db.notification.deleteMany({
        where: { userId: { in: [next.hostId, ...next.extraUserIds] } },
      });
      await cleanupTestFixtures(next);
    }
  });

  /**
   * A stay ending on `checkOutYmd`, written straight through Prisma: there is no way to
   * book into the past through `createBooking`, and what is under test is how the
   * stored row is read.
   */
  async function stay(options: {
    checkOutYmd: string;
    checkOutTime?: string | null;
    status?:
      | "CONFIRMED"
      | "PENDING"
      | "COMPLETED"
      | "REJECTED"
      | "EXPIRED"
      | "CANCELLED_BY_GUEST";
    withSnapshot?: boolean;
  }) {
    const { host, property, listing } = await createTestHostAndListing();
    const guest = await createTestGuest();
    fixtures.push({
      hostId: host.id,
      propertyId: property.id,
      listingId: listing.id,
      extraUserIds: [guest.id],
    });
    const booking = await db.booking.create({
      data: {
        listingId: listing.id,
        guestId: guest.id,
        checkIn: ymdToDbDate(addDaysToYmd(options.checkOutYmd, -2)),
        checkOut: ymdToDbDate(options.checkOutYmd),
        guestCount: 1,
        adults: 1,
        numberOfNights: 2,
        nightlyRate: 50,
        cleaningFee: 10,
        serviceFee: 0,
        totalPrice: 110,
        status: options.status ?? "CONFIRMED",
        ...(options.withSnapshot === false
          ? {}
          : { houseRulesSnapshot: storedSnapshot(options.checkOutTime ?? null) }),
      },
    });
    return { booking, host, guest, listing };
  }

  const statusOf = async (id: string) =>
    (await db.booking.findUniqueOrThrow({ where: { id }, select: { status: true } }))
      .status;
  const timelineCount = (id: string) =>
    db.bookingTimelineEvent.count({ where: { bookingId: id, type: "COMPLETED" } });

  it("leaves a stay CONFIRMED and its reviews shut before the checkout instant", async () => {
    const today = todayYmd();
    const { booking } = await stay({ checkOutYmd: today, checkOutTime: "10:00" });
    const checkout = zonedTimeToInstant(today, "10:00");

    await completePastBookings(new Date(checkout.getTime() - 60_000));

    expect(await statusOf(booking.id)).toBe("CONFIRMED");
    expect(await db.reviewInvitation.count({ where: { bookingId: booking.id } })).toBe(0);

    // And the review flow itself is shut for a stay whose checkout the *real* clock has
    // not reached — the same question asked of tomorrow, since the page has no `now` to
    // hand and this file cannot move the wall clock without moving it for the sweep too.
    const tomorrow = await stay({
      checkOutYmd: addDaysToYmd(today, 1),
      checkOutTime: "10:00",
    });
    await expect(
      getPostStayReviewContext(tomorrow.booking.id, tomorrow.guest.id),
    ).rejects.toThrow(/Ratings open after the stay is completed/);
  });

  it("keeps reviews shut when legacy data already says COMPLETED before checkout", async () => {
    const checkOutYmd = addDaysToYmd(todayYmd(), 1);
    const { booking, guest } = await stay({
      checkOutYmd,
      checkOutTime: "18:00",
      status: "COMPLETED",
    });
    const beforeCheckout = new Date(
      zonedTimeToInstant(checkOutYmd, "18:00").getTime() - 1,
    );

    await expect(
      ensureReviewInvitationsForBooking(booking.id, beforeCheckout),
    ).resolves.toEqual([]);
    expect(
      await db.reviewInvitation.count({ where: { bookingId: booking.id } }),
    ).toBe(0);
    await expect(
      getPostStayReviewContext(booking.id, guest.id),
    ).rejects.toThrow(/Ratings open after the stay is completed/);
  });

  it("completes exactly at the checkout instant and opens the window there", async () => {
    const today = todayYmd();
    const { booking } = await stay({ checkOutYmd: today, checkOutTime: "10:00" });
    const checkout = zonedTimeToInstant(today, "10:00");

    await completePastBookings(checkout);

    expect(await statusOf(booking.id)).toBe("COMPLETED");
    const invitations = await db.reviewInvitation.findMany({
      where: { bookingId: booking.id },
    });
    expect(invitations).toHaveLength(2);
    for (const invitation of invitations) {
      expect(invitation.deadline.getTime()).toBe(
        checkout.getTime() + REVIEW_WINDOW_DAYS * 86_400_000,
      );
    }
  });

  it("honours a frozen late checkout, and does not complete the stay before it", async () => {
    const today = todayYmd();
    const { booking } = await stay({ checkOutYmd: today, checkOutTime: "18:00" });

    // 10:00 would have been enough under the fallback. This booking said 18:00.
    await completePastBookings(zonedTimeToInstant(today, "10:00"));
    expect(await statusOf(booking.id)).toBe("CONFIRMED");

    await completePastBookings(zonedTimeToInstant(today, "18:00"));
    expect(await statusOf(booking.id)).toBe("COMPLETED");
  });

  it("completes a legacy snapshot-less stay on the 10:00 fallback", async () => {
    const today = todayYmd();
    const { booking } = await stay({ checkOutYmd: today, withSnapshot: false });
    const checkout = zonedTimeToInstant(today, "10:00");

    await completePastBookings(new Date(checkout.getTime() - 1));
    expect(await statusOf(booking.id)).toBe("CONFIRMED");

    await completePastBookings(checkout);
    expect(await statusOf(booking.id)).toBe("COMPLETED");
  });

  it("stamps the COMPLETED event at the checkout instant", async () => {
    const today = todayYmd();
    const { booking } = await stay({ checkOutYmd: today, checkOutTime: "09:30" });
    const checkout = zonedTimeToInstant(today, "09:30");

    await completePastBookings(new Date(checkout.getTime() + 3_600_000));

    const event = await db.bookingTimelineEvent.findFirstOrThrow({
      where: { bookingId: booking.id, type: "COMPLETED" },
      select: { createdAt: true },
    });
    expect(event.createdAt.getTime()).toBe(checkout.getTime());
  });

  it("opens the window on a direct review link without waiting for a scheduler", async () => {
    // Yesterday, so the stay is over by the *real* clock the page reads.
    const checkOutYmd = addDaysToYmd(todayYmd(), -1);
    const { booking, guest } = await stay({ checkOutYmd, checkOutTime: "10:00" });
    expect(await statusOf(booking.id)).toBe("CONFIRMED");

    // No sweep is run here. This is the guest following the emailed link.
    const context = await getPostStayReviewContext(booking.id, guest.id);

    expect(await statusOf(booking.id)).toBe("COMPLETED");
    expect(context.direction).toBe("GUEST_TO_HOST");
    expect(context.deadline.getTime()).toBe(
      zonedTimeToInstant(checkOutYmd, "10:00").getTime() +
        REVIEW_WINDOW_DAYS * 86_400_000,
    );
  });

  it("makes one transition, one event and one invitation per direction under repeats and races", async () => {
    const checkOutYmd = addDaysToYmd(todayYmd(), -1);
    const { booking, guest } = await stay({ checkOutYmd, checkOutTime: "10:00" });

    await Promise.all([
      completePastBookings(),
      completePastBookings(),
      ensureReviewInvitationsForBooking(booking.id),
    ]);
    await completePastBookings();
    await getPostStayReviewContext(booking.id, guest.id);
    await ensureReviewInvitationsForBooking(booking.id);

    expect(await statusOf(booking.id)).toBe("COMPLETED");
    expect(await timelineCount(booking.id)).toBe(1);
    expect(
      await db.reviewInvitation.count({
        where: { bookingId: booking.id, direction: "GUEST_TO_HOST" },
      }),
    ).toBe(1);
    expect(
      await db.reviewInvitation.count({
        where: { bookingId: booking.id, direction: "HOST_TO_GUEST" },
      }),
    ).toBe(1);
    // And one opening notification each, not one per run.
    expect(
      await db.reviewInvitationReminder.count({
        where: { invitation: { bookingId: booking.id }, stage: "INVITATION" },
      }),
    ).toBe(2);
  });

  it.each([
    ["PENDING", "PENDING"],
    ["REJECTED", "REJECTED"],
    ["EXPIRED", "EXPIRED"],
    ["a guest cancellation", "CANCELLED_BY_GUEST"],
  ] as const)(
    "leaves %s bookings whose dates have passed untouched",
    async (_label, status) => {
      const { booking } = await stay({
        checkOutYmd: addDaysToYmd(todayYmd(), -3),
        status,
      });

      await completePastBookings();

      expect(await statusOf(booking.id)).toBe(status);
      expect(await timelineCount(booking.id)).toBe(0);
      expect(await db.reviewInvitation.count({ where: { bookingId: booking.id } })).toBe(
        0,
      );
    },
  );

  it("adds no second transition to an already-completed stay", async () => {
    const { booking } = await stay({
      checkOutYmd: addDaysToYmd(todayYmd(), -3),
      status: "COMPLETED",
    });

    await completePastBookings();
    await completePastBookings();

    expect(await statusOf(booking.id)).toBe("COMPLETED");
    expect(await timelineCount(booking.id)).toBe(0);
  });

  it("leaves a future confirmed stay alone", async () => {
    const { booking, guest } = await stay({
      checkOutYmd: addDaysToYmd(todayYmd(), 30),
      checkOutTime: "10:00",
    });

    await completePastBookings();

    expect(await statusOf(booking.id)).toBe("CONFIRMED");
    await expect(getPostStayReviewContext(booking.id, guest.id)).rejects.toThrow(
      /Ratings open after the stay is completed/,
    );
  });
});

describe("a stored invitation deadline is the one that counts", () => {
  const fixtures: TestFixtures[] = [];
  afterEach(async () => {
    while (fixtures.length > 0) {
      const next = fixtures.pop()!;
      await db.auditLog.deleteMany({
        where: { userId: { in: [next.hostId, ...next.extraUserIds] } },
      });
      await db.notification.deleteMany({
        where: { userId: { in: [next.hostId, ...next.extraUserIds] } },
      });
      await cleanupTestFixtures(next);
    }
  });

  async function completedStay() {
    const { host, property, listing } = await createTestHostAndListing();
    const guest = await createTestGuest();
    fixtures.push({
      hostId: host.id,
      propertyId: property.id,
      listingId: listing.id,
      extraUserIds: [guest.id],
    });
    const booking = await db.booking.create({
      data: {
        listingId: listing.id,
        guestId: guest.id,
        checkIn: ymdToDbDate(addDaysToYmd(todayYmd(), -4)),
        checkOut: ymdToDbDate(addDaysToYmd(todayYmd(), -2)),
        guestCount: 1,
        adults: 1,
        numberOfNights: 2,
        nightlyRate: 50,
        cleaningFee: 10,
        serviceFee: 0,
        totalPrice: 110,
        status: "COMPLETED",
        houseRulesSnapshot: storedSnapshot("10:00"),
      },
    });
    return { booking, host, guest };
  }

  const guestRatings = {
    OVERALL: 5,
    CLEANLINESS: 5,
    ACCURACY: 5,
    CHECK_IN: 5,
    COMMUNICATION: 5,
    LOCATION: 4,
    VALUE: 5,
  } as const;

  it("keeps a historical deadline instead of rewriting it to today's rule", async () => {
    const { booking, guest } = await completedStay();
    // A deadline written under an older rule, nowhere near what the current one
    // computes for this stay.
    const historical = new Date(Date.now() + 3 * 86_400_000);
    await db.reviewInvitation.create({
      data: {
        bookingId: booking.id,
        recipientId: guest.id,
        direction: "GUEST_TO_HOST",
        deadline: historical,
      },
    });

    await ensureReviewInvitationsForBooking(booking.id);
    await getPostStayReviewContext(booking.id, guest.id);

    const stored = await db.reviewInvitation.findUniqueOrThrow({
      where: {
        bookingId_direction: { bookingId: booking.id, direction: "GUEST_TO_HOST" },
      },
    });
    expect(stored.deadline.getTime()).toBe(historical.getTime());
  });

  it("reports the stored deadline to the after-stay page", async () => {
    const { booking, guest } = await completedStay();
    const historical = new Date(Date.now() + 2 * 86_400_000);
    await db.reviewInvitation.create({
      data: {
        bookingId: booking.id,
        recipientId: guest.id,
        direction: "GUEST_TO_HOST",
        deadline: historical,
      },
    });

    const context = await getPostStayReviewContext(booking.id, guest.id);
    expect(context.deadline.getTime()).toBe(historical.getTime());
  });

  it("accepts a submission a minute before the stored deadline", async () => {
    const { booking, guest } = await completedStay();
    await db.reviewInvitation.create({
      data: {
        bookingId: booking.id,
        recipientId: guest.id,
        direction: "GUEST_TO_HOST",
        deadline: new Date(Date.now() + 60_000),
      },
    });

    const review = await submitReview({
      bookingId: booking.id,
      authorId: guest.id,
      publicComment: "A clean and accurately described place with an easy arrival.",
      ratings: guestRatings,
    });
    expect(review.id).toBeTruthy();
  });

  it("refuses a submission at or after the stored deadline", async () => {
    const { booking, guest } = await completedStay();
    await db.reviewInvitation.create({
      data: {
        bookingId: booking.id,
        recipientId: guest.id,
        direction: "GUEST_TO_HOST",
        // Already elapsed, even though the computed window is still wide open.
        deadline: new Date(Date.now() - 1_000),
      },
    });

    await expect(
      submitReview({
        bookingId: booking.id,
        authorId: guest.id,
        publicComment: "A clean and accurately described place with an easy arrival.",
        ratings: guestRatings,
      }),
    ).rejects.toThrow(/rating window has closed/);
  });
});
