import "server-only";
import { db } from "@/lib/db";
import { getT } from "@/lib/i18n/t";
import { resolveRoomTypeLabel } from "@/lib/i18n/room-labels";
import { getRoomTypeCatalogIncluding } from "@/lib/services/room-type.service";
import { roomDisplayName } from "@/lib/rooms/room-name";
import { listingBasicsComplete } from "@/lib/host/v2/listing-basics";
import { editorCompletedSections } from "@/lib/host/v2/editor-sections";
import type { CatalogRoomType, ListingRoomSummary } from "@/lib/types/room-catalog";
import type { ListingMediaTypeValue } from "@/lib/types/listing-media";

export interface EditorPhoto {
  id: string;
  url: string;
  mediaType: ListingMediaTypeValue;
  alt: string | null;
  displayOrder: number;
  isPrimary: boolean;
  roomId: string | null;
  roomOrder: number;
}

export interface ListingEditorData {
  listing: {
    id: string;
    title: string;
    status: string;
    slug: string;
    coverUrl: string | null;
    completeSections: string[];
  };
  photos: EditorPhoto[];
  rooms: ListingRoomSummary[];
  roomTypes: CatalogRoomType[];
}

/**
 * Everything the Photos workspace renders from, in one pass.
 *
 * Scoped to `hostId` in the query rather than checked afterwards, so a listing the
 * caller does not own comes back as "not found" instead of leaking that it exists.
 */
export async function getListingEditorData(
  listingId: string,
  hostId: string,
): Promise<ListingEditorData | null> {
  const listing = await db.listing.findFirst({
    where: { id: listingId, hostId },
    select: {
      id: true,
      title: true,
      description: true,
      status: true,
      slug: true,
      images: {
        select: {
          id: true,
          url: true,
          mediaType: true,
          alt: true,
          displayOrder: true,
          isPrimary: true,
          roomId: true,
          roomOrder: true,
        },
        orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
      },
      rooms: {
        select: {
          id: true,
          roomTypeId: true,
          ordinal: true,
          displayName: true,
          sortOrder: true,
          roomType: { select: { key: true, name: true, icon: true } },
        },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      },
    },
  });

  if (!listing) return null;

  const translator = await getT();
  const photos: EditorPhoto[] = listing.images.map((image) => ({
    id: image.id,
    url: image.url,
    mediaType: image.mediaType,
    alt: image.alt,
    displayOrder: image.displayOrder,
    isPrimary: image.isPrimary,
    roomId: image.roomId,
    roomOrder: image.roomOrder,
  }));

  // How many rooms share each type, which is what decides whether a room is "Bedroom" or
  // "Bedroom 2". Counted here rather than per row so the answer is the same for all of
  // them even while the host is adding one.
  const sameTypeCounts = new Map<string, number>();
  for (const room of listing.rooms) {
    sameTypeCounts.set(room.roomTypeId, (sameTypeCounts.get(room.roomTypeId) ?? 0) + 1);
  }

  const photosByRoom = new Map<string, EditorPhoto[]>();
  for (const photo of photos) {
    if (!photo.roomId) continue;
    const bucket = photosByRoom.get(photo.roomId);
    if (bucket) bucket.push(photo);
    else photosByRoom.set(photo.roomId, [photo]);
  }
  for (const bucket of photosByRoom.values()) {
    bucket.sort((a, b) => a.roomOrder - b.roomOrder);
  }

  const rooms: ListingRoomSummary[] = listing.rooms.map((room) => {
    const typeLabel = resolveRoomTypeLabel(translator, room.roomType.name);
    const inRoom = photosByRoom.get(room.id) ?? [];
    return {
      id: room.id,
      roomTypeId: room.roomTypeId,
      roomTypeKey: room.roomType.key,
      name: roomDisplayName({
        displayName: room.displayName,
        typeLabel: typeLabel.text,
        ordinal: room.ordinal,
        sameTypeCount: sameTypeCounts.get(room.roomTypeId) ?? 1,
      }),
      // A host-authored display name is their own words, so it is not a translated
      // string even when the type label behind it would have been.
      translated: room.displayName ? false : typeLabel.translated,
      icon: room.roomType.icon,
      ordinal: room.ordinal,
      sortOrder: room.sortOrder,
      photoCount: inRoom.length,
      coverUrl: inRoom[0]?.url ?? null,
    };
  });

  const roomTypes = await getRoomTypeCatalogIncluding(
    listing.rooms.map((room) => room.roomTypeId),
  );

  return {
    listing: {
      id: listing.id,
      title: listing.title,
      status: listing.status,
      slug: listing.slug,
      coverUrl: photos.find((photo) => photo.isPrimary)?.url ?? photos[0]?.url ?? null,
      completeSections: editorCompletedSections({
        photoCount: photos.length,
        basicsComplete: listingBasicsComplete({
          title: listing.title,
          description: listing.description,
        }),
      }),
    },
    photos,
    rooms,
    roomTypes,
  };
}

export interface EditorListingOption {
  id: string;
  title: string;
  status: string;
  coverUrl: string | null;
}

/** The host's other properties, for the header's switcher. Archived listings are left
 *  out: they are the ones deliberately put away, and a menu for jumping between the
 *  places you are actively working on should not reopen them. */
export async function getSwitchableListings(
  hostId: string,
): Promise<EditorListingOption[]> {
  const listings = await db.listing.findMany({
    where: { hostId, status: { not: "ARCHIVED" } },
    select: {
      id: true,
      title: true,
      status: true,
      images: {
        where: { mediaType: "IMAGE" },
        select: { url: true },
        orderBy: [{ isPrimary: "desc" }, { displayOrder: "asc" }],
        take: 1,
      },
    },
    orderBy: { updatedAt: "desc" },
  });
  return listings.map((listing) => ({
    id: listing.id,
    title: listing.title,
    status: listing.status,
    coverUrl: listing.images[0]?.url ?? null,
  }));
}

/** The header needs the listing identity on every editor section, including the ones
 *  that are still placeholders — cheaper than loading the whole workspace for them. */
export async function getListingEditorHeader(listingId: string, hostId: string) {
  const listing = await db.listing.findFirst({
    where: { id: listingId, hostId },
    select: {
      id: true,
      title: true,
      description: true,
      status: true,
      slug: true,
      images: {
        where: { mediaType: "IMAGE" },
        select: { url: true },
        orderBy: [{ isPrimary: "desc" }, { displayOrder: "asc" }],
        take: 1,
      },
      _count: { select: { images: true } },
    },
  });
  if (!listing) return null;
  return {
    id: listing.id,
    title: listing.title,
    status: listing.status,
    slug: listing.slug,
    coverUrl: listing.images[0]?.url ?? null,
    photoCount: listing._count.images,
    completeSections: editorCompletedSections({
      photoCount: listing._count.images,
      basicsComplete: listingBasicsComplete({
        title: listing.title,
        description: listing.description,
      }),
    }),
  };
}
