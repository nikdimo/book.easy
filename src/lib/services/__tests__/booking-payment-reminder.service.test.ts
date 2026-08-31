import { afterEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { createBooking, confirmBooking } from "@/lib/services/booking.service";
import { processBookingPaymentReminders } from "@/lib/services/booking-payment-reminder.service";
import {
  cleanupTestFixtures,
  createTestGuest,
  createTestHostAndListing,
  type TestFixtures,
} from "./test-helpers";

describe("booking payment reminders", () => {
  let fixtures: TestFixtures | undefined;

  afterEach(async () => {
    if (fixtures) await cleanupTestFixtures(fixtures);
    fixtures = undefined;
  });

  it("sends each due-date reminder once and skips settled requests", async () => {
    const { host, property, listing } = await createTestHostAndListing();
    const guest = await createTestGuest();
    fixtures = {
      hostId: host.id,
      propertyId: property.id,
      listingId: listing.id,
      extraUserIds: [guest.id],
    };
    const checkIn = new Date("2026-09-10T00:00:00.000Z");
    const booking = await createBooking({
      listingId: listing.id,
      guestId: guest.id,
      guestCount: 1,
      checkIn,
      checkOut: new Date("2026-09-12T00:00:00.000Z"),
    });
    await confirmBooking(booking.id, host.id, { decision: "NO_INSTRUCTIONS" });
    const request = await db.bookingPaymentRequest.findFirstOrThrow({
      where: { bookingId: booking.id, type: "ACCOMMODATION_BALANCE" },
    });
    await db.bookingPaymentRequest.update({
      where: { id: request.id },
      data: {
        status: "SENT",
        dueAt: new Date("2026-09-01T00:00:00.000Z"),
        reviewedAt: new Date("2026-08-28T00:00:00.000Z"),
        sentAt: new Date("2026-08-28T00:00:00.000Z"),
      },
    });

    const now = new Date("2026-09-01T10:00:00.000Z");
    // The processor is intentionally global, so another integration test running
    // against the same database may also leave a due obligation. Assert this fixture's
    // delivery, not a repository-wide count that depends on unrelated rows.
    await processBookingPaymentReminders(now);
    await expect(
      db.bookingPaymentReminderDelivery.count({
        where: { requestId: request.id, recipientId: guest.id, kind: "DUE_DATE" },
      }),
    ).resolves.toBe(1);
    await processBookingPaymentReminders(now);
    await expect(
      db.bookingPaymentReminderDelivery.count({
        where: { requestId: request.id, recipientId: guest.id, kind: "DUE_DATE" },
      }),
    ).resolves.toBe(1);

    await db.booking.update({
      where: { id: booking.id },
      data: { paymentStatus: "PAYMENT_CONFIRMED" },
    });
    await processBookingPaymentReminders(new Date("2026-09-05T10:00:00.000Z"));
    await expect(
      db.bookingPaymentReminderDelivery.count({ where: { requestId: request.id } }),
    ).resolves.toBe(1);
  });
});
