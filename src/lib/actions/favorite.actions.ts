"use server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";

export async function toggleFavorite(listingId: string) {
  const session = await auth();
  if (!session?.user) return { error: "You need to be signed in to save listings" };

  const existing = await db.favorite.findUnique({
    where: { userId_listingId: { userId: session.user.id, listingId } },
  });

  if (existing) {
    await db.favorite.delete({ where: { id: existing.id } });
    revalidatePath("/account/favorites");
    return { success: true, saved: false };
  }

  const listing = await db.listing.findUnique({ where: { id: listingId }, select: { id: true } });
  if (!listing) return { error: "Listing not found" };

  await db.favorite.create({ data: { userId: session.user.id, listingId } });
  revalidatePath("/account/favorites");
  return { success: true, saved: true };
}

export async function getFavoriteListingIds() {
  const session = await auth();
  if (!session?.user) return [];

  const favorites = await db.favorite.findMany({
    where: { userId: session.user.id },
    select: { listingId: true },
  });
  return favorites.map((f) => f.listingId);
}
