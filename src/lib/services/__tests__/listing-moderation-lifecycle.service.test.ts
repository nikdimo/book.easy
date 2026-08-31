import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import {
  BookingStatus,
  ListingStatus,
  ReviewStatus,
  SafetyCaseStatus,
  SuggestionStatus,
} from "@prisma/client";
import { db } from "@/lib/db";
import {
  archiveOwnedListing,
  suspendListingForAdmin,
  unpublishOwnedListing,
} from "@/lib/services/listing-lifecycle.service";
import {
  cleanupTestFixtures,
  createTestHostAndListing,
  type TestFixtures,
} from "./test-helpers";

/**
 * L4 — `ListingStatus.PENDING_REVIEW` and `REJECTED` described a pre-publication
 * moderation queue this product does not run, and no transition could reach either.
 *
 * The workflow these tests pin down instead:
 *
 * - publish / republish → `APPROVED` with `needsReview: true` (live immediately)
 * - admin review        → `APPROVED` with `needsReview: false`
 * - safety suspension   → `SUSPENDED`
 * - host unpublish      → `UNPUBLISHED`, archive → `ARCHIVED` (M9 rules, unchanged)
 *
 * Reintroducing either retired value would silently turn publication into a queue, so
 * the absence of both is asserted at the enum, at the database, and in the migration.
 */

const MIGRATION_SQL_PATH = path.join(
  process.cwd(),
  "prisma",
  "migrations",
  "20260830120000_listing_status_drop_obsolete_moderation_states",
  "migration.sql",
);

/** The migration file with its comments stripped, so assertions read the SQL only. */
function migrationBody(sql: string): string {
  return sql
    .split(/\r?\n/)
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
}

describe("ListingStatus has no moderation-queue states (L4)", () => {
  it("exposes exactly the five reachable statuses", () => {
    expect(Object.keys(ListingStatus).sort()).toEqual([
      "APPROVED",
      "ARCHIVED",
      "DRAFT",
      "SUSPENDED",
      "UNPUBLISHED",
    ]);
    expect(ListingStatus).not.toHaveProperty("PENDING_REVIEW");
    expect(ListingStatus).not.toHaveProperty("REJECTED");
  });

  it("no longer carries the retired labels in Postgres", async () => {
    const labels = await db.$queryRaw<{ enumlabel: string }[]>`
      SELECT e.enumlabel
      FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'ListingStatus'
      ORDER BY e.enumsortorder
    `;
    expect(labels.map((row) => row.enumlabel)).toEqual([
      "DRAFT",
      "APPROVED",
      "UNPUBLISHED",
      "SUSPENDED",
      "ARCHIVED",
    ]);
  });

  it("keeps the DRAFT column default across the enum replacement", async () => {
    const columns = await db.$queryRaw<
      { column_default: string | null; is_nullable: string }[]
    >`
      SELECT column_default, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'Listing' AND column_name = 'status'
    `;
    expect(columns).toHaveLength(1);
    expect(columns[0].column_default).toContain("DRAFT");
    expect(columns[0].is_nullable).toBe("NO");
  });

  it("leaves no listing row in a retired state", async () => {
    const stale = await db.$queryRaw<{ n: bigint }[]>`
      SELECT COUNT(*) AS n
      FROM "Listing"
      WHERE "status"::text IN ('PENDING_REVIEW', 'REJECTED')
    `;
    expect(Number(stale[0].n)).toBe(0);
  });
});

describe("other models keep their own REJECTED status (L4)", () => {
  it("does not touch booking, review, suggestion or safety-case enums", () => {
    expect(BookingStatus.REJECTED).toBe("REJECTED");
    expect(ReviewStatus.REJECTED).toBe("REJECTED");
    expect(SuggestionStatus.REJECTED).toBe("REJECTED");
    expect(SafetyCaseStatus.REJECTED).toBe("REJECTED");
  });

  it("keeps every other Postgres enum's REJECTED label in place", async () => {
    const rows = await db.$queryRaw<{ typname: string }[]>`
      SELECT DISTINCT t.typname
      FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      WHERE e.enumlabel = 'REJECTED'
      ORDER BY t.typname
    `;
    const names = rows.map((row) => row.typname);
    expect(names).toEqual(
      expect.arrayContaining([
        "BookingStatus",
        "ReviewStatus",
        "SafetyCaseStatus",
        "SuggestionStatus",
      ]),
    );
    expect(names).not.toContain("ListingStatus");
  });
});

describe("listing publication and moderation lifecycle (L4)", () => {
  let fixtures: TestFixtures | undefined;

  afterEach(async () => {
    if (fixtures) await cleanupTestFixtures(fixtures);
    fixtures = undefined;
  });

  async function setup(status: "APPROVED" | "DRAFT" = "APPROVED") {
    const { host, property, listing } = await createTestHostAndListing({ status });
    fixtures = {
      hostId: host.id,
      propertyId: property.id,
      listingId: listing.id,
      extraUserIds: [],
    };
    return { host, listing };
  }

  /** What `submitNewListing` and `submitForReview` both write when a listing goes live:
   *  approved and on the site, with the review flag raised for the admin queue. */
  async function publish(listingId: string) {
    return db.listing.update({
      where: { id: listingId },
      data: {
        status: ListingStatus.APPROVED,
        needsReview: true,
        approvedAt: new Date(),
        publishedAt: new Date(),
      },
      select: { status: true, needsReview: true, publishedAt: true },
    });
  }

  it("publishes a new listing as approved and flagged for review", async () => {
    const { listing } = await setup("DRAFT");
    expect(listing.status).toBe(ListingStatus.DRAFT);

    const published = await publish(listing.id);
    expect(published.status).toBe(ListingStatus.APPROVED);
    expect(published.needsReview).toBe(true);
    expect(published.publishedAt).not.toBeNull();
  });

  it("republishes an unpublished listing straight back to approved and flagged", async () => {
    const { host, listing } = await setup();
    await publish(listing.id);
    await db.listing.update({
      where: { id: listing.id },
      data: { needsReview: false },
    });

    const hidden = await unpublishOwnedListing(listing.id, host.id);
    expect(hidden).toMatchObject({ success: true });
    expect(
      await db.listing.findUniqueOrThrow({
        where: { id: listing.id },
        select: { status: true },
      }),
    ).toEqual({ status: ListingStatus.UNPUBLISHED });

    const republished = await publish(listing.id);
    expect(republished.status).toBe(ListingStatus.APPROVED);
    expect(republished.needsReview).toBe(true);
  });

  /** `markListingReviewed` behind `requireAdmin()`; the state change it performs. */
  it("clears the review flag on admin review without changing visibility", async () => {
    const { listing } = await setup();
    await publish(listing.id);

    const reviewed = await db.listing.update({
      where: { id: listing.id },
      data: { needsReview: false, moderationNote: null },
      select: { status: true, needsReview: true },
    });
    expect(reviewed).toEqual({
      status: ListingStatus.APPROVED,
      needsReview: false,
    });
  });

  it("suspends with a note and takes the listing off the site", async () => {
    const { listing } = await setup();
    await publish(listing.id);

    const result = await suspendListingForAdmin(listing.id, "Safety review");
    expect(result).toMatchObject({ success: true });
    expect(
      await db.listing.findUniqueOrThrow({
        where: { id: listing.id },
        select: { status: true, moderationNote: true, needsReview: true },
      }),
    ).toEqual({
      status: ListingStatus.SUSPENDED,
      moderationNote: "Safety review",
      needsReview: false,
    });
  });

  it("keeps the M9 unpublish and archive rules intact", async () => {
    const { host, listing } = await setup();

    await expect(unpublishOwnedListing(listing.id, host.id)).resolves.toMatchObject({
      success: true,
    });
    // M9: unpublish only applies to an approved listing, so a second call is refused.
    await expect(unpublishOwnedListing(listing.id, host.id)).resolves.toMatchObject({
      success: false,
    });

    await expect(archiveOwnedListing(listing.id, host.id)).resolves.toMatchObject({
      success: true,
    });
    expect(
      await db.listing.findUniqueOrThrow({
        where: { id: listing.id },
        select: { status: true },
      }),
    ).toEqual({ status: ListingStatus.ARCHIVED });
  });

  it("refuses to store a retired status even through raw SQL", async () => {
    const { listing } = await setup();

    await expect(
      db.$executeRawUnsafe(
        'UPDATE "Listing" SET "status" = \'PENDING_REVIEW\' WHERE "id" = $1',
        listing.id,
      ),
    ).rejects.toThrow();
    await expect(
      db.$executeRawUnsafe(
        'UPDATE "Listing" SET "status" = \'REJECTED\' WHERE "id" = $1',
        listing.id,
      ),
    ).rejects.toThrow();
  });
});

describe("the L4 migration re-homes legacy moderation rows (L4)", () => {
  const sql = fs.readFileSync(MIGRATION_SQL_PATH, "utf8");

  it("maps the retired statuses to UNPUBLISHED, never to APPROVED", () => {
    const body = migrationBody(sql);
    expect(body).toMatch(/SET\s+"status"\s*=\s*'UNPUBLISHED'/i);
    expect(body).not.toMatch(/SET\s+"status"\s*=\s*'APPROVED'/i);
  });

  it("keeps the legacy-row rewrite inside the enum replacement transaction", () => {
    const body = migrationBody(sql);
    const begin = body.search(/\bBEGIN\s*;/i);
    const update = body.search(/UPDATE\s+"Listing"/i);
    const commit = body.search(/\bCOMMIT\s*;/i);

    expect(begin).toBeGreaterThanOrEqual(0);
    expect(update).toBeGreaterThan(begin);
    expect(commit).toBeGreaterThan(update);
  });

  /**
   * Replays the migration against a throwaway schema holding the *old* enum and rows in
   * every legacy state. `search_path` excludes `public`, so the unqualified identifiers
   * in the migration resolve to the scratch objects and the real database is untouched.
   */
  it("moves PENDING_REVIEW and REJECTED rows to UNPUBLISHED and keeps their notes", async () => {
    const schema = `l4_migration_${randomUUID().replace(/-/g, "")}`;
    const statements = migrationBody(sql)
      .split(";")
      .map((statement) => statement.trim())
      .filter(
        (statement) => statement.length > 0 && !/^(BEGIN|COMMIT)$/i.test(statement),
      );

    try {
      await db.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
      await db.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${schema}"`);
        await tx.$executeRawUnsafe(
          `CREATE TYPE "ListingStatus" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'APPROVED', 'REJECTED', 'UNPUBLISHED', 'SUSPENDED', 'ARCHIVED')`,
        );
        await tx.$executeRawUnsafe(`
          CREATE TABLE "Listing" (
            "id" text PRIMARY KEY,
            "status" "ListingStatus" NOT NULL DEFAULT 'DRAFT',
            "needsReview" boolean NOT NULL DEFAULT false,
            "moderationNote" text
          )
        `);
        await tx.$executeRawUnsafe(`
          INSERT INTO "Listing" ("id", "status", "needsReview", "moderationNote") VALUES
            ('queued',      'PENDING_REVIEW', true,  'Waiting on a moderator'),
            ('turned-down', 'REJECTED',       false, 'Photos show another property'),
            ('live',        'APPROVED',       true,  NULL),
            ('hidden',      'UNPUBLISHED',    false, NULL),
            ('stopped',     'SUSPENDED',      false, 'Safety review'),
            ('gone',        'ARCHIVED',       false, NULL),
            ('new',         'DRAFT',          false, NULL)
        `);

        for (const statement of statements) {
          await tx.$executeRawUnsafe(statement);
        }

        const rows = await tx.$queryRawUnsafe<
          {
            id: string;
            status: string;
            needsReview: boolean;
            moderationNote: string | null;
          }[]
        >(
          'SELECT "id", "status"::text AS status, "needsReview", "moderationNote" FROM "Listing" ORDER BY "id"',
        );
        const byId = new Map(rows.map((row) => [row.id, row]));

        // The two legacy rows land in the host-recoverable off-the-site state — never
        // APPROVED, which would publish a listing that had never been live.
        expect(byId.get("queued")).toEqual({
          id: "queued",
          status: "UNPUBLISHED",
          needsReview: true,
          moderationNote: "Waiting on a moderator",
        });
        expect(byId.get("turned-down")).toEqual({
          id: "turned-down",
          status: "UNPUBLISHED",
          needsReview: false,
          moderationNote: "Photos show another property",
        });

        // Every other row keeps the status it already had.
        expect(byId.get("live")?.status).toBe("APPROVED");
        expect(byId.get("hidden")?.status).toBe("UNPUBLISHED");
        expect(byId.get("stopped")?.status).toBe("SUSPENDED");
        expect(byId.get("stopped")?.moderationNote).toBe("Safety review");
        expect(byId.get("gone")?.status).toBe("ARCHIVED");
        expect(byId.get("new")?.status).toBe("DRAFT");

        const labels = await tx.$queryRawUnsafe<{ enumlabel: string }[]>(`
          SELECT e.enumlabel
          FROM pg_enum e
          JOIN pg_type t ON t.oid = e.enumtypid
          JOIN pg_namespace n ON n.oid = t.typnamespace
          WHERE t.typname = 'ListingStatus' AND n.nspname = '${schema}'
          ORDER BY e.enumsortorder
        `);
        expect(labels.map((row) => row.enumlabel)).toEqual([
          "DRAFT",
          "APPROVED",
          "UNPUBLISHED",
          "SUSPENDED",
          "ARCHIVED",
        ]);

        // The DEFAULT is dropped and restored around the type swap, so a fresh insert
        // still lands in DRAFT rather than failing or picking an arbitrary value.
        await tx.$executeRawUnsafe(
          'INSERT INTO "Listing" ("id") VALUES (\'defaulted\')',
        );
        const defaulted = await tx.$queryRawUnsafe<{ status: string }[]>(
          'SELECT "status"::text AS status FROM "Listing" WHERE "id" = \'defaulted\'',
        );
        expect(defaulted[0].status).toBe("DRAFT");
      });
    } finally {
      await db.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    }
  });
});
