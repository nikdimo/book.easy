import "server-only";
import { db } from "@/lib/db";
import { getT } from "@/lib/i18n/t";
import { resolveRoomTypeLabel } from "@/lib/i18n/room-labels";
import { getRoomTypeCatalogIncluding } from "@/lib/services/room-type.service";
import { roomDisplayName } from "@/lib/rooms/room-name";
import { listingBasicsComplete } from "@/lib/host/v2/listing-basics";
import {
  listingLocationComplete,
  listingStreetViewComplete,
} from "@/lib/host/v2/listing-location";
import { listingPropertyDetailsComplete } from "@/lib/host/v2/listing-property-details";
import { editorCompletedSections } from "@/lib/host/v2/editor-sections";
import { editorAttentionSlugs } from "@/lib/host/v2/editor-overview";
import type { CatalogRoomType, ListingRoomSummary } from "@/lib/types/room-catalog";
import type { ListingMediaTypeValue } from "@/lib/types/listing-media";

export interface EditorPhoto {
  id: string;
  url: string;
  mediaType: ListingMediaTypeValue;
  isPanorama?: boolean;
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
    /** Sections with an open task, for the navigation. Includes Pricing, which is not a
     *  completion section and so never carried a checkmark. */
    attention: string[];
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
      spaceType: true,
      bedrooms: true,
      beds: true,
      bathrooms: true,
      houseRulesReviewedAt: true,
      paymentMethodsReviewedAt: true,
      depositPoliciesReviewedAt: true,
      cancellationPolicyReviewedAt: true,
      property: {
        select: {
          propertyType: true,
          address: true,
          city: true,
          country: true,
          latitude: true,
          longitude: true,
          streetViewHeading: true,
          streetViewPitch: true,
          streetViewPanoId: true,
        },
      },
      images: {
        select: {
          id: true,
          url: true,
          mediaType: true,
          isPanorama: true,
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
      pricingRule: { select: { id: true } },
      _count: {
        select: { images: { where: { mediaType: "IMAGE" } } },
      },
    },
  });

  if (!listing) return null;

  const translator = await getT();
  const photos: EditorPhoto[] = listing.images.map((image) => ({
    id: image.id,
    url: image.url,
    mediaType: image.mediaType,
    isPanorama: image.isPanorama,
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

  const completeSections = editorCompletedSections({
      photoCount: listing._count.images,
      basicsComplete: listingBasicsComplete({
        title: listing.title,
        description: listing.description,
      }),
      propertyDetailsComplete: listingPropertyDetailsComplete({
        propertyType: listing.property.propertyType,
        spaceType: listing.spaceType,
        bedrooms: listing.bedrooms,
        beds: listing.beds,
        bathrooms: listing.bathrooms,
      }),
      locationComplete: listingLocationComplete(listing.property),
      paymentMethodsReviewed:
        listing.paymentMethodsReviewedAt !== null &&
        listing.depositPoliciesReviewedAt !== null &&
        listing.cancellationPolicyReviewedAt !== null,
      houseRulesReviewed: listing.houseRulesReviewedAt !== null,
    });
const attention = editorAttentionSlugs({
  completeSections,
  hasPricing: listing.pricingRule !== null,
  streetViewSet: listingStreetViewComplete(listing.property),
  });

  return {
    listing: {
      id: listing.id,
      title: listing.title,
      status: listing.status,
      slug: listing.slug,
      coverUrl: photos.find((photo) => photo.isPrimary)?.url ?? photos[0]?.url ?? null,
      completeSections,
      attention,
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
      spaceType: true,
      bedrooms: true,
      beds: true,
      bathrooms: true,
      houseRulesReviewedAt: true,
      paymentMethodsReviewedAt: true,
      depositPoliciesReviewedAt: true,
      cancellationPolicyReviewedAt: true,
      property: {
        select: {
          propertyType: true,
          address: true,
          city: true,
          country: true,
          latitude: true,
          longitude: true,
          streetViewHeading: true,
          streetViewPitch: true,
          streetViewPanoId: true,
        },
      },
      images: {
        where: { mediaType: "IMAGE" },
        select: { url: true },
        orderBy: [{ isPrimary: "desc" }, { displayOrder: "asc" }],
        take: 1,
      },
      pricingRule: { select: { id: true } },
      _count: {
        select: { images: { where: { mediaType: "IMAGE" } } },
      },
    },
  });
  if (!listing) return null;
  const completeSections = editorCompletedSections({
    photoCount: listing._count.images,
    basicsComplete: listingBasicsComplete({
      title: listing.title,
      description: listing.description,
    }),
    propertyDetailsComplete: listingPropertyDetailsComplete({
      propertyType: listing.property.propertyType,
      spaceType: listing.spaceType,
      bedrooms: listing.bedrooms,
      beds: listing.beds,
      bathrooms: listing.bathrooms,
    }),
    locationComplete: listingLocationComplete(listing.property),
    paymentMethodsReviewed:
      listing.paymentMethodsReviewedAt !== null &&
      listing.depositPoliciesReviewedAt !== null &&
      listing.cancellationPolicyReviewedAt !== null,
    houseRulesReviewed: listing.houseRulesReviewedAt !== null,
  });
const attention = editorAttentionSlugs({
  completeSections,
  hasPricing: listing.pricingRule !== null,
  streetViewSet: listingStreetViewComplete(listing.property),
  });

  return {
    id: listing.id,
    title: listing.title,
    status: listing.status,
    slug: listing.slug,
    coverUrl: listing.images[0]?.url ?? null,
    photoCount: listing._count.images,
    completeSections,
    attention,
  };
}

export interface ListingEditorOverview {
  id: string;
  title: string;
  status: string;
  slug: string;
  coverUrl: string | null;
  /** "Area, City, Country" as far as the listing has it, or null when the address has
   *  not been filled in at all. */
  locationLabel: string | null;
  photoCount: number;
  roomCount: number;
  amenityCount: number;
  /** Null when the listing has no pricing rule — the state that blocks every booking. */
  nightlyRate: { amount: number; currency: string } | null;
  availabilityMode: "OPEN" | "CLOSED";
  /** Whether the host has ever saved the House rules section. */
  houseRulesReviewed: boolean;
  /** Whether the host has ever saved Payment arrangements. */
  paymentMethodsReviewed: boolean;
  /** Whether the host has chosen a saved Street View approach. */
  streetViewSet?: boolean;
  completeSections: string[];
  /** Sections with an open task. Pricing can appear here; it has no checkmark of its
   *  own because it is not a completion section. */
  attention: string[];
}

/**
 * Everything the Listing overview renders from, in one query.
 *
 * Scoped to `hostId` inside the `where` exactly like the rest of the editor's reads, so
 * a listing that is not this host's comes back as `null` — "not found" — instead of
 * leaking that it exists. It is a read and authorizes nothing: every section it links
 * to re-checks ownership when it loads, and every mutation behind those sections checks
 * again in its own action.
 *
 * The counts are `_count` aggregates rather than loaded rows: the overview prints "12
 * photos", never the photos themselves, and pulling a hundred image rows to render a
 * number would make the editor's index its most expensive page.
 */
export async function getListingEditorOverview(
  listingId: string,
  hostId: string,
): Promise<ListingEditorOverview | null> {
  const listing = await db.listing.findFirst({
    where: { id: listingId, hostId },
    select: {
      id: true,
      title: true,
      description: true,
      status: true,
      slug: true,
      spaceType: true,
      bedrooms: true,
      beds: true,
      bathrooms: true,
      availabilityMode: true,
      houseRulesReviewedAt: true,
      paymentMethodsReviewedAt: true,
      depositPoliciesReviewedAt: true,
      cancellationPolicyReviewedAt: true,
      property: {
        select: {
          propertyType: true,
          address: true,
          area: true,
          city: true,
          country: true,
          latitude: true,
          longitude: true,
          streetViewHeading: true,
          streetViewPitch: true,
          streetViewPanoId: true,
        },
      },
      images: {
        where: { mediaType: "IMAGE" },
        select: { url: true },
        orderBy: [{ isPrimary: "desc" }, { displayOrder: "asc" }],
        take: 1,
      },
      pricingRule: { select: { currency: true, baseNightlyRate: true } },
      _count: {
        select: {
          images: { where: { mediaType: "IMAGE" } },
          rooms: true,
          amenities: true,
        },
      },
    },
  });
  if (!listing) return null;

  const place = [listing.property.area, listing.property.city, listing.property.country]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part));

  const completeSections = editorCompletedSections({
    photoCount: listing._count.images,
    basicsComplete: listingBasicsComplete({
      title: listing.title,
      description: listing.description,
    }),
    propertyDetailsComplete: listingPropertyDetailsComplete({
      propertyType: listing.property.propertyType,
      spaceType: listing.spaceType,
      bedrooms: listing.bedrooms,
      beds: listing.beds,
      bathrooms: listing.bathrooms,
    }),
    locationComplete: listingLocationComplete(listing.property),
    paymentMethodsReviewed:
      listing.paymentMethodsReviewedAt !== null &&
      listing.depositPoliciesReviewedAt !== null &&
      listing.cancellationPolicyReviewedAt !== null,
    houseRulesReviewed: listing.houseRulesReviewedAt !== null,
  });
const attention = editorAttentionSlugs({
  completeSections,
  hasPricing: listing.pricingRule !== null,
  streetViewSet: listingStreetViewComplete(listing.property),
  });

  return {
    id: listing.id,
    title: listing.title,
    status: listing.status,
    slug: listing.slug,
    coverUrl: listing.images[0]?.url ?? null,
    locationLabel: place.length > 0 ? place.join(", ") : null,
    photoCount: listing._count.images,
    roomCount: listing._count.rooms,
    amenityCount: listing._count.amenities,
    nightlyRate: listing.pricingRule
      ? {
          // Prisma hands Decimal back as its own object; the overview prints a number.
          amount: Number(listing.pricingRule.baseNightlyRate),
          currency: listing.pricingRule.currency,
        }
      : null,
    availabilityMode: listing.availabilityMode === "CLOSED" ? "CLOSED" : "OPEN",
    houseRulesReviewed: listing.houseRulesReviewedAt !== null,
    paymentMethodsReviewed:
      listing.paymentMethodsReviewedAt !== null &&
      listing.depositPoliciesReviewedAt !== null &&
      listing.cancellationPolicyReviewedAt !== null,
    streetViewSet: listingStreetViewComplete(listing.property),
    completeSections,
    attention,
  };
}
