"use server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-helpers";
import { createAuditLog } from "@/lib/services/audit.service";
import { revalidatePublicListingCaches } from "@/lib/utils/revalidate-public-listing-caches";
import { revalidatePath } from "next/cache";

export async function reportListing(listingId: string, message: string) {
  const session = await auth();

  const listing = await db.listing.findUnique({ where: { id: listingId }, select: { id: true } });
  if (!listing) return { error: "Listing not found" };

  await db.listingReport.create({
    data: {
      listingId,
      reporterId: session?.user?.id ?? null,
      message: message.trim() || null,
    },
  });

  return { success: true };
}

export async function reviewReport(
  reportId: string,
  decision: "dismiss" | "remove_listing",
  reason?: string
) {
  const admin = await requireAdmin();

  const report = await db.listingReport.findUnique({
    where: { id: reportId },
    include: { listing: true },
  });
  if (!report || report.status !== "PENDING") {
    return { error: "Report not found or already reviewed" };
  }

  if (decision === "remove_listing") {
    if (!reason?.trim()) return { error: "Reason is required to remove a listing" };

    if (report.listing.status === "APPROVED") {
      await db.listing.update({
        where: { id: report.listingId },
        data: { status: "SUSPENDED", moderationNote: reason, needsReview: false },
      });
      await createAuditLog({
        userId: admin.id,
        action: "listing.suspend",
        entityType: "Listing",
        entityId: report.listingId,
        metadata: { reason, viaReport: reportId },
      });
      revalidatePublicListingCaches();
    }
  }

  await db.listingReport.update({
    where: { id: reportId },
    data: {
      status: decision === "remove_listing" ? "REVIEWED" : "DISMISSED",
      reviewedById: admin.id,
      reviewedAt: new Date(),
    },
  });

  await createAuditLog({
    userId: admin.id,
    action: decision === "remove_listing" ? "report.remove_listing" : "report.dismiss",
    entityType: "ListingReport",
    entityId: reportId,
  });

  revalidatePath("/admin/reports");
  revalidatePath("/admin/listings");
  return { success: true };
}
