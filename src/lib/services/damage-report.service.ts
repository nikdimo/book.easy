import "server-only";

import type { DamageReportStatus, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { dispatchNotificationPushes } from "@/lib/services/notification.service";
import type { z } from "zod";
import type { damageReportSchema } from "@/lib/validations/communication.schema";
import { publishConversationChanged } from "@/lib/services/communication-realtime.service";

type DamageInput = z.infer<typeof damageReportSchema>;

export async function createConversationDamageReport(input: DamageInput & {
  conversationId: string;
  reporterId: string;
}) {
  const membership = await db.conversationParticipant.findUnique({
    where: {
      conversationId_userId: {
        conversationId: input.conversationId,
        userId: input.reporterId,
      },
    },
    select: {
      conversation: {
        select: {
          bookingId: true,
          listing: { select: { title: true } },
        },
      },
    },
  });
  if (!membership?.conversation.bookingId) {
    throw new Error("Damage reports require a booking conversation");
  }

  const result = await db.$transaction(async (tx) => {
    const report = await tx.damageReport.create({
      data: {
        bookingId: membership.conversation.bookingId!,
        conversationId: input.conversationId,
        reporterId: input.reporterId,
        description: input.description,
        evidence: { create: input.evidence },
      },
      include: {
        reporter: { select: { id: true, name: true } },
        evidence: true,
      },
    });
    const recipients = await tx.conversationParticipant.findMany({
      where: {
        conversationId: input.conversationId,
        userId: { not: input.reporterId },
        role: "MEMBER",
      },
      select: { userId: true },
    });
    const notifications = await Promise.all(
      recipients.map(({ userId }) =>
        tx.notification.create({
          data: {
            userId,
            type: "CASE_SUBMITTED",
            title: "New damage report",
            body: `${membership.conversation.listing.title}: ${input.description.slice(0, 140)}`,
            route: `/messages/${input.conversationId}`,
            data: {
              conversationId: input.conversationId,
              damageReportId: report.id,
            } satisfies Prisma.InputJsonObject,
          },
          select: { id: true },
        })
      )
    );
    return { report, notificationIds: notifications.map(({ id }) => id) };
  });

  void dispatchNotificationPushes(result.notificationIds);
  publishConversationChanged(input.conversationId);
  return result.report;
}

export async function updateConversationDamageReport(input: {
  conversationId: string;
  damageReportId: string;
  userId: string;
  action: "ACKNOWLEDGE" | "ESCALATE" | "RESOLVE";
}) {
  const report = await db.damageReport.findFirst({
    where: {
      id: input.damageReportId,
      conversationId: input.conversationId,
      conversation: { participants: { some: { userId: input.userId } } },
    },
    select: {
      id: true,
      reporterId: true,
      status: true,
      description: true,
      conversation: { select: { listing: { select: { title: true } } } },
    },
  });
  if (!report) throw new Error("Damage report not found");
  if (input.action === "ACKNOWLEDGE" && report.reporterId === input.userId) {
    throw new Error("The other participant must acknowledge this report");
  }
  const nextStatus: DamageReportStatus = ({
    ACKNOWLEDGE: "ACKNOWLEDGED",
    ESCALATE: "ESCALATED",
    RESOLVE: "RESOLVED",
  } as const)[input.action];
  if (report.status === "RESOLVED") throw new Error("This damage report is resolved");

  const result = await db.$transaction(async (tx) => {
    const updated = await tx.damageReport.update({
      where: { id: report.id },
      data: { status: nextStatus },
    });
    const recipients = await tx.conversationParticipant.findMany({
      where: {
        conversationId: input.conversationId,
        userId: { not: input.userId },
        role: "MEMBER",
      },
      select: { userId: true },
    });
    const admins =
      input.action === "ESCALATE"
        ? await tx.user.findMany({
            where: { role: "ADMIN", isActive: true },
            select: { id: true },
          })
        : [];
    const targets = [
      ...recipients.map(({ userId }) => ({
        userId,
        route: `/messages/${input.conversationId}`,
      })),
      ...admins.map(({ id }) => ({
        userId: id,
        route: `/admin/communications/${input.conversationId}`,
      })),
    ];
    const notifications = await Promise.all(
      targets.map(({ userId, route }) =>
        tx.notification.create({
          data: {
            userId,
            type: "CASE_UPDATED",
            title: `Damage report ${nextStatus.toLowerCase()}`,
            body: `${report.conversation.listing.title}: ${report.description.slice(0, 140)}`,
            route,
            data: {
              conversationId: input.conversationId,
              damageReportId: report.id,
            } satisfies Prisma.InputJsonObject,
          },
          select: { id: true },
        })
      )
    );
    return { updated, notificationIds: notifications.map(({ id }) => id) };
  });
  void dispatchNotificationPushes(result.notificationIds);
  publishConversationChanged(input.conversationId);
  return result.updated;
}
