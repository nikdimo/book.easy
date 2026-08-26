import { afterEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
  getListingDepositPolicyData,
  saveListingDepositPolicy,
} from "@/lib/services/listing-deposit-policy.service";
import {
  cleanupTestFixtures,
  createTestGuest,
  createTestHostAndListing,
  type TestFixtures,
} from "./test-helpers";

describe("listing deposit-policy service", () => {
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

  it("keeps an unanswered default distinct from an explicit no-deposit answer", async () => {
    const { host, listing } = await setup();
    const initial = await getListingDepositPolicyData(listing.id, host.id);
    expect(initial?.policy).toMatchObject({
      status: "UNANSWERED",
      policy: "NONE",
    });

    const saved = await saveListingDepositPolicy(listing.id, host.id, {
      policy: "NONE",
      purpose: null,
      value: null,
      dueTiming: "AFTER_ACCEPTANCE",
      dueDaysBeforeCheckIn: null,
      returnDaysAfterCheckout: null,
    });
    expect(saved).toMatchObject({ changed: true, policy: { policy: "NONE" } });

    const stored = await getListingDepositPolicyData(listing.id, host.id);
    expect(stored?.policy).toMatchObject({ status: "REVIEWED", policy: "NONE" });
  });

  it("uses the listing currency instead of trusting a submitted currency", async () => {
    const { host, listing } = await setup();
    const result = await saveListingDepositPolicy(listing.id, host.id, {
      policy: "FIXED",
      purpose: "DAMAGE_SECURITY",
      value: "125.50",
      currency: "USD",
      dueTiming: "DAYS_BEFORE_CHECK_IN",
      dueDaysBeforeCheckIn: 5,
      returnDaysAfterCheckout: 7,
    });
    expect(result).toMatchObject({
      policy: {
        policy: "FIXED",
        purpose: "DAMAGE_SECURITY",
        value: "125.5",
        currency: "EUR",
        dueDaysBeforeCheckIn: 5,
        returnDaysAfterCheckout: 7,
      },
    });

    const stored = await db.listing.findUniqueOrThrow({ where: { id: listing.id } });
    expect(stored.depositCurrency).toBe("EUR");
    expect(stored.depositPolicyReviewedAt).toBeInstanceOf(Date);
  });

  it("scopes reads and writes to the listing owner", async () => {
    const { listing, outsider } = await setup();
    expect(await getListingDepositPolicyData(listing.id, outsider.id)).toBeNull();
    await expect(
      saveListingDepositPolicy(listing.id, outsider.id, {
        policy: "NONE",
        purpose: null,
        value: null,
        dueTiming: "AFTER_ACCEPTANCE",
      }),
    ).resolves.toEqual({ error: "Listing not found." });
  });

  it("rejects invalid percentage and timing combinations without mutation", async () => {
    const { host, listing } = await setup();
    const result = await saveListingDepositPolicy(listing.id, host.id, {
      policy: "PERCENTAGE",
      purpose: "ADVANCE_PAYMENT",
      value: "120",
      dueTiming: "DAYS_BEFORE_CHECK_IN",
      dueDaysBeforeCheckIn: null,
    });
    expect(result).toEqual({
      issues: {
        value: "PERCENTAGE_TOO_HIGH",
        dueDaysBeforeCheckIn: "DUE_DAYS_REQUIRED",
      },
    });
    const stored = await db.listing.findUniqueOrThrow({ where: { id: listing.id } });
    expect(stored.depositPolicyReviewedAt).toBeNull();
  });
});
