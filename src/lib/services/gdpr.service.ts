import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { enqueueUserDraftUploads } from '@/lib/listing-draft-cleanup';
import {
  enqueueUploadDeletions,
  processPendingUploadDeletions,
  sweepUploads,
} from '@/lib/storage/upload-cleanup';
import { parseCancellationSettlementSnapshot } from '@/lib/payments/cancellation-policy';
import { dbDateToYmd, todayYmd, ymdToDbDate } from '@/lib/utils/date-only';
import { recordBookingTimelineEvent } from '@/lib/services/booking-timeline.service';

export interface UserDataExport {
  account: {
    id: string;
    email: string;
    name: string;
    image?: string;
    role: string;
    isHost: boolean;
    createdAt: Date;
    updatedAt: Date;
  };
  profile?: {
    phone?: string;
    bio?: string;
    hostBio?: string;
    hostDisplayName?: string;
  };
  bookings: Array<{
    id: string;
    listingTitle: string;
    checkIn: string;
    checkOut: string;
    guestCount: number;
    totalPrice: string;
    status: string;
    paymentStatus: string;
    advancePaymentStatus: string;
    damageDepositStatus: string;
    advancePaymentAmount?: string;
    damageDepositAmount?: string;
    depositPolicySnapshot?: unknown;
    createdAt: Date;
  }>;
  listings?: Array<{
    id: string;
    title: string;
    slug: string;
    status: string;
    views: number;
    advancePaymentEnabled: boolean;
    advancePaymentType?: string;
    advancePaymentValue?: string;
    damageDepositEnabled: boolean;
    damageDepositType?: string;
    damageDepositValue?: string;
    depositPoliciesCurrency?: string;
    createdAt: Date;
  }>;
  favorites: Array<{
    listingTitle: string;
    addedAt: Date;
  }>;
  reviews: Array<{
    listingTitle: string;
    rating?: number;
    comment?: string;
    createdAt: Date;
  }>;
  auditLog: Array<{
    action: string;
    entityType: string;
    createdAt: Date;
  }>;
  consentHistory: Array<{
    essential: boolean;
    analytics: boolean;
    marketing: boolean;
    consentedAt: Date;
  }>;
  communicationPreferences?: {
    messageEmail: boolean;
    reviewEmail: boolean;
    operationalPush: boolean;
  };
  marketingConsentHistory: Array<{
    channel: string;
    audience: string;
    status: string;
    statementVersion?: string;
    statementText?: string;
    events: Array<{
      action: string;
      source: string;
      occurredAt: Date;
    }>;
  }>;
  notifications: Array<{
    type: string;
    title: string;
    body: string;
    readAt?: Date;
    createdAt: Date;
  }>;
  messages: Array<{
    conversationId: string;
    kind: string;
    body: string;
    editedAt?: Date;
    deletedAt?: Date;
    createdAt: Date;
  }>;
  paymentStatusEvents: Array<{
    bookingId: string;
    listingTitle: string;
    eventType: string;
    paymentStatus: string;
    advancePaymentStatus?: string;
    damageDepositStatus?: string;
    createdAt: Date;
  }>;
  transactionReports: Array<{
    bookingId: string;
    track: string;
    amount: string;
    currency: string;
    transactionDate: string;
    reference?: string;
    note?: string;
    retainedReason?: string;
    createdAt: Date;
  }>;
}

/**
 * Export all user data in a portable format (GDPR Right to Data Portability)
 */
export async function exportUserData(userId: string): Promise<UserDataExport> {
  const user = await db.user.findUniqueOrThrow({
    where: { id: userId },
    include: {
      profile: true,
      bookings: {
        include: { listing: true },
        take: 100,
      },
      listings: {
        include: { views: { select: { id: true } } },
        take: 50,
      },
      favorites: {
        include: { listing: true },
        take: 100,
      },
      auditLogs: {
        take: 200,
      },
      notifications: {
        orderBy: { createdAt: 'desc' },
        take: 500,
      },
      sentMessages: {
        orderBy: { createdAt: 'desc' },
        take: 1000,
      },
      bookingPaymentStatusEvents: {
        orderBy: { createdAt: 'desc' },
        take: 1000,
        include: { booking: { include: { listing: true } } },
      },
      bookingPaymentPrivateRecords: {
        orderBy: { createdAt: 'desc' },
        take: 1000,
      },
    },
  });

  // Get reviews via listing reports/comments (if stored)
  const listingReports = await db.listingReport.findMany({
    where: { reporterId: userId },
    include: { listing: true },
    take: 100,
  });

  // Get consent history
  const [consentHistory, communicationPreferences, marketingContact] =
    await Promise.all([
      db.userConsent.findMany({
        where: { userId },
        orderBy: { consentedAt: 'desc' },
        take: 50,
      }),
      db.communicationPreference.findUnique({ where: { userId } }),
      db.marketingContact.findUnique({
        where: { userId },
        include: {
          preferences: {
            include: {
              statement: true,
              events: { orderBy: { occurredAt: 'asc' } },
            },
          },
        },
      }),
    ]);

  return {
    account: {
      id: user.id,
      email: user.email,
      name: user.name,
      image: user.image || undefined,
      role: user.role,
      isHost: user.isHost,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    },
    profile: user.profile
      ? {
          phone: user.profile.phone || undefined,
          bio: user.profile.bio || undefined,
          hostBio: user.profile.hostBio || undefined,
          hostDisplayName: user.profile.hostDisplayName || undefined,
        }
      : undefined,
    bookings: user.bookings.map((booking) => ({
      id: booking.id,
      listingTitle: booking.listing.title,
      checkIn: booking.checkIn.toISOString().split('T')[0],
      checkOut: booking.checkOut.toISOString().split('T')[0],
      guestCount: booking.guestCount,
      totalPrice: booking.totalPrice.toString(),
      status: booking.status,
      paymentStatus: booking.paymentStatus,
      advancePaymentStatus: booking.advancePaymentStatus,
      damageDepositStatus: booking.damageDepositStatus,
      advancePaymentAmount: booking.advancePaymentAmount?.toString(),
      damageDepositAmount: booking.damageDepositAmount?.toString(),
      depositPolicySnapshot: booking.depositPolicySnapshot ?? undefined,
      createdAt: booking.createdAt,
    })),
    listings: user.listings
      ? user.listings.map((listing) => ({
          id: listing.id,
          title: listing.title,
          slug: listing.slug,
          status: listing.status,
          views: listing.views.length,
          advancePaymentEnabled: listing.advancePaymentEnabled,
          advancePaymentType: listing.advancePaymentType || undefined,
          advancePaymentValue: listing.advancePaymentValue?.toString(),
          damageDepositEnabled: listing.damageDepositEnabled,
          damageDepositType: listing.damageDepositType || undefined,
          damageDepositValue: listing.damageDepositValue?.toString(),
          depositPoliciesCurrency: listing.depositPoliciesCurrency || undefined,
          createdAt: listing.createdAt,
        }))
      : undefined,
    favorites: user.favorites.map((fav) => ({
      listingTitle: fav.listing.title,
      addedAt: fav.createdAt,
    })),
    reviews: listingReports.map((report) => ({
      listingTitle: report.listing.title,
      rating: undefined,
      comment: report.message || undefined,
      createdAt: report.createdAt,
    })),
    auditLog: user.auditLogs.map((log) => ({
      action: log.action,
      entityType: log.entityType,
      createdAt: log.createdAt,
    })),
    consentHistory: consentHistory.map((consent) => ({
      essential: consent.essential,
      analytics: consent.analytics,
      marketing: consent.marketing,
      consentedAt: consent.consentedAt,
    })),
    communicationPreferences: communicationPreferences
      ? {
          messageEmail: communicationPreferences.messageEmail,
          reviewEmail: communicationPreferences.reviewEmail,
          operationalPush: communicationPreferences.operationalPush,
        }
      : undefined,
    marketingConsentHistory: (marketingContact?.preferences || []).map(
      (preference) => ({
        channel: preference.channel,
        audience: preference.audience,
        status: preference.status,
        statementVersion: preference.statement?.version,
        statementText: preference.statement?.text,
        events: preference.events.map((event) => ({
          action: event.action,
          source: event.source,
          occurredAt: event.occurredAt,
        })),
      })
    ),
    notifications: user.notifications.map((notification) => ({
      type: notification.type,
      title: notification.title,
      body: notification.body,
      readAt: notification.readAt || undefined,
      createdAt: notification.createdAt,
    })),
    messages: user.sentMessages.map((message) => ({
      conversationId: message.conversationId,
      kind: message.kind,
      body: message.deletedAt ? 'Message removed' : message.body,
      editedAt: message.editedAt || undefined,
      deletedAt: message.deletedAt || undefined,
      createdAt: message.createdAt,
    })),
    paymentStatusEvents: user.bookingPaymentStatusEvents.map((event) => ({
      bookingId: event.bookingId,
      listingTitle: event.booking.listing.title,
      eventType: event.eventType,
      paymentStatus: event.paymentStatus,
      advancePaymentStatus: event.advancePaymentStatus ?? undefined,
      damageDepositStatus: event.damageDepositStatus ?? undefined,
      createdAt: event.createdAt,
    })),
    transactionReports: user.bookingPaymentPrivateRecords.map((record) => ({
      bookingId: record.bookingId,
      track: record.track,
      amount: record.amount.toString(),
      currency: record.currency,
      transactionDate: dbDateToYmd(record.transactionDate),
      reference: record.reference ?? undefined,
      note: record.note ?? undefined,
      retainedReason: record.retainedReason ?? undefined,
      createdAt: record.createdAt,
    })),
  };
}

/** The display name every erased account collapses to.
 *
 *  Deliberately the same literal the messaging UI already falls back to for a null
 *  sender (`conversation.deleted_user`), so a host reading an old reservation sees one
 *  phrase for "this person is gone" rather than two. */
export const ERASED_USER_NAME = 'Deleted user';

/**
 * The address an erased account is left holding.
 *
 * `.invalid` is reserved by RFC 2606 and can never resolve, so nothing we send can
 * reach a husk. It is derived from the user id, which makes it unique without a lookup
 * and keeps the write idempotent. The point of moving the address at all is that
 * `User.email` is unique: parking it here releases the real address, so somebody who
 * erases their account can sign up again with the same mailbox afterwards.
 */
export function erasedEmailFor(userId: string): string {
  return `deleted-${userId}@deleted.invalid`;
}

export type AccountDeletionRefusal =
  | 'ACTIVE_BOOKING'
  | 'OPEN_OBLIGATION'
  | 'TOKEN_INVALID'
  | 'TOKEN_ALREADY_USED'
  | 'ACCOUNT_NOT_FOUND';

/**
 * A refusal the person who asked is entitled to read.
 *
 * Separate from the generic failure because the messages differ in kind: "something
 * broke, contact support" is an apology, while "you have a guest arriving on Friday"
 * is an instruction the user can act on. `confirmAccountDeletion` passes `message`
 * straight through to the UI, so anything thrown here is user-facing copy.
 */
export class AccountDeletionBlockedError extends Error {
  readonly reason: AccountDeletionRefusal;

  constructor(reason: AccountDeletionRefusal, message: string) {
    super(message);
    this.name = 'AccountDeletionBlockedError';
    this.reason = reason;
  }
}

/** Confirmed stays that have not finished yet, on either side of the booking. */
interface BlockingBooking {
  guestId: string;
  checkOut: Date;
}

function describeBlockingBookings(userId: string, rows: BlockingBooking[]): string {
  const asGuest = rows.filter((row) => row.guestId === userId).length;
  const asHost = rows.length - asGuest;
  const last = dbDateToYmd(
    rows.reduce((latest, row) => (row.checkOut > latest ? row.checkOut : latest), rows[0].checkOut)
  );

  const parts: string[] = [];
  if (asGuest > 0) {
    parts.push(`${asGuest} ${asGuest === 1 ? 'stay' : 'stays'} you booked`);
  }
  if (asHost > 0) {
    parts.push(
      `${asHost} ${asHost === 1 ? 'reservation' : 'reservations'} at your ${
        asHost === 1 ? 'listing' : 'listings'
      }`
    );
  }

  const one = rows.length === 1;
  return (
    `Your account still has ${parts.join(' and ')} that ${one ? 'has' : 'have'} not ` +
    `finished yet — the last one ends on ${last}. Cancel or complete ${one ? 'it' : 'them'} ` +
    `first, then request deletion again.`
  );
}

/**
 * Money this account is still in the middle of, on either side of a booking.
 *
 * Deletion already refuses a confirmed stay that has not finished. It did not refuse an
 * open *financial* obligation, so a host holding a guest's damage deposit — or one the
 * platform had recorded as owing an accommodation refund — could erase themselves. The
 * refund reminder job then kept targeting a deleted user, and the guest lost the
 * counterparty to an obligation the platform itself opened and recorded.
 *
 * Four properties this guard has to have, and each one is a decision rather than an
 * accident:
 *
 * **Established money only.** A `*_REPORTED` status is one side's own claim (see the
 * `BookingPaymentStatus` doc in the schema). A claim is enough to open an obligation; it
 * is not enough to suspend somebody's right to erasure indefinitely, because the person
 * being blocked has no way to make the other side confirm. So an obligation blocks only
 * where the money is proven: a `DEPOSIT_CONFIRMED` deposit the host still holds, or a
 * refund whose settlement snapshot records `refundBasis: CONFIRMED`. An `AWAITING_REFUND`
 * built on `refundBasis: CLAIMED` — or on a version-1 snapshot, whose basis reads back as
 * `UNKNOWN` — is not proof that confirmed money moved, and does not block.
 *
 * **Symmetry.** `REFUND_REPORTED` and `RETURN_REPORTED` are the same situation on two
 * tracks: the paying side says they have paid and the other side has not confirmed. A
 * report discharges the reporter's own prompt, exactly as it does for reminders, so
 * neither blocks the reporter.
 *
 * **Role sensitivity.** What blocks a host is money they are holding or owe. What blocks
 * a guest is money they owe — an accommodation balance or deposit the host has recorded
 * as still due on a live booking.
 *
 * **A bounded resolution path.** Every refusal names the specific obligation and sends
 * the person to support, because some of these cannot be cleared by the blocked party
 * acting alone. Support can settle, write off or record the obligation, after which
 * erasure proceeds. This guard is deliberately not the place that decides how a
 * *disputed* obligation ends — that needs privacy and legal review, and until it has one
 * a disputed (claimed) obligation does not block at all.
 */
interface ObligationBooking {
  id: string;
  reference: string;
  guestId: string;
  status: string;
  damageDepositAmount: unknown;
  damageDepositStatus: string;
  accommodationRefundAmount: unknown;
  accommodationRefundStatus: string;
  cancellationSettlementSnapshot: unknown;
  paymentStatus: string;
  advancePaymentStatus: string;
}

/** The deposit statuses that mean the host is holding confirmed guest money. */
const HOST_HOLDS_CONFIRMED_DEPOSIT = 'DEPOSIT_CONFIRMED';

/** A booking whose stay is still live enough for an unpaid balance to be a real debt. */
const GUEST_DEBT_STATUSES = ['CONFIRMED', 'COMPLETED'];

function obligationRefusals(
  userId: string,
  rows: ObligationBooking[],
): string[] {
  const refusals: string[] = [];
  for (const booking of rows) {
    const isGuest = booking.guestId === userId;
    const amount = (value: unknown) => Number(value ?? 0);

    if (!isGuest) {
      // Host side: money they are holding, or money they owe and it is proven.
      if (
        booking.damageDepositStatus === HOST_HOLDS_CONFIRMED_DEPOSIT &&
        amount(booking.damageDepositAmount) > 0
      ) {
        refusals.push(
          `booking ${booking.reference}: you confirmed receiving a refundable damage deposit that has not been returned`,
        );
      }
      if (
        booking.accommodationRefundStatus === 'AWAITING_REFUND' &&
        amount(booking.accommodationRefundAmount) > 0 &&
        parseCancellationSettlementSnapshot(booking.cancellationSettlementSnapshot)
          ?.refundBasis === 'CONFIRMED'
      ) {
        refusals.push(
          `booking ${booking.reference}: an accommodation refund you have not reported sending`,
        );
      }
      continue;
    }

    // Guest side: money they owe on a stay that is still live.
    if (!GUEST_DEBT_STATUSES.includes(booking.status)) continue;
    if (booking.paymentStatus === 'AWAITING_PAYMENT') {
      refusals.push(
        `booking ${booking.reference}: an accommodation balance the host has recorded as still due`,
      );
    }
    if (booking.advancePaymentStatus === 'AWAITING_PAYMENT') {
      refusals.push(
        `booking ${booking.reference}: an advance payment the host has recorded as still due`,
      );
    }
  }
  return refusals;
}

function describeOpenObligations(refusals: string[]): string {
  const one = refusals.length === 1;
  return (
    `Your account still has ${one ? 'an open obligation' : 'open obligations'} recorded ` +
    `against ${one ? 'a booking' : 'bookings'} — ${refusals.join('; ')}. ` +
    `Settle ${one ? 'it' : 'them'} on the booking, or contact support to have ` +
    `${one ? 'it' : 'them'} resolved, then request deletion again.`
  );
}

export interface DeleteUserAccountResult {
  success: boolean;
  /** True when the account was already a husk and this call changed nothing. */
  alreadyErased: boolean;
  deletedRecords: Record<string, number>;
  anonymizedRecords: Record<string, number>;
}

/**
 * Erase an account: strip every trace of the person, keep the records the business is
 * required to keep.
 *
 * **Why the row survives.** Four foreign keys onto `User` are `ON DELETE RESTRICT` —
 * `Booking.guestId`, `Listing.hostId`, `Property.ownerId`, `Suggestion.hostId` — and a
 * fifth, `AuditLog.userId`, is handled by deleting the logs outright. `DELETE FROM
 * "User"` therefore raised a foreign-key violation for any account that had ever booked
 * or hosted, which is very nearly every real account. Three ways out were on the table:
 *
 *   - *Make the columns nullable.* Pushes `null` through every read of a booking's guest
 *     and a listing's host, across the booking, search, messaging and mobile-API layers.
 *   - *Reassign to one shared tombstone user.* Merges unrelated people into a single
 *     identity, which defeats the point of keeping booking records distinguishable for
 *     seven years.
 *   - *Anonymize the row in place.* What this does. Every relation stays valid, each
 *     erased account keeps its own meaningless key, and `booking.guest.name` still
 *     resolves — to "Deleted user".
 *
 * A side effect worth naming: `SafetyCase.reporterId` is a required `ON DELETE CASCADE`,
 * so the old hard delete silently destroyed the safety cases an erased user had filed.
 * They now survive with an anonymous reporter.
 *
 * **What is refused.** A confirmed stay that has not finished yet — on either side —
 * blocks erasure before anything is written, so nobody erases their way out of a
 * reservation somebody else is relying on. The check runs inside the transaction, so a
 * booking confirmed while this was in flight cannot slip past it.
 *
 * **Atomicity.** Pass `consumeTokenHash` and the confirmation token is spent in this
 * same transaction. A refusal or a crash rolls the token back with everything else, so a
 * failed attempt leaves the emailed link still usable.
 *
 * **Idempotency.** Erasing an already-erased account reports success and writes nothing.
 */
export async function deleteUserAccount(
  userId: string,
  options: { consumeTokenHash?: string } = {}
): Promise<DeleteUserAccountResult> {
  const deletedRecords: Record<string, number> = {};
  const anonymizedRecords: Record<string, number> = {};
  // Filled inside the transaction, swept after it commits.
  let queuedUploads: string[] = [];
  let alreadyErased = false;

  try {
    await db.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { id: true, image: true, deletedAt: true },
      });
      if (!user) {
        throw new AccountDeletionBlockedError('ACCOUNT_NOT_FOUND', 'Account not found.');
      }

      // Re-running against a husk is a no-op rather than an error: a retry after a
      // dropped connection should not tell the user their erasure failed.
      if (user.deletedAt) {
        alreadyErased = true;
        return;
      }

      // ── Refusals, before a single write ───────────────────────────────────────
      // Inside the transaction on purpose. Checking outside it would leave a window
      // in which a host accepts a request between the check and the erasure.
      const blocking = await tx.booking.findMany({
        where: {
          status: 'CONFIRMED',
          checkOut: { gte: ymdToDbDate(todayYmd()) },
          OR: [{ guestId: userId }, { listing: { hostId: userId } }],
        },
        select: { guestId: true, checkOut: true },
      });
      if (blocking.length > 0) {
        throw new AccountDeletionBlockedError(
          'ACTIVE_BOOKING',
          describeBlockingBookings(userId, blocking)
        );
      }

      // Open money, on either side. Same reason it is inside the transaction: an
      // obligation must not be opened between the check and the erasure.
      const obligations = await tx.booking.findMany({
        where: {
          OR: [{ guestId: userId }, { listing: { hostId: userId } }],
          // Everything except the states in which no money was ever in play.
          status: { notIn: ['PENDING', 'REJECTED', 'EXPIRED'] },
        },
        select: {
          id: true,
          reference: true,
          guestId: true,
          status: true,
          damageDepositAmount: true,
          damageDepositStatus: true,
          accommodationRefundAmount: true,
          accommodationRefundStatus: true,
          cancellationSettlementSnapshot: true,
          paymentStatus: true,
          advancePaymentStatus: true,
        },
      });
      const refusals = obligationRefusals(userId, obligations);
      if (refusals.length > 0) {
        throw new AccountDeletionBlockedError(
          'OPEN_OBLIGATION',
          describeOpenObligations(refusals)
        );
      }

      // ── Spend the confirmation link, atomically with the erasure ──────────────
      // `usedAt: null` in the filter is what makes it single-use under concurrency:
      // two simultaneous confirmations both reach here, one updates a row and one
      // updates none, and the loser rolls back without having touched the account.
      if (options.consumeTokenHash) {
        const now = new Date();
        const consumed = await tx.accountDeletionToken.updateMany({
          where: {
            tokenHash: options.consumeTokenHash,
            userId,
            usedAt: null,
            expires: { gt: now },
          },
          data: { usedAt: now },
        });
        if (consumed.count !== 1) {
          throw new AccountDeletionBlockedError(
            'TOKEN_INVALID',
            'This confirmation link is no longer valid. Please request a new one.'
          );
        }
      }

      // Preserve a minimal suppression record after deletion so the address cannot
      // accidentally be re-imported into marketing. Consent evidence remains detached
      // from the deleted account for the applicable limitation period.
      const marketingContact = await tx.marketingContact.findUnique({
        where: { userId },
        include: {
          preferences: { select: { id: true, statementId: true } },
        },
      });
      if (marketingContact) {
        const now = new Date();
        await Promise.all(
          ['EMAIL', 'PUSH'].map((channel) =>
            tx.marketingSuppression.upsert({
              where: {
                contactId_channel: {
                  contactId: marketingContact.id,
                  channel: channel as 'EMAIL' | 'PUSH',
                },
              },
              create: {
                contactId: marketingContact.id,
                channel: channel as 'EMAIL' | 'PUSH',
                reason: 'PRIVACY_OBJECTION',
                source: 'account-deletion',
              },
              update: {
                reason: 'PRIVACY_OBJECTION',
                source: 'account-deletion',
                createdAt: now,
              },
            })
          )
        );
        await tx.marketingPreference.updateMany({
          where: { contactId: marketingContact.id },
          data: { status: 'SUPPRESSED', withdrawnAt: now },
        });
        if (marketingContact.preferences.length) {
          await tx.marketingConsentEvent.createMany({
            data: marketingContact.preferences.map((preference) => ({
              preferenceId: preference.id,
              statementId: preference.statementId,
              action: 'SUPPRESSED',
              source: 'account-deletion',
            })),
          });
        }
        await tx.marketingContact.update({
          where: { id: marketingContact.id },
          data: { userId: null },
        });
        anonymizedRecords['marketingConsent'] = marketingContact.preferences.length;
      }

      // ── Purely personal rows: deleted outright ────────────────────────────────
      // Each of these carries no business, tax or dispute value once its owner is
      // gone. All of them used to disappear through `ON DELETE CASCADE` on the user
      // row; with the row surviving, every one has to be named explicitly, and a
      // relation missed here would be personal data left behind.
      const auditLogs = await tx.auditLog.deleteMany({ where: { userId } });
      // Named as anonymization because that is what it achieves for the audit trail —
      // the entries are dropped rather than detached because they carry the IP address
      // the action came from.
      if (auditLogs.count > 0) anonymizedRecords['auditLogs'] = auditLogs.count;

      deletedRecords['consentRecords'] = (
        await tx.userConsent.deleteMany({ where: { userId } })
      ).count;
      deletedRecords['favorites'] = (await tx.favorite.deleteMany({ where: { userId } })).count;
      deletedRecords['notifications'] = (
        await tx.notification.deleteMany({ where: { userId } })
      ).count;
      deletedRecords['pushTokens'] = (await tx.pushToken.deleteMany({ where: { userId } })).count;
      deletedRecords['communicationPreferences'] = (
        await tx.communicationPreference.deleteMany({ where: { userId } })
      ).count;
      deletedRecords['messageEmailDeliveries'] = (
        await tx.messageEmailDelivery.deleteMany({ where: { recipientId: userId } })
      ).count;
      deletedRecords['conversationMemberships'] = (
        await tx.conversationParticipant.deleteMany({ where: { userId } })
      ).count;
      deletedRecords['reviewInvitations'] = (
        await tx.reviewInvitation.deleteMany({ where: { recipientId: userId } })
      ).count;
      deletedRecords['reviewAdminReads'] = (
        await tx.reviewAdminRead.deleteMany({ where: { adminId: userId } })
      ).count;

      // ── Content that stays, with its author detached ──────────────────────────
      // Every column below is already nullable with `onDelete: SetNull`, so the schema
      // was always designed for the author to disappear from under the record. The
      // records themselves are the other party's history — a guest's chat thread, a
      // host's review, an admin's moderation trail — and are not this user's to erase.
      const nulled = async (label: string, count: Promise<{ count: number }>) => {
        const { count: n } = await count;
        if (n > 0) anonymizedRecords[label] = (anonymizedRecords[label] ?? 0) + n;
      };

      await nulled(
        'listingReports',
        tx.listingReport.updateMany({ where: { reporterId: userId }, data: { reporterId: null } })
      );
      await nulled(
        'reviewedListingReports',
        tx.listingReport.updateMany({
          where: { reviewedById: userId },
          data: { reviewedById: null },
        })
      );
      await nulled(
        'reviewedSuggestions',
        tx.suggestion.updateMany({ where: { reviewedById: userId }, data: { reviewedById: null } })
      );
      // Payment-instruction messages can contain account numbers and other reusable
      // payment coordinates. Redact their body before detaching the sender; after the
      // senderId becomes null there is no reliable way to identify which erased host
      // supplied that private text.
      const redactedPaymentMessages = await tx.message.updateMany({
        where: { senderId: userId, kind: 'PAYMENT_INSTRUCTIONS' },
        data: {
          body: 'Payment details removed after account deletion',
          deletedAt: new Date(),
        },
      });
      if (redactedPaymentMessages.count > 0) {
        anonymizedRecords['paymentInstructionMessages'] =
          redactedPaymentMessages.count;
      }
      await nulled(
        'messages',
        tx.message.updateMany({ where: { senderId: userId }, data: { senderId: null } })
      );
      await nulled(
        'conversations',
        tx.conversation.updateMany({ where: { startedById: userId }, data: { startedById: null } })
      );
      await nulled(
        'conversations',
        tx.conversation.updateMany({
          where: { inquiryGuestId: userId },
          data: { inquiryGuestId: null },
        })
      );
      await nulled(
        'bookingTimelineEvents',
        tx.bookingTimelineEvent.updateMany({ where: { actorId: userId }, data: { actorId: null } })
      );
      await nulled(
        'bookingPaymentStatusEvents',
        tx.bookingPaymentStatusEvent.updateMany({
          where: { actorId: userId },
          data: { actorId: null },
        })
      );
      await nulled(
        'bookingPaymentPrivateRecords',
        tx.bookingPaymentPrivateRecord.updateMany({
          where: { reporterId: userId },
          data: {
            reporterId: null,
            reference: null,
            note: null,
            retainedReason: null,
          },
        })
      );
      deletedRecords['bookingPaymentReminders'] = (
        await tx.bookingPaymentReminderDelivery.deleteMany({
          where: { recipientId: userId },
        })
      ).count;
      await nulled(
        'damageReports',
        tx.damageReport.updateMany({ where: { reporterId: userId }, data: { reporterId: null } })
      );
      await nulled(
        'safetyCases',
        tx.safetyCase.updateMany({
          where: { reportedUserId: userId },
          data: { reportedUserId: null },
        })
      );
      await nulled(
        'safetyCases',
        tx.safetyCase.updateMany({
          where: { assignedAdminId: userId },
          data: { assignedAdminId: null },
        })
      );
      await nulled(
        'safetyCaseUpdates',
        tx.safetyCaseUpdate.updateMany({ where: { authorId: userId }, data: { authorId: null } })
      );
      await nulled(
        'reviewsWritten',
        tx.review.updateMany({ where: { authorId: userId }, data: { authorId: null } })
      );
      await nulled(
        'reviewsReceived',
        tx.review.updateMany({ where: { subjectUserId: userId }, data: { subjectUserId: null } })
      );
      await nulled(
        'moderatedReviews',
        tx.review.updateMany({ where: { approvedById: userId }, data: { approvedById: null } })
      );
      await nulled(
        'contactMessages',
        tx.contactMessage.updateMany({ where: { userId }, data: { userId: null } })
      );

      // ── Listings: archived, kept, owner anonymized ────────────────────────────
      // Archiving takes them off the marketplace. The rows stay because a listing is
      // the other end of every booking record being retained; the host identity on
      // them is emptied by the user write at the bottom of this transaction.
      const listingCount = await tx.listing.count({ where: { hostId: userId } });
      if (listingCount > 0) {
        await tx.listing.updateMany({
          where: { hostId: userId },
          data: {
            status: 'ARCHIVED',
            // Reusable private payment destinations are personal data and no longer
            // have an owner after erasure.
            paymentInstructionTemplates: Prisma.DbNull,
            paymentMethodOther: null,
          },
        });
        anonymizedRecords['listings'] = listingCount;
        const privateRequests = await tx.bookingPaymentRequest.updateMany({
          where: { booking: { listing: { hostId: userId } } },
          data: { instructionsSnapshot: Prisma.DbNull },
        });
        if (privateRequests.count > 0) {
          anonymizedRecords['bookingPaymentRequests'] = privateRequests.count;
        }
        const legacyBookingSnapshots = await tx.booking.updateMany({
          where: { listing: { hostId: userId } },
          data: { paymentInstructionsSnapshot: Prisma.DbNull },
        });
        if (legacyBookingSnapshots.count > 0) {
          anonymizedRecords['bookingPaymentInstructionSnapshots'] =
            legacyBookingSnapshots.count;
        }
      }

      // ── Bookings: history kept, guest identity and free text removed ──────────
      // Pending *guest* requests are withdrawn — the person asking to be erased is
      // the one who made them, and leaving them live would ask a host to accept a
      // reservation for somebody who no longer exists. The availability hold goes
      // with them, exactly as `cancelBooking` releases it.
      //
      // Pending requests *at this user's listings* are deliberately left alone. They
      // expire on `responseDueAt` through the normal sweep, which sends the guest the
      // expiry mail they would otherwise never get.
      const pendingGuestBookings = await tx.booking.findMany({
        where: { guestId: userId, status: 'PENDING' },
        select: { id: true },
      });
      if (pendingGuestBookings.length > 0) {
        const ids = pendingGuestBookings.map((booking) => booking.id);
        await tx.booking.updateMany({
          where: { id: { in: ids } },
          data: {
            status: 'CANCELLED_BY_GUEST',
            cancellationReason: 'Guest account deleted',
          },
        });
        // The host keeps a booking whose status says the guest cancelled it, so the
        // history has to say the same — written here, in the erasure's own transaction,
        // because nothing else on this path will ever announce it. No actor id: this
        // guest's id is being erased a few statements from now, and the timeline rows
        // pointing at it were nulled above. The role is what survives, and it is the
        // part a host reading this months later actually needs.
        for (const bookingId of ids) {
          await recordBookingTimelineEvent(tx, {
            bookingId,
            type: 'CANCELLED_BY_GUEST',
            actor: { role: 'GUEST' },
            data: { reason: 'ACCOUNT_DELETION' },
          });
        }
        await tx.availabilityBlock.deleteMany({
          where: { bookingId: { in: ids }, blockType: 'BOOKING_HOLD' },
        });
      }
      anonymizedRecords['bookingsCancelled'] = pendingGuestBookings.length;

      // The dates, amounts and statuses are the record being retained; the note is
      // free text the guest wrote about themselves ("arriving late, call me on …")
      // and has no retention justification once the stay is over.
      const bookingCount = await tx.booking.count({ where: { guestId: userId } });
      if (bookingCount > 0) {
        await tx.booking.updateMany({
          where: { guestId: userId, guestNote: { not: null } },
          data: { guestNote: null },
        });
        anonymizedRecords['bookings'] = bookingCount;
      }

      // ── Profile, credentials and sessions ─────────────────────────────────────
      const profile = await tx.profile.findUnique({
        where: { userId },
        select: { avatarUrl: true },
      });
      deletedRecords['profiles'] = (await tx.profile.deleteMany({ where: { userId } })).count;
      deletedRecords['sessions'] = (await tx.session.deleteMany({ where: { userId } })).count;
      // Removes the Google linkage, so the provider can no longer resolve to this row.
      deletedRecords['accounts'] = (await tx.account.deleteMany({ where: { userId } })).count;

      // 10. Record the uploads this erasure is about to strand.
      // Listing drafts used to disappear through `ListingDraft.host`'s cascade, taking
      // their photos off every index without any draft-delete path running. The user
      // row now survives, so the drafts are deleted here explicitly — after their URLs
      // have been read off them, and in the same transaction, so a rollback queues
      // nothing and a crash after the commit still leaves the files discoverable.
      // The two avatar fields join them: they are pictures of the person, and nothing
      // else was ever going to unlink them.
      //
      // Nothing is unlinked here: the reference sweep runs per file afterwards, so a
      // photo also held by a published listing, another host's draft, an avatar or a
      // case attachment survives.
      queuedUploads = [
        ...(await enqueueUserDraftUploads(tx, userId)),
        ...(await enqueueUploadDeletions(
          tx,
          [user.image, profile?.avatarUrl].filter((url): url is string => Boolean(url)),
          'account-deletion'
        )),
      ];
      deletedRecords['listingDrafts'] = (
        await tx.listingDraft.deleteMany({ where: { hostId: userId } })
      ).count;

      // ── Finally, the account itself ───────────────────────────────────────────
      // Not a delete. Everything identifying is overwritten in one statement, and the
      // row is left as a key that the retained bookings and listings can keep pointing
      // at. `isActive: false` is what the sign-in callback checks, so the husk cannot
      // be signed into even with a live Google session; `email` moves to an unroutable
      // placeholder, which also releases the real address for a future signup.
      await tx.user.update({
        where: { id: userId },
        data: {
          email: erasedEmailFor(userId),
          name: ERASED_USER_NAME,
          image: null,
          locale: null,
          displayCurrency: null,
          emailVerified: null,
          isActive: false,
          isHost: false,
          deletedAt: new Date(),
        },
      });
      anonymizedRecords['user'] = 1;

      // Every confirmation link for this account, spent or not. Keeping them would
      // leave rows keyed to a husk, and the one just consumed has nothing left to do.
      deletedRecords['deletionTokens'] = (
        await tx.accountDeletionToken.deleteMany({ where: { userId } })
      ).count;
    }, { isolationLevel: 'Serializable', timeout: 20_000 });

    // After the commit, never inside it: unlinking a file cannot be rolled back, and a
    // failure here must not undo an erasure the user is legally owed.
    if (queuedUploads.length > 0) {
      const cleanup = await sweepUploads(queuedUploads, `account-deletion:${userId}`);
      deletedRecords['draftUploads'] = cleanup.deleted;
    }

    return {
      success: true,
      alreadyErased,
      deletedRecords,
      anonymizedRecords,
    };
  } catch (error) {
    // A refusal is the user's answer, not a fault: pass it through untouched rather
    // than burying "you have a guest arriving on Friday" under a support message.
    if (error instanceof AccountDeletionBlockedError) throw error;
    console.error('Error deleting user account:', error);
    throw new Error('Failed to delete user account. Contact support for assistance.');
  }
}

/**
 * Automatic data deletion based on retention policies
 * Call this via a scheduled job (e.g., nightly cron)
 */
export async function runDataRetentionCleanup(): Promise<{
  deletedRecords: Record<string, number>;
  cleanedUp: boolean;
}> {
  const deletedRecords: Record<string, number> = {};
  const now = new Date();

  try {
    await db.$transaction(async (tx) => {
      // 1. Delete old listing views (older than 14 months - analytics retention)
      const viewsCutoff = new Date(now);
      viewsCutoff.setMonth(viewsCutoff.getMonth() - 14);
      const viewsDeleted = await tx.listingView.deleteMany({
        where: {
          createdAt: { lt: viewsCutoff },
        },
      });
      deletedRecords['oldListingViews'] = viewsDeleted.count;

      // 2. Delete old verification tokens (older than 7 days)
      const tokensCutoff = new Date(now);
      tokensCutoff.setDate(tokensCutoff.getDate() - 7);
      const tokensDeleted = await tx.verificationToken.deleteMany({
        where: {
          expires: { lt: tokensCutoff },
        },
      });
      deletedRecords['expiredTokens'] = tokensDeleted.count;

      // 3. Delete read notifications after one year. Unread records remain so a user
      // does not lose important booking activity simply because it is old.
      const notificationCutoff = new Date(now);
      notificationCutoff.setFullYear(notificationCutoff.getFullYear() - 1);
      const notificationsDeleted = await tx.notification.deleteMany({
        where: {
          readAt: { not: null },
          createdAt: { lt: notificationCutoff },
        },
      });
      deletedRecords['oldReadNotifications'] = notificationsDeleted.count;

      // 4. Anonymize very old audit logs (older than 2 years but keep count)
      const auditCutoff = new Date(now);
      auditCutoff.setFullYear(auditCutoff.getFullYear() - 2);
      const oldAuditLogs = await tx.auditLog.findMany({
        where: {
          createdAt: { lt: auditCutoff },
        },
        select: { id: true },
      });
      if (oldAuditLogs.length > 0) {
        await tx.auditLog.deleteMany({
          where: {
            id: { in: oldAuditLogs.map((log) => log.id) },
          },
        });
        deletedRecords['oldAuditLogs'] = oldAuditLogs.length;
      }

      // 5. Delete inactive user accounts (no login for 2 years, with backup data)
      const inactiveCutoff = new Date(now);
      inactiveCutoff.setFullYear(inactiveCutoff.getFullYear() - 2);
      const inactiveUsers = await tx.user.findMany({
        where: {
          updatedAt: { lt: inactiveCutoff },
          isActive: true,
          role: 'USER', // Don't delete admins
        },
        select: { id: true },
      });

      // Note: You would want to send email notification before actually deleting
      // For now, just mark as inactive
      if (inactiveUsers.length > 0) {
        await tx.user.updateMany({
          where: {
            id: { in: inactiveUsers.map((u) => u.id) },
          },
          data: { isActive: false },
        });
        deletedRecords['deactivatedInactiveUsers'] = inactiveUsers.length;
      }
    });

    // Outside the transaction, and last: unlinking a file cannot be rolled back. This is
    // the retry the cleanup outbox depends on — anything a crash or a locked file left
    // queued gets another attempt on every nightly run, and the sweep is idempotent, so
    // running it repeatedly can only converge.
    const uploads = await processPendingUploadDeletions();
    deletedRecords['pendingUploadsDeleted'] = uploads.deleted;
    deletedRecords['pendingUploadsKept'] = uploads.kept;
    deletedRecords['pendingUploadsStillQueued'] = uploads.failed;

    return {
      deletedRecords,
      cleanedUp: true,
    };
  } catch (error) {
    console.error('Error running data retention cleanup:', error);
    return {
      deletedRecords,
      cleanedUp: false,
    };
  }
}

/**
 * Get data retention policy for admin review
 */
export function getDataRetentionPolicy() {
  return {
    accountData: {
      retention: '7 years',
      reason: 'Tax compliance and legal records',
      note: 'Deleting an account empties its record rather than removing the row: the name, email, avatar and profile are gone, and what remains is an unnamed key the retained bookings and listings point at',
    },
    bookingRecords: {
      retention: '7 years',
      reason: 'Tax, audit, and dispute resolution',
      note: 'Dates, amounts and statuses are kept; the guest is shown as a deleted user and their booking note is removed',
    },
    listingRecords: {
      retention: '7 years',
      reason: 'The other end of every retained booking',
      note: 'Archived and taken off the marketplace when the host deletes their account; the listing itself is kept because the bookings on it are',
    },
    listingViews: {
      retention: '14 months',
      reason: 'Analytics aggregation window',
      note: 'Aggregated and anonymized after period',
    },
    auditLogs: {
      retention: '2 years',
      reason: 'Security and compliance audit trail',
      note: 'User linkage removed after 2 years',
    },
    sessionData: {
      retention: '24 hours of inactivity',
      reason: 'Active session management',
      note: 'Auto-cleared by browser',
    },
    consentRecords: {
      retention: 'As long as user data retained (7 years)',
      reason: 'Proof of consent for GDPR',
      note: 'Kept with anonymized user indicator',
    },
    chatMessages: {
      retention: 'Booking record retention period',
      reason: 'Guest support and dispute resolution',
      note: 'Sender identity is removed when an account is deleted',
    },
    notifications: {
      retention: '1 year after being read',
      reason: 'In-app activity history',
      note: 'Unread records remain until read or account deletion',
    },
    inactiveAccounts: {
      retention: '2 years',
      reason: 'User account recovery window',
      note: 'Accounts deactivated (not deleted) after 2 years',
    },
  };
}
