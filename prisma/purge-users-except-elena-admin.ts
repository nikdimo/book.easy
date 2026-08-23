/**
 * Deletes every user except platform admins and Elena (seed: elena@example.com),
 * and removes their listings, properties, bookings, and related rows.
 *
 * Run: npx tsx prisma/purge-users-except-elena-admin.ts
 */
import "dotenv/config";
import { PrismaClient, UserRole } from "@prisma/client";
import { enqueueUploadDeletions, processPendingUploadDeletions } from "@/lib/storage/upload-cleanup";
import { draftUploadUrls } from "@/lib/storage/upload-references";
import { listingDraftData } from "@/lib/mobile-listing-draft";

const prisma = new PrismaClient();

/** Emails to keep (case-insensitive), in addition to all ADMIN users. */
const KEEP_EMAILS = ["elena@example.com"];

async function main() {
  const keepUsers = await prisma.user.findMany({
    where: {
      OR: [
        { role: UserRole.ADMIN },
        ...KEEP_EMAILS.map((email) => ({
          email: { equals: email, mode: "insensitive" as const },
        })),
      ],
    },
    select: { id: true, email: true, name: true, role: true },
  });

  if (keepUsers.length === 0) {
    throw new Error(
      "No users matched keep rules (ADMIN or Elena email). Aborting to avoid wiping the database."
    );
  }

  const keepIds = new Set(keepUsers.map((u) => u.id));

  const allUsers = await prisma.user.findMany({ select: { id: true } });
  const deleteIds = allUsers.map((u) => u.id).filter((id) => !keepIds.has(id));

  if (deleteIds.length === 0) {
    console.log("Nothing to delete — only kept users exist.");
    return;
  }

  const doomedListings = await prisma.listing.findMany({
    where: {
      OR: [
        { hostId: { in: deleteIds } },
        { property: { ownerId: { in: deleteIds } } },
      ],
    },
    select: { id: true },
  });
  const doomedListingIds = doomedListings.map((l) => l.id);

  console.log("Keeping:", keepUsers.map((u) => `${u.email} (${u.role})`).join(", "));
  console.log("Deleting users:", deleteIds.length);
  console.log("Removing listings (and related data):", doomedListingIds.length);

  // Both the doomed listings' photos and the doomed users' draft photos are managed
  // uploads that nothing will point at once this runs — `ListingDraft.host` cascades, so
  // the drafts disappear without any delete path seeing them. Read before the transaction,
  // queued inside it.
  const [doomedImages, doomedDrafts] = await Promise.all([
    prisma.listingImage.findMany({
      where: doomedListingIds.length > 0 ? { listingId: { in: doomedListingIds } } : { id: "" },
      select: { url: true },
    }),
    prisma.listingDraft.findMany({ where: { hostId: { in: deleteIds } }, select: { data: true } }),
  ]);
  const doomedUploads = [
    ...doomedImages.map((image) => image.url),
    ...doomedDrafts.flatMap((draft) => draftUploadUrls(listingDraftData(draft.data))),
  ];

  await prisma.$transaction(async (tx) => {
    // Queued in the same transaction as the deletions below: if this rolls back, nothing
    // is scheduled for removal. The files themselves are swept after the commit, and each
    // one is re-checked against every other reference first.
    const queued = await enqueueUploadDeletions(tx, doomedUploads, "purge-users-script");
    console.log("  uploads queued for cleanup:", queued.length);

    const bookingDelete = await tx.booking.deleteMany({
      where: {
        OR: [
          ...(doomedListingIds.length > 0
            ? [{ listingId: { in: doomedListingIds } }]
            : []),
          { guestId: { in: deleteIds } },
        ],
      },
    });
    console.log("  bookings removed:", bookingDelete.count);

    if (doomedListingIds.length > 0) {
      const listingDelete = await tx.listing.deleteMany({
        where: { id: { in: doomedListingIds } },
      });
      console.log("  listings removed:", listingDelete.count);
    }

    const propertyDelete = await tx.property.deleteMany({
      where: { ownerId: { in: deleteIds } },
    });
    console.log("  properties removed:", propertyDelete.count);

    const auditDelete = await tx.auditLog.deleteMany({
      where: { userId: { in: deleteIds } },
    });
    console.log("  audit logs removed:", auditDelete.count);

    const userDelete = await tx.user.deleteMany({
      where: { id: { in: deleteIds } },
    });
    console.log("  users removed:", userDelete.count);
  });

  const cleanup = await processPendingUploadDeletions({ limit: doomedUploads.length || 1 });
  console.log(
    `  uploads removed: ${cleanup.deleted} (kept, still referenced: ${cleanup.kept}; failed: ${cleanup.failed})`,
  );
  if (cleanup.failed > 0) {
    console.log("  Re-run `npm run uploads:process-deletions` to retry the failures.");
  }

  console.log("Done.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
