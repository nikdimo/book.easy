"use server";

import { db } from "@/lib/db";
import { requireHost } from "@/lib/auth-helpers";
import { revalidatePath } from "next/cache";
import { revalidatePublicListingCaches } from "@/lib/utils/revalidate-public-listing-caches";
import { nextOrdinal } from "@/lib/rooms/room-name";
import { syncListingCountsFromRooms } from "@/lib/rooms/counted-rooms";
import { enqueueUploadDeletions, sweepUploads } from "@/lib/storage/upload-cleanup";
import type { ListingMediaTypeValue } from "@/lib/types/listing-media";
import { actionText } from "@/lib/actions/action-text";

const ORDER_STEP = 1;
/** A library this size already needs a different tool than a grid; the cap is here so a
 *  runaway client cannot ask the database for an unbounded transaction. */
const MAX_BULK = 500;

type Result<T = unknown> = ({ error: string } & Partial<T>) | ({ error?: undefined } & T);

/**
 * Confirms the signed-in host owns this listing before anything writes.
 *
 * Every action in this file goes through it, and every one of them re-scopes its own
 * `where` to the listing as well: ownership proven once at the top does not stop a
 * caller from naming a photo id that belongs to somebody else's listing.
 */
async function ownedListing(listingId: string) {
  const user = await requireHost();
  const listing = await db.listing.findFirst({
    where: { id: listingId, hostId: user.id },
    select: { id: true, slug: true, status: true },
  });
  return listing;
}
function refresh(listingId: string, slug: string, status: string) {
  revalidatePath(`/host/listings/${listingId}/photos`);
  revalidatePath(`/host/listings/${listingId}/rooms`);
  revalidatePath(`/host/listings/${listingId}`);
  revalidatePath(`/host/listings/${listingId}/edit`);
  revalidatePath("/host/listings");
  revalidatePath("/host/listings");
  // Only a live listing has public pages worth rebuilding; a draft's photos are not on
  // any guest-facing surface yet.
  if (status === "APPROVED") {
    revalidatePath(`/properties/${slug}`);
    revalidatePublicListingCaches();
  }
}

async function flagRoomChangeForReview(listing: { id: string; status: string }) {
  if (listing.status === "APPROVED") {
    await db.listing.update({ where: { id: listing.id }, data: { needsReview: true } });
  }
}

// ─── Photos ───────────────────────────────────────────────────────────────────

/**
 * Records photos the browser has already uploaded to /api/upload.
 *
 * New photos land unassigned and at the end of the gallery: the whole organising model
 * is upload first, sort later, so nothing here asks the host to pick a room.
 */
export async function addListingPhotos(
  listingId: string,
  items: { url: string; mediaType: ListingMediaTypeValue; isPanorama?: boolean }[],
): Promise<Result<{ ids: string[] }>> {
  const listing = await ownedListing(listingId);
  if (!listing) return { error: await actionText("action.error.listing_not_found_sentence", "Listing not found.") };
  if (items.length === 0) return { error: await actionText("action.error.photos_none_to_add", "No photos to add.") };
  if (items.length > MAX_BULK) return { error: await actionText("action.error.photos_too_many", "Too many photos in one go.") };

  const [last, existing] = await Promise.all([
    db.listingImage.findFirst({
      where: { listingId },
      orderBy: { displayOrder: "desc" },
      select: { displayOrder: true },
    }),
    db.listingImage.count({ where: { listingId } }),
  ]);

  const start = (last?.displayOrder ?? -1) + ORDER_STEP;
  const created = await db.$transaction(
    items.map((item, index) =>
      db.listingImage.create({
        data: {
          listingId,
          url: item.url,
          mediaType: item.mediaType,
          isPanorama: item.mediaType === "IMAGE" && item.isPanorama === true,
          displayOrder: start + index,
          // The very first photo on an empty listing becomes the cover, so a listing is
          // never left without one just because the host stopped after uploading.
          isPrimary: existing === 0 && index === 0 && item.mediaType === "IMAGE",
        },
        select: { id: true },
      }),
    ),
  );

  refresh(listingId, listing.slug, listing.status);
  return { ids: created.map((row) => row.id) };
}

/** Moves photos into a room, or out of every room when `roomId` is null. */
export async function assignPhotosToRoom(
  listingId: string,
  photoIds: string[],
  roomId: string | null,
): Promise<Result<{ moved: number }>> {
  const listing = await ownedListing(listingId);
  if (!listing) return { error: await actionText("action.error.listing_not_found_sentence", "Listing not found.") };
  if (photoIds.length === 0) return { error: await actionText("action.error.photos_select_one", "Select at least one photo.") };
  if (photoIds.length > MAX_BULK) return { error: await actionText("action.error.photos_too_many", "Too many photos in one go.") };

  if (roomId) {
    const room = await db.listingRoom.findFirst({
      where: { id: roomId, listingId },
      select: { id: true },
    });
    if (!room) return { error: await actionText("action.error.room_missing", "That room is no longer on this listing.") };
  }

  const last = roomId
    ? await db.listingImage.findFirst({
        where: { listingId, roomId },
        orderBy: { roomOrder: "desc" },
        select: { roomOrder: true },
      })
    : null;
  const start = (last?.roomOrder ?? -1) + ORDER_STEP;

  // Scoped to `listingId` as well as the ids, so a photo id from another listing simply
  // matches nothing rather than being reassigned.
  const owned = await db.listingImage.findMany({
    where: { id: { in: photoIds }, listingId },
    select: { id: true },
  });
  if (owned.length === 0) return { error: await actionText("action.error.photos_missing", "Those photos are no longer on this listing.") };

  await db.$transaction(
    owned.map((photo, index) =>
      db.listingImage.update({
        where: { id: photo.id },
        data: { roomId, roomOrder: roomId ? start + index : 0 },
      }),
    ),
  );

  refresh(listingId, listing.slug, listing.status);
  return { moved: owned.length };
}

/**
 * Rewrites the listing-level gallery order from the sequence the grid is showing.
 *
 * Sending the whole order rather than one moved index keeps the stored result identical
 * to what the host just saw, even with the editor open in two tabs.
 */
export async function reorderListingPhotos(
  listingId: string,
  orderedIds: string[],
): Promise<Result<{ success: true }>> {
  const listing = await ownedListing(listingId);
  if (!listing) return { error: await actionText("action.error.listing_not_found_sentence", "Listing not found.") };
  if (orderedIds.length === 0) return { error: await actionText("action.error.nothing_to_reorder", "Nothing to reorder.") };
  if (orderedIds.length > MAX_BULK) return { error: await actionText("action.error.photos_too_many", "Too many photos in one go.") };

  const owned = await db.listingImage.findMany({
    where: { id: { in: orderedIds }, listingId },
    select: { id: true },
  });
  const ownedIds = new Set(owned.map((row) => row.id));
  const applicable = orderedIds.filter((id) => ownedIds.has(id));
  if (applicable.length === 0) return { error: await actionText("action.error.photos_missing", "Those photos are no longer on this listing.") };

  await db.$transaction(
    applicable.map((id, index) =>
      db.listingImage.update({ where: { id }, data: { displayOrder: index } }),
    ),
  );

  refresh(listingId, listing.slug, listing.status);
  return { success: true };
}

/** Rewrites one room's photo sequence. Deliberately separate from the listing gallery
 *  order, so arranging a room's tour cannot reshuffle what guests see first. */
export async function reorderRoomPhotos(
  listingId: string,
  roomId: string,
  orderedIds: string[],
): Promise<Result<{ success: true }>> {
  const listing = await ownedListing(listingId);
  if (!listing) return { error: await actionText("action.error.listing_not_found_sentence", "Listing not found.") };
  if (orderedIds.length === 0) return { error: await actionText("action.error.nothing_to_reorder", "Nothing to reorder.") };
  if (orderedIds.length > MAX_BULK) return { error: await actionText("action.error.photos_too_many", "Too many photos in one go.") };

  const room = await db.listingRoom.findFirst({
    where: { id: roomId, listingId },
    select: { id: true },
  });
  if (!room) return { error: await actionText("action.error.room_missing", "That room is no longer on this listing.") };

  const owned = await db.listingImage.findMany({
    where: { id: { in: orderedIds }, listingId },
    select: { id: true },
  });
  const ownedIds = new Set(owned.map((row) => row.id));
  const applicable = orderedIds.filter((id) => ownedIds.has(id));
  if (applicable.length === 0) return { error: await actionText("action.error.photos_missing", "Those photos are no longer on this listing.") };

  await db.$transaction(
    applicable.map((id, index) =>
      db.listingImage.update({
        where: { id },
        data: { roomId, roomOrder: index },
      }),
    ),
  );

  refresh(listingId, listing.slug, listing.status);
  return { success: true };
}

/** The one photo guests see first. Exactly one row can hold it, so the previous holder
 *  is cleared in the same transaction. */
export async function setListingCoverPhoto(
  listingId: string,
  photoId: string,
): Promise<Result<{ success: true }>> {
  const listing = await ownedListing(listingId);
  if (!listing) return { error: await actionText("action.error.listing_not_found_sentence", "Listing not found.") };

  const photo = await db.listingImage.findFirst({
    where: { id: photoId, listingId },
    select: { id: true, mediaType: true },
  });
  if (!photo) return { error: await actionText("action.error.photo_missing", "That photo is no longer on this listing.") };
  if (photo.mediaType !== "IMAGE") return { error: await actionText("action.error.cover_must_be_photo", "A video cannot be the cover.") };

  await db.$transaction([
    db.listingImage.updateMany({
      where: { listingId, isPrimary: true },
      data: { isPrimary: false },
    }),
    db.listingImage.update({ where: { id: photoId }, data: { isPrimary: true } }),
  ]);

  refresh(listingId, listing.slug, listing.status);
  return { success: true };
}

/** A room's cover is simply its first photo, so "set as room cover" is a reorder rather
 *  than a second flag that could disagree with the order shown. */
export async function setRoomCoverPhoto(
  listingId: string,
  roomId: string,
  photoId: string,
): Promise<Result<{ success: true }>> {
  const listing = await ownedListing(listingId);
  if (!listing) return { error: await actionText("action.error.listing_not_found_sentence", "Listing not found.") };

  const [room, photo] = await Promise.all([
    db.listingRoom.findFirst({ where: { id: roomId, listingId }, select: { id: true } }),
    db.listingImage.findFirst({
      where: { id: photoId, listingId, roomId },
      select: { id: true },
    }),
  ]);
  if (!room) return { error: await actionText("action.error.room_missing", "That room is no longer on this listing.") };
  if (!photo) return { error: await actionText("action.error.photo_not_in_room", "That photo is not in this room.") };

  const others = await db.listingImage.findMany({
    where: { listingId, roomId, id: { not: photoId } },
    orderBy: { roomOrder: "asc" },
    select: { id: true },
  });

  await db.$transaction([
    db.listingImage.update({ where: { id: photoId }, data: { roomOrder: 0 } }),
    ...others.map((row, index) =>
      db.listingImage.update({ where: { id: row.id }, data: { roomOrder: index + 1 } }),
    ),
  ]);

  refresh(listingId, listing.slug, listing.status);
  return { success: true };
}

/**
 * Removes photos for good.
 *
 * If the cover went with them, the next remaining image takes over rather than leaving
 * the listing with no cover at all — a state the public card cannot render.
 */
export async function deleteListingPhotos(
  listingId: string,
  photoIds: string[],
): Promise<Result<{ deleted: number }>> {
  const listing = await ownedListing(listingId);
  if (!listing) return { error: await actionText("action.error.listing_not_found_sentence", "Listing not found.") };
  if (photoIds.length === 0) return { error: await actionText("action.error.photos_select_one", "Select at least one photo.") };
  if (photoIds.length > MAX_BULK) return { error: await actionText("action.error.photos_too_many", "Too many photos in one go.") };

  const doomed = await db.listingImage.findMany({
    where: { id: { in: photoIds }, listingId },
    select: { id: true, isPrimary: true, url: true },
  });
  if (doomed.length === 0) return { error: await actionText("action.error.photos_missing", "Those photos are no longer on this listing.") };

  const losingCover = doomed.some((photo) => photo.isPrimary);
  // The rows and the intent to unlink their files commit together. Deleting the rows
  // alone — which is what this did — left every removed photo on disk forever, and
  // unlinking them here instead would skip the question of whether a draft or another
  // listing still shows them. The sweep answers that, after the commit.
  const queued = await db.$transaction(async (tx) => {
    await tx.listingImage.deleteMany({
      where: { id: { in: doomed.map((photo) => photo.id) }, listingId },
    });
    return enqueueUploadDeletions(tx, doomed.map((photo) => photo.url), "listing-photo-deleted");
  });
  await sweepUploads(queued, `listing-photo-deleted:${listingId}`);

  if (losingCover) {
    const replacement = await db.listingImage.findFirst({
      where: { listingId, mediaType: "IMAGE" },
      orderBy: { displayOrder: "asc" },
      select: { id: true },
    });
    if (replacement) {
      await db.listingImage.update({
        where: { id: replacement.id },
        data: { isPrimary: true },
      });
    }
  }

  refresh(listingId, listing.slug, listing.status);
  return { deleted: doomed.length };
}

// ─── Rooms on a listing ───────────────────────────────────────────────────────

/**
 * Adds a space. The number comes from what the listing already has, so picking "Bedroom"
 * on a property with two of them creates Bedroom 3 without the host choosing a number.
 */
export async function addListingRoom(
  listingId: string,
  roomTypeId: string,
): Promise<Result<{ roomId: string }>> {
  const listing = await ownedListing(listingId);
  if (!listing) return { error: await actionText("action.error.listing_not_found_sentence", "Listing not found.") };

  const roomType = await db.roomType.findUnique({
    where: { id: roomTypeId },
    select: { id: true, isRepeatable: true, name: true },
  });
  if (!roomType) return { error: await actionText("action.error.room_type_unavailable", "That space is no longer available.") };

  const [sameType, last] = await Promise.all([
    db.listingRoom.findMany({
      where: { listingId, roomTypeId },
      select: { ordinal: true },
    }),
    db.listingRoom.findFirst({
      where: { listingId },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    }),
  ]);

  if (!roomType.isRepeatable && sameType.length > 0) {
    return { error: await actionText(
      "action.error.room_type_duplicate",
      "This listing already has a {room}.",
      { room: roomType.name },
    ) };
  }

  const room = await db.listingRoom.create({
    data: {
      listingId,
      roomTypeId,
      ordinal: nextOrdinal(sameType.map((row) => row.ordinal)),
      sortOrder: (last?.sortOrder ?? -1) + ORDER_STEP,
    },
    select: { id: true },
  });

  await syncListingCountsFromRooms(listingId);
  await flagRoomChangeForReview(listing);
  refresh(listingId, listing.slug, listing.status);
  return { roomId: room.id };
}

/** Renames a room for display only. Clearing the name falls back to the type, so a host
 *  can always undo a custom name without knowing what the type was called. */
export async function renameListingRoom(
  listingId: string,
  roomId: string,
  displayName: string,
): Promise<Result<{ success: true }>> {
  const listing = await ownedListing(listingId);
  if (!listing) return { error: await actionText("action.error.listing_not_found_sentence", "Listing not found.") };

  const value = displayName.trim();
  if (value.length > 60) return { error: await actionText("action.error.name_too_long", "That name is too long.") };

  const room = await db.listingRoom.findFirst({
    where: { id: roomId, listingId },
    select: { id: true },
  });
  if (!room) return { error: await actionText("action.error.room_missing", "That room is no longer on this listing.") };

  await db.listingRoom.update({
    where: { id: roomId },
    data: { displayName: value || null },
  });

  await flagRoomChangeForReview(listing);
  refresh(listingId, listing.slug, listing.status);
  return { success: true };
}

export async function reorderListingRooms(
  listingId: string,
  orderedIds: string[],
): Promise<Result<{ success: true }>> {
  const listing = await ownedListing(listingId);
  if (!listing) return { error: await actionText("action.error.listing_not_found_sentence", "Listing not found.") };
  if (orderedIds.length === 0) return { error: await actionText("action.error.nothing_to_reorder", "Nothing to reorder.") };

  const owned = await db.listingRoom.findMany({
    where: { id: { in: orderedIds }, listingId },
    select: { id: true },
  });
  const ownedIds = new Set(owned.map((row) => row.id));
  const applicable = orderedIds.filter((id) => ownedIds.has(id));
  if (applicable.length === 0) return { error: await actionText("action.error.rooms_missing", "Those rooms are no longer on this listing.") };

  await db.$transaction(
    applicable.map((id, index) =>
      db.listingRoom.update({ where: { id }, data: { sortOrder: index } }),
    ),
  );

  await flagRoomChangeForReview(listing);
  refresh(listingId, listing.slug, listing.status);
  return { success: true };
}

/**
 * Removes a room and keeps every photo in it.
 *
 * The photos fall back to Other / Unassigned — the schema's ON DELETE SET NULL does this
 * on its own, but the count comes back so the UI can say what happened rather than
 * leaving the host to discover it.
 */
export async function deleteListingRoom(
  listingId: string,
  roomId: string,
): Promise<Result<{ releasedPhotos: number }>> {
  const listing = await ownedListing(listingId);
  if (!listing) return { error: await actionText("action.error.listing_not_found_sentence", "Listing not found.") };

  const room = await db.listingRoom.findFirst({
    where: { id: roomId, listingId },
    select: { id: true, _count: { select: { images: true } } },
  });
  if (!room) return { error: await actionText("action.error.room_missing", "That room is no longer on this listing.") };

  await db.listingRoom.delete({ where: { id: roomId } });

  await syncListingCountsFromRooms(listingId);
  await flagRoomChangeForReview(listing);
  refresh(listingId, listing.slug, listing.status);
  return { releasedPhotos: room._count.images };
}

/** Marks an equirectangular image for interactive 360-degree rendering. The host can
 * switch it off again if a very wide ordinary photo was selected by mistake. */
export async function setListingPhotoPanorama(
  listingId: string,
  photoId: string,
  isPanorama: boolean,
): Promise<Result> {
  const listing = await ownedListing(listingId);
  if (!listing) return { error: await actionText("action.error.listing_not_found_sentence", "Listing not found.") };

  const photo = await db.listingImage.findFirst({
    where: { id: photoId, listingId },
    select: { id: true, mediaType: true },
  });
  if (!photo) return { error: await actionText("action.error.photo_missing", "That photo is no longer on this listing.") };
  if (photo.mediaType !== "IMAGE") return { error: await actionText("action.error.panorama_photo_only", "Only photos can be shown in 360°.") };

  await db.listingImage.update({ where: { id: photoId }, data: { isPanorama } });
  refresh(listingId, listing.slug, listing.status);
  return {};
}
