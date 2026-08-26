import "server-only";

import { BookingEmailDeliveryStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { PAYMENT_INSTRUCTIONS_PREVIEW } from "@/lib/services/payment-instructions";

const MAX_ATTEMPTS = 12;
const LOCK_TIMEOUT_MS = 15 * 60 * 1000;

function retryDelayMs(attempts: number) {
  return Math.min(
    6 * 60 * 60 * 1000,
    5 * 60 * 1000 * 2 ** Math.max(0, attempts - 1)
  );
}

export async function processMessageEmailOutbox(options?: {
  messageId?: string;
  limit?: number;
}) {
  const now = new Date();
  const staleBefore = new Date(now.getTime() - LOCK_TIMEOUT_MS);
  const candidates = await db.messageEmailDelivery.findMany({
    where: {
      ...(options?.messageId ? { messageId: options.messageId } : {}),
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
    select: {
      id: true,
      messageId: true,
      recipientId: true,
      message: {
        select: {
          conversationId: true,
          senderId: true,
          body: true,
          kind: true,
          sender: { select: { id: true } },
          conversation: {
            select: {
              participants: {
                where: { role: "SUPPORT" },
                select: { userId: true },
              },
            },
          },
        },
      },
    },
    orderBy: [{ availableAt: "asc" }, { createdAt: "asc" }],
    take: Math.min(100, Math.max(1, options?.limit ?? 50)),
  });

  const result = { claimed: 0, sent: 0, failed: 0, exhausted: 0 };
  for (const candidate of candidates) {
    const claimed = await db.messageEmailDelivery.updateMany({
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
        attempts: { increment: 1 },
        lockedAt: now,
        lastError: null,
      },
    });
    if (claimed.count === 0) continue;
    result.claimed += 1;
    try {
      if (!candidate.message.senderId) {
        throw new Error("Message sender no longer exists");
      }
      const { notifyConversationMessage } = await import("@/lib/email");
      await notifyConversationMessage({
        conversationId: candidate.message.conversationId,
        senderId: candidate.message.senderId,
        recipientIds: [candidate.recipientId],
        // The durable row points to a sensitive message body, but email is an
        // external transport. Always derive its preview from the kind at delivery
        // time rather than trusting any earlier caller to have redacted it.
        preview:
          candidate.message.kind === "PAYMENT_INSTRUCTIONS"
            ? PAYMENT_INSTRUCTIONS_PREVIEW
            : candidate.message.body.slice(0, 180),
        supportSender: candidate.message.conversation.participants.some(
          ({ userId }) => userId === candidate.message.senderId
        ),
      });
      await db.messageEmailDelivery.update({
        where: { id: candidate.id },
        data: {
          status: BookingEmailDeliveryStatus.SENT,
          sentAt: new Date(),
          lockedAt: null,
        },
      });
      result.sent += 1;
    } catch (error) {
      const current = await db.messageEmailDelivery.findUnique({
        where: { id: candidate.id },
        select: { attempts: true },
      });
      const attempts = current?.attempts ?? MAX_ATTEMPTS;
      await db.messageEmailDelivery.update({
        where: { id: candidate.id },
        data: {
          status: BookingEmailDeliveryStatus.FAILED,
          lockedAt: null,
          lastError:
            error instanceof Error
              ? error.message.slice(0, 2000)
              : "Message email failed",
          availableAt: new Date(Date.now() + retryDelayMs(attempts)),
        },
      });
      result.failed += 1;
    }
  }
  result.exhausted = await db.messageEmailDelivery.count({
    where: {
      ...(options?.messageId ? { messageId: options.messageId } : {}),
      status: BookingEmailDeliveryStatus.FAILED,
      attempts: { gte: MAX_ATTEMPTS },
    },
  });
  return result;
}

export function kickMessageEmailDelivery(messageId: string) {
  void processMessageEmailOutbox({ messageId }).catch(() => {
    // The scheduled worker retries the durable row.
  });
}
