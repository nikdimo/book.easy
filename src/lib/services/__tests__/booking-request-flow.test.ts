import { afterEach, describe, expect, it } from "vitest";
import { confirmBooking, createBooking, rejectBooking } from "@/lib/services/booking.service";
import { db } from "@/lib/db";
import {
  cleanupTestFixtures,
  createTestGuest,
  createTestHostAndListing,
  type TestFixtures,
} from "./test-helpers";

/**
 * The payment-language correction is copy: it renamed the button, replaced the line
 * under it and rewrote what the emails and the legal pages claim. What it must not
 * have done is move the booking itself.
 *
 * So this pins the shape of the flow the new wording describes — a request that
 * arrives PENDING, an acceptance that the host makes, a decline that ends it — and
 * that no money is processed at any of those points. Manual status exists only to
 * record participant reports; it is not evidence of a platform transaction.
 *
 * Integration test against the real local Postgres, like its neighbours in this
 * directory. Run `npm run db:docker` first if the container isn't up.
 */
describe("request-to-book flow", () => {
  let fixtures: TestFixtures | undefined;

  afterEach(async () => {
    if (fixtures) await cleanupTestFixtures(fixtures);
    fixtures = undefined;
  });

  async function setup() {
    const { host, property, listing } = await createTestHostAndListing();
    const guest = await createTestGuest();
    fixtures = {
      hostId: host.id,
      propertyId: property.id,
      listingId: listing.id,
      extraUserIds: [guest.id],
    };
    return { host, listing, guest };
  }

  it("creates a request the host still has to answer, with nothing charged", async () => {
    const { listing, guest } = await setup();

    const booking = await createBooking({
      listingId: listing.id,
      guestId: guest.id,
      checkIn: new Date("2032-04-01"),
      checkOut: new Date("2032-04-04"),
      guestCount: 2,
    });

    expect(booking.status).toBe("PENDING");
    // A deadline for the host to answer by is what makes this a request rather than
    // a reservation, and it is what every "the host will review it" sentence means.
    expect(booking.responseDueAt.getTime()).toBeGreaterThan(Date.now());
    expect(booking.respondedAt).toBeNull();
    // The total is a price agreed between guest and host, not an amount taken: the
    // platform adds nothing to it and records no payment against it.
    expect(Number(booking.serviceFee)).toBe(0);
    expect(Number(booking.totalPrice)).toBe(160);
    expect(booking).not.toHaveProperty("paidAt");
    expect(booking.paymentStatus).toBe("UNTRACKED");
    expect(booking.paymentStatusUpdatedAt).toBeNull();
  });

  it("moves PENDING to CONFIRMED when the host accepts, and no further", async () => {
    const { host, listing, guest } = await setup();

    const booking = await createBooking({
      listingId: listing.id,
      guestId: guest.id,
      checkIn: new Date("2032-05-01"),
      checkOut: new Date("2032-05-03"),
      guestCount: 1,
    });

    await confirmBooking(booking.id, host.id);

    const accepted = await db.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(accepted.status).toBe("CONFIRMED");
    expect(accepted.respondedAt).not.toBeNull();
    // The amount is unchanged by acceptance — accepting is the host agreeing to host,
    // not a settlement step the platform performs.
    expect(Number(accepted.totalPrice)).toBe(Number(booking.totalPrice));

    // Accepting twice is not a way to trigger anything a second time.
    await expect(confirmBooking(booking.id, host.id)).rejects.toThrow();
  });

  it("ends the request when the host declines, and needs a reason to do it", async () => {
    const { host, listing, guest } = await setup();

    const booking = await createBooking({
      listingId: listing.id,
      guestId: guest.id,
      checkIn: new Date("2032-06-10"),
      checkOut: new Date("2032-06-12"),
      guestCount: 1,
    });

    await expect(rejectBooking(booking.id, host.id)).rejects.toThrow(/reason is required/i);

    await rejectBooking(booking.id, host.id, "Those dates no longer work.");

    const declined = await db.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(declined.status).toBe("REJECTED");
    expect(declined.cancellationReason).toBe("Those dates no longer work.");
    expect(Number(declined.totalPrice)).toBe(Number(booking.totalPrice));
  });
});
