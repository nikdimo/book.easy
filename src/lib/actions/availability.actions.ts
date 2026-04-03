"use server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { BlockType } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { parseLocalYmd } from "@/lib/utils/stay-pricing";

async function getListingForManager(userId: string, role: string, listingId: string) {
  const listing = await db.listing.findUnique({
    where: { id: listingId },
    include: { pricingRule: true },
  });
  if (!listing) return null;
  if (role === "ADMIN") return listing;
  if (listing.hostId === userId) return listing;
  return null;
}

function revalidateListingPaths(listingId: string, slug?: string | null) {
  revalidatePath(`/host/listings/${listingId}/availability`);
  revalidatePath(`/admin/listings/${listingId}`);
  if (slug) revalidatePath(`/properties/${slug}`);
}

export async function blockDates(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) return { error: "Not authorized" };

  const listingId = formData.get("listingId") as string;
  const startDate = formData.get("startDate") as string;
  const endDate = formData.get("endDate") as string;
  const reason = formData.get("reason") as string;

  if (!listingId || !startDate || !endDate) {
    return { error: "Missing required fields" };
  }

  const listing = await getListingForManager(
    session.user.id,
    session.user.role,
    listingId
  );
  if (!listing) return { error: "Listing not found" };

  const start = parseLocalYmd(startDate);
  const end = parseLocalYmd(endDate);
  if (end <= start) return { error: "End date must be after start date" };

  const overlap = await db.availabilityBlock.findFirst({
    where: {
      listingId,
      startDate: { lt: end },
      endDate: { gt: start },
    },
  });

  if (overlap) {
    return { error: "These dates overlap with an existing block or booking" };
  }

  await db.availabilityBlock.create({
    data: {
      listingId,
      startDate: start,
      endDate: end,
      blockType: BlockType.MANUAL_BLOCK,
      reason: reason || null,
    },
  });

  revalidateListingPaths(listingId, listing.slug);
  return { success: true };
}

export async function unblockDates(blockId: string) {
  const session = await auth();
  if (!session?.user?.id) return { error: "Not authorized" };

  const block = await db.availabilityBlock.findUnique({
    where: { id: blockId },
    include: { listing: true },
  });

  if (!block) return { error: "Block not found" };

  const listing = await getListingForManager(
    session.user.id,
    session.user.role,
    block.listingId
  );
  if (!listing) return { error: "Not authorized" };

  if (block.blockType !== "MANUAL_BLOCK") {
    return { error: "Only manual blocks can be removed" };
  }

  await db.availabilityBlock.delete({ where: { id: blockId } });

  revalidateListingPaths(block.listingId, block.listing.slug);
  return { success: true };
}

export async function upsertListingDatePrice(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) return { error: "Not authorized" };

  const listingId = formData.get("listingId") as string;
  const dateStr = formData.get("date") as string;
  const nightlyRateRaw = formData.get("nightlyRate") as string;

  if (!listingId || !dateStr) return { error: "Missing date or listing" };

  const rate = parseFloat(nightlyRateRaw);
  if (!Number.isFinite(rate) || rate <= 0) {
    return { error: "Enter a valid nightly price greater than zero" };
  }

  const listing = await getListingForManager(
    session.user.id,
    session.user.role,
    listingId
  );
  if (!listing || !listing.pricingRule) return { error: "Listing not found" };

  const base = Number(listing.pricingRule.baseNightlyRate);
  const day = parseLocalYmd(dateStr);

  if (Math.abs(rate - base) < 0.005) {
    await db.listingDatePrice.deleteMany({
      where: { listingId, date: day },
    });
  } else {
    await db.listingDatePrice.upsert({
      where: {
        listingId_date: { listingId, date: day },
      },
      create: {
        listingId,
        date: day,
        nightlyRate: rate,
      },
      update: { nightlyRate: rate },
    });
  }

  revalidateListingPaths(listingId, listing.slug);
  return { success: true };
}

export async function removeListingDatePrice(priceId: string) {
  const session = await auth();
  if (!session?.user?.id) return { error: "Not authorized" };

  const row = await db.listingDatePrice.findUnique({
    where: { id: priceId },
    include: { listing: true },
  });

  if (!row) return { error: "Price override not found" };

  const listing = await getListingForManager(
    session.user.id,
    session.user.role,
    row.listingId
  );
  if (!listing) return { error: "Not authorized" };

  await db.listingDatePrice.delete({ where: { id: priceId } });

  revalidateListingPaths(row.listingId, row.listing.slug);
  return { success: true };
}
