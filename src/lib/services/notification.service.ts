import "server-only";

import type { NotificationType, Prisma } from "@prisma/client";
import { db } from "@/lib/db";

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

export async function getUnreadNotificationCount(userId: string): Promise<number> {
  return db.notification.count({ where: { userId, readAt: null } });
}

export async function createUserNotification(input: CreateNotificationInput) {
  const notification = await db.notification.create({ data: input });
  void sendPushNotification(input).catch(() => {
    // The durable in-app notification already exists. Push is best-effort and must not
    // make the booking or chat mutation appear to fail.
  });
  return notification;
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

async function sendPushNotification(input: CreateNotificationInput): Promise<void> {
  const tokens = await db.pushToken.findMany({
    where: { userId: input.userId },
    select: { token: true },
  });
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
    if (!response.ok) return;

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
  event: "request" | "confirmed" | "rejected" | "cancelled-by-guest" | "cancelled-by-host"
) {
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
      route: "/(tabs)/bookings",
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
      route: "/(tabs)/bookings",
      data: commonData,
    });
    return;
  }

  const copy = {
    confirmed: {
      type: "BOOKING_CONFIRMED" as const,
      title: "Booking confirmed",
      body: `Your stay at ${booking.listing.title} is confirmed.`,
    },
    rejected: {
      type: "BOOKING_REJECTED" as const,
      title: "Booking request declined",
      body: `Your request for ${booking.listing.title} was declined.`,
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
    route: "/account/bookings",
    data: commonData,
  });
}
