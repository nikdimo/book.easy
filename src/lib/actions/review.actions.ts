"use server";

import type { ReviewRatingCategory } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { requireAdmin, requireUser } from "@/lib/auth-helpers";
import {
  moderateReview,
  submitReview,
} from "@/lib/services/review.service";

export async function submitReviewAction(formData: FormData) {
  const user = await requireUser();
  let ratings: Partial<Record<ReviewRatingCategory, number>>;
  try {
    ratings = JSON.parse(String(formData.get("ratings") ?? "{}")) as Partial<
      Record<ReviewRatingCategory, number>
    >;
  } catch {
    return { error: "The ratings could not be read" };
  }

  const bookingId = String(formData.get("bookingId") ?? "");
  try {
    const review = await submitReview({
      bookingId,
      authorId: user.id,
      publicComment: String(formData.get("publicComment") ?? ""),
      privateNote: String(formData.get("privateNote") ?? ""),
      ratings,
    });
    revalidatePath(`/account/bookings/${bookingId}/after-stay`);
    revalidatePath(`/account/bookings/${bookingId}`);
    revalidatePath("/host/bookings");
    revalidatePath("/host/reservations");
    revalidatePath(`/host/reservations/${bookingId}`);
    revalidatePath("/admin/ratings");
    return { success: true, reviewId: review.id };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Could not submit the rating",
    };
  }
}

export async function moderateReviewAction(input: {
  reviewId: string;
  action: "APPROVE" | "REJECT" | "HIDE" | "RESTORE";
  note?: string;
}) {
  const admin = await requireAdmin();
  try {
    const review = await moderateReview({ ...input, adminId: admin.id });
    revalidatePath("/admin/ratings");
    revalidatePath(`/admin/ratings/${review.id}`);
    revalidatePath(`/account/bookings/${review.bookingId}/after-stay`);
    revalidatePath(`/properties/${review.listingId}`);
    return { success: true };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Could not update the rating",
    };
  }
}
