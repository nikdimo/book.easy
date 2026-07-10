"use server";

import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-helpers";
import { createAuditLog } from "@/lib/services/audit.service";
import { cancelBooking } from "@/lib/services/booking.service";
import { revalidatePublicListingCaches } from "@/lib/utils/revalidate-public-listing-caches";
import { revalidatePath } from "next/cache";

export async function approveListing(listingId: string) {
  const admin = await requireAdmin();

  const listing = await db.listing.findUnique({ where: { id: listingId } });
  if (!listing || listing.status !== "PENDING_REVIEW") {
    return { error: "Listing not found or not pending review" };
  }

  await db.listing.update({
    where: { id: listingId },
    data: {
      status: "APPROVED",
      approvedAt: new Date(),
      publishedAt: new Date(),
      moderationNote: null,
    },
  });

  await createAuditLog({
    userId: admin.id,
    action: "listing.approve",
    entityType: "Listing",
    entityId: listingId,
    metadata: { listingTitle: listing.title },
  });

  revalidatePath("/admin/listings");
  revalidatePublicListingCaches();
  return { success: true };
}

export async function rejectListing(listingId: string, reason: string) {
  const admin = await requireAdmin();

  if (!reason) return { error: "Rejection reason is required" };

  const listing = await db.listing.findUnique({ where: { id: listingId } });
  if (!listing || listing.status !== "PENDING_REVIEW") {
    return { error: "Listing not found or not pending review" };
  }

  await db.listing.update({
    where: { id: listingId },
    data: { status: "REJECTED", moderationNote: reason },
  });

  await createAuditLog({
    userId: admin.id,
    action: "listing.reject",
    entityType: "Listing",
    entityId: listingId,
    metadata: { listingTitle: listing.title, reason },
  });

  revalidatePath("/admin/listings");
  return { success: true };
}

export async function suspendListing(listingId: string, reason: string) {
  const admin = await requireAdmin();

  if (!reason) return { error: "Suspension reason is required" };

  const listing = await db.listing.findUnique({ where: { id: listingId } });
  if (!listing || listing.status !== "APPROVED") {
    return { error: "Only approved listings can be suspended" };
  }

  await db.listing.update({
    where: { id: listingId },
    data: { status: "SUSPENDED", moderationNote: reason },
  });

  await createAuditLog({
    userId: admin.id,
    action: "listing.suspend",
    entityType: "Listing",
    entityId: listingId,
    metadata: { listingTitle: listing.title, reason },
  });

  revalidatePath("/admin/listings");
  revalidatePublicListingCaches();
  return { success: true };
}

export async function adminCancelBooking(bookingId: string, reason: string) {
  const admin = await requireAdmin();

  if (!reason) return { error: "Cancellation reason is required" };

  try {
    await cancelBooking(bookingId, admin.id, "admin", reason);

    await createAuditLog({
      userId: admin.id,
      action: "booking.cancel_by_admin",
      entityType: "Booking",
      entityId: bookingId,
      metadata: { reason },
    });

    revalidatePath("/admin/bookings");
    return { success: true };
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : "Failed to cancel" };
  }
}

export async function deactivateUser(userId: string) {
  const admin = await requireAdmin();

  await db.user.update({
    where: { id: userId },
    data: { isActive: false },
  });

  await createAuditLog({
    userId: admin.id,
    action: "user.deactivate",
    entityType: "User",
    entityId: userId,
  });

  revalidatePath("/admin/users");
  return { success: true };
}

export async function reactivateUser(userId: string) {
  const admin = await requireAdmin();

  await db.user.update({
    where: { id: userId },
    data: { isActive: true },
  });

  await createAuditLog({
    userId: admin.id,
    action: "user.reactivate",
    entityType: "User",
    entityId: userId,
  });

  revalidatePath("/admin/users");
  return { success: true };
}
