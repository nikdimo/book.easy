import "server-only";

import { db } from "@/lib/db";

export async function getHostAttentionSummary(hostId: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [
    pendingBookings,
    unreadThreads,
    damageReports,
    recentNotifications,
    firstActiveListing,
    confirmedBookingCount,
    upcomingStay,
  ] =
    await Promise.all([
      db.booking.count({
        where: { listing: { hostId }, status: "PENDING" },
      }),
      db.conversationParticipant.count({
        where: {
          userId: hostId,
          unreadCount: { gt: 0 },
          conversation: { listing: { hostId } },
        },
      }),
      db.damageReport.count({
        where: {
          booking: { listing: { hostId } },
          reporterId: { not: hostId },
          status: { in: ["REPORTED", "ESCALATED"] },
        },
      }),
      db.notification.findMany({
        where: { userId: hostId, readAt: null },
        select: {
          id: true,
          type: true,
          title: true,
          body: true,
          route: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        take: 6,
      }),
      db.listing.findFirst({
        where: { hostId, status: "APPROVED" },
        select: { id: true },
        orderBy: { createdAt: "asc" },
      }),
      db.booking.count({
        where: {
          listing: { hostId, status: "APPROVED" },
          status: { in: ["CONFIRMED", "COMPLETED"] },
        },
      }),
      db.booking.findFirst({
        where: {
          listing: { hostId },
          status: "CONFIRMED",
          checkIn: { gte: today },
        },
        select: { checkIn: true, listingId: true },
        orderBy: { checkIn: "asc" },
      }),
    ]);

  return {
    total: pendingBookings + unreadThreads + damageReports,
    pendingBookings,
    unreadThreads,
    damageReports,
    recentNotifications,
    firstActiveListing,
    confirmedBookingCount,
    upcomingStay,
  };
}

export async function getUserAttentionSummary(userId: string, isHost: boolean) {
  const [unreadNotifications, host] = await Promise.all([
    db.notification.count({ where: { userId, readAt: null } }),
    isHost ? getHostAttentionSummary(userId) : Promise.resolve(null),
  ]);
  return {
    unreadNotifications,
    host: host
      ? {
          total: host.total,
          pendingBookings: host.pendingBookings,
          unreadThreads: host.unreadThreads,
          damageReports: host.damageReports,
        }
      : null,
  };
}
