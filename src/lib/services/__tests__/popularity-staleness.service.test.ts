import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { recomputePopularityScores } from "@/lib/services/popularity.service";
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
 * #15: a listing that leaves APPROVED must not keep its last popularity score.
 *
 * `recomputePopularityScores` scores `status: APPROVED` listings only, so an unpublished
 * or suspended one kept its `popularityScore` and `popularityUpdatedAt` indefinitely.
 * Harmless while search filters it away — and then not harmless at all the moment it is
 * republished, because it comes back ranked on a months-old number describing traffic
 * nobody can point at.
 *
 * Two layers are held here: the lifecycle writers clear the score at the transition, and
 * the sweep catches everything already in that state. Both matter — the transition makes
 * it immediate, the sweep makes it true of rows that got there before this existed.
 *
 * Integration test against the real local Postgres. Run `npm run db:docker` first if the
 * container isn't up.
 */
describe("popularity scores and listing visibility", () => {
  const fixtures: TestFixtures[] = [];

  afterEach(async () => {
    for (const fixture of fixtures.splice(0)) await cleanupTestFixtures(fixture);
  });

  async function scoredListing(score = 42.5) {
    const { host, property, listing } = await createTestHostAndListing();
    fixtures.push({
      hostId: host.id,
      propertyId: property.id,
      listingId: listing.id,
      extraUserIds: [],
    });
    await db.listing.update({
      where: { id: listing.id },
      data: { popularityScore: score, popularityUpdatedAt: new Date() },
    });
    return { host, listing };
  }

  const scoreOf = (id: string) =>
    db.listing.findUniqueOrThrow({
      where: { id },
      select: { popularityScore: true, popularityUpdatedAt: true, status: true },
    });

  it("clears the score when the host unpublishes", async () => {
    const { host, listing } = await scoredListing();

    const result = await unpublishOwnedListing(listing.id, host.id);
    expect(result.success).toBe(true);

    const after = await scoreOf(listing.id);
    expect(after.status).toBe("UNPUBLISHED");
    expect(after.popularityScore).toBe(0);
    expect(after.popularityUpdatedAt).toBeNull();
  });

  it("clears the score when support suspends", async () => {
    const { listing } = await scoredListing();

    const result = await suspendListingForAdmin(listing.id, "Safety review");
    expect(result.success).toBe(true);

    const after = await scoreOf(listing.id);
    expect(after.status).toBe("SUSPENDED");
    expect(after.popularityScore).toBe(0);
    expect(after.popularityUpdatedAt).toBeNull();
  });

  it("clears the score when the host archives", async () => {
    const { host, listing } = await scoredListing();

    const result = await archiveOwnedListing(listing.id, host.id);
    expect(result.success).toBe(true);

    const after = await scoreOf(listing.id);
    expect(after.popularityScore).toBe(0);
    expect(after.popularityUpdatedAt).toBeNull();
  });

  /**
   * The rows already in this state. Nothing backfills them, so the sweep has to.
   */
  it("clears a score left behind on a listing that is already unpublished", async () => {
    const { listing } = await scoredListing(17.25);
    // Straight to the column, as an older release would have left it.
    await db.listing.update({
      where: { id: listing.id },
      data: {
        status: "UNPUBLISHED",
        popularityScore: 17.25,
        popularityUpdatedAt: new Date("2026-01-01T00:00:00.000Z"),
      },
    });

    const result = await recomputePopularityScores();
    expect(result.listingsCleared).toBeGreaterThanOrEqual(1);

    const after = await scoreOf(listing.id);
    expect(after.popularityScore).toBe(0);
    expect(after.popularityUpdatedAt).toBeNull();
  });

  /** A republished listing therefore starts from no score rather than a stale one. */
  it("leaves a republished listing to be rescored from current activity", async () => {
    const { host, listing } = await scoredListing(99);
    await unpublishOwnedListing(listing.id, host.id);
    await db.listing.update({
      where: { id: listing.id },
      data: { status: "APPROVED" },
    });

    const before = await scoreOf(listing.id);
    expect(before.popularityScore).toBe(0);
    expect(before.popularityUpdatedAt).toBeNull();

    // And the sweep does not resurrect anything: with no views or bookings in the
    // window, the score it computes is zero too.
    await recomputePopularityScores();
    expect((await scoreOf(listing.id)).popularityScore).toBe(0);
  });

  it("leaves an approved listing's own score alone", async () => {
    const { listing } = await scoredListing(31);
    // A view today, so the sweep has something to score it from.
    await db.listingView.create({
      data: {
        listingId: listing.id,
        visitorKey: randomUUID().replace(/-/g, "").slice(0, 32),
        viewedOn: new Date(
          Date.UTC(
            new Date().getUTCFullYear(),
            new Date().getUTCMonth(),
            new Date().getUTCDate(),
          ),
        ),
      },
    });

    await recomputePopularityScores();

    const after = await scoreOf(listing.id);
    expect(after.status).toBe("APPROVED");
    expect(after.popularityScore).toBeGreaterThan(0);
    expect(after.popularityUpdatedAt).not.toBeNull();
  });
});
