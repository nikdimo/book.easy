import { afterEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
  getListingDepositPoliciesData,
  saveListingDepositPolicies,
} from "@/lib/services/listing-deposit-policies.service";
import {
  cleanupTestFixtures,
  createTestGuest,
  createTestHostAndListing,
  type TestFixtures,
} from "./test-helpers";

const ADVANCE = {
  enabled: true,
  amountType: "PERCENTAGE",
  value: "25",
  dueTiming: "AFTER_ACCEPTANCE",
  dueDaysBeforeCheckIn: null,
};
const DAMAGE = {
  enabled: true,
  amountType: "FIXED",
  value: "200",
  dueTiming: "DAYS_BEFORE_CHECK_IN",
  dueDaysBeforeCheckIn: 5,
  returnDaysAfterCheckout: 7,
};

describe("listing deposit-policies service", () => {
  let fixtures: TestFixtures | undefined;

  afterEach(async () => {
    if (fixtures) await cleanupTestFixtures(fixtures);
    fixtures = undefined;
  });

  async function setup() {
    const { host, property, listing } = await createTestHostAndListing();
    const outsider = await createTestGuest();
    fixtures = {
      hostId: host.id,
      propertyId: property.id,
      listingId: listing.id,
      extraUserIds: [outsider.id],
    };
    return { host, listing, outsider };
  }

  it("keeps an unanswered default distinct from an explicit 'neither'", async () => {
    const { host, listing } = await setup();
    const initial = await getListingDepositPoliciesData(listing.id, host.id);
    expect(initial?.policies).toEqual({
      version: 2,
      status: "UNANSWERED",
      advancePayment: null,
      damageDeposit: null,
    });

    const saved = await saveListingDepositPolicies(listing.id, host.id, {
      advancePayment: { enabled: false },
      damageDeposit: { enabled: false },
    });
    expect(saved).toMatchObject({
      changed: true,
      policies: { advancePayment: null, damageDeposit: null },
    });

    const stored = await getListingDepositPoliciesData(listing.id, host.id);
    expect(stored?.policies).toEqual({
      version: 2,
      status: "REVIEWED",
      advancePayment: null,
      damageDeposit: null,
    });
  });

  it("saves an advance payment on its own, leaving the damage deposit off", async () => {
    const { host, listing } = await setup();
    await saveListingDepositPolicies(listing.id, host.id, {
      advancePayment: ADVANCE,
      damageDeposit: { enabled: false },
    });

    const stored = await db.listing.findUniqueOrThrow({ where: { id: listing.id } });
    expect(stored.advancePaymentEnabled).toBe(true);
    expect(stored.advancePaymentType).toBe("PERCENTAGE");
    expect(stored.advancePaymentValue?.toString()).toBe("25");
    expect(stored.damageDepositEnabled).toBe(false);
    expect(stored.damageDepositValue).toBeNull();
    expect(stored.depositPoliciesReviewedAt).toBeInstanceOf(Date);
  });

  it("saves a damage deposit on its own, with its return period", async () => {
    const { host, listing } = await setup();
    await saveListingDepositPolicies(listing.id, host.id, {
      advancePayment: { enabled: false },
      damageDeposit: DAMAGE,
    });

    const stored = await db.listing.findUniqueOrThrow({ where: { id: listing.id } });
    expect(stored.advancePaymentEnabled).toBe(false);
    expect(stored.damageDepositEnabled).toBe(true);
    expect(stored.damageDepositType).toBe("FIXED");
    expect(stored.damageDepositDueDaysBeforeCheckIn).toBe(5);
    expect(stored.damageDepositReturnDaysAfterCheckout).toBe(7);
  });

  it("saves both at once and keeps them independent", async () => {
    const { host, listing } = await setup();
    const result = await saveListingDepositPolicies(listing.id, host.id, {
      advancePayment: ADVANCE,
      damageDeposit: DAMAGE,
    });
    expect(result).toMatchObject({
      policies: {
        advancePayment: { amountType: "PERCENTAGE", value: "25" },
        damageDeposit: { amountType: "FIXED", value: "200", returnDaysAfterCheckout: 7 },
      },
    });

    const stored = await getListingDepositPoliciesData(listing.id, host.id);
    expect(stored?.policies.advancePayment).toMatchObject({
      amountType: "PERCENTAGE",
      value: "25",
      dueTiming: "AFTER_ACCEPTANCE",
    });
    expect(stored?.policies.damageDeposit).toMatchObject({
      amountType: "FIXED",
      value: "200",
      dueTiming: "DAYS_BEFORE_CHECK_IN",
      dueDaysBeforeCheckIn: 5,
    });
  });

  it("switches one policy off without disturbing the other", async () => {
    const { host, listing } = await setup();
    await saveListingDepositPolicies(listing.id, host.id, {
      advancePayment: ADVANCE,
      damageDeposit: DAMAGE,
    });
    await saveListingDepositPolicies(listing.id, host.id, {
      advancePayment: { enabled: false },
      damageDeposit: DAMAGE,
    });

    const stored = await getListingDepositPoliciesData(listing.id, host.id);
    expect(stored?.policies.advancePayment).toBeNull();
    expect(stored?.policies.damageDeposit).toMatchObject({ value: "200" });

    // Nothing stale is left behind on the switched-off side.
    const row = await db.listing.findUniqueOrThrow({ where: { id: listing.id } });
    expect(row.advancePaymentType).toBeNull();
    expect(row.advancePaymentValue).toBeNull();
    expect(row.advancePaymentDueDaysBeforeCheckIn).toBeNull();
  });

  it("uses the listing currency instead of trusting a submitted currency", async () => {
    const { host, listing } = await setup();
    const result = await saveListingDepositPolicies(listing.id, host.id, {
      currency: "USD",
      advancePayment: ADVANCE,
      damageDeposit: DAMAGE,
    });
    expect(result).toMatchObject({
      policies: {
        advancePayment: { currency: "EUR" },
        damageDeposit: { currency: "EUR" },
      },
    });
    const stored = await db.listing.findUniqueOrThrow({ where: { id: listing.id } });
    expect(stored.depositPoliciesCurrency).toBe("EUR");
  });

  it("scopes reads and writes to the listing owner", async () => {
    const { listing, outsider } = await setup();
    expect(await getListingDepositPoliciesData(listing.id, outsider.id)).toBeNull();
    await expect(
      saveListingDepositPolicies(listing.id, outsider.id, {
        advancePayment: { enabled: false },
        damageDeposit: { enabled: false },
      }),
    ).resolves.toEqual({ error: "Listing not found." });
  });

  it("rejects an invalid section without mutating either side", async () => {
    const { host, listing } = await setup();
    const result = await saveListingDepositPolicies(listing.id, host.id, {
      advancePayment: { ...ADVANCE, value: "120" },
      damageDeposit: { ...DAMAGE, dueDaysBeforeCheckIn: null },
    });
    expect(result).toEqual({
      issues: {
        advancePayment: { value: "PERCENTAGE_TOO_HIGH" },
        damageDeposit: { dueDaysBeforeCheckIn: "DUE_DAYS_REQUIRED" },
      },
    });
    const stored = await db.listing.findUniqueOrThrow({ where: { id: listing.id } });
    expect(stored.depositPoliciesReviewedAt).toBeNull();
    expect(stored.advancePaymentEnabled).toBe(false);
    expect(stored.damageDepositEnabled).toBe(false);
  });

  it("reports no change when the same answer is saved twice", async () => {
    const { host, listing } = await setup();
    await saveListingDepositPolicies(listing.id, host.id, {
      advancePayment: ADVANCE,
      damageDeposit: DAMAGE,
    });
    const again = await saveListingDepositPolicies(listing.id, host.id, {
      advancePayment: ADVANCE,
      damageDeposit: DAMAGE,
    });
    expect(again).toMatchObject({ changed: false });
  });
});
