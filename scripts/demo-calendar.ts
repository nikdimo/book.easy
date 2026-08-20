import { PrismaClient } from "@prisma/client";
import { applyCalendarDemo } from "../prisma/demo-calendar";

/**
 * Fill two months of one host's calendar with every state the grid can draw.
 *
 * Deliberately not part of `prisma db seed`, which begins by deleting every user and
 * listing in the database. On a development database that has been worked in for weeks
 * that is not a seed, it is a reset — so this adds to what is already there and confines
 * itself to August and September 2026 on the two listings it is given.
 *
 *   npm run demo:calendar
 *   npm run demo:calendar -- --closed "Bright apartment" --open "Cozy 2BR"
 *
 * With no arguments it picks the first two live listings belonging to the host who owns
 * the most of them, which on a development database is the account being used.
 */

const db = new PrismaClient();

function argument(flag: string): string | null {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? (process.argv[index + 1] ?? null) : null;
}

async function findListing(match: string) {
  const listing = await db.listing.findFirst({
    where: { title: { contains: match, mode: "insensitive" } },
    select: { id: true, title: true, hostId: true },
  });
  if (!listing) throw new Error(`No listing matches "${match}".`);
  return listing;
}

async function main() {
  const closedMatch = argument("--closed");
  const openMatch = argument("--open");

  let closed: { id: string; title: string; hostId: string };
  let open: { id: string; title: string; hostId: string };

  if (closedMatch && openMatch) {
    closed = await findListing(closedMatch);
    open = await findListing(openMatch);
  } else {
    // Whoever has the most listings is the account someone is actually signed in as.
    const hosts = await db.listing.groupBy({
      by: ["hostId"],
      _count: { hostId: true },
      orderBy: { _count: { hostId: "desc" } },
      take: 1,
    });
    const hostId = hosts[0]?.hostId;
    if (!hostId) throw new Error("No listings in this database.");
    const listings = await db.listing.findMany({
      where: { hostId },
      orderBy: { createdAt: "asc" },
      select: { id: true, title: true, hostId: true },
      take: 2,
    });
    if (listings.length < 2) {
      throw new Error("That host needs two listings for the demo.");
    }
    [closed, open] = listings as [typeof closed, typeof open];
  }

  if (closed.id === open.id) {
    throw new Error("The two listings must be different.");
  }

  /**
   * Guests are borrowed rather than created: the bookings need real accounts to hang
   * off, and inventing users on someone's database is a bigger footprint than a
   * calendar demo has any business leaving.
   *
   * Hosts are excluded, and not only the two who own these listings. A booking whose
   * guest is the host of the listing next door is nonsense the moment anyone opens the
   * reservation, and it is the kind of nonsense that survives into screenshots.
   */
  const guests = await db.user.findMany({
    where: {
      isHost: false,
      role: { not: "ADMIN" },
      id: { notIn: [closed.hostId, open.hostId] },
    },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true },
    take: 2,
  });
  if (guests.length < 2) {
    throw new Error(
      "Two guest accounts are needed for the demo bookings — none of the hosts or admins qualify.",
    );
  }

  await applyCalendarDemo(db, {
    closedListingId: closed.id,
    openListingId: open.id,
    guestIds: [guests[0].id, guests[1].id],
  });

  console.log("Calendar demo applied to August–September 2026:");
  console.log(`  closed by default  ${closed.title}`);
  console.log(`  open by default    ${open.title}`);
  console.log(`  guests             ${guests.map((g) => g.name).join(", ")}`);
  console.log("Nothing outside those two months was changed.");
}

main()
  .catch((error) => {
    console.error("Demo failed:", (error as Error).message);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
