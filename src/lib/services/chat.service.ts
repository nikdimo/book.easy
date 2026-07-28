import "server-only";

import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { createUserNotification } from "@/lib/services/notification.service";

const MESSAGE_MAX_LENGTH = 2000;
const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const URL_PATTERN = /\b(?:https?:\/\/|www\.|wa\.me\/|t\.me\/)\S+/i;
const PHONE_PATTERN = /(?:\+?\d[\s().-]*){7,}/;

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

  let conversation = await db.conversation.findUnique({ where: { bookingId } });
  if (!conversation) {
    const inquiry = await db.conversation.findUnique({
      where: {
        listingId_inquiryGuestId: {
          listingId: booking.listingId,
          inquiryGuestId: booking.guestId,
        },
      },
    });
    conversation = inquiry
      ? await db.conversation.update({
          where: { id: inquiry.id },
          data: { bookingId, kind: "BOOKING", status: "OPEN" },
        })
      : await db.conversation.create({
          data: {
            bookingId,
            listingId: booking.listingId,
            kind: "BOOKING",
            startedById: booking.guestId,
          },
        });
  }

  await db.conversationParticipant.createMany({
    data: [
      { conversationId: conversation.id, userId: booking.guestId },
      { conversationId: conversation.id, userId: booking.listing.hostId },
    ],
    skipDuplicates: true,
  });

  return conversation;
}

export async function ensureInquiryConversation(listingId: string, guestId: string) {
  const listing = await db.listing.findFirst({
    where: {
      id: listingId,
      status: "APPROVED",
      hostId: { not: guestId },
    },
    select: { id: true, hostId: true },
  });
  if (!listing) throw new Error("Listing not found");

  const conversation = await db.conversation.upsert({
    where: {
      listingId_inquiryGuestId: {
        listingId,
        inquiryGuestId: guestId,
      },
    },
    create: {
      listingId,
      inquiryGuestId: guestId,
      startedById: guestId,
      kind: "INQUIRY",
    },
    update: {},
  });

  await db.conversationParticipant.createMany({
    data: [
      { conversationId: conversation.id, userId: guestId },
      { conversationId: conversation.id, userId: listing.hostId },
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
    const other = row.participants.find(
      (participant) =>
        participant.userId !== userId && participant.role !== "SUPPORT"
    );
    return {
      id: row.id,
      kind: row.kind,
      status: row.status,
      hasSupport: row.participants.some((participant) => participant.role === "SUPPORT"),
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
      type: { in: ["CHAT_MESSAGE", "SUPPORT_MESSAGE"] },
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
      senderRole:
        conversation.participants.find(
          (participant) => participant.userId === message.senderId
        )?.role ?? "MEMBER",
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
      conversation: {
        select: {
          kind: true,
          status: true,
          listing: { select: { title: true } },
        },
      },
    },
  });
  if (!membership) throw new Error("Conversation not found");
  if (
    membership.conversation.status !== "OPEN" &&
    membership.role !== "SUPPORT"
  ) {
    throw new Error("This conversation is not accepting new messages");
  }
  if (
    membership.conversation.kind === "INQUIRY" &&
    membership.role !== "SUPPORT" &&
    (EMAIL_PATTERN.test(body) || URL_PATTERN.test(body) || PHONE_PATTERN.test(body))
  ) {
    throw new Error(
      "Keep contact details and external links inside Linger Homes until a booking is confirmed"
    );
  }

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
      select: { userId: true, role: true },
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
    recipients.map(({ userId, role }) =>
      createUserNotification({
        userId,
        type: membership.role === "SUPPORT" ? "SUPPORT_MESSAGE" : "CHAT_MESSAGE",
        title:
          membership.role === "SUPPORT"
            ? "Linger Homes Support"
            : membership.user.name,
        body: `${membership.conversation.listing.title}: ${body.slice(0, 140)}`,
        route: `/messages/${input.conversationId}`,
        data: { ...notificationData, recipientRole: role },
      })
    )
  );

  void import("@/lib/email")
    .then(({ notifyConversationMessage }) =>
      notifyConversationMessage({
        conversationId: input.conversationId,
        senderId: input.senderId,
        recipientIds: recipients.map(({ userId }) => userId),
        preview: body.slice(0, 180),
        supportSender: membership.role === "SUPPORT",
      })
    )
    .catch(() => {
      // The message and durable notifications are authoritative. Email is best-effort.
    });

  return message;
}

export async function listAdminConversations() {
  return db.conversation.findMany({
    include: {
      booking: {
        select: { id: true, status: true, checkIn: true, checkOut: true },
      },
      listing: { select: { id: true, title: true } },
      participants: {
        include: {
          user: { select: { id: true, name: true, email: true, role: true } },
        },
      },
      _count: { select: { messages: true, safetyCases: true } },
    },
    orderBy: [{ lastMessageAt: "desc" }, { createdAt: "desc" }],
  });
}

export async function joinConversationAsSupport(
  conversationId: string,
  adminId: string
) {
  const admin = await db.user.findFirst({
    where: { id: adminId, role: "ADMIN", isActive: true },
    select: { id: true },
  });
  if (!admin) throw new Error("Admin access required");

  const conversation = await db.conversation.findUnique({
    where: { id: conversationId },
    select: { id: true },
  });
  if (!conversation) throw new Error("Conversation not found");

  await db.$transaction([
    db.conversationParticipant.upsert({
      where: {
        conversationId_userId: { conversationId, userId: adminId },
      },
      create: { conversationId, userId: adminId, role: "SUPPORT" },
      update: { role: "SUPPORT" },
    }),
    db.conversation.update({
      where: { id: conversationId },
      data: { supportJoinedAt: new Date() },
    }),
  ]);
}

export async function getConversationForAdmin(conversationId: string) {
  const conversation = await db.conversation.findUnique({
    where: { id: conversationId },
    include: {
      booking: true,
      listing: { select: { id: true, title: true } },
      participants: {
        include: {
          user: { select: { id: true, name: true, email: true, role: true } },
        },
      },
      messages: {
        orderBy: { createdAt: "asc" },
        include: {
          sender: { select: { id: true, name: true, email: true, role: true } },
        },
      },
      safetyCases: { select: { id: true, reference: true, status: true } },
    },
  });
  if (!conversation) throw new Error("Conversation not found");
  return conversation;
}
