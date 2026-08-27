/**
 * Gives every existing listing the bedroom and bathroom rooms its stored counts claim.
 *
 * Listings published before the editor worked in rooms have `Listing.bedrooms` set and
 * no `ListingRoom` rows at all, so Photos opens with an empty rail. This creates the
 * missing rows and then rewrites the counts from what the rows actually say.
 *
 * It only ever adds. A listing where the host already built rooms by hand keeps them,
 * and one where they deliberately deleted a bedroom is left short rather than having it
 * silently put back — the counts are what get corrected in that case, not the rooms.
 *
 *   npm run rooms:backfill -- --dry-run
 *   npm run rooms:backfill
 */
import { db } from "@/lib/db";
import {
  countedRoomTypes,
  growRoomsOfType,
  syncListingCountsFromRooms,
} from "@/lib/rooms/counted-rooms";

const dryRun = process.argv.includes("--dry-run");

async function main() {
  const types = await countedRoomTypes();
  const bedroom = types.get("bedroom");
  const bathroom = types.get("bathroom");
  if (!bedroom && !bathroom) {
    console.error("No bedroom or bathroom room type found. Import the room catalog first.");
    process.exitCode = 1;
    return;
  }

  const listings = await db.listing.findMany({
    select: {
      id: true,
      title: true,
      bedrooms: true,
      bathrooms: true,
      rooms: { select: { roomTypeId: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  let touched = 0;
  for (const listing of listings) {
    const have = (typeId: string | undefined) =>
      typeId ? listing.rooms.filter((room) => room.roomTypeId === typeId).length : 0;
    const missingBedrooms = bedroom ? Math.max(0, listing.bedrooms - have(bedroom.id)) : 0;
    const missingBathrooms = bathroom ? Math.max(0, listing.bathrooms - have(bathroom.id)) : 0;
    if (missingBedrooms === 0 && missingBathrooms === 0) continue;

    touched += 1;
    console.log(
      `${dryRun ? "would add" : "adding"} ${missingBedrooms} bedroom(s), ${missingBathrooms} bathroom(s) — ${listing.title} (${listing.id})`,
    );
    if (dryRun) continue;

    await db.$transaction(async (tx) => {
      if (bedroom && missingBedrooms > 0) {
        await growRoomsOfType(tx, listing.id, bedroom, listing.bedrooms);
      }
      if (bathroom && missingBathrooms > 0) {
        await growRoomsOfType(tx, listing.id, bathroom, listing.bathrooms);
      }
    });
    await syncListingCountsFromRooms(listing.id);
  }

  console.log(
    `${dryRun ? "Would touch" : "Touched"} ${touched} of ${listings.length} listing(s).`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
