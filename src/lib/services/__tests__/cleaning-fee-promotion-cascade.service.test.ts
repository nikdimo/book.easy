import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/cache")>()),
  revalidatePath: () => {},
  revalidateTag: () => {},
}));

import { db } from "@/lib/db";
import { saveDefaultPricingForManagedListing } from "@/lib/services/pricing-promotion-mutation.service";
import {
  cleanupTestFixtures,
  createTestHostAndListing,
  type TestFixtures,
} from "./test-helpers";

/**
 * #8, against the constraint that decides it.
 *
 * `ListingPromotion_benefit_check` requires `discountPercent > 0 OR freeCleaning = true`.
 * Clearing a listing's cleaning fee used to clear `freeCleaning` on every active offer in
 * place — which, for an offer whose only benefit *was* the free cleaning, produced a row
 * the database rejects. The check violation rolled back the whole pricing save, so a host
 * with such an offer could not set their cleaning fee to zero at all.
 *
 * A mocked Prisma client has no check constraints to violate, so this belongs against the
 * real local Postgres like its neighbours. Run `npm run db:docker` first if the container
 * isn't up.
 */
describe("clearing the cleaning fee with promotions in force", () => {
  let fixtures: TestFixtures | undefined;

  afterEach(async () => {
    if (fixtures) {
      // Audit rows hold a required FK to the actor, and every pricing save writes one.
      await db.auditLog.deleteMany({ where: { userId: fixtures.hostId } });
      await db.listingPromotion.deleteMany({
        where: { listingId: fixtures.listingId ?? "" },
      });
      await cleanupTestFixtures(fixtures);
    }
    fixtures = undefined;
  });

  async function setup(
    promotions: Array<{ discountPercent: number; freeCleaning: boolean }>,
  ) {
    const { host, property, listing } = await createTestHostAndListing();
    fixtures = {
      hostId: host.id,
      propertyId: property.id,
      listingId: listing.id,
      extraUserIds: [],
    };
    await db.pricingRule.update({
      where: { listingId: listing.id },
      data: { cleaningFee: 30 },
    });
    for (const promotion of promotions) {
      await db.listingPromotion.create({
        data: {
          listingId: listing.id,
          type: promotion.discountPercent > 0 ? "PERCENT_DISCOUNT" : "FREE_CLEANING",
          discountPercent: promotion.discountPercent,
          freeCleaning: promotion.freeCleaning,
          minimumNights: 2,
        },
      });
    }
    return {
      host,
      managed: {
        id: listing.id,
        slug: listing.slug,
        availabilityMode: listing.availabilityMode,
      },
    };
  }

  const activePromotions = (listingId: string) =>
    db.listingPromotion.findMany({
      where: { listingId },
      orderBy: { discountPercent: "asc" },
      select: { discountPercent: true, freeCleaning: true, disabledAt: true },
    });

  it("saves the price and switches off a free-cleaning-only offer", async () => {
    const { host, managed } = await setup([
      { discountPercent: 0, freeCleaning: true },
    ]);

    const result = await saveDefaultPricingForManagedListing(managed, host.id, {
      baseNightlyRate: 100,
      cleaningFee: 0,
    });

    expect(result).toEqual({
      success:
        "Pricing saved. Offers whose only benefit was free cleaning were switched off.",
    });
    const rule = await db.pricingRule.findUniqueOrThrow({
      where: { listingId: managed.id },
    });
    expect(Number(rule.cleaningFee)).toBe(0);
    expect(Number(rule.baseNightlyRate)).toBe(100);

    const [promotion] = await activePromotions(managed.id);
    expect(promotion.disabledAt).not.toBeNull();
    // Switched off rather than emptied: the row the constraint forbids is never written.
    expect(promotion.freeCleaning).toBe(true);
    expect(promotion.discountPercent).toBe(0);
  });

  it("keeps a percentage offer alive, minus its cleaning benefit", async () => {
    const { host, managed } = await setup([
      { discountPercent: 15, freeCleaning: true },
    ]);

    const result = await saveDefaultPricingForManagedListing(managed, host.id, {
      baseNightlyRate: 100,
      cleaningFee: 0,
    });

    expect(result).toEqual({
      success:
        "Pricing saved. Free-cleaning benefits were removed from active promotions.",
    });
    const [promotion] = await activePromotions(managed.id);
    expect(promotion.disabledAt).toBeNull();
    expect(promotion.freeCleaning).toBe(false);
    expect(promotion.discountPercent).toBe(15);
  });

  it("handles both kinds on one listing in a single save", async () => {
    const { host, managed } = await setup([
      { discountPercent: 0, freeCleaning: true },
      { discountPercent: 20, freeCleaning: true },
    ]);

    const result = await saveDefaultPricingForManagedListing(managed, host.id, {
      baseNightlyRate: 100,
      cleaningFee: 0,
    });

    expect(result).toEqual({
      success:
        "Pricing saved. Free-cleaning benefits were removed from active promotions, and offers left with nothing to give were switched off.",
    });
    const [worthless, percentage] = await activePromotions(managed.id);
    expect(worthless.disabledAt).not.toBeNull();
    expect(percentage.disabledAt).toBeNull();
    expect(percentage.freeCleaning).toBe(false);
  });

  it("leaves everything alone when the fee stays positive", async () => {
    const { host, managed } = await setup([
      { discountPercent: 0, freeCleaning: true },
    ]);

    const result = await saveDefaultPricingForManagedListing(managed, host.id, {
      baseNightlyRate: 100,
      cleaningFee: 45,
    });

    expect(result).toEqual({ success: "Pricing saved." });
    const [promotion] = await activePromotions(managed.id);
    expect(promotion.disabledAt).toBeNull();
    expect(promotion.freeCleaning).toBe(true);
  });
});
