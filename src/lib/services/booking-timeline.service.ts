import "server-only";

import type { BookingTimelineEventType, Prisma } from "@prisma/client";
import { db } from "@/lib/db";

const eventTypeByNotificationEvent = {
  request: "REQUESTED",
  confirmed: "CONFIRMED",
  rejected: "REJECTED",
  expired: "EXPIRED",
  "cancelled-by-guest": "CANCELLED_BY_GUEST",
  "cancelled-by-host": "CANCELLED_BY_HOST",
} as const satisfies Record<string, BookingTimelineEventType>;

export type BookingNotificationEvent = keyof typeof eventTypeByNotificationEvent;

export async function recordBookingTimelineEvent(input: {
  bookingId: string;
  event: BookingNotificationEvent;
  actorId?: string;
  data?: Prisma.InputJsonValue;
}) {
  const type = eventTypeByNotificationEvent[input.event];
  const idempotencyKey = `booking:${input.bookingId}:${type.toLowerCase()}`;
  return db.bookingTimelineEvent.upsert({
    where: { idempotencyKey },
    create: {
      bookingId: input.bookingId,
      type,
      actorId: input.actorId,
      data: input.data,
      idempotencyKey,
    },
    update: {},
  });
}

export async function reconcileBookingTimelineEvents(limit = 200) {
  const bookings = await db.booking.findMany({
    select: {
      id: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      respondedAt: true,
    },
    orderBy: { updatedAt: "desc" },
    take: limit,
  });
  const statusType: Partial<Record<(typeof bookings)[number]["status"], BookingTimelineEventType>> = {
    CONFIRMED: "CONFIRMED",
    REJECTED: "REJECTED",
    EXPIRED: "EXPIRED",
    CANCELLED_BY_GUEST: "CANCELLED_BY_GUEST",
    CANCELLED_BY_HOST: "CANCELLED_BY_HOST",
    CANCELLED_BY_ADMIN: "CANCELLED_BY_ADMIN",
    COMPLETED: "COMPLETED",
  };
  const data = bookings.flatMap((booking) => {
    const currentType = statusType[booking.status];
    return [
      {
        bookingId: booking.id,
        type: "REQUESTED" as const,
        idempotencyKey: `booking:${booking.id}:requested`,
        createdAt: booking.createdAt,
      },
      ...(currentType
        ? [
            {
              bookingId: booking.id,
              type: currentType,
              idempotencyKey: `booking:${booking.id}:${booking.status.toLowerCase()}`,
              createdAt: booking.respondedAt ?? booking.updatedAt,
            },
          ]
        : []),
    ];
  });
  const result = await db.bookingTimelineEvent.createMany({
    data,
    skipDuplicates: true,
  });
  return result.count;
}
