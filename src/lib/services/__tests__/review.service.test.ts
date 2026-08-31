import { afterEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
  cleanupTestFixtures,
  createTestGuest,
  createTestHostAndListing,
  type TestFixtures,
} from "./test-helpers";
import {
  getPostStayReviewContext,
  moderateReview,
  submitReview,
} from "@/lib/services/review.service";
import { addDaysToYmd, todayYmd, ymdToDbDate } from "@/lib/utils/date-only";

function recentlyCompletedStay() {
  const today = todayYmd();
  return {
    checkIn: ymdToDbDate(addDaysToYmd(today, -3)),
    checkOut: ymdToDbDate(addDaysToYmd(today, -1)),
  };
}

describe("sealed review workflow", () => {
  let fixtures: TestFixtures | undefined;

  afterEach(async () => {
    if (fixtures) {
      await db.auditLog.deleteMany({
        where: { userId: { in: [fixtures.hostId, ...fixtures.extraUserIds] } },
      });
      await cleanupTestFixtures(fixtures);
    }
    fixtures = undefined;
  });

  it("publishes approved reviews only after both sides submit and moderation finishes", async () => {
    const { host, property, listing } = await createTestHostAndListing();
    const guest = await createTestGuest();
    const admin = await db.user.create({
      data: {
        email: `review-admin-${crypto.randomUUID()}@example.test`,
        name: "Review Admin",
        role: "ADMIN",
      },
    });
    fixtures = {
      hostId: host.id,
      propertyId: property.id,
      listingId: listing.id,
      extraUserIds: [guest.id, admin.id],
    };

    const booking = await db.booking.create({
      data: {
        listingId: listing.id,
        guestId: guest.id,
        ...recentlyCompletedStay(),
        guestCount: 2,
        nightlyRate: 50,
        cleaningFee: 10,
        serviceFee: 5,
        totalPrice: 115,
        numberOfNights: 2,
        status: "COMPLETED",
      },
    });

    const guestReview = await submitReview({
      bookingId: booking.id,
      authorId: guest.id,
      publicComment: "A clean and accurately described place with an easy arrival.",
      ratings: {
        OVERALL: 5,
        CLEANLINESS: 5,
        ACCURACY: 5,
        CHECK_IN: 5,
        COMMUNICATION: 5,
        LOCATION: 4,
        VALUE: 5,
      },
    });
    const hostReview = await submitReview({
      bookingId: booking.id,
      authorId: host.id,
      publicComment: "The guest communicated clearly and respected the home.",
      ratings: {
        OVERALL: 5,
        CLEANLINESS: 5,
        COMMUNICATION: 5,
        HOUSE_RULES: 5,
      },
    });

    await moderateReview({
      reviewId: guestReview.id,
      adminId: admin.id,
      action: "APPROVE",
    });
    expect(
      await db.review.findUnique({
        where: { id: guestReview.id },
        select: { publishedAt: true },
      })
    ).toEqual({ publishedAt: null });

    await moderateReview({
      reviewId: hostReview.id,
      adminId: admin.id,
      action: "APPROVE",
    });
    const published = await db.review.findMany({
      where: { bookingId: booking.id },
      select: { publishedAt: true },
    });
    expect(published).toHaveLength(2);
    expect(published.every((review) => review.publishedAt instanceof Date)).toBe(true);
  });

  it("carries the booking's own currency and frozen display-currency snapshot for the after-stay page", async () => {
    // Regression test: the after-stay page's price used to be formatted with no
    // currency argument at all, which silently rendered every non-EUR booking as if
    // it had been priced in EUR. Guarding it here, at the data the page reads from,
    // means the page can never again lose these fields without this test failing.
    const { host, property, listing } = await createTestHostAndListing();
    const guest = await createTestGuest();
    fixtures = {
      hostId: host.id,
      propertyId: property.id,
      listingId: listing.id,
      extraUserIds: [guest.id],
    };

    const booking = await db.booking.create({
      data: {
        listingId: listing.id,
        guestId: guest.id,
        ...recentlyCompletedStay(),
        guestCount: 2,
        currency: "USD",
        nightlyRate: 50,
        cleaningFee: 10,
        serviceFee: 5,
        totalPrice: 115,
        displayCurrency: "MKD",
        displayRate: 55.5,
        displayTotal: 6382.5,
        numberOfNights: 2,
        status: "COMPLETED",
      },
    });

    const context = await getPostStayReviewContext(booking.id, guest.id);

    // The official, payable amount — what the after-stay total must render — stays
    // in the currency the booking was actually made in.
    expect(context.booking.currency).toBe("USD");
    expect(Number(context.booking.totalPrice)).toBe(115);
    // The frozen approximate figure the guest saw at booking time is available too,
    // and is never recalculated from a live rate.
    expect(context.booking.displayCurrency).toBe("MKD");
    expect(Number(context.booking.displayTotal)).toBe(6382.5);

    // Reading the booking for display must never rewrite what it charged or was
    // agreed in, regardless of today's exchange rates or how the page renders it.
    const reloaded = await db.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(reloaded.currency).toBe("USD");
    expect(Number(reloaded.totalPrice)).toBe(115);
    expect(reloaded.displayCurrency).toBe("MKD");
    expect(Number(reloaded.displayTotal)).toBe(6382.5);
  });
});
