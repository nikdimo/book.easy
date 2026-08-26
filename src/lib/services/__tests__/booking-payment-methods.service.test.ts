import { afterEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { parsePaymentMethodsSnapshot } from "@/lib/payments/payment-methods";
import { confirmBooking, createBooking } from "@/lib/services/booking.service";
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
      // The host now accepts two methods, so the guest has to pick one.
      selectedPaymentMethod: "PAYPAL",
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
    expect(stored.selectedPaymentMethod).toBe("PAYPAL");
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

  it("requires the guest to choose when the host offers multiple methods", async () => {
    const { listing, guest, checkIn, checkOut } = await setup(650);
    await db.listing.update({
      where: { id: listing.id },
      data: {
        acceptedPaymentMethods: ["PAYPAL", "BITCOIN"],
        paymentMethodsReviewedAt: new Date(),
      },
    });

    await expect(
      createBooking({
        listingId: listing.id,
        guestId: guest.id,
        checkIn,
        checkOut,
        guestCount: 2,
      }),
    ).rejects.toThrow("Choose a payment method");
  });

  it("rejects a stale choice that the host no longer accepts", async () => {
    const { listing, guest, checkIn, checkOut } = await setup(660);
    await db.listing.update({
      where: { id: listing.id },
      data: {
        acceptedPaymentMethods: ["PAYPAL"],
        paymentMethodsReviewedAt: new Date(),
      },
    });

    await expect(
      createBooking({
        listingId: listing.id,
        guestId: guest.id,
        checkIn,
        checkOut,
        guestCount: 2,
        selectedPaymentMethod: "BITCOIN",
      }),
    ).rejects.toThrow("accepted payment methods changed");
  });

  it("creates the host's send-payment-information task after accepting a remote method", async () => {
    const { listing, guest, checkIn, checkOut } = await setup(670);
    const storedListing = await db.listing.update({
      where: { id: listing.id },
      data: {
        acceptedPaymentMethods: ["BANK_TRANSFER_INTERNATIONAL"],
        paymentMethodsReviewedAt: new Date(),
      },
      select: { hostId: true },
    });
    const booking = await createBooking({
      listingId: listing.id,
      guestId: guest.id,
      checkIn,
      checkOut,
      guestCount: 2,
      selectedPaymentMethod: "BANK_TRANSFER_INTERNATIONAL",
    });

    await confirmBooking(booking.id, storedListing.hostId);

    const accepted = await db.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(accepted.paymentInstructionsStatus).toBe("PENDING");
  });
});
