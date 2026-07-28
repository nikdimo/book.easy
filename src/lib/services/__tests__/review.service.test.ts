import { afterEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
  cleanupTestFixtures,
  createTestGuest,
  createTestHostAndListing,
  type TestFixtures,
} from "./test-helpers";
import {
  moderateReview,
  submitReview,
} from "@/lib/services/review.service";

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
        checkIn: new Date("2030-07-01"),
        checkOut: new Date("2030-07-03"),
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
});
