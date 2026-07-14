"use server";

import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { requireAdmin } from "@/lib/auth-helpers";
import { createAuditLog } from "@/lib/services/audit.service";
import { PROPERTY_TYPES_TAG } from "@/lib/services/property-type.service";
import { AMENITIES_TAG } from "@/lib/services/amenity.service";
import { uniquePropertyTypeValue } from "@/lib/utils/property-type";
import { revalidateTag, revalidatePath } from "next/cache";

export async function createSuggestion(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id || !session.user.isHost) {
    return { error: "Not authorized" };
  }

  const kind = formData.get("kind");
  const label = String(formData.get("label") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim() || null;
  const listingId = String(formData.get("listingId") ?? "").trim() || null;

  if (kind !== "PROPERTY_TYPE" && kind !== "AMENITY") {
    return { error: "Invalid suggestion type" };
  }
  if (label.length < 2) {
    return { error: "Please enter a name for what's missing" };
  }

  if (listingId) {
    const owns = await db.listing.findFirst({
      where: { id: listingId, hostId: session.user.id },
      select: { id: true },
    });
    if (!owns) return { error: "Listing not found" };
  }

  await db.suggestion.create({
    data: {
      kind,
      label,
      note,
      listingId,
      hostId: session.user.id,
    },
  });

  revalidatePath("/admin/settings");
  return { success: true };
}

export async function reviewSuggestion(
  suggestionId: string,
  input: {
    decision: "APPROVED" | "REJECTED";
    label?: string;
    category?: string;
    scope?: "GLOBAL" | "LISTING_ONLY";
    adminNote?: string;
  }
) {
  const admin = await requireAdmin();

  const suggestion = await db.suggestion.findUnique({
    where: { id: suggestionId },
  });
  if (!suggestion || suggestion.status !== "PENDING") {
    return { error: "Suggestion not found or already reviewed" };
  }

  if (input.decision === "REJECTED") {
    await db.suggestion.update({
      where: { id: suggestionId },
      data: {
        status: "REJECTED",
        reviewedById: admin.id,
        reviewedAt: new Date(),
        adminNote: input.adminNote || null,
      },
    });

    await createAuditLog({
      userId: admin.id,
      action: "suggestion.reject",
      entityType: "Suggestion",
      entityId: suggestionId,
      metadata: { kind: suggestion.kind, label: suggestion.label },
    });

    revalidatePath("/admin/settings");
    return { success: true };
  }

  const scope = input.scope ?? "LISTING_ONLY";
  const finalLabel = (input.label ?? suggestion.label).trim();
  if (finalLabel.length < 2) return { error: "Label is required" };

  if (suggestion.kind === "PROPERTY_TYPE") {
    const value = await uniquePropertyTypeValue(finalLabel);
    const propertyType = await db.propertyType.create({
      data: {
        value,
        label: finalLabel,
        isActive: scope === "GLOBAL",
      },
    });

    if (suggestion.listingId) {
      const listing = await db.listing.findUnique({
        where: { id: suggestion.listingId },
        select: { propertyId: true },
      });
      if (listing) {
        await db.property.update({
          where: { id: listing.propertyId },
          data: { propertyType: propertyType.value },
        });
      }
    }

    if (scope === "GLOBAL") revalidateTag(PROPERTY_TYPES_TAG, "max");
  } else {
    const category = (input.category ?? "Features").trim() || "Features";
    const amenity = await db.amenity.create({
      data: {
        name: finalLabel,
        category,
        isActive: scope === "GLOBAL",
      },
    });

    if (scope === "GLOBAL") revalidateTag(AMENITIES_TAG, "max");

    if (suggestion.listingId) {
      await db.listingAmenity.upsert({
        where: {
          listingId_amenityId: {
            listingId: suggestion.listingId,
            amenityId: amenity.id,
          },
        },
        create: { listingId: suggestion.listingId, amenityId: amenity.id },
        update: {},
      });
    }
  }

  await db.suggestion.update({
    where: { id: suggestionId },
    data: {
      status: "APPROVED",
      scope,
      label: finalLabel,
      reviewedById: admin.id,
      reviewedAt: new Date(),
      adminNote: input.adminNote || null,
    },
  });

  await createAuditLog({
    userId: admin.id,
    action: "suggestion.approve",
    entityType: "Suggestion",
    entityId: suggestionId,
    metadata: { kind: suggestion.kind, label: finalLabel, scope },
  });

  revalidatePath("/admin/settings");
  if (suggestion.listingId) {
    revalidatePath(`/host/listings/${suggestion.listingId}/edit`);
  }
  return { success: true };
}
