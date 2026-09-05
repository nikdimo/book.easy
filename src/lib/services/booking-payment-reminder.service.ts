import "server-only";

import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { parseCancellationSettlementSnapshot } from "@/lib/payments/cancellation-policy";
import { parseDepositPoliciesSnapshot } from "@/lib/payments/deposit-policies";
import { derivePaymentReminderState } from "@/lib/payments/payment-reminders";
import {
  addDaysToYmd,
  dbDateToYmd,
  marketplaceYmd,
  todayYmd,
  ymdToDbDate,
} from "@/lib/utils/date-only";
import { dispatchNotificationPushes } from "@/lib/services/notification.service";

type ReminderKind = "DUE_SOON" | "DUE_DATE" | "OVERDUE" | "RETURN_DUE";

async function deliver(input: {
  bookingId: string;
  requestId?: string | null;
  recipientId: string;
  obligationKey: string;
  kind: ReminderKind;
  dueAt: Date;
  title: string;
  body: string;
  route: string;
}) {
  try {
    return await db.$transaction(async (tx) => {
      await tx.bookingPaymentReminderDelivery.create({
        data: {
          bookingId: input.bookingId,
          requestId: input.requestId ?? null,
          recipientId: input.recipientId,
          obligationKey: input.obligationKey,
          kind: input.kind,
          dueAt: input.dueAt,
        },
      });
      return tx.notification.create({
        data: {
          userId: input.recipientId,
          type: "SYSTEM",
          title: input.title,
          body: input.body,
          route: input.route,
          data: { bookingId: input.bookingId },
        },
        select: { id: true },
      });
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === "P2002" || error.code === "P2003")
    ) {
      return null;
    }
    throw error;
  }
}

export async function processBookingPaymentReminders(now = new Date()) {
  const today = todayYmd(undefined, now);
  const notificationIds: string[] = [];
  const requests = await db.bookingPaymentRequest.findMany({
    where: {
      status: "SENT",
      amount: { gt: 0 },
      booking: { status: { in: ["CONFIRMED", "COMPLETED"] } },
    },
    include: {
      booking: {
        select: {
          id: true,
          guestId: true,
          paymentStatus: true,
          advancePaymentStatus: true,
          damageDepositStatus: true,
          listing: { select: { hostId: true } },
        },
      },
    },
  });

  for (const request of requests) {
    const status =
      request.type === "ADVANCE_PAYMENT"
        ? request.booking.advancePaymentStatus
        : request.type === "DAMAGE_DEPOSIT"
          ? request.booking.damageDepositStatus
          : request.booking.paymentStatus;
    // Two thresholds, because the two recipients are being asked different things.
    //
    // The *guest* is being asked to send money. Once they have said they sent it, there
    // is nothing further for them to do, and a "Payment reminder" that keeps arriving is
    // the platform telling them their own report did not count. The *host* is being
    // asked to confirm receipt, and that is still outstanding until they do — so their
    // overdue notice continues through `*_REPORTED`.
    //
    // One vocabulary, two thresholds: a report means the same thing to both sides, and
    // the sides differ only in what it discharges.
    const guestSettled =
      request.type === "DAMAGE_DEPOSIT"
        ? ["DEPOSIT_REPORTED", "DEPOSIT_CONFIRMED", "RETURN_REPORTED", "RETURN_CONFIRMED", "RETAINED", "NOT_REQUIRED"].includes(status)
        : ["PAYMENT_REPORTED", "PAYMENT_CONFIRMED", "NOT_REQUIRED"].includes(status);
    const hostSettled =
      request.type === "DAMAGE_DEPOSIT"
        ? ["DEPOSIT_CONFIRMED", "RETURN_REPORTED", "RETURN_CONFIRMED", "RETAINED", "NOT_REQUIRED"].includes(status)
        : ["PAYMENT_CONFIRMED", "NOT_REQUIRED"].includes(status);
    if (guestSettled && hostSettled) continue;
    const state = derivePaymentReminderState({ dueDate: dbDateToYmd(request.dueAt), today });
    if (state === "SCHEDULED" || state === "RETURN_DUE") continue;
    const kind = state as Exclude<ReminderKind, "RETURN_DUE">;
    if (!guestSettled) {
      const guest = await deliver({
        bookingId: request.bookingId,
        requestId: request.id,
        recipientId: request.booking.guestId,
        obligationKey: `request:${request.id}`,
        kind,
        dueAt: request.dueAt,
        title: kind === "OVERDUE" ? "Payment date has passed" : "Payment reminder",
        body: "A booking payment needs your attention. Open the booking for the amount and instructions.",
        route: `/account/bookings/${request.bookingId}`,
      });
      if (guest) notificationIds.push(guest.id);
    }
    if (kind === "OVERDUE" && !hostSettled) {
      const host = await deliver({
        bookingId: request.bookingId,
        requestId: request.id,
        recipientId: request.booking.listing.hostId,
        obligationKey: `request:${request.id}`,
        kind,
        dueAt: request.dueAt,
        title: "Payment date has passed",
        body: guestSettled
          ? "A guest has reported sending a booking payment that is now overdue. Open the booking to confirm whether it arrived."
          : "A booking payment is overdue. Open the booking to review its reported status.",
        route: `/host/reservations/${request.bookingId}`,
      });
      if (host) notificationIds.push(host.id);
    }
  }

  const returns = await db.booking.findMany({
    where: {
      OR: [
        {
          status: { in: ["CANCELLED_BY_GUEST", "CANCELLED_BY_HOST", "CANCELLED_BY_ADMIN"] },
          damageDepositAmount: { gt: 0 },
          damageDepositStatus: { in: ["DEPOSIT_REPORTED", "DEPOSIT_CONFIRMED"] },
        },
        {
          status: "COMPLETED",
          damageDepositAmount: { gt: 0 },
          damageDepositStatus: "DEPOSIT_CONFIRMED",
        },
        {
          status: { in: ["CANCELLED_BY_GUEST", "CANCELLED_BY_HOST", "CANCELLED_BY_ADMIN"] },
          accommodationRefundAmount: { gt: 0 },
          accommodationRefundStatus: "AWAITING_REFUND",
        },
      ],
    },
    select: {
      id: true,
      status: true,
      checkOut: true,
      cancelledAt: true,
      depositPolicySnapshot: true,
      damageDepositAmount: true,
      damageDepositStatus: true,
      accommodationRefundAmount: true,
      accommodationRefundStatus: true,
      cancellationSettlementSnapshot: true,
      listing: { select: { hostId: true } },
    },
  });

  for (const booking of returns) {
    if (booking.accommodationRefundStatus === "AWAITING_REFUND" && Number(booking.accommodationRefundAmount ?? 0) > 0) {
      const dueAt = booking.cancelledAt ?? now;
      // `cancelledAt` (and the `now` fallback) are moments, so their civil day is the
      // marketplace's — `dbDateToYmd` would read them in UTC and compare a UTC day
      // against the Skopje `today` below.
      const state = derivePaymentReminderState({
        dueDate: marketplaceYmd(dueAt),
        today,
      });
      if (state !== "SCHEDULED" && state !== "DUE_SOON") {
        // An obligation built on an unconfirmed report is still the host's to answer —
        // but it is a claim, and the notice says so rather than presenting it as an
        // established debt. `UNKNOWN` is a settlement written before provenance was
        // recorded, and it is not evidence of confirmation either.
        const settlement = parseCancellationSettlementSnapshot(
          booking.cancellationSettlementSnapshot,
        );
        const provisional = settlement?.refundBasis !== "CONFIRMED";
        const sent = await deliver({
          bookingId: booking.id,
          recipientId: booking.listing.hostId,
          obligationKey: `refund:${booking.id}`,
          kind: state === "DUE_DATE" ? "DUE_DATE" : "OVERDUE",
          dueAt,
          title: provisional
            ? "Accommodation refund claimed"
            : "Accommodation refund due",
          body: provisional
            ? "A cancelled booking has an accommodation refund based on a payment the guest reported and you have not confirmed. Open the booking to confirm what you received, or contact support if you disagree."
            : "A cancelled booking has an accommodation refund awaiting your report.",
          route: `/host/reservations/${booking.id}`,
        });
        if (sent) notificationIds.push(sent.id);
      }
    }
    if (
      ["DEPOSIT_REPORTED", "DEPOSIT_CONFIRMED"].includes(
        booking.damageDepositStatus,
      ) &&
      Number(booking.damageDepositAmount ?? 0) > 0
    ) {
      const cancelled = booking.status.startsWith("CANCELLED_BY_");
      const policy = parseDepositPoliciesSnapshot(booking.depositPolicySnapshot);
      const dueYmd = cancelled
        ? marketplaceYmd(booking.cancelledAt ?? now)
        : addDaysToYmd(dbDateToYmd(booking.checkOut), policy?.damageDeposit?.returnDaysAfterCheckout ?? 0);
      const state = derivePaymentReminderState({ dueDate: dueYmd, today, returnObligation: true });
      if (state === "RETURN_DUE") {
        const dueAt = ymdToDbDate(dueYmd);
        const sent = await deliver({
          bookingId: booking.id,
          recipientId: booking.listing.hostId,
          obligationKey: `damage-return:${booking.id}`,
          kind: "RETURN_DUE",
          dueAt,
          title: "Damage deposit return due",
          body: "A refundable damage deposit is due for return. Open the booking to report it.",
          route: `/host/reservations/${booking.id}`,
        });
        if (sent) notificationIds.push(sent.id);
      }
    }
  }

  if (notificationIds.length > 0) void dispatchNotificationPushes(notificationIds);
  return notificationIds.length;
}
