import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { nextOrdinal } from "@/lib/rooms/room-name";

/**
 * The two room types the editor drives with a stepper instead of a picker.
 *
 * Everything else on a listing is a space the host chooses to add — a kitchen, a
 * balcony. Bedrooms and bathrooms are different: guests search on them, the listing card
 * prints them, and `Listing.bedrooms` / `Listing.bathrooms` have carried those numbers
 * since before rooms existed. Keeping the two in step is what this module is for. The
 * room rows are the truth; the columns on `Listing` are a denormalised copy that search
 * and the public pages read, rewritten from the rows on every change.
 */
export const COUNTED_ROOM_KEYS = ["bedroom", "bathroom"] as const;
export type CountedRoomKey = (typeof COUNTED_ROOM_KEYS)[number];

/** The English names these types were seeded under, for installs whose keys drifted. */
const COUNTED_ROOM_NAMES: Record<CountedRoomKey, string> = {
  bedroom: "Bedroom",
  bathroom: "Bathroom",
};

export interface CountedRoomType {
  id: string;
  key: CountedRoomKey;
  /** False caps the stepper at one: `addListingRoom` refuses a second of these. */
  isRepeatable: boolean;
}

type Client = Prisma.TransactionClient | typeof db;

/**
 * Resolves the bedroom and bathroom types, tolerating a key that an admin rename moved.
 * Missing types are simply absent from the map rather than an error — a fresh install
 * with no taxonomy yet should still be able to publish a listing.
 */
export async function countedRoomTypes(
  client: Client = db,
): Promise<Map<CountedRoomKey, CountedRoomType>> {
  const rows = await client.roomType.findMany({
    where: {
      OR: [
        { key: { in: [...COUNTED_ROOM_KEYS] } },
        { name: { in: Object.values(COUNTED_ROOM_NAMES) } },
      ],
    },
    select: { id: true, key: true, name: true, isRepeatable: true },
  });

  const found = new Map<CountedRoomKey, CountedRoomType>();
  for (const key of COUNTED_ROOM_KEYS) {
    // A key match is the strong signal; the name is the fallback for a renamed key.
    const row =
      rows.find((candidate) => candidate.key === key) ??
      rows.find((candidate) => candidate.name === COUNTED_ROOM_NAMES[key]);
    if (row) found.set(key, { id: row.id, key, isRepeatable: row.isRepeatable });
  }
  return found;
}

/**
 * Brings one listing's rooms of a single type up to `target`, creating whatever is
 * missing. It only ever adds: trimming a room throws photos out of it, which is a
 * decision that belongs to the host pressing the minus button, never to a sync pass.
 *
 * Returns how many rooms the listing has of that type afterwards.
 */
export async function growRoomsOfType(
  client: Client,
  listingId: string,
  roomType: CountedRoomType,
  target: number,
): Promise<number> {
  const cap = roomType.isRepeatable ? target : Math.min(target, 1);
  const [existing, last] = await Promise.all([
    client.listingRoom.findMany({
      where: { listingId, roomTypeId: roomType.id },
      select: { ordinal: true },
    }),
    client.listingRoom.findFirst({
      where: { listingId },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    }),
  ]);

  const ordinals = existing.map((row) => row.ordinal);
  let sortOrder = last?.sortOrder ?? -1;
  const missing = cap - ordinals.length;
  if (missing <= 0) return ordinals.length;

  const rows: Prisma.ListingRoomCreateManyInput[] = [];
  for (let index = 0; index < missing; index += 1) {
    const ordinal = nextOrdinal(ordinals);
    ordinals.push(ordinal);
    sortOrder += 1;
    rows.push({ listingId, roomTypeId: roomType.id, ordinal, sortOrder });
  }
  // Two requests seeding the same listing at once both compute the same ordinals; the
  // `@@unique([listingId, roomTypeId, ordinal])` plus skipDuplicates lets the loser of
  // that race no-op instead of throwing.
  await client.listingRoom.createMany({ data: rows, skipDuplicates: true });
  return ordinals.length;
}

/**
 * Creates the bedrooms and bathrooms a newly published listing said it has.
 *
 * Called from listing creation so a host who answered "2 bedrooms" in the wizard finds
 * two bedrooms waiting in Photos, rather than an empty rail and no hint that rooms are
 * a thing they were meant to make.
 */
export async function seedListingRooms(
  client: Client,
  listingId: string,
  counts: { bedrooms: number; bathrooms: number },
): Promise<void> {
  const types = await countedRoomTypes(client);
  const bedroom = types.get("bedroom");
  const bathroom = types.get("bathroom");
  if (bedroom) await growRoomsOfType(client, listingId, bedroom, counts.bedrooms);
  if (bathroom) await growRoomsOfType(client, listingId, bathroom, counts.bathrooms);
}

/**
 * Rewrites `Listing.bedrooms` / `Listing.bathrooms` from the room rows.
 *
 * Run after any add or delete of a counted room, so the number guests search on and the
 * list the host is looking at can never drift apart. A type that cannot repeat is left
 * alone: its rows can only ever say "1", which would silently overwrite a real count of
 * three shared bathrooms with a number the taxonomy — not the host — chose.
 */
export async function syncListingCountsFromRooms(
  listingId: string,
  client: Client = db,
): Promise<void> {
  const types = await countedRoomTypes(client);
  const repeatable = [...types.values()].filter((type) => type.isRepeatable);
  if (repeatable.length === 0) return;

  const grouped = await client.listingRoom.groupBy({
    by: ["roomTypeId"],
    where: { listingId, roomTypeId: { in: repeatable.map((type) => type.id) } },
    _count: { _all: true },
  });
  const countFor = (key: CountedRoomKey) => {
    const type = types.get(key);
    if (!type?.isRepeatable) return undefined;
    return grouped.find((row) => row.roomTypeId === type.id)?._count._all ?? 0;
  };

  const bedrooms = countFor("bedroom");
  const bathrooms = countFor("bathroom");
  const data: Prisma.ListingUpdateInput = {};
  if (bedrooms !== undefined) data.bedrooms = bedrooms;
  if (bathrooms !== undefined) data.bathrooms = bathrooms;
  if (Object.keys(data).length === 0) return;
  await client.listing.update({ where: { id: listingId }, data });
}
