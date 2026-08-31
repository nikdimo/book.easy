import "server-only";

import type { BookingTimelineEventType, Prisma } from "@prisma/client";
import { db } from "@/lib/db";

/** Who moved the booking. */
export type BookingTimelineActorRole = "GUEST" | "HOST" | "ADMIN" | "SYSTEM";

/**
 * The actor, recorded twice on purpose.
 *
 * `userId` is the pointer, and it is not durable: erasure nulls `actorId` on every
 * timeline row belonging to the erased account, and the account itself may be gone by
 * the time anyone reads the history. `role` is the fact — a cancellation the guest made
 * must still read as the guest's, not as an anonymous system sweep, years later.
 */
export interface BookingTimelineActor {
  role: BookingTimelineActorRole;
  /** Null for a system transition, and for an actor being erased in this same
   *  transaction (their id is on its way to null anyway). */
  userId?: string | null;
}

/**
 * Anything that can run the write: the transaction client handed out by
 * `db.$transaction`, or `db` itself. Typing the parameter rather than reaching for the
 * module-level client is the whole point — see below.
 */
export type BookingTimelineClient = Pick<Prisma.TransactionClient, "bookingTimelineEvent">;

export function bookingTimelineIdempotencyKey(
  bookingId: string,
  type: BookingTimelineEventType,
): string {
  return `booking:${bookingId}:${type.toLowerCase()}`;
}

/**
 * Writes one permanent history entry for a status transition, on the caller's own
 * transaction.
 *
 * This used to be reached from exactly one place — `notifyBookingEvent` — which is
 * always called through a fire-and-forget wrapper that swallows every error (M7). A
 * booking could therefore change state and lose its history entry with nothing
 * reporting it, and `reconcileBookingTimelineEvents` could only ever backfill the
 * *current* status: any intermediate state lost that way was gone permanently.
 *
 * So the client is a parameter and never `db`. Callers pass the same `tx` that writes
 * the status, the availability blocks and the email outbox rows, which makes the
 * history entry as durable as the transition itself: if this write fails the status
 * change rolls back with it, and there is no window in which one exists without the
 * other. Notification, push and email *delivery* stay best-effort after the commit —
 * they just no longer carry the record.
 *
 * `createMany`/`skipDuplicates` compiles to `INSERT ... ON CONFLICT DO NOTHING` against
 * the unique `idempotencyKey`, so a replayed or concurrent transition adds nothing and
 * raises nothing: one transition, one event. Returns whether this call is the one that
 * wrote the row.
 */
export async function recordBookingTimelineEvent(
  client: BookingTimelineClient,
  input: {
    bookingId: string;
    type: BookingTimelineEventType;
    actor: BookingTimelineActor;
    /** Only for a transition whose moment is not "now" — see `completePastBookings`. */
    createdAt?: Date;
    /** Extra context. Never payment coordinates or any other private detail. */
    data?: Prisma.InputJsonObject;
  },
): Promise<boolean> {
  const result = await client.bookingTimelineEvent.createMany({
    data: [
      {
        bookingId: input.bookingId,
        type: input.type,
        actorId: input.actor.userId ?? null,
        idempotencyKey: bookingTimelineIdempotencyKey(input.bookingId, input.type),
        // Context is deliberately spread first: callers may add facts such as an
        // account-deletion reason, but they cannot replace the schema version or the
        // authoritative actor attribution maintained by this service.
        data: { ...(input.data ?? {}), version: 1, actor: input.actor.role },
        ...(input.createdAt ? { createdAt: input.createdAt } : {}),
      },
    ],
    skipDuplicates: true,
  });
  return result.count > 0;
}

/**
 * Backfill for bookings whose history predates the transactional write above, and a
 * belt-and-braces sweep for anything the old fire-and-forget path dropped. It can only
 * ever reconstruct the *current* status, and only for the newest rows, which is exactly
 * why it is not the mechanism — every live transition now writes its own entry inside
 * the transaction that makes it.
 *
 * Rows it creates carry no `data`: the actor behind a historical transition is not
 * recoverable from the booking row, and inventing one would be worse than leaving the
 * gap legible.
 */
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
        idempotencyKey: bookingTimelineIdempotencyKey(booking.id, "REQUESTED"),
        createdAt: booking.createdAt,
      },
      ...(currentType
        ? [
            {
              bookingId: booking.id,
              type: currentType,
              idempotencyKey: bookingTimelineIdempotencyKey(booking.id, currentType),
              createdAt: booking.respondedAt ?? booking.updatedAt,
            },
          ]
        : []),
    ];
  });
  return createTimelineBackfillRows(data);
}

type TimelineBackfillRow = Prisma.BookingTimelineEventCreateManyInput;

function isForeignKeyConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2003"
  );
}

/**
 * Usually this is one bulk insert. If a booking is erased between the reconciler's
 * read and write, Postgres rejects the whole statement because that one parent no
 * longer exists. Split only that failed batch until the vanished row is isolated, so
 * valid legacy rows are still repaired and genuine database errors still surface.
 */
async function createTimelineBackfillRows(
  data: TimelineBackfillRow[],
): Promise<number> {
  if (data.length === 0) return 0;
  try {
    const result = await db.bookingTimelineEvent.createMany({
      data,
      skipDuplicates: true,
    });
    return result.count;
  } catch (error) {
    if (!isForeignKeyConstraintError(error)) throw error;
    if (data.length === 1) return 0;

    const middle = Math.floor(data.length / 2);
    const left = await createTimelineBackfillRows(data.slice(0, middle));
    const right = await createTimelineBackfillRows(data.slice(middle));
    return left + right;
  }
}
