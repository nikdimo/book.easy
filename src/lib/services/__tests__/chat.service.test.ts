import { afterEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
  ensureBookingConversation,
  getConversationMessages,
  sendConversationMessage,
} from "@/lib/services/chat.service";
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
});
