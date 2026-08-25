import { afterEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { parsePaymentMethodsSnapshot } from "@/lib/payments/payment-methods";
import { createBooking } from "@/lib/services/booking.service";
import {
  cleanupTestFixtures,
  createTestGuest,
  createTestHostAndListing,
  type TestFixtures,
} from "./test-helpers";

function stayDates(offsetDays: number) {
  const checkIn = new Date();
  checkIn.setUTCHours(0, 0, 0, 0);
  checkIn.setUTCDate(checkIn.getUTCDate() + offsetDays);
  const checkOut = new Date(checkIn);
  checkOut.setUTCDate(checkOut.getUTCDate() + 2);
  return { checkIn, checkOut };
}

describe("payment methods on a booking request", () => {
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
    return { listing, guest, ...stayDates(offsetDays) };
  }

  it("creates a reviewed V1 snapshot from the listing, never client input", async () => {
    const { listing, guest, checkIn, checkOut } = await setup(620);
    await db.listing.update({
      where: { id: listing.id },
      data: {
        acceptedPaymentMethods: ["PAYPAL", "OTHER"],
        paymentMethodOther: "MobilePay",
        paymentMethodsReviewedAt: new Date(),
      },
    });

    const booking = await createBooking({
      listingId: listing.id,
      guestId: guest.id,
      checkIn,
      checkOut,
      guestCount: 2,
      ...({
        paymentMethodsSnapshot: {
          version: 1,
          status: "REVIEWED",
          methods: ["ARRANGE_DIRECTLY"],
          otherLabel: null,
        },
      } as object),
    });

    const stored = await db.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(parsePaymentMethodsSnapshot(stored.paymentMethodsSnapshot)).toEqual({
      version: 1,
      status: "REVIEWED",
      methods: ["PAYPAL", "OTHER"],
      otherLabel: "MobilePay",
    });
  });

  it("snapshots UNANSWERED for a new request and leaves it immutable", async () => {
    const { listing, guest, checkIn, checkOut } = await setup(640);
    const booking = await createBooking({
      listingId: listing.id,
      guestId: guest.id,
      checkIn,
      checkOut,
      guestCount: 2,
    });

    await db.listing.update({
      where: { id: listing.id },
      data: {
        acceptedPaymentMethods: ["WISE"],
        paymentMethodsReviewedAt: new Date(),
      },
    });

    const stored = await db.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(parsePaymentMethodsSnapshot(stored.paymentMethodsSnapshot)).toEqual({
      version: 1,
      status: "UNANSWERED",
      methods: [],
      otherLabel: null,
    });
  });
});
