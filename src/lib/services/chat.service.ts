import "server-only";

import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { createUserNotification } from "@/lib/services/notification.service";

const MESSAGE_MAX_LENGTH = 2000;

export async function ensureBookingConversation(bookingId: string, requiredUserId?: string) {
  const booking = await db.booking.findUnique({
    where: { id: bookingId },
    select: {
      id: true,
      listingId: true,
      guestId: true,
      listing: { select: { hostId: true } },
    },
  });
  if (!booking) throw new Error("Booking not found");
  if (
    requiredUserId &&
    requiredUserId !== booking.guestId &&
    requiredUserId !== booking.listing.hostId
  ) {
    throw new Error("Booking not found");
  }

  const conversation = await db.conversation.upsert({
    where: { bookingId },
    create: {
      bookingId,
      listingId: booking.listingId,
    },
    update: {},
  });

  await db.conversationParticipant.createMany({
    data: [
      { conversationId: conversation.id, userId: booking.guestId },
      { conversationId: conversation.id, userId: booking.listing.hostId },
    ],
    skipDuplicates: true,
  });

  return conversation;
}

async function ensureUserBookingConversations(userId: string) {
  const bookings = await db.booking.findMany({
    where: {
      OR: [{ guestId: userId }, { listing: { hostId: userId } }],
    },
    select: { id: true },
  });
  await Promise.all(bookings.map(({ id }) => ensureBookingConversation(id)));
}

export async function listUserConversations(userId: string) {
  await ensureUserBookingConversations(userId);

  const rows = await db.conversation.findMany({
    where: { participants: { some: { userId } } },
    include: {
      booking: {
        select: {
          id: true,
          status: true,
          checkIn: true,
          checkOut: true,
        },
      },
      listing: {
        select: {
          id: true,
          title: true,
          images: {
            where: { isPrimary: true },
            take: 1,
            select: { url: true },
          },
        },
      },
      participants: {
        include: {
          user: { select: { id: true, name: true, image: true } },
        },
      },
      messages: {
        where: { deletedAt: null },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { body: true, createdAt: true, senderId: true },
      },
    },
    orderBy: [{ lastMessageAt: "desc" }, { createdAt: "desc" }],
  });

  return rows.map((row) => {
    const membership = row.participants.find((participant) => participant.userId === userId);
    const other = row.participants.find((participant) => participant.userId !== userId);
    return {
      id: row.id,
      booking: row.booking,
      listing: {
        id: row.listing.id,
        title: row.listing.title,
        imageUrl: row.listing.images[0]?.url ?? null,
      },
      otherUser: other?.user ?? { id: "", name: "Deleted user", image: null },
      unreadCount: membership?.unreadCount ?? 0,
      lastMessage: row.messages[0] ?? null,
      lastMessageAt: row.lastMessageAt,
      lastMessagePreview: row.lastMessagePreview,
    };
  });
}

export async function getConversationMessages(conversationId: string, userId: string) {
  const membership = await db.conversationParticipant.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
  });
  if (!membership) throw new Error("Conversation not found");

  const [conversation, messages] = await db.$transaction([
    db.conversation.findUniqueOrThrow({
      where: { id: conversationId },
      include: {
        booking: {
          select: { id: true, status: true, checkIn: true, checkOut: true },
        },
        listing: { select: { id: true, title: true } },
        participants: {
          include: { user: { select: { id: true, name: true, image: true } } },
        },
      },
    }),
    db.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: "asc" },
      take: 150,
      include: {
        sender: { select: { id: true, name: true, image: true } },
      },
    }),
    db.conversationParticipant.update({
      where: { conversationId_userId: { conversationId, userId } },
      data: { unreadCount: 0, lastReadAt: new Date() },
    }),
  ]);

  await db.notification.updateMany({
    where: {
      userId,
      type: "CHAT_MESSAGE",
      readAt: null,
      data: { path: ["conversationId"], equals: conversationId },
    },
    data: { readAt: new Date() },
  });

  return {
    conversation,
    messages: messages.map((message) => ({
      id: message.id,
      body: message.deletedAt ? "Message removed" : message.body,
      sender: message.sender ?? { id: "", name: "Deleted user", image: null },
      senderId: message.senderId,
      createdAt: message.createdAt,
      editedAt: message.editedAt,
      deletedAt: message.deletedAt,
    })),
  };
}

export async function sendConversationMessage(input: {
  conversationId: string;
  senderId: string;
  body: string;
}) {
  const body = input.body.trim();
  if (!body) throw new Error("Message cannot be empty");
  if (body.length > MESSAGE_MAX_LENGTH) {
    throw new Error(`Messages can be up to ${MESSAGE_MAX_LENGTH} characters`);
  }

  const membership = await db.conversationParticipant.findUnique({
    where: {
      conversationId_userId: {
        conversationId: input.conversationId,
        userId: input.senderId,
      },
    },
    include: {
      user: { select: { name: true } },
      conversation: { select: { listing: { select: { title: true } } } },
    },
  });
  if (!membership) throw new Error("Conversation not found");

  const { message, recipients } = await db.$transaction(async (tx) => {
    const message = await tx.message.create({
      data: {
        conversationId: input.conversationId,
        senderId: input.senderId,
        body,
      },
      include: {
        sender: { select: { id: true, name: true, image: true } },
      },
    });

    await tx.conversation.update({
      where: { id: input.conversationId },
      data: {
        lastMessageAt: message.createdAt,
        lastMessagePreview: body.slice(0, 180),
      },
    });

    const recipients = await tx.conversationParticipant.findMany({
      where: {
        conversationId: input.conversationId,
        userId: { not: input.senderId },
      },
      select: { userId: true },
    });

    await tx.conversationParticipant.updateMany({
      where: {
        conversationId: input.conversationId,
        userId: { not: input.senderId },
      },
      data: { unreadCount: { increment: 1 } },
    });

    return { message, recipients };
  });

  const notificationData = {
    conversationId: input.conversationId,
  } satisfies Prisma.InputJsonObject;
  await Promise.all(
    recipients.map(({ userId }) =>
      createUserNotification({
        userId,
        type: "CHAT_MESSAGE",
        title: membership.user.name,
        body: `${membership.conversation.listing.title}: ${body.slice(0, 140)}`,
        route: `/chat/${input.conversationId}`,
        data: notificationData,
      })
    )
  );

  return message;
}
