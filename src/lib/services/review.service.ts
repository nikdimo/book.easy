import "server-only";

import {
  Prisma,
  type ReviewDirection,
  type ReviewRatingCategory,
  type ReviewReminderStage,
  type ReviewStatus,
} from "@prisma/client";
import { db } from "@/lib/db";
import {
  addDaysToYmd,
  marketplaceYmd,
  ymdToDbDate,
} from "@/lib/utils/date-only";
import {
  REVIEW_WINDOW_DAYS,
  reviewWindowForBooking,
  reviewWindowOpensAt,
} from "@/lib/services/review-window";
import { createAuditLog } from "@/lib/services/audit.service";
import { createUserNotification } from "@/lib/services/notification.service";

export const GUEST_REVIEW_CATEGORIES = [
  "OVERALL",
  "CLEANLINESS",
  "ACCURACY",
  "CHECK_IN",
  "COMMUNICATION",
  "LOCATION",
  "VALUE",
] as const satisfies readonly ReviewRatingCategory[];

export const HOST_REVIEW_CATEGORIES = [
  "OVERALL",
  "CLEANLINESS",
  "COMMUNICATION",
  "HOUSE_RULES",
] as const satisfies readonly ReviewRatingCategory[];

/**
 * When this stay's review window opens and closes, from the booking alone.
 *
 * Re-exported rather than reimplemented: `review-window.ts` is the single rule that
 * completion, invitations, this page's context, submission and publication all read.
 * Callers that already hold a stored invitation must prefer *its* deadline — see
 * `deadlineForDirection`.
 */
export { reviewWindowForBooking, reviewWindowOpensAt } from "@/lib/services/review-window";

/** The fields the window rule needs, wherever a booking is selected for it. */
const reviewWindowSelect = {
  checkOut: true,
  houseRulesSnapshot: true,
} as const;

/**
 * The deadline that governs one direction of one booking.
 *
 * A stored invitation is authoritative. Its `deadline` column was written when the
 * window opened and is what the recipient was told, in the notification and in the
 * email; recomputing it would let a later change to the rule — or to the listing's
 * checkout time — silently move a deadline someone is already counting on. Only a
 * direction with no invitation yet falls back to the computed window.
 */
async function deadlineForDirection(
  booking: { id: string; checkOut: Date; houseRulesSnapshot?: unknown },
  direction: ReviewDirection,
): Promise<Date> {
  const invitation = await db.reviewInvitation.findUnique({
    where: { bookingId_direction: { bookingId: booking.id, direction } },
    select: { deadline: true },
  });
  return invitation?.deadline ?? reviewWindowForBooking(booking).deadline;
}

function cleanReviewText(value: string, label: string, min: number, max: number) {
  const cleaned = value.trim();
  if (cleaned.length < min) throw new Error(`${label} must be at least ${min} characters`);
  if (cleaned.length > max) throw new Error(`${label} must be ${max} characters or fewer`);
  return cleaned;
}

function directionForUser(booking: {
  guestId: string;
  listing: { hostId: string };
}, userId: string): ReviewDirection | null {
  if (booking.guestId === userId) return "GUEST_TO_HOST";
  if (booking.listing.hostId === userId) return "HOST_TO_GUEST";
  return null;
}

function expectedCategories(direction: ReviewDirection) {
  return direction === "GUEST_TO_HOST"
    ? GUEST_REVIEW_CATEGORIES
    : HOST_REVIEW_CATEGORIES;
}

function validateRatings(
  direction: ReviewDirection,
  ratings: Partial<Record<ReviewRatingCategory, number>>
) {
  const expected = expectedCategories(direction);
  const entries = expected.map((category) => {
    const score = ratings[category];
    if (!Number.isInteger(score) || Number(score) < 1 || Number(score) > 5) {
      throw new Error(`Choose a rating from 1 to 5 for ${category.toLowerCase().replaceAll("_", " ")}`);
    }
    return { category, score: Number(score) };
  });
  return entries;
}

async function getEligibleBooking(bookingId: string, userId: string) {
  // A direct link to the after-stay flow must not depend on a scheduler having run.
  // The sweep is idempotent and guarded, so running it here costs one indexed read on
  // the overwhelming majority of visits and is the whole difference between "your stay
  // ended an hour ago" and "Ratings open after the stay is completed" (L7). The booking
  // is read *after* it, never before, or the status below would be the stale one.
  const { completePastBookings } = await import("@/lib/services/booking.service");
  const now = new Date();
  await completePastBookings(now);

  const booking = await db.booking.findUnique({
    where: { id: bookingId },
    select: {
      id: true,
      reference: true,
      status: true,
      guestId: true,
      checkIn: true,
      ...reviewWindowSelect,
      totalPrice: true,
      currency: true,
      displayCurrency: true,
      displayTotal: true,
      guest: { select: { id: true, name: true, email: true, image: true } },
      listing: {
        select: {
          id: true,
          title: true,
          hostId: true,
          host: { select: { id: true, name: true, email: true, image: true } },
          property: { select: { city: true, area: true } },
          images: {
            where: { isPrimary: true },
            take: 1,
            select: { url: true, alt: true },
          },
        },
      },
    },
  });
  if (!booking || !directionForUser(booking, userId)) {
    throw new Error("Completed stay not found");
  }
  // Do not trust status alone. Rows completed by the old midnight rule, imported
  // history, or an administrative correction can already say COMPLETED before this
  // booking's frozen checkout time. The review window itself still starts at checkout.
  if (
    booking.status !== "COMPLETED" ||
    reviewWindowOpensAt(booking).getTime() > now.getTime()
  ) {
    throw new Error("Ratings open after the stay is completed");
  }
  return booking;
}

export async function ensureReviewInvitationsForBooking(
  bookingId: string,
  now = new Date(),
) {
  const booking = await db.booking.findUnique({
    where: { id: bookingId },
    select: {
      id: true,
      status: true,
      ...reviewWindowSelect,
      guestId: true,
      listing: { select: { hostId: true } },
    },
  });
  if (
    !booking ||
    booking.status !== "COMPLETED" ||
    reviewWindowOpensAt(booking).getTime() > now.getTime()
  ) {
    return [];
  }

  // Fourteen full days from the moment the stay actually ended. Written once, on the
  // run that creates the row: `skipDuplicates` below means a booking that already has
  // invitations keeps the deadline it was given, so no rerun and no later change to
  // this rule rewrites a deadline a guest or host has already been told.
  const deadline = reviewWindowForBooking(booking).deadline;
  await db.reviewInvitation.createMany({
    data: [
      {
        bookingId,
        recipientId: booking.guestId,
        direction: "GUEST_TO_HOST",
        deadline,
      },
      {
        bookingId,
        recipientId: booking.listing.hostId,
        direction: "HOST_TO_GUEST",
        deadline,
      },
    ],
    skipDuplicates: true,
  });

  const invitations = await db.reviewInvitation.findMany({ where: { bookingId } });
  await Promise.allSettled(
    invitations.map((invitation) =>
      sendReviewReminder(invitation.id, "INVITATION")
    )
  );
  return invitations;
}

async function sendReviewReminder(
  invitationId: string,
  stage: ReviewReminderStage
) {
  const invitation = await db.reviewInvitation.findUnique({
    where: { id: invitationId },
    include: {
      recipient: { select: { id: true, name: true, email: true } },
      booking: {
        select: {
          id: true,
          guestId: true,
          listing: { select: { title: true, hostId: true } },
          reviews: { select: { direction: true } },
        },
      },
    },
  });
  if (!invitation) return false;
  if (invitation.booking.reviews.some((review) => review.direction === invitation.direction)) {
    return false;
  }
  if (invitation.deadline <= new Date()) return false;

  try {
    await db.reviewInvitationReminder.create({
      data: { invitationId, stage },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return false;
    }
    throw error;
  }

  const waiting = stage === "OTHER_PARTY_SUBMITTED";
  const title = waiting ? "A private rating is waiting" : "Rate your completed stay";
  const body = waiting
    ? `Submit your rating for ${invitation.booking.listing.title} to unlock both after approval.`
    : `Share your experience at ${invitation.booking.listing.title} before the review window closes.`;
  const route = `/account/bookings/${invitation.booking.id}/after-stay`;

  await createUserNotification({
    userId: invitation.recipientId,
    type: waiting ? "REVIEW_SUBMITTED" : "REVIEW_INVITATION",
    title,
    body,
    route,
    data: {
      bookingId: invitation.booking.id,
      direction: invitation.direction,
      deadline: invitation.deadline.toISOString(),
    },
  });

  void import("@/lib/email")
    .then(({ notifyReviewReminder }) =>
      notifyReviewReminder({
        invitationId,
        waitingForYourReview: waiting,
      })
    )
    .catch(() => {});
  return true;
}

export async function processDueReviewReminders(now = new Date()) {
  const unpublishedExpired = await db.review.findMany({
    where: {
      status: "APPROVED",
      publishedAt: null,
      reviewDeadline: { lte: now },
    },
    distinct: ["bookingId"],
    select: { bookingId: true },
  });
  await Promise.allSettled(
    unpublishedExpired.map((review) =>
      publishEligibleReviewsForBooking(review.bookingId)
    )
  );

  // Backfill invitations for stays that were completed before this scheduler was
  // deployed. Newly created invitations receive only the opening email on this run.
  const missingInvitationBookings = await db.booking.findMany({
    where: {
      status: "COMPLETED",
      // `checkOut` is `@db.Date`: a calendar column, so the backfill window is
      // bounded by calendar days rather than by the instant this sweep happens to run
      // at, which slid the boundary by up to a day with the server's zone.
      checkOut: {
        gte: ymdToDbDate(addDaysToYmd(marketplaceYmd(now), -REVIEW_WINDOW_DAYS)),
        lte: ymdToDbDate(marketplaceYmd(now)),
      },
      reviewInvitations: { none: {} },
    },
    select: { id: true },
  });
  const justCreatedBookingIds = new Set(
    missingInvitationBookings.map((booking) => booking.id)
  );
  await Promise.allSettled(
    missingInvitationBookings.map((booking) =>
      ensureReviewInvitationsForBooking(booking.id, now)
    )
  );

  const invitations = await db.reviewInvitation.findMany({
    where: {
      deadline: { gt: now },
    },
    include: {
      booking: { select: { reviews: { select: { direction: true } } } },
    },
  });

  let sent = 0;
  for (const invitation of invitations) {
    if (justCreatedBookingIds.has(invitation.bookingId)) continue;
    if (invitation.booking.reviews.some((review) => review.direction === invitation.direction)) {
      continue;
    }
    const remainingHours = (invitation.deadline.getTime() - now.getTime()) / 3_600_000;
    const elapsedDays = (now.getTime() - invitation.createdAt.getTime()) / 86_400_000;
    const stage: ReviewReminderStage | null =
      remainingHours <= 24
        ? "HOURS_24"
        : remainingHours <= 48
          ? "HOURS_48"
          : elapsedDays >= 7
            ? "DAY_7"
            : elapsedDays >= 3
              ? "DAY_3"
              : null;
    if (stage && (await sendReviewReminder(invitation.id, stage))) sent += 1;
  }
  return sent;
}

export async function getPostStayReviewContext(bookingId: string, userId: string) {
  const booking = await getEligibleBooking(bookingId, userId);
  await ensureReviewInvitationsForBooking(booking.id);
  const direction = directionForUser(booking, userId)!;
  const deadline = await deadlineForDirection(booking, direction);
  const [ownReview, otherReview] = await Promise.all([
    db.review.findUnique({
      where: { bookingId_direction: { bookingId, direction } },
      include: { ratings: true },
    }),
    db.review.findUnique({
      where: {
        bookingId_direction: {
          bookingId,
          direction: direction === "GUEST_TO_HOST" ? "HOST_TO_GUEST" : "GUEST_TO_HOST",
        },
      },
      include: {
        ratings: true,
        author: { select: { name: true, image: true } },
      },
    }),
  ]);

  return {
    booking,
    direction,
    deadline,
    ownReview,
    otherPartySubmitted: Boolean(otherReview),
    otherReview: otherReview?.publishedAt ? otherReview : null,
  };
}

export async function submitReview(input: {
  bookingId: string;
  authorId: string;
  publicComment: string;
  privateNote?: string;
  ratings: Partial<Record<ReviewRatingCategory, number>>;
}) {
  const booking = await getEligibleBooking(input.bookingId, input.authorId);
  const direction = directionForUser(booking, input.authorId)!;
  // The invitation's own deadline when there is one — the same instant the recipient
  // was shown — and the computed window only for a direction never invited.
  const deadline = await deadlineForDirection(booking, direction);
  if (deadline <= new Date()) throw new Error("The 14-day rating window has closed");

  const ratings = validateRatings(direction, input.ratings);
  const publicComment = cleanReviewText(input.publicComment, "Public review", 10, 2000);
  const privateNote = input.privateNote?.trim()
    ? cleanReviewText(input.privateNote, "Private note", 2, 2000)
    : undefined;
  const subjectUserId =
    direction === "GUEST_TO_HOST" ? booking.listing.hostId : booking.guestId;

  let review;
  try {
    review = await db.review.create({
      data: {
        bookingId: booking.id,
        listingId: booking.listing.id,
        authorId: input.authorId,
        subjectUserId,
        direction,
        publicComment,
        privateNote,
        reviewDeadline: deadline,
        ratings: { create: ratings },
      },
      include: { ratings: true },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new Error("You have already submitted a rating for this stay");
    }
    throw error;
  }

  const admins = await db.user.findMany({
    where: { role: "ADMIN", isActive: true },
    select: { id: true },
  });
  await Promise.allSettled([
    ...admins.map((admin) =>
      createUserNotification({
        userId: admin.id,
        type: "REVIEW_SUBMITTED",
        title: "Rating awaiting approval",
        body: `${booking.listing.title} · ${booking.id.slice(0, 8).toUpperCase()}`,
        route: `/admin/ratings/${review.id}`,
        data: { reviewId: review.id, bookingId: booking.id },
      })
    ),
    notifyOtherPartyReviewSubmitted(booking.id, direction),
  ]);

  void import("@/lib/email")
    .then(({ notifyReviewSubmitted }) => notifyReviewSubmitted({ reviewId: review.id }))
    .catch(() => {});
  return review;
}

async function notifyOtherPartyReviewSubmitted(
  bookingId: string,
  submittedDirection: ReviewDirection
) {
  const otherDirection: ReviewDirection =
    submittedDirection === "GUEST_TO_HOST" ? "HOST_TO_GUEST" : "GUEST_TO_HOST";
  const invitation = await db.reviewInvitation.findUnique({
    where: { bookingId_direction: { bookingId, direction: otherDirection } },
  });
  if (invitation) {
    await sendReviewReminder(invitation.id, "OTHER_PARTY_SUBMITTED");
  }
}

async function publishEligibleReviewsForBooking(bookingId: string) {
  const reviews = await db.review.findMany({
    where: { bookingId },
    select: {
      id: true,
      status: true,
      publishedAt: true,
      reviewDeadline: true,
      authorId: true,
      subjectUserId: true,
      listing: { select: { title: true } },
    },
  });
  if (!reviews.length || reviews.some((review) => review.status === "PENDING_ADMIN")) {
    return [];
  }
  const deadlinePassed = reviews[0]!.reviewDeadline <= new Date();
  if (reviews.length < 2 && !deadlinePassed) return [];

  const publishable = reviews.filter(
    (review) => review.status === "APPROVED" && !review.publishedAt
  );
  if (!publishable.length) return [];
  const publishedAt = new Date();
  await db.review.updateMany({
    where: { id: { in: publishable.map((review) => review.id) } },
    data: { publishedAt },
  });

  await Promise.allSettled(
    publishable.flatMap((review) => {
      const userIds = [...new Set([review.authorId, review.subjectUserId].filter(Boolean))] as string[];
      return userIds.map((userId) =>
        createUserNotification({
          userId,
          type: "REVIEW_PUBLISHED",
          title: "Rating published",
          body: `The rating for ${review.listing.title} is now available.`,
          route: `/account/bookings/${bookingId}/after-stay`,
          data: { reviewId: review.id, bookingId },
        })
      );
    })
  );
  void import("@/lib/email")
    .then(({ notifyReviewsPublished }) => notifyReviewsPublished({ bookingId }))
    .catch(() => {});
  return publishable.map((review) => review.id);
}

export async function moderateReview(input: {
  reviewId: string;
  adminId: string;
  action: "APPROVE" | "REJECT" | "HIDE" | "RESTORE";
  note?: string;
}) {
  const existing = await db.review.findUnique({
    where: { id: input.reviewId },
    select: { id: true, bookingId: true, authorId: true, status: true, publishedAt: true },
  });
  if (!existing) throw new Error("Rating not found");
  const note = input.note?.trim();
  if (input.action === "REJECT" && !note) {
    throw new Error("Give the author a reason for rejecting the review");
  }

  const now = new Date();
  const data =
    input.action === "APPROVE"
      ? {
          status: "APPROVED" as ReviewStatus,
          approvedAt: now,
          approvedById: input.adminId,
          rejectedAt: null,
          hiddenAt: null,
          moderationNote: note || null,
        }
      : input.action === "REJECT"
        ? {
            status: "REJECTED" as ReviewStatus,
            rejectedAt: now,
            publishedAt: null,
            moderationNote: note!,
          }
        : input.action === "HIDE"
          ? {
              status: "HIDDEN" as ReviewStatus,
              hiddenAt: now,
              publishedAt: null,
              moderationNote: note || "Hidden by an administrator",
            }
          : {
              status: "APPROVED" as ReviewStatus,
              hiddenAt: null,
              approvedAt: now,
              approvedById: input.adminId,
              moderationNote: note || null,
            };

  const review = await db.review.update({ where: { id: input.reviewId }, data });
  await markReviewRead(input.reviewId, input.adminId);
  await createAuditLog({
    userId: input.adminId,
    action: `review.${input.action.toLowerCase()}`,
    entityType: "Review",
    entityId: input.reviewId,
    metadata: { previousStatus: existing.status, note: note || null },
  });

  if (input.action === "REJECT" && existing.authorId) {
    await createUserNotification({
      userId: existing.authorId,
      type: "REVIEW_REJECTED",
      title: "Your review needs attention",
      body: note!,
      route: `/account/bookings/${existing.bookingId}/after-stay`,
      data: { reviewId: existing.id, bookingId: existing.bookingId },
    });
    void import("@/lib/email")
      .then(({ notifyReviewRejected }) =>
        notifyReviewRejected({ reviewId: existing.id, reason: note! })
      )
      .catch(() => {});
  }

  if (input.action === "APPROVE" || input.action === "REJECT" || input.action === "RESTORE") {
    await publishEligibleReviewsForBooking(existing.bookingId);
  }
  return review;
}

export async function markReviewRead(reviewId: string, adminId: string) {
  await db.reviewAdminRead.upsert({
    where: { reviewId_adminId: { reviewId, adminId } },
    create: { reviewId, adminId },
    update: { readAt: new Date() },
  });
}

export function getUnreadReviewCount(adminId: string) {
  return db.review.count({
    where: {
      status: "PENDING_ADMIN",
      adminReads: { none: { adminId } },
    },
  });
}

export function getPendingCaseCount() {
  return db.safetyCase.count({
    where: { status: { in: ["SUBMITTED", "AWAITING_INFORMATION"] } },
  });
}

export function listAdminReviews(adminId: string) {
  return db.review.findMany({
    include: {
      ratings: true,
      author: { select: { id: true, name: true, email: true } },
      subjectUser: { select: { id: true, name: true, email: true } },
      approvedBy: { select: { name: true } },
      booking: { select: { id: true, checkIn: true, checkOut: true } },
      listing: { select: { id: true, title: true, slug: true } },
      adminReads: { where: { adminId }, select: { readAt: true } },
    },
    orderBy: [{ status: "asc" }, { submittedAt: "desc" }],
  });
}

export function getAdminReview(reviewId: string) {
  return db.review.findUnique({
    where: { id: reviewId },
    include: {
      ratings: true,
      author: { select: { id: true, name: true, email: true } },
      subjectUser: { select: { id: true, name: true, email: true } },
      approvedBy: { select: { name: true } },
      booking: {
        select: {
          id: true,
          checkIn: true,
          checkOut: true,
          guestCount: true,
          totalPrice: true,
        },
      },
      listing: { select: { id: true, title: true, slug: true } },
    },
  });
}

export async function getPublishedListingReviews(listingId: string) {
  const reviews = await db.review.findMany({
    where: {
      listingId,
      direction: "GUEST_TO_HOST",
      status: "APPROVED",
      publishedAt: { not: null },
    },
    include: {
      ratings: true,
      author: { select: { name: true, image: true } },
    },
    orderBy: { publishedAt: "desc" },
  });
  const overallScores = reviews
    .map((review) => review.ratings.find((rating) => rating.category === "OVERALL")?.score)
    .filter((score): score is number => typeof score === "number");
  const average =
    overallScores.length > 0
      ? overallScores.reduce((sum, score) => sum + score, 0) / overallScores.length
      : null;
  return { reviews, average, count: reviews.length };
}
