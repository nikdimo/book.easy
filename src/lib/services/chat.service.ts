import "server-only";

import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { dispatchNotificationPushes } from "@/lib/services/notification.service";
import { COMMUNICATION_BRAND } from "@/lib/communication-brand";
import { kickMessageEmailDelivery } from "@/lib/services/message-email-outbox.service";
import { publishConversationChanged } from "@/lib/services/communication-realtime.service";
import { normalizeLocaleCode } from "@/lib/i18n/locale-preference";
import {
  assertSafePaymentInstructions,
  containsPaymentCoordinates,
  containsUnsafePaymentCredentials,
  PAYMENT_INSTRUCTIONS_PREVIEW,
} from "@/lib/services/payment-instructions";

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
    try {
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
            data: {
              bookingId,
              inquiryGuestId: null,
              kind: "BOOKING",
              status: "OPEN",
            },
          })
        : await db.conversation.create({
            data: {
              bookingId,
              listingId: booking.listingId,
              kind: "BOOKING",
              startedById: booking.guestId,
            },
          });
    } catch (error) {
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        error.code !== "P2002"
      ) {
        throw error;
      }
      conversation = await db.conversation.findUnique({ where: { bookingId } });
      if (!conversation) throw error;
    }
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

export async function ensureMissingBookingConversations(limit = 100) {
  const missing = await db.booking.findMany({
    where: { conversation: null },
    select: { id: true },
    orderBy: { createdAt: "asc" },
    take: limit,
  });
  const results = await Promise.allSettled(
    missing.map(({ id }) => ensureBookingConversation(id))
  );
  return {
    processed: results.filter((result) => result.status === "fulfilled").length,
    failed: results.filter((result) => result.status === "rejected").length,
  };
}

export async function listUserConversations(userId: string) {
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
        select: { body: true, kind: true, createdAt: true, senderId: true },
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

export async function assertConversationMembership(
  conversationId: string,
  userId: string
) {
  const membership = await db.conversationParticipant.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
    select: { userId: true },
  });
  if (!membership) throw new Error("Conversation not found");
}

export async function getConversationMessages(
  conversationId: string,
  userId: string,
  options: { cursor?: string; limit?: number } = {}
) {
  const membership = await db.conversationParticipant.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
  });
  if (!membership) throw new Error("Conversation not found");

  const limit = Math.min(100, Math.max(1, options.limit ?? 50));
  const [conversation, messageRows] = await db.$transaction([
    db.conversation.findUniqueOrThrow({
      where: { id: conversationId },
      select: {
        id: true,
        kind: true,
        status: true,
        booking: {
          select: {
            id: true,
            reference: true,
            status: true,
            checkIn: true,
            checkOut: true,
            numberOfNights: true,
            guestCount: true,
            currency: true,
            totalPrice: true,
            guestId: true,
            listing: { select: { hostId: true } },
            timelineEvents: {
              select: {
                id: true,
                type: true,
                actorId: true,
                data: true,
                createdAt: true,
              },
              orderBy: { createdAt: "asc" },
            },
          },
        },
        listing: {
          select: {
            id: true,
            title: true,
            images: {
              where: { isPrimary: true },
              orderBy: { displayOrder: "asc" },
              take: 1,
              select: { url: true },
            },
          },
        },
        participants: {
          select: {
            userId: true,
            role: true,
            user: { select: { id: true, name: true, image: true } },
          },
        },
        damageReports: {
          select: {
            id: true,
            description: true,
            status: true,
            reporterId: true,
            createdAt: true,
            reporter: { select: { id: true, name: true, image: true } },
            evidence: {
              select: {
                id: true,
                url: true,
                fileName: true,
                mimeType: true,
                sizeBytes: true,
              },
            },
          },
          orderBy: { createdAt: "asc" },
        },
      },
    }),
    db.message.findMany({
      where: { conversationId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      ...(options.cursor
        ? { cursor: { id: options.cursor }, skip: 1 }
        : {}),
      include: {
        sender: { select: { id: true, name: true, image: true } },
      },
    }),
  ]);

  const hasMore = messageRows.length > limit;
  const page = hasMore ? messageRows.slice(0, limit) : messageRows;
  const messages = page.reverse();

  return {
    conversation: {
      id: conversation.id,
      kind: conversation.kind,
      status: conversation.status,
      listing: {
        id: conversation.listing.id,
        title: conversation.listing.title,
        imageUrl: conversation.listing.images[0]?.url ?? null,
      },
      booking: conversation.booking
        ? {
            id: conversation.booking.id,
            reference: conversation.booking.reference,
            status: conversation.booking.status,
            checkIn: conversation.booking.checkIn,
            checkOut: conversation.booking.checkOut,
            numberOfNights: conversation.booking.numberOfNights,
            guestCount: conversation.booking.guestCount,
            currency: conversation.booking.currency,
            totalPrice: Number(conversation.booking.totalPrice),
            detailsUrl:
              conversation.booking.listing.hostId === userId
                ? `/host/reservations/${conversation.booking.id}`
                : `/account/bookings/${conversation.booking.id}`,
          }
        : null,
      participants: conversation.participants,
    },
    nextCursor: hasMore ? messages[0]?.id ?? null : null,
    messages: messages.map((message) => ({
      id: message.id,
      clientId: message.clientId,
      kind: message.kind,
      body: message.deletedAt ? "Message removed" : message.body,
      sourceLocale: message.sourceLocale,
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
    bookingEvents:
      conversation.booking?.timelineEvents.map((event) => ({
        id: event.id,
        type: event.type,
        actorId: event.actorId,
        data: event.data,
        createdAt: event.createdAt,
      })) ?? [],
    damageReports: conversation.damageReports,
  };
}

export async function markConversationRead(input: {
  conversationId: string;
  userId: string;
  lastMessageId: string;
}) {
  const message = await db.message.findFirst({
    where: {
      id: input.lastMessageId,
      conversationId: input.conversationId,
    },
    select: { createdAt: true },
  });
  if (!message) throw new Error("Message not found");

  await db.$transaction(
    async (tx) => {
      const locked = await tx.$queryRaw<Array<{ userId: string }>>`
        SELECT "userId"
        FROM "ConversationParticipant"
        WHERE "conversationId" = ${input.conversationId}
          AND "userId" = ${input.userId}
        FOR UPDATE
      `;
      if (locked.length === 0) throw new Error("Conversation not found");

      const remainingUnread = await tx.message.count({
        where: {
          conversationId: input.conversationId,
          senderId: { not: input.userId },
          createdAt: { gt: message.createdAt },
        },
      });
      const readMessageIds = await tx.message.findMany({
        where: {
          conversationId: input.conversationId,
          senderId: { not: input.userId },
          createdAt: { lte: message.createdAt },
        },
        select: { id: true },
      });
      await tx.conversationParticipant.update({
        where: {
          conversationId_userId: {
            conversationId: input.conversationId,
            userId: input.userId,
          },
        },
        data: {
          unreadCount: remainingUnread,
          lastReadAt: message.createdAt,
        },
      });
      await tx.notification.updateMany({
        where: {
          userId: input.userId,
          type: { in: ["CHAT_MESSAGE", "SUPPORT_MESSAGE"] },
          readAt: null,
          OR: [
            { messageId: { in: readMessageIds.map(({ id }) => id) } },
            {
              messageId: null,
              data: { path: ["conversationId"], equals: input.conversationId },
            },
          ],
        },
        data: { readAt: new Date() },
      });
    },
    // The default interactive-transaction timeout is 5 seconds. Under concurrent test
    // or production load this four-query, row-locked operation occasionally finished a
    // few milliseconds beyond that boundary. Ten seconds preserves the lock/atomicity
    // while avoiding a false failure caused by ordinary short-lived database contention.
    { timeout: 10_000 },
  );
}

type ConversationMessageKind = "CHAT" | "PAYMENT_INSTRUCTIONS";

type CreateConversationMessageInput = {
  conversationId: string;
  senderId: string;
  body: string;
  clientId?: string;
  sourceLocale?: string | null;
  kind: ConversationMessageKind;
};

function normalizeMessageInput(input: CreateConversationMessageInput) {
  const body = input.body.trim();
  if (!body) throw new Error("Message cannot be empty");
  if (body.length > MESSAGE_MAX_LENGTH) {
    throw new Error(`Messages can be up to ${MESSAGE_MAX_LENGTH} characters`);
  }
  if (input.kind === "PAYMENT_INSTRUCTIONS") {
    assertSafePaymentInstructions(body);
  }
  return { body, clientId: input.clientId ?? randomUUID() };
}

async function createConversationMessageInTransaction(
  tx: Prisma.TransactionClient,
  input: CreateConversationMessageInput & { body: string; clientId: string }
) {
  const membership = await tx.conversationParticipant.findUnique({
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
          booking: { select: { status: true } },
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
    input.kind === "CHAT" &&
    membership.role !== "SUPPORT" &&
    (containsUnsafePaymentCredentials(input.body) ||
      containsPaymentCoordinates(input.body))
  ) {
    throw new Error(
      membership.conversation.booking?.status === "CONFIRMED"
        ? "Use the private payment-instructions form for bank or payment details"
        : "Payment details can only be shared privately after the booking is accepted",
    );
  }
  if (
    input.kind === "CHAT" &&
    membership.conversation.kind === "INQUIRY" &&
    membership.role !== "SUPPORT" &&
    (EMAIL_PATTERN.test(input.body) ||
      URL_PATTERN.test(input.body) ||
      PHONE_PATTERN.test(input.body))
  ) {
    throw new Error(
      `Keep contact details and external links inside ${COMMUNICATION_BRAND.name} until a booking is confirmed`
    );
  }

  const message = await tx.message.create({
    data: {
      clientId: input.clientId,
      conversationId: input.conversationId,
      senderId: input.senderId,
      body: input.body,
      kind: input.kind,
      sourceLocale: normalizeLocaleCode(input.sourceLocale) ?? "en",
    },
    include: {
      sender: { select: { id: true, name: true, image: true } },
    },
  });
  const sensitive = input.kind === "PAYMENT_INSTRUCTIONS";
  const preview = sensitive
    ? PAYMENT_INSTRUCTIONS_PREVIEW
    : input.body.slice(0, 180);

  await tx.conversation.update({
    where: { id: input.conversationId },
    data: {
      lastMessageAt: message.createdAt,
      lastMessagePreview: preview,
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

  const notifications = await Promise.all(
    recipients.map(({ userId, role }) =>
      tx.notification.create({
        data: {
          userId,
          type:
            membership.role === "SUPPORT"
              ? "SUPPORT_MESSAGE"
              : "CHAT_MESSAGE",
          title:
            membership.role === "SUPPORT"
              ? COMMUNICATION_BRAND.supportName
              : membership.user.name,
          body: sensitive
            ? PAYMENT_INSTRUCTIONS_PREVIEW
            : `${membership.conversation.listing.title}: ${input.body.slice(0, 140)}`,
          route: `/messages/${input.conversationId}`,
          messageId: message.id,
          data: {
            conversationId: input.conversationId,
            recipientRole: role,
          } satisfies Prisma.InputJsonObject,
        },
        select: { id: true },
      })
    )
  );
  await tx.messageEmailDelivery.createMany({
    data: recipients.map(({ userId }) => ({
      messageId: message.id,
      recipientId: userId,
    })),
    skipDuplicates: true,
  });
  return {
    message,
    notificationIds: notifications.map(({ id }) => id),
  };
}

async function findIdempotentMessage(input: {
  clientId?: string;
  conversationId: string;
  senderId: string;
  kind: ConversationMessageKind;
}) {
  if (input.clientId) {
    const existing = await db.message.findUnique({
      where: { clientId: input.clientId },
      include: {
        sender: { select: { id: true, name: true, image: true } },
      },
    });
    if (
      existing?.conversationId === input.conversationId &&
      existing.senderId === input.senderId &&
      existing.kind === input.kind
    ) {
      return existing;
    }
    if (existing) throw new Error("Invalid message ID");
  }
  return null;
}

async function createConversationMessage(input: CreateConversationMessageInput) {
  const { body, clientId } = normalizeMessageInput(input);
  const existing = await findIdempotentMessage(input);
  if (existing) return existing;

  let result;
  try {
    result = await db.$transaction((tx) =>
      createConversationMessageInTransaction(tx, {
        ...input,
        body,
        clientId,
      })
    );
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const existing = await db.message.findUnique({
        where: { clientId },
        include: {
          sender: { select: { id: true, name: true, image: true } },
        },
      });
      if (
        existing?.conversationId === input.conversationId &&
        existing.senderId === input.senderId &&
        existing.kind === input.kind
      ) {
        return existing;
      }
    }
    throw error;
  }

  void dispatchNotificationPushes(result.notificationIds);
  kickMessageEmailDelivery(result.message.id);
  publishConversationChanged(input.conversationId);

  return result.message;
}

export async function sendConversationMessage(input: {
  conversationId: string;
  senderId: string;
  body: string;
  clientId?: string;
  sourceLocale?: string | null;
}) {
  return createConversationMessage({ ...input, kind: "CHAT" });
}

export async function shareBookingPaymentInstructions(input: {
  bookingId: string;
  hostId: string;
  body: string;
  sourceLocale?: string | null;
  clientId?: string;
}) {
  const body = input.body.trim();
  if (!body) throw new Error("Payment instructions cannot be empty");
  if (body.length > MESSAGE_MAX_LENGTH) {
    throw new Error(
      `Payment instructions can be up to ${MESSAGE_MAX_LENGTH} characters`
    );
  }
  assertSafePaymentInstructions(body);
  const clientId = input.clientId ?? randomUUID();

  if (input.clientId) {
    const existing = await db.message.findUnique({
      where: { clientId },
      include: {
        sender: { select: { id: true, name: true, image: true } },
        conversation: { select: { bookingId: true } },
      },
    });
    if (
      existing?.senderId === input.hostId &&
      existing.conversation.bookingId === input.bookingId &&
      existing.kind === "PAYMENT_INSTRUCTIONS"
    ) {
      return existing;
    }
    if (existing) throw new Error("Invalid message ID");
  }

  let result;
  try {
    result = await db.$transaction(async (tx) => {
      // The action only supplies IDs and text. Re-read every authorization fact in
      // this transaction so a stale host UI cannot send after confirmation changes.
      await tx.$queryRaw`SELECT "id" FROM "Booking" WHERE "id" = ${input.bookingId} FOR UPDATE`;
      const booking = await tx.booking.findUnique({
        where: { id: input.bookingId },
        select: {
          id: true,
          status: true,
          acceptedAt: true,
          listing: { select: { hostId: true } },
          conversation: { select: { id: true } },
        },
      });
      if (!booking || booking.listing.hostId !== input.hostId) {
        throw new Error("Booking not found");
      }
      if (!booking.acceptedAt || booking.status !== "CONFIRMED") {
        throw new Error(
          "Payment instructions can only be shared for accepted, confirmed bookings"
        );
      }
      if (!booking.conversation) throw new Error("Booking conversation not found");

      return createConversationMessageInTransaction(tx, {
        conversationId: booking.conversation.id,
        senderId: input.hostId,
        body,
        clientId,
        sourceLocale: input.sourceLocale,
        kind: "PAYMENT_INSTRUCTIONS",
      });
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const existing = await db.message.findUnique({
        where: { clientId },
        include: {
          sender: { select: { id: true, name: true, image: true } },
          conversation: { select: { bookingId: true } },
        },
      });
      if (
        existing?.senderId === input.hostId &&
        existing.conversation.bookingId === input.bookingId &&
        existing.kind === "PAYMENT_INSTRUCTIONS"
      ) {
        return existing;
      }
    }
    throw error;
  }

  void dispatchNotificationPushes(result.notificationIds);
  kickMessageEmailDelivery(result.message.id);
  publishConversationChanged(result.message.conversationId);
  return result.message;
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
