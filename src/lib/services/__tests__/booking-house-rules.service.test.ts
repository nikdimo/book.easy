import { afterEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { createBooking } from "@/lib/services/booking.service";
import { parseHouseRulesSnapshot } from "@/lib/host/v2/listing-house-rules";
import { houseRulesSnapshot } from "@/lib/host/v2/listing-house-rules";
import { houseRulesVersion } from "@/lib/host/v2/house-rules-version.server";
import {
  createTestGuest,
  createTestHostAndListing,
  cleanupTestFixtures,
  type TestFixtures,
} from "./test-helpers";

/**
 * What a guest agreed to, and that it stays agreed to.
 *
 * Integration tests against the real local Postgres, like the rest of
 * `booking.service.test.ts` — the snapshot is a JSON column and its immutability is a
 * property of what the database ends up holding, which a mocked client could not show.
 */

/** Two nights, far enough out that nothing else in the suite has claimed them. */
function stayDates(offsetDays: number) {
  const checkIn = new Date();
  checkIn.setUTCHours(0, 0, 0, 0);
  checkIn.setUTCDate(checkIn.getUTCDate() + offsetDays);
  const checkOut = new Date(checkIn);
  checkOut.setUTCDate(checkOut.getUTCDate() + 2);
  return { checkIn, checkOut };
}

const RULES = {
  checkInTime: "16:00",
  checkOutTime: "10:00",
  petPolicy: "ASK_HOST",
  smokingPolicy: "OUTDOORS_ONLY",
  eventPolicy: "NOT_ALLOWED",
  quietHoursPolicy: "SET",
  quietHoursStart: "22:00",
  quietHoursEnd: "08:00",
  additionalRules: "No shoes indoors.",
} as const;

describe("house rules on a booking", () => {
  let fixtures: TestFixtures | undefined;

  afterEach(async () => {
    if (fixtures) await cleanupTestFixtures(fixtures);
    fixtures = undefined;
  });

  async function setup(offsetDays: number) {
    const { host, property, listing } = await createTestHostAndListing();
    const guest = await createTestGuest();
    fixtures = {
      hostId: host.id,
      propertyId: property.id,
      listingId: listing.id,
      extraUserIds: [guest.id],
    };
    const rulesRow = await db.listing.update({
      where: { id: listing.id },
      data: RULES,
      select: {
        checkInTime: true,
        checkOutTime: true,
        maxGuests: true,
        petPolicy: true,
        smokingPolicy: true,
        eventPolicy: true,
        quietHoursPolicy: true,
        quietHoursStart: true,
        quietHoursEnd: true,
        additionalRules: true,
      },
    });
    return {
      listing,
      guest,
      expectedHouseRulesVersion: houseRulesVersion(houseRulesSnapshot(rulesRow)),
      ...stayDates(offsetDays),
    };
  }

  it("stores the listing's rules, and the moment they were accepted", async () => {
    const { listing, guest, checkIn, checkOut, expectedHouseRulesVersion } =
      await setup(400);

    const booking = await createBooking({
      listingId: listing.id,
      guestId: guest.id,
      checkIn,
      checkOut,
      guestCount: 2,
      houseRulesAcceptedAt: new Date(),
      expectedHouseRulesVersion,
    });

    const stored = await db.booking.findUniqueOrThrow({
      where: { id: booking.id },
      select: { houseRulesSnapshot: true, houseRulesAcceptedAt: true },
    });

    expect(stored.houseRulesAcceptedAt).toBeInstanceOf(Date);
    expect(parseHouseRulesSnapshot(stored.houseRulesSnapshot)).toEqual({
      version: 1,
      checkInTime: "16:00",
      checkOutTime: "10:00",
      maxGuests: 4,
      petPolicy: "ASK_HOST",
      smokingPolicy: "OUTDOORS_ONLY",
      eventPolicy: "NOT_ALLOWED",
      quietHoursPolicy: "SET",
      // Frozen as a list, even for a listing that stores the single legacy pair — a
      // booking taken today and one taken after the host adds a second period read
      // through the same field.
      quietHoursPeriods: [{ start: "22:00", end: "08:00" }],
      quietHoursStart: "22:00",
      quietHoursEnd: "08:00",
      additionalRules: "No shoes indoors.",
    });
  });

  it("builds the snapshot from the listing, never from anything the caller passed", async () => {
    // The caller supplies only the moment. There is no parameter through which a client
    // could describe the rules it would prefer to have agreed to.
    const { listing, guest, checkIn, checkOut, expectedHouseRulesVersion } =
      await setup(420);

    const booking = await createBooking({
      listingId: listing.id,
      guestId: guest.id,
      checkIn,
      checkOut,
      guestCount: 2,
      houseRulesAcceptedAt: new Date(),
      expectedHouseRulesVersion,
      // A crafted payload would try something like this; the type does not admit it and
      // the value is ignored either way.
      ...({ houseRulesSnapshot: { version: 1, petPolicy: "ALLOWED" } } as object),
    });

    const stored = await db.booking.findUniqueOrThrow({
      where: { id: booking.id },
      select: { houseRulesSnapshot: true },
    });

    expect(parseHouseRulesSnapshot(stored.houseRulesSnapshot)?.petPolicy).toBe(
      "ASK_HOST",
    );
  });

  it("leaves the snapshot null when no acceptance was collected", async () => {
    // Which is what every booking taken before acceptance existed holds. "No record" is
    // a different fact from "agreed to nothing", and the column keeps them apart.
    const { listing, guest, checkIn, checkOut } = await setup(440);

    const booking = await createBooking({
      listingId: listing.id,
      guestId: guest.id,
      checkIn,
      checkOut,
      guestCount: 2,
    });

    const stored = await db.booking.findUniqueOrThrow({
      where: { id: booking.id },
      select: { houseRulesSnapshot: true, houseRulesAcceptedAt: true },
    });

    expect(stored.houseRulesSnapshot).toBeNull();
    expect(stored.houseRulesAcceptedAt).toBeNull();
    expect(parseHouseRulesSnapshot(stored.houseRulesSnapshot)).toBeNull();
  });

  it("does not rewrite an existing booking when the host changes their rules", async () => {
    // The point of the whole mechanism: a host who bans pets tomorrow has changed what
    // the next guest agrees to, not what this one already did.
    const { listing, guest, checkIn, checkOut, expectedHouseRulesVersion } =
      await setup(460);

    const booking = await createBooking({
      listingId: listing.id,
      guestId: guest.id,
      checkIn,
      checkOut,
      guestCount: 2,
      houseRulesAcceptedAt: new Date(),
      expectedHouseRulesVersion,
    });

    await db.listing.update({
      where: { id: listing.id },
      data: {
        petPolicy: "NOT_ALLOWED",
        smokingPolicy: "NOT_ALLOWED",
        quietHoursPolicy: "NONE",
        quietHoursStart: null,
        quietHoursEnd: null,
        additionalRules: "Absolutely no pets.",
        checkInTime: "18:00",
      },
    });

    const stored = await db.booking.findUniqueOrThrow({
      where: { id: booking.id },
      select: { houseRulesSnapshot: true },
    });
    const snapshot = parseHouseRulesSnapshot(stored.houseRulesSnapshot);

    expect(snapshot).toMatchObject({
      petPolicy: "ASK_HOST",
      smokingPolicy: "OUTDOORS_ONLY",
      quietHoursPolicy: "SET",
      quietHoursStart: "22:00",
      additionalRules: "No shoes indoors.",
      checkInTime: "16:00",
    });
  });

  it("snapshots a listing that has answered nothing without inventing refusals", async () => {
    const { host, property, listing } = await createTestHostAndListing();
    const guest = await createTestGuest();
    fixtures = {
      hostId: host.id,
      propertyId: property.id,
      listingId: listing.id,
      extraUserIds: [guest.id],
    };
    const { checkIn, checkOut } = stayDates(480);
    const currentRules = houseRulesSnapshot(listing);

    const booking = await createBooking({
      listingId: listing.id,
      guestId: guest.id,
      checkIn,
      checkOut,
      guestCount: 2,
      houseRulesAcceptedAt: new Date(),
      expectedHouseRulesVersion: houseRulesVersion(currentRules),
    });

    const stored = await db.booking.findUniqueOrThrow({
      where: { id: booking.id },
      select: { houseRulesSnapshot: true },
    });

    expect(parseHouseRulesSnapshot(stored.houseRulesSnapshot)).toMatchObject({
      petPolicy: null,
      smokingPolicy: null,
      eventPolicy: null,
      quietHoursPolicy: null,
      additionalRules: null,
      // The one rule every listing always has.
      maxGuests: 4,
    });
  });

  it("refuses to record acceptance when the host changed the rules after they were shown", async () => {
    const { listing, guest, checkIn, checkOut, expectedHouseRulesVersion } =
      await setup(500);

    await db.listing.update({
      where: { id: listing.id },
      data: { additionalRules: "The rules visible now are different." },
    });

    await expect(
      createBooking({
        listingId: listing.id,
        guestId: guest.id,
        checkIn,
        checkOut,
        guestCount: 2,
        houseRulesAcceptedAt: new Date(),
        expectedHouseRulesVersion,
      }),
    ).rejects.toThrow("house rules changed");

    expect(await db.booking.count({ where: { listingId: listing.id } })).toBe(0);
  });
});
