import {
  listAdminReviews,
  moderateReview,
} from "@/lib/services/review.service";
import { mobileJson, mobileOptions, requireMobileAdmin } from "@/lib/mobile-api";

/** Review moderation queue. Both reads and decisions go through review.service, so
 *  the rule that a rejection must carry a reason for the author is enforced there
 *  once rather than restated here. Admin-only. */
export async function OPTIONS(request: Request) {
  return mobileOptions(request);
}

export async function GET(request: Request) {
  const access = await requireMobileAdmin(request);
  if ("response" in access) return access.response;

  const reviews = await listAdminReviews(access.user.id);

  return mobileJson(request, {
    reviews: reviews.map((review) => ({
      id: review.id,
      status: review.status,
      comment: review.publicComment,
      submittedAt: review.submittedAt?.toISOString() ?? null,
      author: review.author
        ? { id: review.author.id, name: review.author.name }
        : null,
      subjectUser: review.subjectUser
        ? { id: review.subjectUser.id, name: review.subjectUser.name }
        : null,
      listing: review.listing
        ? { id: review.listing.id, title: review.listing.title }
        : null,
      // A simple average across the rating dimensions, so the list can show one
      // number without the client needing to know what the categories are.
      averageRating: review.ratings.length
        ? Math.round(
            (review.ratings.reduce((total, entry) => total + entry.score, 0) /
              review.ratings.length) *
              10
          ) / 10
        : null,
      unread: review.adminReads.length === 0,
    })),
  });
}

export async function POST(request: Request) {
  const access = await requireMobileAdmin(request);
  if ("response" in access) return access.response;

  const body = (await request.json().catch(() => null)) as {
    reviewId?: string;
    action?: "APPROVE" | "REJECT" | "HIDE" | "RESTORE";
    note?: string;
  } | null;
  if (!body?.reviewId || !body.action) {
    return mobileJson(request, { error: "Review and action are required" }, { status: 400 });
  }

  try {
    await moderateReview({
      reviewId: body.reviewId,
      adminId: access.user.id,
      action: body.action,
      note: body.note,
    });
    return mobileJson(request, { success: true });
  } catch (error) {
    // moderateReview throws for a missing review and for a rejection with no
    // reason; both are the admin's problem to fix, not a server fault.
    return mobileJson(
      request,
      { error: error instanceof Error ? error.message : "Could not moderate review" },
      { status: 400 }
    );
  }
}
