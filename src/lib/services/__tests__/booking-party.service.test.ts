import { afterEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { SELF_BOOKING_ERROR, createBooking } from "@/lib/services/booking.service";
import { resolveBookingParty } from "@/lib/booking-party";
import {
  cleanupTestFixtures,
  createTestGuest,
  createTestHostAndListing,
  type TestFixtures,
} from "./test-helpers";

/**
 * H3 and H4, at the only place either is actually enforced.
 *
 * Integration tests against the real local Postgres, like the rest of the booking
 * suite: what a self-booking must *not* leave behind and what a party must leave behind
 * are both properties of the rows the database ends up holding, and a mocked client
 * could show neither. Run `npm run db:docker` first if the container isn't up.
 */

/** A two-night stay, offset far enough out that nothing else in the suite claims it. */
function stayDates(offsetDays: number) {
  const checkIn = new Date();
  checkIn.setUTCHours(0, 0, 0, 0);
  checkIn.setUTCDate(checkIn.getUTCDate() + offsetDays);
  const checkOut = new Date(checkIn);
  checkOut.setUTCDate(checkOut.getUTCDate() + 2);
  return { checkIn, checkOut };
}

describe("a host cannot book their own listing", () => {
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

  it("refuses a request whose guest is the listing's own host", async () => {
    const { host, listing } = await setup();
    const { checkIn, checkOut } = stayDates(610);

    await expect(
      createBooking({
        listingId: listing.id,
        guestId: host.id,
        checkIn,
        checkOut,
        party: { adults: 2 },
      }),
    ).rejects.toThrow(SELF_BOOKING_ERROR);
  });

  it("creates nothing at all — no booking, hold, conversation or queued email", async () => {
    const { host, listing } = await setup();
    const { checkIn, checkOut } = stayDates(620);

    await expect(
      createBooking({
        listingId: listing.id,
        guestId: host.id,
        checkIn,
        checkOut,
        party: { adults: 1 },
      }),
    ).rejects.toThrow(SELF_BOOKING_ERROR);

    // The whole point of putting the check inside the transaction and before the
    // writes: a self-booking that got as far as a BOOKING_HOLD would have blocked this
    // host's own calendar, and one that got as far as a conversation would have opened
    // a thread with the same person on both sides of it.
    expect(
      await db.booking.count({ where: { listingId: listing.id } }),
    ).toBe(0);
    expect(
      await db.availabilityBlock.count({ where: { listingId: listing.id } }),
    ).toBe(0);
    expect(
      await db.conversation.count({ where: { listingId: listing.id } }),
    ).toBe(0);
    expect(
      await db.bookingEmailDelivery.count({
        where: { booking: { listingId: listing.id } },
      }),
    ).toBe(0);
  });

  it("holds for a direct service call, not just for the widget", async () => {
    const { host, listing } = await setup();
    const { checkIn, checkOut } = stayDates(630);

    // No action, no form, no session — the raw service, which is what a bypassed or
    // hand-rolled client would reach. The listing page hiding the widget is a courtesy;
    // this is the enforcement.
    await expect(
      createBooking({
        listingId: listing.id,
        guestId: host.id,
        checkIn,
        checkOut,
        guestCount: 2,
      }),
    ).rejects.toThrow(SELF_BOOKING_ERROR);
  });

  it("still takes an ordinary guest's request for the same listing and dates", async () => {
    const { host, listing, guest } = await setup();
    const { checkIn, checkOut } = stayDates(640);

    await expect(
      createBooking({
        listingId: listing.id,
        guestId: host.id,
        checkIn,
        checkOut,
        party: { adults: 2 },
      }),
    ).rejects.toThrow(SELF_BOOKING_ERROR);

    const booking = await createBooking({
      listingId: listing.id,
      guestId: guest.id,
      checkIn,
      checkOut,
      party: { adults: 2 },
    });

    expect(booking.guestId).toBe(guest.id);
    expect(
      await db.availabilityBlock.count({
        where: { listingId: listing.id, bookingId: booking.id },
      }),
    ).toBe(1);
  });
});

describe("the party a guest chose is what the booking stores", () => {
  let fixtures: TestFixtures | undefined;

  afterEach(async () => {
    if (fixtures) await cleanupTestFixtures(fixtures);
    fixtures = undefined;
  });

  async function setup(petPolicy: "ALLOWED" | "NOT_ALLOWED" | "ASK_HOST" | null = null) {
    const { host, property, listing } = await createTestHostAndListing();
    const guest = await createTestGuest();
    fixtures = {
      hostId: host.id,
      propertyId: property.id,
      listingId: listing.id,
      extraUserIds: [guest.id],
    };
    if (petPolicy) {
      await db.listing.update({ where: { id: listing.id }, data: { petPolicy } });
    }
    return { listing, guest };
  }

  async function storedParty(bookingId: string) {
    return db.booking.findUniqueOrThrow({
      where: { id: bookingId },
      select: {
        guestCount: true,
        adults: true,
        children: true,
        infants: true,
        pets: true,
      },
    });
  }

  it("keeps adults and children apart, and adds only those two into the guest count", async () => {
    const { listing, guest } = await setup();
    const { checkIn, checkOut } = stayDates(700);

    const booking = await createBooking({
      listingId: listing.id,
      guestId: guest.id,
      checkIn,
      checkOut,
      party: { adults: 2, children: 1 },
    });

    expect(await storedParty(booking.id)).toEqual({
      guestCount: 3,
      adults: 2,
      children: 1,
      infants: 0,
      pets: 0,
    });
  });

  it("keeps an infant out of the capacity count and still records it", async () => {
    const { listing, guest } = await setup();
    const { checkIn, checkOut } = stayDates(710);

    const booking = await createBooking({
      listingId: listing.id,
      guestId: guest.id,
      checkIn,
      checkOut,
      party: { adults: 2, infants: 2 },
    });

    // The listing takes four; two adults and two infants would be six if infants
    // counted, and this booking has to be accepted precisely because they do not.
    expect(await storedParty(booking.id)).toEqual({
      guestCount: 2,
      adults: 2,
      children: 0,
      infants: 2,
      pets: 0,
    });
  });

  it("records a pet at a listing whose house rules take one", async () => {
    const { listing, guest } = await setup("ALLOWED");
    const { checkIn, checkOut } = stayDates(720);

    const booking = await createBooking({
      listingId: listing.id,
      guestId: guest.id,
      checkIn,
      checkOut,
      party: { adults: 1, pets: 1 },
    });

    expect(await storedParty(booking.id)).toMatchObject({ guestCount: 1, pets: 1 });
  });

  it("treats ASK_HOST as a conversation rather than a refusal", async () => {
    const { listing, guest } = await setup("ASK_HOST");
    const { checkIn, checkOut } = stayDates(730);

    const booking = await createBooking({
      listingId: listing.id,
      guestId: guest.id,
      checkIn,
      checkOut,
      party: { adults: 1, pets: 1 },
    });

    expect(await storedParty(booking.id)).toMatchObject({ pets: 1 });
  });

  it("refuses a pet at a listing whose house rules say no, and writes nothing", async () => {
    const { listing, guest } = await setup("NOT_ALLOWED");
    const { checkIn, checkOut } = stayDates(740);

    await expect(
      createBooking({
        listingId: listing.id,
        guestId: guest.id,
        checkIn,
        checkOut,
        party: { adults: 2, pets: 1 },
      }),
    ).rejects.toThrow(/pets/i);

    expect(await db.booking.count({ where: { listingId: listing.id } })).toBe(0);
  });

  it("refuses a party with nobody old enough to hold the booking", async () => {
    const { listing, guest } = await setup();
    const { checkIn, checkOut } = stayDates(750);

    await expect(
      createBooking({
        listingId: listing.id,
        guestId: guest.id,
        checkIn,
        checkOut,
        party: { adults: 0, children: 2, infants: 1 },
      }),
    ).rejects.toThrow(/adult/i);
  });

  it("still checks the party against the listing's capacity, on the two that count", async () => {
    const { listing, guest } = await setup();
    const { checkIn, checkOut } = stayDates(760);

    // maxGuests is 4 on the test listing.
    await expect(
      createBooking({
        listingId: listing.id,
        guestId: guest.id,
        checkIn,
        checkOut,
        party: { adults: 3, children: 2 },
      }),
    ).rejects.toThrow(/Maximum 4 guests/);
  });

  it("leaves the party null for a caller that stated only a guest count", async () => {
    const { listing, guest } = await setup();
    const { checkIn, checkOut } = stayDates(770);

    const booking = await createBooking({
      listingId: listing.id,
      guestId: guest.id,
      checkIn,
      checkOut,
      guestCount: 2,
    });

    const stored = await storedParty(booking.id);
    // Exactly what every booking taken before these columns existed holds. Writing
    // zeroes here would assert the guest brought no infant and no pet, which is a claim
    // nobody made — so readers get "not recorded" and print the plain count.
    expect(stored).toEqual({
      guestCount: 2,
      adults: null,
      children: null,
      infants: null,
      pets: null,
    });
    expect(resolveBookingParty(stored)).toEqual({ recorded: false, guestCount: 2 });
  });

  it("keeps the legacy count-only path but refuses invalid raw counts", async () => {
    const { listing, guest } = await setup();
    const { checkIn, checkOut } = stayDates(780);

    for (const guestCount of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 21]) {
      await expect(
        createBooking({
          listingId: listing.id,
          guestId: guest.id,
          checkIn,
          checkOut,
          guestCount,
        }),
      ).rejects.toThrow(/party size/i);
    }

    expect(await db.booking.count({ where: { listingId: listing.id } })).toBe(0);
  });
});
