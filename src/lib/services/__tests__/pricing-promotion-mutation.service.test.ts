import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  pricingRuleFindUnique: vi.fn(),
  pricingRuleCreate: vi.fn(),
  pricingRuleUpdate: vi.fn(),
  promotionUpdateMany: vi.fn(),
  listingFindUnique: vi.fn(),
  promotionCreate: vi.fn(),
  promotionUpdate: vi.fn(),
  transaction: vi.fn(),
  audit: vi.fn(),
  revalidatePath: vi.fn(),
  revalidatePublic: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    pricingRule: {
      findUnique: mocks.pricingRuleFindUnique,
      create: mocks.pricingRuleCreate,
    },
    listing: { findUnique: mocks.listingFindUnique },
    listingPromotion: {
      create: mocks.promotionCreate,
      update: mocks.promotionUpdate,
      updateMany: mocks.promotionUpdateMany,
    },
    $transaction: mocks.transaction,
  },
}));
vi.mock("@/lib/services/audit.service", () => ({ createAuditLog: mocks.audit }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/utils/revalidate-public-listing-caches", () => ({
  revalidatePublicListingCaches: mocks.revalidatePublic,
}));

import {
  createDefaultPricingForManagedListing,
  removePromotionForManagedListing,
  saveDefaultPricingForManagedListing,
  savePromotionForManagedListing,
} from "@/lib/services/pricing-promotion-mutation.service";

const listing = {
  id: "listing-1",
  slug: "lake-house",
  availabilityMode: "OPEN" as const,
};

describe("pricing and promotion mutation service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.pricingRuleFindUnique.mockResolvedValue({ id: "pricing-1", maxNights: 30 });
    mocks.pricingRuleUpdate.mockResolvedValue({});
    mocks.pricingRuleCreate.mockResolvedValue({ id: "pricing-1" });
    mocks.promotionUpdateMany.mockResolvedValue({ count: 0 });
    mocks.transaction.mockImplementation(async (run) =>
      run({
        pricingRule: { update: mocks.pricingRuleUpdate },
        listingPromotion: { updateMany: mocks.promotionUpdateMany },
      }),
    );
    mocks.audit.mockResolvedValue({});
    mocks.listingFindUnique.mockResolvedValue({
      id: "listing-1",
      status: "APPROVED",
      pricingRule: {
        cleaningFee: 25,
        minNights: 1,
        maxNights: 30,
      },
      promotions: [],
    });
    mocks.promotionCreate.mockResolvedValue({
      id: "promotion-1",
      discountPercent: 20,
      minimumNights: 2,
      freeCleaning: false,
      roundToWholeUnit: true,
      startDate: null,
      endDate: null,
    });
  });

  it("rejects invalid pricing before writing", async () => {
    await expect(
      saveDefaultPricingForManagedListing(listing, "host-1", {
        baseNightlyRate: 0,
        cleaningFee: -1,
      }),
    ).resolves.toEqual({ error: "Nightly rate must be at least 1." });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("saves valid pricing and removes impossible free-cleaning benefits atomically", async () => {
    // Nothing worthless left behind, two offers stripped of their cleaning benefit.
    mocks.promotionUpdateMany
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 2 });
    await expect(
      saveDefaultPricingForManagedListing(listing, "host-1", {
        baseNightlyRate: 120,
        cleaningFee: 0,
      }),
    ).resolves.toEqual({
      success:
        "Pricing saved. Free-cleaning benefits were removed from active promotions.",
    });
    expect(mocks.pricingRuleUpdate).toHaveBeenCalledWith({
      where: { id: "pricing-1" },
      data: { baseNightlyRate: 120, cleaningFee: 0 },
    });
    expect(mocks.promotionUpdateMany).toHaveBeenLastCalledWith({
      where: {
        listingId: "listing-1",
        disabledAt: null,
        freeCleaning: true,
      },
      data: { freeCleaning: false },
    });
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "host-1", action: "listing.pricing_updated" }),
    );
  });

  /**
   * #8, and the reason it matters more than the audit's own description of it.
   *
   * An offer whose only benefit was free cleaning has nothing left once the fee is
   * cleared, and `ListingPromotion_benefit_check` — `discountPercent > 0 OR freeCleaning
   * = true` — refuses the row. Clearing the flag in place therefore raised a check
   * violation that rolled back the whole pricing save, so a host with a free-cleaning-only
   * offer could not set their cleaning fee to zero at all. The offer is switched off
   * instead, which is also what the host means.
   */
  it("switches off offers whose only benefit was the cleaning fee", async () => {
    mocks.promotionUpdateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });

    await expect(
      saveDefaultPricingForManagedListing(listing, "host-1", {
        baseNightlyRate: 120,
        cleaningFee: 0,
      }),
    ).resolves.toEqual({
      success:
        "Pricing saved. Offers whose only benefit was free cleaning were switched off.",
    });

    // Disabled first, and narrowed to the offers the constraint would reject: the
    // percentage offers in the second call keep a benefit and survive the clear.
    const [disable, clear] = mocks.promotionUpdateMany.mock.calls;
    expect(disable[0]).toEqual({
      where: {
        listingId: "listing-1",
        disabledAt: null,
        freeCleaning: true,
        discountPercent: { lte: 0 },
      },
      data: { disabledAt: expect.any(Date) },
    });
    expect(clear[0].data).toEqual({ freeCleaning: false });
  });

  it("says so when it both switched some off and stripped others", async () => {
    mocks.promotionUpdateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 2 });

    await expect(
      saveDefaultPricingForManagedListing(listing, "host-1", {
        baseNightlyRate: 120,
        cleaningFee: 0,
      }),
    ).resolves.toEqual({
      success:
        "Pricing saved. Free-cleaning benefits were removed from active promotions, and offers left with nothing to give were switched off.",
    });
  });

  it("touches no promotion when the cleaning fee stays positive", async () => {
    await expect(
      saveDefaultPricingForManagedListing(listing, "host-1", {
        baseNightlyRate: 120,
        cleaningFee: 25,
      }),
    ).resolves.toEqual({ success: "Pricing saved." });
    expect(mocks.promotionUpdateMany).not.toHaveBeenCalled();
  });

  /**
   * The stale-tab race, at the last boundary before the database.
   *
   * Even a caller that hands this core a `minNights` — an older mobile build, a
   * hand-rolled request — cannot move the stay limits through a price save: the update
   * is built from the parsed amounts alone, so the columns Availability → Booking rules
   * owns are never named in the write.
   */
  it("never writes stay limits, even when a caller supplies them", async () => {
    await expect(
      saveDefaultPricingForManagedListing(
        listing,
        "host-1",
        {
          baseNightlyRate: 140,
          cleaningFee: 20,
          minNights: 2,
          maxNights: 30,
        } as unknown as { baseNightlyRate: number; cleaningFee: number },
      ),
    ).resolves.toEqual({ success: "Pricing saved." });

    expect(mocks.pricingRuleUpdate).toHaveBeenCalledWith({
      where: { id: "pricing-1" },
      data: { baseNightlyRate: 140, cleaningFee: 20 },
    });
    const [{ data }] = mocks.pricingRuleUpdate.mock.calls[0];
    expect(Object.keys(data).sort()).toEqual(["baseNightlyRate", "cleaningFee"]);
    // And the rule is looked up without reading a maximum it no longer compares to.
    expect(mocks.pricingRuleFindUnique).toHaveBeenCalledWith({
      where: { listingId: "listing-1" },
      select: { id: true },
    });
  });

  it("rejects invalid promotions but allows intentional date overlaps", async () => {
    await expect(
      savePromotionForManagedListing(listing, "host-1", {
        discountPercent: 51,
        minimumNights: 2,
        freeCleaning: false,
        roundToWholeUnit: true,
      }),
    ).resolves.toEqual(expect.objectContaining({ error: expect.any(String) }));
    expect(mocks.promotionCreate).not.toHaveBeenCalled();

    mocks.listingFindUnique.mockResolvedValue({
      id: "listing-1",
      status: "APPROVED",
      pricingRule: { cleaningFee: 25, minNights: 1, maxNights: 30 },
      promotions: [
        {
          id: "existing",
          minimumNights: 2,
          startDate: new Date("2026-09-01T00:00:00.000Z"),
          endDate: new Date("2026-09-20T00:00:00.000Z"),
        },
      ],
    });
    await expect(
      savePromotionForManagedListing(listing, "host-1", {
        discountPercent: 20,
        minimumNights: 2,
        freeCleaning: false,
        roundToWholeUnit: true,
        startDate: "2026-09-10",
        endDate: "2026-09-25",
      }),
    ).resolves.toEqual({ success: "Promotion created." });
    expect(mocks.promotionCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        listingId: "listing-1",
        discountPercent: 20,
        minimumNights: 2,
        startDate: new Date("2026-09-10T00:00:00.000Z"),
        endDate: new Date("2026-09-25T00:00:00.000Z"),
      }),
    });
  });

  /**
   * "No maximum" is stored as a zero, and every other surface reads it through
   * `stayLengthCap`. Reading the raw column here meant an uncapped listing — a state the
   * Booking rules editor offers as "no maximum" — could not create any promotion at all,
   * because every minimum is greater than 0.
   */
  it("treats a stored maxNights of 0 as no cap when validating the offer minimum", async () => {
    mocks.listingFindUnique.mockResolvedValue({
      id: "listing-1",
      status: "APPROVED",
      pricingRule: { cleaningFee: 25, minNights: 1, maxNights: 0 },
      promotions: [],
    });
    await expect(
      savePromotionForManagedListing(listing, "host-1", {
        discountPercent: 20,
        minimumNights: 5,
        freeCleaning: false,
        roundToWholeUnit: true,
      }),
    ).resolves.toEqual({ success: "Promotion created." });
    expect(mocks.promotionCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ minimumNights: 5 }),
    });
  });

  /** A negative column is the same "no cap" reading, and must not be quoted back. */
  it("treats a negative maxNights as no cap rather than quoting it back", async () => {
    mocks.listingFindUnique.mockResolvedValue({
      id: "listing-1",
      status: "APPROVED",
      pricingRule: { cleaningFee: 25, minNights: 1, maxNights: -3 },
      promotions: [],
    });
    await expect(
      savePromotionForManagedListing(listing, "host-1", {
        discountPercent: 20,
        minimumNights: 4,
        freeCleaning: false,
        roundToWholeUnit: true,
      }),
    ).resolves.toEqual({ success: "Promotion created." });
  });

  it("still refuses an offer minimum above a real cap", async () => {
    mocks.listingFindUnique.mockResolvedValue({
      id: "listing-1",
      status: "APPROVED",
      pricingRule: { cleaningFee: 25, minNights: 1, maxNights: 7 },
      promotions: [],
    });
    await expect(
      savePromotionForManagedListing(listing, "host-1", {
        discountPercent: 20,
        minimumNights: 8,
        freeCleaning: false,
        roundToWholeUnit: true,
      }),
    ).resolves.toEqual({
      error: "The offer minimum cannot exceed 7 nights.",
    });
    expect(mocks.promotionCreate).not.toHaveBeenCalled();
  });

  it("creates and removes valid promotions with actor audit attribution", async () => {
    await expect(
      savePromotionForManagedListing(listing, "host-1", {
        discountPercent: 20,
        minimumNights: 2,
        freeCleaning: false,
        roundToWholeUnit: true,
      }),
    ).resolves.toEqual({ success: "Promotion created." });
    expect(mocks.promotionCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        listingId: "listing-1",
        discountPercent: 20,
        minimumNights: 2,
        roundToWholeUnit: true,
      }),
    });

    mocks.listingFindUnique.mockResolvedValue({
      id: "listing-1",
      status: "APPROVED",
      pricingRule: { cleaningFee: 25, minNights: 1, maxNights: 30 },
      promotions: [{ id: "promotion-1" }],
    });
    mocks.promotionUpdate.mockResolvedValue({});
    await expect(
      removePromotionForManagedListing(listing, "host-1", "promotion-1"),
    ).resolves.toEqual({ success: "Promotion removed." });
    expect(mocks.promotionUpdate).toHaveBeenCalledWith({
      where: { id: "promotion-1", listingId: "listing-1" },
      data: { disabledAt: expect.any(Date) },
    });
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "host-1", action: "listing.promotion_disabled" }),
    );
  });
});

/**
 * A listing with no `PricingRule` at all — an import, or one from before listing
 * creation nested the rule in the same write. The Pricing section has to be able to
 * give it a first price rather than sending the host to a calendar that says the same
 * thing back at them.
 */
describe("first pricing rule", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.pricingRuleFindUnique.mockResolvedValue(null);
    mocks.pricingRuleCreate.mockResolvedValue({ id: "pricing-1" });
    mocks.audit.mockResolvedValue({});
  });

  it("creates the rule in the platform currency, audits it and revalidates", async () => {
    await expect(
      createDefaultPricingForManagedListing(listing, "host-1", {
        baseNightlyRate: 90,
        cleaningFee: 15,
      }),
    ).resolves.toEqual({ success: "Pricing saved." });

    // The caller sends two amounts; the neutral 1-night minimum every new rule needs
    // is the server's own database default, not something the Pricing UI chose.
    expect(mocks.pricingRuleCreate).toHaveBeenCalledWith({
      data: {
        listingId: "listing-1",
        currency: "EUR",
        baseNightlyRate: 90,
        cleaningFee: 15,
        minNights: 1,
      },
    });
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "host-1",
        action: "listing.pricing_created",
        entityType: "Listing",
        entityId: "listing-1",
      }),
    );
    // The same clean V2 routes every other pricing write refreshes.
    const paths = mocks.revalidatePath.mock.calls.map(([path]) => path);
    expect(paths).toContain("/host/listings/listing-1/pricing");
    expect(paths).toContain("/host/listings/listing-1/availability");
    expect(paths).toContain("/host/listings/listing-1");
    expect(paths).toContain("/host/calendar");
    expect(paths).toContain("/properties/lake-house");
    expect(mocks.revalidatePublic).toHaveBeenCalled();
  });

  it("refuses to overwrite a rule that already exists", async () => {
    mocks.pricingRuleFindUnique.mockResolvedValue({ id: "pricing-1", maxNights: 30 });
    await expect(
      createDefaultPricingForManagedListing(listing, "host-1", {
        baseNightlyRate: 90,
        cleaningFee: 15,
      }),
    ).resolves.toEqual({ error: "This listing already has pricing." });
    expect(mocks.pricingRuleCreate).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("validates through the same schema as the save path", async () => {
    await expect(
      createDefaultPricingForManagedListing(listing, "host-1", {
        baseNightlyRate: 0,
        cleaningFee: 15,
      }),
    ).resolves.toEqual({ error: "Nightly rate must be at least 1." });
    await expect(
      createDefaultPricingForManagedListing(listing, "host-1", {
        baseNightlyRate: 90,
        cleaningFee: -1,
      }),
    ).resolves.toEqual({ error: "Cleaning fee cannot be negative." });
    expect(mocks.pricingRuleCreate).not.toHaveBeenCalled();
  });
});
