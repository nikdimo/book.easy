import "server-only";

import type { MarketingAudience, NotificationType, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import {
  recordBookingTimelineEvent,
  type BookingNotificationEvent,
} from "@/lib/services/booking-timeline.service";

const EXPO_PUSH_ENDPOINT = "https://exp.host/--/api/v2/push/send";
const EXPO_TOKEN_PATTERN = /^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$/;

interface CreateNotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  route?: string;
  data?: Prisma.InputJsonValue;
}

interface ExpoPushTicket {
  status?: "ok" | "error";
  details?: { error?: string };
}

interface PushNotificationInput {
  userId: string;
  title: string;
  body: string;
  route?: string | null;
  data?: Prisma.JsonValue | Prisma.InputJsonValue;
}

export async function getUnreadNotificationCount(userId: string): Promise<number> {
  return db.notification.count({ where: { userId, readAt: null } });
}

export async function listUserNotifications(userId: string, limit = 50) {
  return db.notification.findMany({
    where: { userId },
    select: {
      id: true,
      type: true,
      title: true,
      body: true,
      route: true,
      data: true,
      readAt: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
    take: Math.min(100, Math.max(1, limit)),
  });
}

export async function markUserNotificationRead(userId: string, notificationId: string) {
  const updated = await db.notification.updateMany({
    where: { id: notificationId, userId, readAt: null },
    data: { readAt: new Date() },
  });
  return updated.count > 0;
}

export async function markAllUserNotificationsRead(userId: string) {
  return db.notification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: new Date() },
  });
}

export async function createUserNotification(input: CreateNotificationInput) {
  const notification = await db.notification.create({ data: input });
  void dispatchNotificationPushes([notification.id]);
  return notification;
}

export async function dispatchNotificationPushes(notificationIds: string[]) {
  await Promise.allSettled(
    notificationIds.map(async (notificationId) => {
      const now = new Date();
      const staleBefore = new Date(now.getTime() - 15 * 60_000);
      const claimed = await db.notification.updateMany({
        where: {
          id: notificationId,
          pushSentAt: null,
          pushAvailableAt: { lte: now },
          pushAttempts: { lt: 8 },
          OR: [
            { pushLockedAt: null },
            { pushLockedAt: { lt: staleBefore } },
          ],
        },
        data: {
          pushLockedAt: now,
          pushAttempts: { increment: 1 },
          pushLastError: null,
        },
      });
      if (claimed.count === 0) return;
      const notification = await db.notification.findUnique({
        where: { id: notificationId },
        select: {
          id: true,
          userId: true,
          type: true,
          title: true,
          body: true,
          route: true,
          data: true,
          pushAttempts: true,
          pushSentAt: true,
        },
      });
      if (!notification || notification.pushSentAt) return;
      try {
        await sendPushNotification(notification);
        await db.notification.update({
          where: { id: notification.id },
          data: {
            pushSentAt: new Date(),
            pushLockedAt: null,
            pushLastError: null,
          },
        });
      } catch (error) {
        const attempts = notification.pushAttempts;
        await db.notification.update({
          where: { id: notification.id },
          data: {
            pushLockedAt: null,
            pushLastError:
              error instanceof Error ? error.message.slice(0, 500) : "Push delivery failed",
            pushAvailableAt: new Date(
              Date.now() + Math.min(60, 2 ** attempts) * 60_000
            ),
          },
        });
      }
    })
  );
}

export async function processPendingNotificationPushes(limit = 100) {
  const pending = await db.notification.findMany({
    where: {
      pushSentAt: null,
      pushAvailableAt: { lte: new Date() },
      pushAttempts: { lt: 8 },
    },
    select: { id: true },
    orderBy: { pushAvailableAt: "asc" },
    take: limit,
  });
  await dispatchNotificationPushes(pending.map(({ id }) => id));
  return pending.length;
}

/** The only supported entry point for promotional in-app/push notifications. */
export async function createMarketingNotification(
  input: CreateNotificationInput & { audience: MarketingAudience }
) {
  const user = await db.user.findUnique({
    where: { id: input.userId },
    select: { email: true, isActive: true },
  });
  if (!user?.isActive) return null;
  const { canSendMarketing } = await import(
    "@/lib/services/marketing-consent.service"
  );
  const eligibility = await canSendMarketing({
    email: user.email,
    channel: "PUSH",
    audience: input.audience,
  });
  if (!eligibility.allowed) return null;
  const notificationInput: CreateNotificationInput = {
    userId: input.userId,
    type: input.type,
    title: input.title,
    body: input.body,
    route: input.route,
    data: input.data,
  };
  return createUserNotification(notificationInput);
}

export async function registerPushToken(input: {
  userId: string;
  token: string;
  platform: string;
  deviceName?: string;
}) {
  if (!EXPO_TOKEN_PATTERN.test(input.token)) {
    throw new Error("Invalid Expo push token");
  }

  return db.pushToken.upsert({
    where: { token: input.token },
    create: input,
    update: {
      userId: input.userId,
      platform: input.platform,
      deviceName: input.deviceName,
    },
  });
}

export async function unregisterPushToken(userId: string, token: string) {
  return db.pushToken.deleteMany({ where: { userId, token } });
}

async function sendPushNotification(input: PushNotificationInput): Promise<void> {
  const [tokens, preference] = await Promise.all([
    db.pushToken.findMany({
      where: { userId: input.userId },
      select: { token: true },
    }),
    db.communicationPreference.findUnique({
      where: { userId: input.userId },
      select: { operationalPush: true },
    }),
  ]);
  if (preference?.operationalPush === false) return;
  if (tokens.length === 0) return;

  const badge = await getUnreadNotificationCount(input.userId);
  const messages = tokens.map(({ token }) => ({
    to: token,
    sound: "default",
    title: input.title,
    body: input.body,
    badge,
    channelId: "booking-and-chat",
    data: {
      route: input.route,
      ...(input.data && typeof input.data === "object" && !Array.isArray(input.data)
        ? input.data
        : {}),
    },
  }));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const headers: Record<string, string> = {
      Accept: "application/json",
      "Content-Type": "application/json",
    };
    if (process.env.EXPO_ACCESS_TOKEN) {
      headers.Authorization = `Bearer ${process.env.EXPO_ACCESS_TOKEN}`;
    }

    const response = await fetch(EXPO_PUSH_ENDPOINT, {
      method: "POST",
      headers,
      body: JSON.stringify(messages),
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Expo push request failed (${response.status})`);
    }

    const result = (await response.json()) as {
      data?: ExpoPushTicket | ExpoPushTicket[];
    };
    const tickets = Array.isArray(result.data) ? result.data : result.data ? [result.data] : [];
    const invalidTokens = tickets.flatMap((ticket, index) =>
      ticket.status === "error" && ticket.details?.error === "DeviceNotRegistered"
        ? [tokens[index]?.token]
        : []
    ).filter((token): token is string => Boolean(token));

    if (invalidTokens.length > 0) {
      await db.pushToken.deleteMany({ where: { token: { in: invalidTokens } } });
    }
  } finally {
    clearTimeout(timeout);
  }
}

export async function notifyBookingEvent(
  bookingId: string,
  event: BookingNotificationEvent
) {
  await recordBookingTimelineEvent({ bookingId, event });
  const booking = await db.booking.findUnique({
    where: { id: bookingId },
    select: {
      id: true,
      guestId: true,
      guest: { select: { name: true } },
      listing: {
        select: {
          id: true,
          title: true,
          hostId: true,
        },
      },
    },
  });
  if (!booking) return;

  const commonData = {
    bookingId: booking.id,
    listingId: booking.listing.id,
  } satisfies Prisma.InputJsonObject;

  if (event === "request") {
    await createUserNotification({
      userId: booking.listing.hostId,
      type: "BOOKING_REQUEST",
      title: "New booking request",
      body: `${booking.guest.name} requested ${booking.listing.title}.`,
      route: `/host/reservations/${booking.id}`,
      data: commonData,
    });
    return;
  }

  if (event === "cancelled-by-guest") {
    await createUserNotification({
      userId: booking.listing.hostId,
      type: "BOOKING_CANCELLED",
      title: "Booking cancelled",
      body: `${booking.guest.name} cancelled ${booking.listing.title}.`,
      route: `/host/reservations/${booking.id}`,
      data: commonData,
    });
    return;
  }

  const copy = {
    confirmed: {
      type: "BOOKING_CONFIRMED" as const,
      title: "Booking confirmed",
      // The host accepting is also the moment payment becomes theirs to arrange, so
      // the notification that announces the one says where to expect the other.
      body: `Your booking at ${booking.listing.title} has been accepted. The host will share payment instructions with you.`,
    },
    rejected: {
      type: "BOOKING_REJECTED" as const,
      title: "Booking request declined",
      body: `Your request for ${booking.listing.title} was declined.`,
    },
    expired: {
      type: "BOOKING_REJECTED" as const,
      title: "Booking request expired",
      body: `The host did not respond in time to your request for ${booking.listing.title}.`,
    },
    "cancelled-by-host": {
      type: "BOOKING_CANCELLED" as const,
      title: "Booking cancelled",
      body: `Your booking for ${booking.listing.title} was cancelled.`,
    },
  }[event];

  await createUserNotification({
    userId: booking.guestId,
    ...copy,
    route: `/account/bookings/${booking.id}`,
    data: commonData,
  });
}
