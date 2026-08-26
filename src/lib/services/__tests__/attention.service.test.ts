import { afterEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { getHostAttentionSummary } from "@/lib/services/attention.service";
import {
  cleanupTestFixtures,
  createTestHostAndListing,
  type TestFixtures,
} from "./test-helpers";

describe("host payment-arrangements attention", () => {
  let fixtures: TestFixtures | undefined;

  afterEach(async () => {
    if (fixtures) await cleanupTestFixtures(fixtures);
    fixtures = undefined;
  });

  it("remains until the host has reviewed both payment methods and the deposit policy", async () => {
    const { host, property, listing } = await createTestHostAndListing();
    fixtures = {
      hostId: host.id,
      propertyId: property.id,
      listingId: listing.id,
      extraUserIds: [],
    };

    expect(await getHostAttentionSummary(host.id)).toMatchObject({
      incompletePaymentArrangements: { id: listing.id, title: listing.title },
      incompletePaymentArrangementCount: 1,
    });

    // An explicit direct-arrangement answer is still incomplete until the host also
    // explicitly chooses the deposit policy (including "no deposit").
    await db.listing.update({
      where: { id: listing.id },
      data: { paymentMethodsReviewedAt: new Date() },
    });
    expect(await getHostAttentionSummary(host.id)).toMatchObject({
      incompletePaymentArrangements: { id: listing.id },
      incompletePaymentArrangementCount: 1,
    });

    await db.listing.update({
      where: { id: listing.id },
      data: { depositPolicyReviewedAt: new Date() },
    });
    expect(await getHostAttentionSummary(host.id)).toMatchObject({
      incompletePaymentArrangements: null,
      incompletePaymentArrangementCount: 0,
    });
  });

  it("does not resurrect a task for an archived listing", async () => {
    const { host, property, listing } = await createTestHostAndListing();
    fixtures = {
      hostId: host.id,
      propertyId: property.id,
      listingId: listing.id,
      extraUserIds: [],
    };

    await db.listing.update({
      where: { id: listing.id },
      data: { status: "ARCHIVED" },
    });

    expect(await getHostAttentionSummary(host.id)).toMatchObject({
      incompletePaymentArrangements: null,
      incompletePaymentArrangementCount: 0,
    });
  });
});
