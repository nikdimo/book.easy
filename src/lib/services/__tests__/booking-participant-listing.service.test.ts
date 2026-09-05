import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/cache")>()),
  revalidatePath: () => {},
  revalidateTag: () => {},
}));

import { db } from "@/lib/db";
import { createBooking } from "@/lib/services/booking.service";
import {
  getBookingParticipantListing,
  getListingBySlug,
} from "@/lib/services/property.service";
import {
  cleanupTestFixtures,
  createTestGuest,
  createTestHostAndListing,
  type TestFixtures,
} from "./test-helpers";

/**
 * #13: a guest can still look at the place they booked after it leaves APPROVED.
 *
 * `getListingBySlug` — the public, `cache()`-memoised read behind `/properties/[slug]` —
 * filters on `status: APPROVED`, while `unpublishOwnedListing` and
 * `suspendListingForAdmin` block on `PENDING` bookings only. So a guest with a confirmed,
 * paid-for stay clicked the photo of the place they were staying in and got a 404.
 *
 * Two properties are held here at once, and the second is why the first is a separate
 * function rather than a flag on the public read:
 *
 *  - a participant in an accepted stay can read the listing whatever its status;
 *  - the public read is *unchanged* — it still refuses a non-approved listing to
 *    everybody, including that same signed-in guest, because a suspended listing is very
 *    often suspended so the public cannot see it.
 *
 * Integration test against the real local Postgres. Run `npm run db:docker` first if the
 * container isn't up.
 */
describe("booking-scoped listing access", () => {
  let fixtures: TestFixtures | undefined;
  const bookingIds: string[] = [];

  afterEach(async () => {
    if (bookingIds.length > 0) {
      await db.availabilityBlock.deleteMany({
        where: { bookingId: { in: bookingIds } },
      });
      await db.booking.deleteMany({ where: { id: { in: bookingIds.splice(0) } } });
    }
    if (fixtures) await cleanupTestFixtures(fixtures);
    fixtures = undefined;
  });

  async function setup({ accepted = true }: { accepted?: boolean } = {}) {
    const { host, property, listing } = await createTestHostAndListing();
    const guest = await createTestGuest();
    const stranger = await createTestGuest();
    fixtures = {
      hostId: host.id,
      propertyId: property.id,
      listingId: listing.id,
      extraUserIds: [guest.id, stranger.id],
    };
    const booking = await createBooking({
      listingId: listing.id,
      guestId: guest.id,
      guestCount: 1,
      checkIn: new Date("2029-12-10T00:00:00.000Z"),
      checkOut: new Date("2029-12-13T00:00:00.000Z"),
    });
    bookingIds.push(booking.id);
    const storedBooking = accepted
      ? await db.booking.update({
          where: { id: booking.id },
          data: {
            status: "CONFIRMED",
            acceptedAt: new Date("2026-09-04T12:00:00.000Z"),
          },
        })
      : booking;
    return { host, guest, stranger, listing, booking: storedBooking };
  }

  const unpublish = (listingId: string) =>
    db.listing.update({ where: { id: listingId }, data: { status: "UNPUBLISHED" } });

  it("serves the guest their listing after the host unpublishes it", async () => {
    const { guest, listing, booking } = await setup();
    await unpublish(listing.id);

    const result = await getBookingParticipantListing(booking.id, guest.id);
    expect(result?.listing.id).toBe(listing.id);
    expect(result?.listing.title).toBe(listing.title);
  });

  it("serves the host the same listing", async () => {
    const { host, listing, booking } = await setup();
    await unpublish(listing.id);

    expect((await getBookingParticipantListing(booking.id, host.id))?.listing.id).toBe(
      listing.id,
    );
  });

  it("serves it after a suspension too", async () => {
    const { guest, listing, booking } = await setup();
    await db.listing.update({
      where: { id: listing.id },
      data: { status: "SUSPENDED" },
    });

    expect((await getBookingParticipantListing(booking.id, guest.id))?.listing.id).toBe(
      listing.id,
    );
  });

  it("does not turn an unaccepted request into a route around a suspension", async () => {
    const { guest, listing, booking } = await setup({ accepted: false });
    await db.listing.update({
      where: { id: listing.id },
      data: { status: "SUSPENDED" },
    });

    expect(await getBookingParticipantListing(booking.id, guest.id)).toBeNull();
  });

  it("removes detailed access when an accepted stay is cancelled", async () => {
    const { guest, listing, booking } = await setup();
    await Promise.all([
      db.listing.update({
        where: { id: listing.id },
        data: { status: "UNPUBLISHED" },
      }),
      db.booking.update({
        where: { id: booking.id },
        data: { status: "CANCELLED_BY_HOST" },
      }),
    ]);

    expect(await getBookingParticipantListing(booking.id, guest.id)).toBeNull();
  });

  /** The whole justification for the access: being in this booking, and nothing else. */
  it("refuses someone who is not in the booking", async () => {
    const { stranger, booking } = await setup();

    expect(await getBookingParticipantListing(booking.id, stranger.id)).toBeNull();
  });

  it("refuses a booking id that is not this user's", async () => {
    const { guest } = await setup();

    expect(await getBookingParticipantListing("no-such-booking", guest.id)).toBeNull();
  });

  /**
   * The public read must not have moved. If it had, an unpublished or suspended listing
   * could leak into a public render — and that is exactly what a suspension is for.
   */
  it("leaves the public read refusing a non-approved listing, for everyone", async () => {
    const { listing } = await setup();
    expect((await getListingBySlug(listing.slug))?.id).toBe(listing.id);

    await unpublish(listing.id);
    expect(await getListingBySlug(listing.slug)).toBeNull();
  });

  /** The host's private reusable payment details are never part of this. */
  it("omits the host's saved payment templates", async () => {
    const { guest, listing, booking } = await setup();
    await db.listing.update({
      where: { id: listing.id },
      data: {
        paymentInstructionTemplates: {
          version: 2,
          templates: { PAYPAL: "private@example.test" },
        },
      },
    });

    const result = await getBookingParticipantListing(booking.id, guest.id);
    expect(result?.listing).not.toHaveProperty("paymentInstructionTemplates");
  });
});
