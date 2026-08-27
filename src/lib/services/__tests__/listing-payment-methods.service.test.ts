import { afterEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
  getListingPaymentMethodsData,
  saveListingPaymentMethods,
} from "@/lib/services/listing-payment-methods.service";
import {
  cleanupTestFixtures,
  createTestGuest,
  createTestHostAndListing,
  type TestFixtures,
} from "./test-helpers";

describe("listing payment-method service", () => {
  let fixtures: TestFixtures | undefined;

  afterEach(async () => {
    if (fixtures) await cleanupTestFixtures(fixtures);
    fixtures = undefined;
  });

  async function setup() {
    const { host, property, listing } = await createTestHostAndListing();
    const otherHost = await createTestGuest();
    fixtures = {
      hostId: host.id,
      propertyId: property.id,
      listingId: listing.id,
      extraUserIds: [otherHost.id],
    };
    return { host, listing, otherHost };
  }

  it("reads unanswered separately from a reviewed answer", async () => {
    const { host, listing } = await setup();

    const initial = await getListingPaymentMethodsData(listing.id, host.id);
    expect(initial?.preferences).toMatchObject({
      status: "UNANSWERED",
      methods: [],
      otherLabel: null,
      reviewedAt: null,
    });
    expect(initial?.instructionTemplates).toEqual({});

    const saved = await saveListingPaymentMethods(listing.id, host.id, {
      methods: ["OTHER", "PAYPAL"],
      otherLabel: "MobilePay",
      instructionTemplates: {
        PAYPAL: "PayPal: host@example.com",
        OTHER: "MobilePay handle: 12345678",
      },
    });
    expect(saved).toMatchObject({
      changed: true,
      preferences: {
        status: "REVIEWED",
        methods: ["PAYPAL", "OTHER"],
        otherLabel: "MobilePay",
      },
    });

    const stored = await db.listing.findUniqueOrThrow({
      where: { id: listing.id },
      select: {
        acceptedPaymentMethods: true,
        paymentMethodOther: true,
        paymentMethodsReviewedAt: true,
        needsReview: true,
        paymentInstructionTemplates: true,
      },
    });
    expect(stored).toMatchObject({
      acceptedPaymentMethods: ["PAYPAL", "OTHER"],
      paymentMethodOther: "MobilePay",
      needsReview: true,
    });
    expect(stored.paymentMethodsReviewedAt).toBeInstanceOf(Date);
    // Saves now write the V2 container. Free text keeps its own `templates` slot
    // untouched; `details` is where structured fields go when a host adds them.
    expect(stored.paymentInstructionTemplates).toEqual({
      version: 2,
      templates: {
        PAYPAL: "PayPal: host@example.com",
        OTHER: "MobilePay handle: 12345678",
      },
      details: {},
    });
  });

  it("scopes reads and writes to the owning host", async () => {
    const { listing, otherHost } = await setup();

    expect(await getListingPaymentMethodsData(listing.id, otherHost.id)).toBeNull();
    await expect(
      saveListingPaymentMethods(listing.id, otherHost.id, {
        methods: ["PAYPAL"],
        otherLabel: null,
      }),
    ).resolves.toEqual({ error: "Listing not found." });

    const stored = await db.listing.findUniqueOrThrow({ where: { id: listing.id } });
    expect(stored.paymentMethodsReviewedAt).toBeNull();
    expect(stored.acceptedPaymentMethods).toEqual([]);
  });

  it("rejects sensitive OTHER content without mutating the listing", async () => {
    const { host, listing } = await setup();

    const result = await saveListingPaymentMethods(listing.id, host.id, {
      methods: ["OTHER"],
      otherLabel: "IBAN DE89 3704 0044 0532 0130 00",
    });
    expect(result).toEqual({
      issues: { otherLabel: "PRIVATE_OR_INSTRUCTIONAL_CONTENT" },
    });

    const stored = await db.listing.findUniqueOrThrow({ where: { id: listing.id } });
    expect(stored.paymentMethodsReviewedAt).toBeNull();
    expect(stored.paymentMethodOther).toBeNull();
  });
});
