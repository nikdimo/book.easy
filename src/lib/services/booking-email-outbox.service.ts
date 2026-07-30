import "server-only";

import {
  BookingEmailDeliveryStatus,
  BookingEmailKind,
  type Prisma,
} from "@prisma/client";
import { db } from "@/lib/db";

const MAX_ATTEMPTS = 12;
const LOCK_TIMEOUT_MS = 15 * 60 * 1000;
const MAX_BATCH_SIZE = 50;

type TransactionClient = Prisma.TransactionClient;

export async function enqueueBookingEmails(
  tx: TransactionClient,
  bookingId: string,
  kinds: BookingEmailKind[]
): Promise<number> {
  if (kinds.length === 0) return 0;
  const result = await tx.bookingEmailDelivery.createMany({
    data: kinds.map((kind) => ({ bookingId, kind })),
    skipDuplicates: true,
  });
  return result.count;
}

async function dispatchBookingEmail(
  kind: BookingEmailKind,
  bookingId: string
): Promise<void> {
  const email = await import("@/lib/email");
  switch (kind) {
    case BookingEmailKind.GUEST_REQUEST_RECEIVED:
      return email.notifyGuestBookingRequestReceived(bookingId);
    case BookingEmailKind.HOST_NEW_REQUEST:
      return email.notifyHostNewBookingRequest(bookingId);
    case BookingEmailKind.HOST_REQUEST_REMINDER:
      return email.notifyHostBookingRequestReminder(bookingId);
    case BookingEmailKind.GUEST_CONFIRMED:
      return email.notifyGuestBookingConfirmed(bookingId);
    case BookingEmailKind.GUEST_REJECTED:
      return email.notifyGuestBookingRejected(bookingId);
    case BookingEmailKind.GUEST_EXPIRED:
      return email.notifyGuestBookingExpired(bookingId);
    case BookingEmailKind.GUEST_CANCELLED:
      return email.notifyGuestBookingCancelled(bookingId);
    case BookingEmailKind.HOST_CANCELLED_BY_GUEST:
      return email.notifyHostBookingCancelledByGuest(bookingId);
  }
}

function retryDelayMs(attempts: number): number {
  return Math.min(6 * 60 * 60 * 1000, 5 * 60 * 1000 * 2 ** Math.max(0, attempts - 1));
}

function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, 2000);
}

export interface BookingEmailProcessingResult {
  claimed: number;
  sent: number;
  failed: number;
  exhausted: number;
}

/**
 * Claims each delivery with an atomic compare-and-set before sending. Multiple app
 * instances or scheduler runs can safely execute this concurrently: only one worker
 * can own a row, while stale locks are recovered after 15 minutes.
 */
export async function processBookingEmailOutbox(options?: {
  bookingId?: string;
  limit?: number;
  now?: Date;
}): Promise<BookingEmailProcessingResult> {
  const now = options?.now ?? new Date();
  const staleBefore = new Date(now.getTime() - LOCK_TIMEOUT_MS);
  const limit = Math.min(Math.max(options?.limit ?? MAX_BATCH_SIZE, 1), MAX_BATCH_SIZE);
  const candidates = await db.bookingEmailDelivery.findMany({
    where: {
      ...(options?.bookingId ? { bookingId: options.bookingId } : {}),
      attempts: { lt: MAX_ATTEMPTS },
      availableAt: { lte: now },
      OR: [
        { status: BookingEmailDeliveryStatus.QUEUED },
        { status: BookingEmailDeliveryStatus.FAILED },
        {
          status: BookingEmailDeliveryStatus.PROCESSING,
          lockedAt: { lt: staleBefore },
        },
      ],
    },
    orderBy: [{ availableAt: "asc" }, { createdAt: "asc" }],
    take: limit,
    select: { id: true, bookingId: true, kind: true },
  });

  const result: BookingEmailProcessingResult = {
    claimed: 0,
    sent: 0,
    failed: 0,
    exhausted: 0,
  };
  for (const candidate of candidates) {
    const claimed = await db.bookingEmailDelivery.updateMany({
      where: {
        id: candidate.id,
        attempts: { lt: MAX_ATTEMPTS },
        availableAt: { lte: now },
        OR: [
          { status: BookingEmailDeliveryStatus.QUEUED },
          { status: BookingEmailDeliveryStatus.FAILED },
          {
            status: BookingEmailDeliveryStatus.PROCESSING,
            lockedAt: { lt: staleBefore },
          },
        ],
      },
      data: {
        status: BookingEmailDeliveryStatus.PROCESSING,
        lockedAt: now,
        attempts: { increment: 1 },
        lastError: null,
      },
    });
    if (claimed.count === 0) continue;
    result.claimed += 1;

    try {
      await dispatchBookingEmail(candidate.kind, candidate.bookingId);
      await db.$transaction(async (tx) => {
        await tx.bookingEmailDelivery.update({
          where: { id: candidate.id },
          data: {
            status: BookingEmailDeliveryStatus.SENT,
            sentAt: new Date(),
            lockedAt: null,
          },
        });
        if (candidate.kind === BookingEmailKind.HOST_REQUEST_REMINDER) {
          await tx.booking.updateMany({
            where: { id: candidate.bookingId, hostReminderSentAt: null },
            data: { hostReminderSentAt: new Date() },
          });
        }
      });
      result.sent += 1;
    } catch (error) {
      const delivery = await db.bookingEmailDelivery.findUnique({
        where: { id: candidate.id },
        select: { attempts: true },
      });
      const attempts = delivery?.attempts ?? MAX_ATTEMPTS;
      await db.bookingEmailDelivery.update({
        where: { id: candidate.id },
        data: {
          status: BookingEmailDeliveryStatus.FAILED,
          lockedAt: null,
          lastError: errorMessage(error),
          availableAt: new Date(Date.now() + retryDelayMs(attempts)),
        },
      });
      result.failed += 1;
    }
  }
  result.exhausted = await db.bookingEmailDelivery.count({
    where: {
      ...(options?.bookingId ? { bookingId: options.bookingId } : {}),
      status: BookingEmailDeliveryStatus.FAILED,
      attempts: { gte: MAX_ATTEMPTS },
    },
  });
  return result;
}

/** Immediate delivery attempt; the durable row remains queued if this process exits. */
export function kickBookingEmailDelivery(bookingId: string): void {
  void processBookingEmailOutbox({ bookingId }).catch(() => {
    // The scheduler will retry from the durable outbox.
  });
}
