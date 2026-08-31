import { afterEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
  createBooking,
  confirmBooking,
  getGuestBookingForConfirmation,
  getGuestBookings,
  getGuestBookingWithHost,
} from "@/lib/services/booking.service";
import { getBookingPaymentProgress } from "@/lib/services/booking-payment-status.service";
import { getListingPaymentMethodsData } from "@/lib/services/listing-payment-methods.service";
import {
  cleanupTestFixtures,
  createTestGuest,
  createTestHostAndListing,
  type TestFixtures,
} from "./test-helpers";

/**
 * Private payment details are financial data belonging to two people.
 *
 * These tests assert the negative: the values a host saves must not appear in anything
 * a guest, a visitor, or a log reader can reach — only in the one place the product
 * promises, which is the private request the host sends for that booking.
 */
const SECRET_IBAN = "DK5000400440116243";
const SECRET_HANDLE = "paypal-secret@example.com";

describe("private payment details never leak", () => {
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
    await db.listing.update({
      where: { id: listing.id },
      data: {
        acceptedPaymentMethods: ["BANK_TRANSFER_INTERNATIONAL", "PAYPAL"],
        paymentMethodsReviewedAt: new Date(),
        paymentInstructionTemplates: {
          version: 2,
          templates: {},
          details: {
            BANK_TRANSFER_INTERNATIONAL: {
              version: 2,
              fields: {
                accountHolder: "Nikola Dimovski",
                bankName: "Komercijalna Banka",
                accountIdentifier: SECRET_IBAN,
                swiftBic: "DABADKKK",
              },
              updatedAt: "2026-08-01T10:00:00.000Z",
            },
            PAYPAL: {
              version: 2,
              fields: { providerIdentifier: SECRET_HANDLE },
              updatedAt: "2026-08-01T10:00:00.000Z",
            },
          },
        },
      },
    });

    const checkIn = new Date();
    checkIn.setUTCHours(0, 0, 0, 0);
    checkIn.setUTCDate(checkIn.getUTCDate() + 710);
    const checkOut = new Date(checkIn);
    checkOut.setUTCDate(checkOut.getUTCDate() + 2);

    const booking = await createBooking({
      listingId: listing.id,
      guestId: guest.id,
      checkIn,
      checkOut,
      guestCount: 2,
      ...({ selectedPaymentMethod: "BANK_TRANSFER_INTERNATIONAL" } as Record<
        string,
        unknown
      >),
    } as Parameters<typeof createBooking>[0]);

    return { host, guest, listing, booking };
  }

  it("keeps saved details out of the guest's booking payload", async () => {
    const { guest, booking } = await setup();
    await confirmBooking(booking.id, (await db.listing.findUniqueOrThrow({
      where: { id: booking.listingId },
      select: { hostId: true },
    })).hostId, { decision: "SEND_LATER" });

    const guestBooking = await getGuestBookingWithHost(booking.id, guest.id);
    const serialized = JSON.stringify(guestBooking);

    expect(serialized).not.toContain(SECRET_IBAN);
    expect(serialized).not.toContain(SECRET_HANDLE);
  });

  it("keeps saved details out of every guest-facing booking query", async () => {
    const { guest, booking } = await setup();

    const [list, confirmation] = await Promise.all([
      getGuestBookings(guest.id),
      getGuestBookingForConfirmation(booking.id, guest.id),
    ]);
    const serialized = JSON.stringify({ list, confirmation });

    expect(serialized).not.toContain(SECRET_IBAN);
    expect(serialized).not.toContain(SECRET_HANDLE);
  });

  it("keeps saved details out of the shared payment-progress payload", async () => {
    const { host, guest, booking } = await setup();
    await confirmBooking(booking.id, host.id, { decision: "SEND_LATER" });

    for (const viewerId of [guest.id, host.id]) {
      const progress = await getBookingPaymentProgress(booking.id, viewerId);
      const serialized = JSON.stringify(progress);
      // Nothing here reads the listing's reusable templates: this payload carries only
      // what was actually sent for this booking, which so far is nothing.
      expect(serialized, viewerId).not.toContain(SECRET_IBAN);
      expect(serialized, viewerId).not.toContain(SECRET_HANDLE);
    }
  });

  it("shows the guest only the details sent for their own booking", async () => {
    const { host, guest, booking } = await setup();
    await confirmBooking(booking.id, host.id, { decision: "SEND_LATER" });
    await db.booking.update({
      where: { id: booking.id },
      data: {
        paymentInstructionsStatus: "SENT",
        paymentInstructionsSentAt: new Date(),
        paymentInstructionsSnapshot: {
          version: 2,
          method: "BANK_TRANSFER_INTERNATIONAL",
          otherLabel: null,
          fields: {
            accountHolder: "Nikola Dimovski",
            bankName: "Komercijalna Banka",
            accountIdentifier: SECRET_IBAN,
            swiftBic: "DABADKKK",
          },
          sentAt: "2026-08-27T10:00:00.000Z",
        },
      },
    });

    const progress = await getBookingPaymentProgress(booking.id, guest.id);
    const serialized = JSON.stringify(progress);

    // The bank details they were sent, and only those.
    expect(serialized).toContain(SECRET_IBAN);
    // Never the host's saved PayPal handle, which this booking does not use.
    expect(serialized).not.toContain(SECRET_HANDLE);
  });

  it("refuses the payment-progress payload to anyone but the two participants", async () => {
    const { booking } = await setup();
    const stranger = await createTestGuest();
    fixtures?.extraUserIds.push(stranger.id);

    expect(await getBookingPaymentProgress(booking.id, stranger.id)).toBeNull();
  });

  it("gives the owner-scoped editor read to the host and nobody else", async () => {
    const { host, guest, listing } = await setup();

    const owner = await getListingPaymentMethodsData(listing.id, host.id);
    expect(owner?.instructionDetails.PAYPAL?.fields).toEqual({
      providerIdentifier: SECRET_HANDLE,
    });

    expect(await getListingPaymentMethodsData(listing.id, guest.id)).toBeNull();
  });

  it("writes no payment values into the booking's audit trail or timeline", async () => {
    const { host, booking } = await setup();
    await confirmBooking(booking.id, host.id, { decision: "SEND_LATER" });

    const [timeline, audits] = await Promise.all([
      db.bookingTimelineEvent.findMany({ where: { bookingId: booking.id } }),
      db.auditLog.findMany({ where: { entityId: booking.id } }),
    ]);
    const serialized = JSON.stringify({ timeline, audits });

    expect(serialized).not.toContain(SECRET_IBAN);
    expect(serialized).not.toContain(SECRET_HANDLE);
  });
});
