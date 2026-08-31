/**
 * H6, end to end: the currency a booking's frozen deposit amounts are denominated in.
 *
 * `Booking.currency`, `Booking.totalPrice`, `priceBreakdown` and both money columns are
 * one unit — the listing's pricing currency at the moment the request was made. The
 * listing's *stored* deposit label (`depositPoliciesCurrency`) is a record of what the
 * host was quoted in when they last reviewed the screen, and it can lag behind a pricing
 * currency that changed since. These cases pin down that the lag never produces a
 * relabelled amount, and that an advance payment never exceeds the stay it is part of.
 */
import { afterEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { createBooking } from "@/lib/services/booking.service";
import {
  cleanupTestFixtures,
  createTestGuest,
  createTestHostAndListing,
  type TestFixtures,
} from "./test-helpers";

const DAY_MS = 24 * 60 * 60 * 1000;

function utcToday(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

const plusDays = (base: Date, days: number) =>
  new Date(base.getTime() + days * DAY_MS);

/** 4 nights at the fixture's 50/night plus a 10 cleaning fee. */
const STAY_NIGHTS = 4;
const STAY_TOTAL = 210;

type DepositColumns = Parameters<typeof db.listing.update>[0]["data"];

describe("deposit amounts frozen onto a booking", () => {
  let fixtures: TestFixtures | undefined;

  afterEach(async () => {
    if (fixtures) await cleanupTestFixtures(fixtures);
    fixtures = undefined;
  });

  async function setup(deposits: DepositColumns) {
    const { host, property, listing } = await createTestHostAndListing();
    const guest = await createTestGuest();
    fixtures = {
      hostId: host.id,
      propertyId: property.id,
      listingId: listing.id,
      extraUserIds: [guest.id],
    };
    await db.listing.update({ where: { id: listing.id }, data: deposits });
    return { host, listing, guest };
  }

  function book(listingId: string, guestId: string, offsetDays = 30) {
    const base = plusDays(utcToday(), offsetDays);
    return createBooking({
      listingId,
      guestId,
      checkIn: base,
      checkOut: plusDays(base, STAY_NIGHTS),
      guestCount: 2,
    });
  }

  const reviewedEur = {
    depositPoliciesCurrency: "EUR",
    depositPoliciesReviewedAt: new Date(),
  };

  it("freezes a fixed advance payment in the booking's own currency", async () => {
    const { listing, guest } = await setup({
      ...reviewedEur,
      advancePaymentEnabled: true,
      advancePaymentType: "FIXED",
      advancePaymentValue: 80,
      advancePaymentDueTiming: "AFTER_ACCEPTANCE",
    });

    const booking = await book(listing.id, guest.id);
    expect(booking.currency).toBe("EUR");
    expect(Number(booking.totalPrice)).toBe(STAY_TOTAL);
    expect(Number(booking.advancePaymentAmount)).toBe(80);
    expect(booking.advancePaymentStatus).toBe("UNTRACKED");
    expect(booking.depositPolicySnapshot).toMatchObject({
      status: "REVIEWED",
      advancePayment: { amountType: "FIXED", value: "80", currency: "EUR" },
    });
  });

  it("resolves a percentage advance against the accommodation total", async () => {
    const { listing, guest } = await setup({
      ...reviewedEur,
      advancePaymentEnabled: true,
      advancePaymentType: "PERCENTAGE",
      advancePaymentValue: 20,
      advancePaymentDueTiming: "AFTER_ACCEPTANCE",
    });

    const booking = await book(listing.id, guest.id);
    expect(Number(booking.advancePaymentAmount)).toBe(STAY_TOTAL * 0.2);
  });

  it("accepts an advance equal to the whole accommodation total", async () => {
    const { listing, guest } = await setup({
      ...reviewedEur,
      advancePaymentEnabled: true,
      advancePaymentType: "FIXED",
      advancePaymentValue: STAY_TOTAL,
      advancePaymentDueTiming: "AFTER_ACCEPTANCE",
    });

    const booking = await book(listing.id, guest.id);
    expect(Number(booking.advancePaymentAmount)).toBe(STAY_TOTAL);
  });

  it("caps an advance larger than the accommodation total at that total", async () => {
    // The listing-editor bound refuses this on save, so it only arises from a policy
    // stored before that bound existed, or from a stay cheaper than the one the bound
    // could see. Booking creation is the defensive check that the guest is never asked
    // for more than they owe.
    const { listing, guest } = await setup({
      ...reviewedEur,
      advancePaymentEnabled: true,
      advancePaymentType: "FIXED",
      advancePaymentValue: 900,
      advancePaymentDueTiming: "AFTER_ACCEPTANCE",
    });

    const booking = await book(listing.id, guest.id);
    expect(Number(booking.advancePaymentAmount)).toBe(STAY_TOTAL);
    // The host's declared term is still frozen verbatim, so the cap stays legible.
    expect(booking.depositPolicySnapshot).toMatchObject({
      advancePayment: { value: "900" },
    });
  });

  it("freezes a fixed damage deposit uncapped, as money on top of the stay", async () => {
    const { listing, guest } = await setup({
      ...reviewedEur,
      damageDepositEnabled: true,
      damageDepositType: "FIXED",
      damageDepositValue: 900,
      damageDepositDueTiming: "AT_CHECK_IN",
      damageDepositReturnDaysAfterCheckout: 14,
    });

    const booking = await book(listing.id, guest.id);
    expect(Number(booking.damageDepositAmount)).toBe(900);
    expect(booking.damageDepositStatus).toBe("UNTRACKED");
    expect(Number(booking.totalPrice)).toBe(STAY_TOTAL);
  });

  it("settles both tracks as NOT_REQUIRED for an explicit 'neither'", async () => {
    const { listing, guest } = await setup({
      depositPoliciesCurrency: null,
      depositPoliciesReviewedAt: new Date(),
    });

    const booking = await book(listing.id, guest.id);
    expect(booking.advancePaymentAmount).toBeNull();
    expect(booking.damageDepositAmount).toBeNull();
    expect(booking.advancePaymentStatus).toBe("NOT_REQUIRED");
    expect(booking.damageDepositStatus).toBe("NOT_REQUIRED");
    expect(booking.depositPolicySnapshot).toMatchObject({
      status: "REVIEWED",
      advancePayment: null,
      damageDeposit: null,
    });
  });

  it("settles a zero-valued policy as NOT_REQUIRED rather than a zero charge", async () => {
    const { listing, guest } = await setup({
      ...reviewedEur,
      advancePaymentEnabled: true,
      advancePaymentType: "PERCENTAGE",
      advancePaymentValue: 0,
      advancePaymentDueTiming: "AFTER_ACCEPTANCE",
    });

    const booking = await book(listing.id, guest.id);
    // A zero value never validated, so the row degrades to UNANSWERED and no track opens.
    expect(booking.advancePaymentAmount).toBeNull();
    expect(booking.advancePaymentStatus).toBe("NOT_REQUIRED");
  });

  it("quotes nothing after the listing's pricing currency changed", async () => {
    // The host reviewed deposits while priced in EUR, then switched the listing to MKD.
    // 20% of an MKD total labelled EUR, or a flat 100 relabelled outright, are both
    // wrong; the guest is told the host has not answered instead.
    const { listing, guest } = await setup({
      ...reviewedEur,
      advancePaymentEnabled: true,
      advancePaymentType: "PERCENTAGE",
      advancePaymentValue: 20,
      advancePaymentDueTiming: "AFTER_ACCEPTANCE",
      damageDepositEnabled: true,
      damageDepositType: "FIXED",
      damageDepositValue: 100,
      damageDepositDueTiming: "AT_CHECK_IN",
    });
    await db.pricingRule.update({
      where: { listingId: listing.id },
      data: { currency: "MKD" },
    });

    const booking = await book(listing.id, guest.id);
    expect(booking.currency).toBe("MKD");
    expect(booking.advancePaymentAmount).toBeNull();
    expect(booking.damageDepositAmount).toBeNull();
    expect(booking.advancePaymentStatus).toBe("NOT_REQUIRED");
    expect(booking.damageDepositStatus).toBe("NOT_REQUIRED");
    expect(booking.depositPolicySnapshot).toMatchObject({
      status: "UNANSWERED",
      advancePayment: null,
      damageDeposit: null,
    });
  });

  it("quotes nothing for a legacy row whose deposit currency was never stamped", async () => {
    const { listing, guest } = await setup({
      depositPoliciesCurrency: null,
      depositPoliciesReviewedAt: new Date(),
      advancePaymentEnabled: true,
      advancePaymentType: "FIXED",
      advancePaymentValue: 100,
      advancePaymentDueTiming: "AFTER_ACCEPTANCE",
    });

    const booking = await book(listing.id, guest.id);
    expect(booking.advancePaymentAmount).toBeNull();
    expect(booking.depositPolicySnapshot).toMatchObject({ status: "UNANSWERED" });
  });

  it("leaves a frozen booking untouched when the listing is edited afterwards", async () => {
    const { listing, guest } = await setup({
      ...reviewedEur,
      advancePaymentEnabled: true,
      advancePaymentType: "FIXED",
      advancePaymentValue: 80,
      advancePaymentDueTiming: "AFTER_ACCEPTANCE",
      damageDepositEnabled: true,
      damageDepositType: "FIXED",
      damageDepositValue: 150,
      damageDepositDueTiming: "AT_CHECK_IN",
    });

    const booking = await book(listing.id, guest.id);
    const frozen = {
      currency: booking.currency,
      advancePaymentAmount: booking.advancePaymentAmount,
      damageDepositAmount: booking.damageDepositAmount,
      depositPolicySnapshot: booking.depositPolicySnapshot,
    };

    // Everything the host could change afterwards: the amounts, the label, the price.
    await db.listing.update({
      where: { id: listing.id },
      data: {
        advancePaymentValue: 5,
        damageDepositValue: 5,
        depositPoliciesCurrency: "MKD",
        depositPoliciesReviewedAt: new Date(),
      },
    });
    await db.pricingRule.update({
      where: { listingId: listing.id },
      data: { currency: "MKD", baseNightlyRate: 4000 },
    });

    const reread = await db.booking.findUniqueOrThrow({
      where: { id: booking.id },
      select: {
        currency: true,
        advancePaymentAmount: true,
        damageDepositAmount: true,
        depositPolicySnapshot: true,
      },
    });
    expect(reread).toEqual(frozen);
    expect(reread.currency).toBe("EUR");
  });
});
