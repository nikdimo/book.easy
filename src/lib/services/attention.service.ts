import "server-only";

import { db } from "@/lib/db";
import { expirePendingBookings } from "@/lib/services/booking.service";
import { listingDraftData } from "@/lib/mobile-listing-draft";
import { todayYmd, ymdToDbDate } from "@/lib/utils/date-only";

export async function getHostAttentionSummary(hostId: string) {
  // Today and the badge must agree with the reservation lists, and every one of those
  // reads sweeps first (see `getHostBookings`, `getHostReservations`). Without this the
  // counter kept requests whose `responseDueAt` had passed until the next timer run,
  // sending the host to a screen where the request was already gone. This is the same
  // authoritative sweep, not a second rule: it releases the booking hold, queues the
  // guest email and notifies exactly once, and its `updateMany` guard makes a repeated
  // dashboard read a no-op rather than a second message.
  await expirePendingBookings();

  // `checkIn` is `@db.Date`. Marketplace day, in the terms it is stored in — the
  // server-local midnight this replaces dropped or kept a stay starting today
  // depending on which side of UTC the host process ran (M6).
  const today = ymdToDbDate(todayYmd());

  const [
    pendingBookings,
    unreadThreads,
    damageReports,
    recentNotifications,
    firstActiveListing,
    incompletePaymentArrangements,
    incompletePaymentArrangementCount,
    confirmedBookingCount,
    upcomingStay,
    latestDamageReport,
    listingCount,
    latestDraft,
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
      // Payment methods, deposit policy, and cancellation policy each have their own
      // reviewed marker. An
      // explicit "arrange directly" method and an explicit "no deposit" answer both
      // set those markers, so this finds only hosts who have not answered one of the
      // three questions — never hosts who deliberately chose the empty-looking option.
      // One oldest listing is enough for Today: showing a card for every property
      // would turn a useful task into a noisy stack. Once it is answered, the next
      // incomplete listing naturally becomes the task.
      db.listing.findFirst({
        where: {
          hostId,
          status: { not: "ARCHIVED" },
          OR: [
            { paymentMethodsReviewedAt: null },
            { depositPoliciesReviewedAt: null },
            { cancellationPolicyReviewedAt: null },
          ],
        },
        select: { id: true, title: true },
        orderBy: { createdAt: "asc" },
      }),
      db.listing.count({
        where: {
          hostId,
          status: { not: "ARCHIVED" },
          OR: [
            { paymentMethodsReviewedAt: null },
            { depositPoliciesReviewedAt: null },
            { cancellationPolicyReviewedAt: null },
          ],
        },
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
      // The thread behind the newest open damage report, so the Today row can open the
      // report itself instead of the inbox. Same filter as the count above plus one
      // more condition: the host must already be a participant of that conversation,
      // which is exactly what the thread route re-checks before it renders. An id that
      // would 404 therefore never becomes a link — the row falls back to the inbox.
      db.damageReport.findFirst({
        where: {
          booking: { listing: { hostId } },
          reporterId: { not: hostId },
          status: { in: ["REPORTED", "ESCALATED"] },
          conversation: {
            listing: { hostId },
            participants: { some: { userId: hostId } },
          },
        },
        select: { conversationId: true },
        orderBy: { createdAt: "desc" },
      }),
      // Everything a host has ever kept, published or not: a host with a listing in
      // review or unpublished is not a first-time host and must not be sent back to
      // the "create your first listing" screen. Only archiving takes a host back there.
      db.listing.count({ where: { hostId, status: { not: "ARCHIVED" } } }),
      // A wizard draft is not a Listing row yet, so it is the only trace a host who
      // started and stopped leaves behind. Today offers it back to them.
      db.listingDraft.findFirst({
        where: { hostId },
        select: { id: true, data: true },
        orderBy: { updatedAt: "desc" },
      }),
    ]);

  return {
    total: pendingBookings + unreadThreads + damageReports,
    pendingBookings,
    unreadThreads,
    damageReports,
    damageReportConversationId: latestDamageReport?.conversationId ?? null,
    recentNotifications,
    firstActiveListing,
    incompletePaymentArrangements,
    incompletePaymentArrangementCount,
    confirmedBookingCount,
    upcomingStay,
    listingCount,
    latestDraft: latestDraft
      ? { id: latestDraft.id, title: listingDraftData(latestDraft.data).title ?? null }
      : null,
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
