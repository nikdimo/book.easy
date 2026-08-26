import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
  ensureBookingConversation,
  getConversationMessages,
  markConversationRead,
  shareBookingPaymentInstructions,
  sendConversationMessage,
} from "@/lib/services/chat.service";
import { PAYMENT_INSTRUCTIONS_PREVIEW } from "@/lib/services/payment-instructions";
import {
  createConversationDamageReport,
  updateConversationDamageReport,
} from "@/lib/services/damage-report.service";
import { getHostAttentionSummary } from "@/lib/services/attention.service";
import {
  cleanupTestFixtures,
  createTestGuest,
  createTestHostAndListing,
  type TestFixtures,
} from "./test-helpers";

describe("booking conversation", () => {
  let fixtures: TestFixtures | undefined;

  afterEach(async () => {
    if (fixtures) await cleanupTestFixtures(fixtures);
    fixtures = undefined;
  });

  async function setup() {
    const { host, property, listing } = await createTestHostAndListing();
    const guest = await createTestGuest();
    const outsider = await createTestGuest();
    fixtures = {
      hostId: host.id,
      propertyId: property.id,
      listingId: listing.id,
      extraUserIds: [guest.id, outsider.id],
    };
    const booking = await db.booking.create({
      data: {
        listingId: listing.id,
        guestId: guest.id,
        checkIn: new Date("2030-09-10"),
        checkOut: new Date("2030-09-12"),
        guestCount: 2,
        nightlyRate: 50,
        cleaningFee: 10,
        totalPrice: 110,
        numberOfNights: 2,
        status: "PENDING",
      },
    });
    return { host, guest, outsider, booking };
  }

  it("creates unread state and a durable notification, then clears both on read", async () => {
    const { host, guest, booking } = await setup();
    const conversation = await ensureBookingConversation(booking.id, guest.id);

    await sendConversationMessage({
      conversationId: conversation.id,
      senderId: guest.id,
      body: "Can I check in after 21:00?",
    });

    const [membership, notification] = await Promise.all([
      db.conversationParticipant.findUniqueOrThrow({
        where: {
          conversationId_userId: {
            conversationId: conversation.id,
            userId: host.id,
          },
        },
      }),
      db.notification.findFirstOrThrow({
        where: {
          userId: host.id,
          type: "CHAT_MESSAGE",
        },
      }),
    ]);
    expect(membership.unreadCount).toBe(1);
    expect(notification.readAt).toBeNull();

    const result = await getConversationMessages(conversation.id, host.id);
    expect(result.messages).toHaveLength(1);
    expect(
      (
        await db.conversationParticipant.findUniqueOrThrow({
          where: {
            conversationId_userId: {
              conversationId: conversation.id,
              userId: host.id,
            },
          },
        })
      ).unreadCount
    ).toBe(1);

    await markConversationRead({
      conversationId: conversation.id,
      userId: host.id,
      lastMessageId: result.messages[0].id,
    });

    const [readMembership, readNotification] = await Promise.all([
      db.conversationParticipant.findUniqueOrThrow({
        where: {
          conversationId_userId: {
            conversationId: conversation.id,
            userId: host.id,
          },
        },
      }),
      db.notification.findUniqueOrThrow({ where: { id: notification.id } }),
    ]);
    expect(readMembership.unreadCount).toBe(0);
    expect(readNotification.readAt).not.toBeNull();
  });

  it("does not expose a booking conversation to an unrelated user", async () => {
    const { guest, outsider, booking } = await setup();
    await expect(ensureBookingConversation(booking.id, outsider.id)).rejects.toThrow(
      "Booking not found"
    );

    const conversation = await ensureBookingConversation(booking.id, guest.id);
    await expect(
      getConversationMessages(conversation.id, outsider.id)
    ).rejects.toThrow("Conversation not found");
    await expect(
      sendConversationMessage({
        conversationId: conversation.id,
        senderId: outsider.id,
        body: "I should not be able to send this",
      })
    ).rejects.toThrow("Conversation not found");
  });

  it("deduplicates retries with the same client message ID", async () => {
    const { host, guest, booking } = await setup();
    const conversation = await ensureBookingConversation(booking.id, guest.id);
    const clientId = randomUUID();
    const input = {
      conversationId: conversation.id,
      senderId: guest.id,
      body: "One reliable message",
      clientId,
    };

    const first = await sendConversationMessage(input);
    const retry = await sendConversationMessage(input);

    expect(retry.id).toBe(first.id);
    expect(
      await db.message.count({ where: { conversationId: conversation.id } })
    ).toBe(1);
    expect(
      await db.notification.count({
        where: {
          userId: host.id,
          data: { path: ["conversationId"], equals: conversation.id },
        },
      })
    ).toBe(1);
    expect(
      await db.messageEmailDelivery.count({
        where: { messageId: first.id, recipientId: host.id },
      })
    ).toBe(1);
  });

  it("only lets the listing owner share safe instructions after acceptance and confirmation", async () => {
    const { host, guest, outsider, booking } = await setup();
    const conversation = await ensureBookingConversation(booking.id, guest.id);

    await expect(
      shareBookingPaymentInstructions({
        bookingId: booking.id,
        hostId: outsider.id,
        body: "IBAN: MK07250120000058984",
      })
    ).rejects.toThrow("Booking not found");

    await expect(
      shareBookingPaymentInstructions({
        bookingId: booking.id,
        hostId: host.id,
        body: "IBAN: MK07250120000058984",
      })
    ).rejects.toThrow("accepted, confirmed");

    await db.booking.update({
      where: { id: booking.id },
      data: { status: "CONFIRMED", acceptedAt: new Date() },
    });
    const sensitiveBody =
      "IBAN: MK07250120000058984 | SWIFT: KOBSMK2X | https://pay.example.test/invoice/42";
    const paymentInput = {
      bookingId: booking.id,
      hostId: host.id,
      body: sensitiveBody,
      clientId: randomUUID(),
    };
    const message = await shareBookingPaymentInstructions(paymentInput);
    const retry = await shareBookingPaymentInstructions(paymentInput);

    expect(message.kind).toBe("PAYMENT_INSTRUCTIONS");
    expect(message.body).toBe(sensitiveBody);
    expect(retry.id).toBe(message.id);
    const [updatedConversation, notification] = await Promise.all([
      db.conversation.findUniqueOrThrow({ where: { id: conversation.id } }),
      db.notification.findFirstOrThrow({
        where: { messageId: message.id, userId: guest.id },
      }),
    ]);
    expect(updatedConversation.lastMessagePreview).toBe(
      PAYMENT_INSTRUCTIONS_PREVIEW
    );
    expect(notification.body).toBe(PAYMENT_INSTRUCTIONS_PREVIEW);
    expect(updatedConversation.lastMessagePreview).not.toContain(sensitiveBody);
    expect(notification.body).not.toContain(sensitiveBody);
    expect(
      (await getConversationMessages(conversation.id, guest.id)).messages.at(-1)
        ?.kind
    ).toBe("PAYMENT_INSTRUCTIONS");
  });

  it("rejects card and account-recovery credentials in payment instructions", async () => {
    const { host, guest, booking } = await setup();
    await ensureBookingConversation(booking.id, guest.id);
    await db.booking.update({
      where: { id: booking.id },
      data: { status: "CONFIRMED", acceptedAt: new Date() },
    });

    await expect(
      shareBookingPaymentInstructions({
        bookingId: booking.id,
        hostId: host.id,
        body: "Card number 4242 4242 4242 4242",
      })
    ).rejects.toThrow("card or account-security credentials");
    await expect(
      shareBookingPaymentInstructions({
        bookingId: booking.id,
        hostId: host.id,
        body: "My recovery code is 123456",
      })
    ).rejects.toThrow("card or account-security credentials");
  });

  it("keeps bank and payment coordinates out of ordinary chat previews", async () => {
    const { host, guest, booking } = await setup();
    const conversation = await ensureBookingConversation(booking.id, guest.id);

    await expect(
      sendConversationMessage({
        conversationId: conversation.id,
        senderId: host.id,
        body: "Please transfer to IBAN MK07250120000058984",
      }),
    ).rejects.toThrow("after the booking is accepted");

    await db.booking.update({
      where: { id: booking.id },
      data: { status: "CONFIRMED", acceptedAt: new Date() },
    });
    await expect(
      sendConversationMessage({
        conversationId: conversation.id,
        senderId: host.id,
        body: "Pay here: https://paypal.me/example-host",
      }),
    ).rejects.toThrow("private payment-instructions form");
    expect(await db.message.count({ where: { conversationId: conversation.id } })).toBe(0);
  });

  it("returns the newest messages and paginates older history", async () => {
    const { guest, booking } = await setup();
    const conversation = await ensureBookingConversation(booking.id, guest.id);
    const startedAt = new Date("2030-01-01T00:00:00.000Z");
    await db.message.createMany({
      data: Array.from({ length: 55 }, (_, index) => ({
        conversationId: conversation.id,
        senderId: guest.id,
        body: `Message ${index + 1}`,
        createdAt: new Date(startedAt.getTime() + index * 1000),
      })),
    });

    const latest = await getConversationMessages(conversation.id, guest.id);
    expect(latest.messages).toHaveLength(50);
    expect(latest.messages[0].body).toBe("Message 6");
    expect(latest.messages.at(-1)?.body).toBe("Message 55");
    expect(latest.nextCursor).toBeTruthy();

    const older = await getConversationMessages(conversation.id, guest.id, {
      cursor: latest.nextCursor!,
    });
    expect(older.messages.map((message) => message.body)).toEqual([
      "Message 1",
      "Message 2",
      "Message 3",
      "Message 4",
      "Message 5",
    ]);
    expect(older.nextCursor).toBeNull();
  });

  it("shows damage reports in host attention and the booking timeline", async () => {
    const { host, guest, booking } = await setup();
    const conversation = await ensureBookingConversation(booking.id, guest.id);
    await createConversationDamageReport({
      conversationId: conversation.id,
      reporterId: guest.id,
      description: "A deep scratch is visible beside the bedroom window.",
      evidence: [
        {
          url: "/uploads/test-damage.webp",
          fileName: "damage.webp",
          mimeType: "image/webp",
          sizeBytes: 1200,
        },
      ],
    });

    const [attention, thread] = await Promise.all([
      getHostAttentionSummary(host.id),
      getConversationMessages(conversation.id, host.id),
    ]);
    expect(attention.damageReports).toBe(1);
    expect(thread.damageReports).toHaveLength(1);
    expect(thread.damageReports[0].description).toMatch(/deep scratch/i);

    await updateConversationDamageReport({
      conversationId: conversation.id,
      damageReportId: thread.damageReports[0].id,
      userId: host.id,
      action: "ACKNOWLEDGE",
    });
    expect((await getHostAttentionSummary(host.id)).damageReports).toBe(0);
  });
});
