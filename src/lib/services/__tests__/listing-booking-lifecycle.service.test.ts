import { afterEach, describe, expect, it, vi } from "vitest";
import { ListingStatus } from "@prisma/client";
import { db } from "@/lib/db";
import {
  confirmBooking,
  createBooking,
  rejectBooking,
} from "@/lib/services/booking.service";
import { acceptBookingAsHost } from "@/lib/services/booking-acceptance.service";
import {
  archiveOwnedListing,
  suspendListingForAdmin,
  UNPUBLISH_PENDING_BOOKINGS_ERROR,
  unpublishOwnedListing,
} from "@/lib/services/listing-lifecycle.service";
import {
  cleanupTestFixtures,
  createTestGuest,
  createTestHostAndListing,
  type TestFixtures,
} from "./test-helpers";

const notificationMocks = vi.hoisted(() => ({
  notifyBookingEvent: vi.fn(async () => undefined),
}));

vi.mock("@/lib/services/notification.service", () => ({
  notifyBookingEvent: notificationMocks.notifyBookingEvent,
}));

const stay = (month: number) => ({
  checkIn: new Date(Date.UTC(2032, month, 10)),
  checkOut: new Date(Date.UTC(2032, month, 13)),
});

describe("listing visibility and booking acceptance lifecycle (M9)", () => {
  let fixtures: TestFixtures | undefined;

  afterEach(async () => {
    if (fixtures) {
      await db.auditLog.deleteMany({
        where: {
          userId: { in: [fixtures.hostId, ...fixtures.extraUserIds] },
        },
      });
      await cleanupTestFixtures(fixtures);
    }
    fixtures = undefined;
    vi.clearAllMocks();
  });

  async function setup(guestCount = 1) {
    const { host, property, listing } = await createTestHostAndListing();
    const guests = await Promise.all(
      Array.from({ length: guestCount }, () => createTestGuest()),
    );
    fixtures = {
      hostId: host.id,
      propertyId: property.id,
      listingId: listing.id,
      extraUserIds: guests.map((guest) => guest.id),
    };
    return { host, listing, guests };
  }

  async function request(
    listingId: string,
    guestId: string,
    month = 0,
  ) {
    return createBooking({
      listingId,
      guestId,
      ...stay(month),
      guestCount: 2,
    });
  }

  /** Everything a listing visibility change must leave alone. */
  async function bookingBusinessState(
    listingId: string,
    participantIds: string[],
  ) {
    const bookings = await db.booking.findMany({
      where: { listingId },
      orderBy: { id: "asc" },
    });
    const bookingIds = bookings.map((booking) => booking.id);
    const [
      holds,
      paymentRequests,
      paymentEvents,
      timeline,
      emails,
      notifications,
    ] = await Promise.all([
      db.availabilityBlock.findMany({
        where: { bookingId: { in: bookingIds } },
        orderBy: { id: "asc" },
      }),
      db.bookingPaymentRequest.findMany({
        where: { bookingId: { in: bookingIds } },
        orderBy: { id: "asc" },
      }),
      db.bookingPaymentStatusEvent.findMany({
        where: { bookingId: { in: bookingIds } },
        orderBy: { id: "asc" },
      }),
      db.bookingTimelineEvent.findMany({
        where: { bookingId: { in: bookingIds } },
        orderBy: { id: "asc" },
      }),
      db.bookingEmailDelivery.findMany({
        where: { bookingId: { in: bookingIds } },
        orderBy: { id: "asc" },
        select: {
          id: true,
          bookingId: true,
          kind: true,
          createdAt: true,
        },
      }),
      db.notification.findMany({
        where: { userId: { in: participantIds } },
        orderBy: { id: "asc" },
        select: {
          id: true,
          userId: true,
          type: true,
          title: true,
          body: true,
          route: true,
          data: true,
          messageId: true,
          createdAt: true,
        },
      }),
    ]);
    return {
      bookings,
      holds,
      paymentRequests,
      paymentEvents,
      timeline,
      emails,
      notifications,
    };
  }

  it("unpublishes an approved listing with no bookings", async () => {
    const { host, listing } = await setup();

    await expect(unpublishOwnedListing(listing.id, host.id)).resolves.toMatchObject({
      success: true,
    });
    expect(
      await db.listing.findUniqueOrThrow({
        where: { id: listing.id },
        select: { status: true },
      }),
    ).toEqual({ status: ListingStatus.UNPUBLISHED });
  });

  it("blocks unpublish while a pending request exists and changes nothing", async () => {
    const { host, listing, guests } = await setup();
    await request(listing.id, guests[0].id);
    const before = await bookingBusinessState(listing.id, [host.id, guests[0].id]);

    await expect(unpublishOwnedListing(listing.id, host.id)).resolves.toEqual({
      success: false,
      error: UNPUBLISH_PENDING_BOOKINGS_ERROR,
    });

    expect(
      await db.listing.findUniqueOrThrow({
        where: { id: listing.id },
        select: { status: true },
      }),
    ).toEqual({ status: ListingStatus.APPROVED });
    expect(await bookingBusinessState(listing.id, [host.id, guests[0].id])).toEqual(
      before,
    );
  });

  it("unpublishes with confirmed bookings and preserves every booking record", async () => {
    const { host, listing, guests } = await setup();
    const booking = await request(listing.id, guests[0].id);
    await confirmBooking(booking.id, host.id, { decision: "NO_INSTRUCTIONS" });
    const before = await bookingBusinessState(listing.id, [host.id, guests[0].id]);

    await expect(unpublishOwnedListing(listing.id, host.id)).resolves.toMatchObject({
      success: true,
    });

    expect(
      await db.listing.findUniqueOrThrow({
        where: { id: listing.id },
        select: { status: true },
      }),
    ).toEqual({ status: ListingStatus.UNPUBLISHED });
    expect(await bookingBusinessState(listing.id, [host.id, guests[0].id])).toEqual(
      before,
    );
  });

  it("keeps archive blocked for both pending and confirmed bookings", async () => {
    const { host, listing, guests } = await setup();
    const booking = await request(listing.id, guests[0].id);

    await expect(archiveOwnedListing(listing.id, host.id)).resolves.toEqual({
      success: false,
      error: expect.stringMatching(/active bookings/i),
    });

    await confirmBooking(booking.id, host.id, { decision: "NO_INSTRUCTIONS" });
    const before = await bookingBusinessState(listing.id, [host.id, guests[0].id]);
    await expect(archiveOwnedListing(listing.id, host.id)).resolves.toEqual({
      success: false,
      error: expect.stringMatching(/active bookings/i),
    });
    expect(await bookingBusinessState(listing.id, [host.id, guests[0].id])).toEqual(
      before,
    );
    expect(
      await db.listing.findUniqueOrThrow({
        where: { id: listing.id },
        select: { status: true },
      }),
    ).toEqual({ status: ListingStatus.APPROVED });
  });

  it("admin suspension stays available with pending and confirmed bookings and preserves them", async () => {
    const { host, listing, guests } = await setup(2);
    const confirmed = await request(listing.id, guests[0].id, 0);
    await confirmBooking(confirmed.id, host.id, { decision: "NO_INSTRUCTIONS" });
    await request(listing.id, guests[1].id, 1);
    const participants = [host.id, ...guests.map((guest) => guest.id)];
    const before = await bookingBusinessState(listing.id, participants);

    await expect(
      suspendListingForAdmin(listing.id, "Safety review"),
    ).resolves.toMatchObject({ success: true });

    expect(
      await db.listing.findUniqueOrThrow({
        where: { id: listing.id },
        select: { status: true, moderationNote: true },
      }),
    ).toEqual({
      status: ListingStatus.SUSPENDED,
      moderationNote: "Safety review",
    });
    expect(await bookingBusinessState(listing.id, participants)).toEqual(before);
  });

  it("accepts while approved", async () => {
    const { host, listing, guests } = await setup();
    const booking = await request(listing.id, guests[0].id);

    await expect(
      acceptBookingAsHost({
        bookingId: booking.id,
        hostId: host.id,
        decision: "NO_INSTRUCTIONS",
        source: "WEB",
      }),
    ).resolves.toMatchObject({ success: true });
    expect(
      await db.booking.findUniqueOrThrow({
        where: { id: booking.id },
        select: { status: true },
      }),
    ).toEqual({ status: "CONFIRMED" });
  });

  it("keeps direct booking creation blocked once a listing is suspended", async () => {
    const { host, listing, guests } = await setup();
    await suspendListingForAdmin(listing.id, "Safety review");
    const before = await bookingBusinessState(listing.id, [host.id, guests[0].id]);

    await expect(request(listing.id, guests[0].id)).rejects.toThrow(
      /not available/i,
    );
    expect(await bookingBusinessState(listing.id, [host.id, guests[0].id])).toEqual(
      before,
    );
  });

  it.each([
    ListingStatus.DRAFT,
    ListingStatus.UNPUBLISHED,
    ListingStatus.SUSPENDED,
    ListingStatus.ARCHIVED,
  ])("refuses direct acceptance when the listing is %s", async (status) => {
    const { host, listing, guests } = await setup();
    const booking = await request(listing.id, guests[0].id);
    await db.listing.update({ where: { id: listing.id }, data: { status } });
    const before = await bookingBusinessState(listing.id, [host.id, guests[0].id]);

    await expect(
      confirmBooking(booking.id, host.id, { decision: "NO_INSTRUCTIONS" }),
    ).rejects.toThrow(/no longer approved/i);
    await expect(
      acceptBookingAsHost({
        bookingId: booking.id,
        hostId: host.id,
        decision: "NO_INSTRUCTIONS",
        source: "MOBILE",
      }),
    ).resolves.toEqual({
      success: false,
      error: expect.stringMatching(/no longer approved/i),
    });
    expect(await bookingBusinessState(listing.id, [host.id, guests[0].id])).toEqual(
      before,
    );
  });

  it.each([ListingStatus.UNPUBLISHED, ListingStatus.SUSPENDED])(
    "still allows rejection after the listing becomes %s",
    async (status) => {
      const { host, listing, guests } = await setup();
      const booking = await request(listing.id, guests[0].id);
      await db.listing.update({ where: { id: listing.id }, data: { status } });

      await expect(
        rejectBooking(booking.id, host.id, "The request cannot be hosted."),
      ).resolves.toMatchObject({ status: "REJECTED" });
    },
  );

  it("serializes concurrent acceptance and unpublish into a safe outcome", async () => {
    const { host, listing, guests } = await setup();
    const booking = await request(listing.id, guests[0].id);

    const [acceptance, unpublish] = await Promise.allSettled([
      confirmBooking(booking.id, host.id, { decision: "NO_INSTRUCTIONS" }),
      unpublishOwnedListing(listing.id, host.id),
    ]);

    expect(acceptance.status).toBe("fulfilled");
    expect(unpublish.status).toBe("fulfilled");
    const stored = await db.booking.findUniqueOrThrow({
      where: { id: booking.id },
      select: { status: true, listing: { select: { status: true } } },
    });
    expect(stored.status).toBe("CONFIRMED");

    if (unpublish.status === "fulfilled" && unpublish.value.success) {
      // Acceptance held the lifecycle lock first; unpublish then saw only a confirmed
      // reservation, which the host must still honour, and was allowed to hide sales.
      expect(stored.listing.status).toBe(ListingStatus.UNPUBLISHED);
    } else {
      // Unpublish held the lock first, saw the still-pending request and changed
      // nothing. Acceptance then proceeded against the still-approved listing.
      expect(unpublish).toMatchObject({
        status: "fulfilled",
        value: { success: false, error: UNPUBLISH_PENDING_BOOKINGS_ERROR },
      });
      expect(stored.listing.status).toBe(ListingStatus.APPROVED);
    }
  });
});
