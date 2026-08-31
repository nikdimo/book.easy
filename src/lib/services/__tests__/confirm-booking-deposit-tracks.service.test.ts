import { describe, it, expect, afterEach } from "vitest";
import { db } from "@/lib/db";
import { confirmBooking, createBooking } from "@/lib/services/booking.service";
import {
  createTestHostAndListing,
  createTestGuest,
  cleanupTestFixtures,
  type TestFixtures,
} from "./test-helpers";

/**
 * M3: accepting a request must not reopen a money track that was already settled.
 *
 * At creation each track is opened only if its own amount came out above zero, and
 * `NOT_REQUIRED` is written as a real answer — the one the guest was shown at request
 * time. `confirmBooking` used to key the transition off the presence of a *policy
 * object* alone, so a policy that resolved to nothing flipped that settled answer to
 * AWAITING_PAYMENT / AWAITING_DEPOSIT on acceptance, asking the guest for money the
 * booking had already told them was not owed.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

function utcToday(): Date {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

const plusDays = (base: Date, days: number) =>
  new Date(base.getTime() + days * DAY_MS);

/** A listing whose host asked for both an advance payment and a damage deposit. */
async function createListingWithDepositPolicies() {
  const { host, property, listing } = await createTestHostAndListing();
  await db.listing.update({
    where: { id: listing.id },
    data: {
      depositPoliciesCurrency: "EUR",
      depositPoliciesReviewedAt: new Date(),
      advancePaymentEnabled: true,
      advancePaymentType: "PERCENTAGE",
      advancePaymentValue: 20,
      advancePaymentDueTiming: "AFTER_ACCEPTANCE",
      damageDepositEnabled: true,
      damageDepositType: "FIXED",
      damageDepositValue: 100,
      damageDepositDueTiming: "AFTER_ACCEPTANCE",
    },
  });
  return { host, property, listing };
}

async function createPendingBooking(listingId: string, guestId: string) {
  const base = plusDays(utcToday(), 30);
  return createBooking({
    listingId,
    guestId,
    checkIn: base,
    checkOut: plusDays(base, 4),
    guestCount: 2,
  });
}

describe("confirmBooking deposit tracks", () => {
  let fixtures: TestFixtures | undefined;

  afterEach(async () => {
    if (fixtures) await cleanupTestFixtures(fixtures);
    fixtures = undefined;
  });

  it("opens both tracks when the frozen amounts are real", async () => {
    // The behaviour the fix must not disturb: a policy that actually asks for money
    // still opens on acceptance.
    const { host, property, listing } = await createListingWithDepositPolicies();
    const guest = await createTestGuest();
    fixtures = {
      hostId: host.id,
      propertyId: property.id,
      listingId: listing.id,
      extraUserIds: [guest.id],
    };

    const booking = await createPendingBooking(listing.id, guest.id);
    expect(Number(booking.advancePaymentAmount)).toBeGreaterThan(0);
    expect(Number(booking.damageDepositAmount)).toBeGreaterThan(0);

    await confirmBooking(booking.id, host.id, { decision: "NO_INSTRUCTIONS" });

    const confirmed = await db.booking.findUniqueOrThrow({
      where: { id: booking.id },
    });
    expect(confirmed.advancePaymentStatus).toBe("AWAITING_PAYMENT");
    expect(confirmed.damageDepositStatus).toBe("AWAITING_DEPOSIT");
  });

  it("leaves a track settled as NOT_REQUIRED settled", async () => {
    const { host, property, listing } = await createListingWithDepositPolicies();
    const guest = await createTestGuest();
    fixtures = {
      hostId: host.id,
      propertyId: property.id,
      listingId: listing.id,
      extraUserIds: [guest.id],
    };

    const booking = await createPendingBooking(listing.id, guest.id);
    // The state creation writes for a policy that resolved to nothing: a settled track,
    // with the policy object still present in the frozen snapshot.
    await db.booking.update({
      where: { id: booking.id },
      data: {
        advancePaymentAmount: 0,
        damageDepositAmount: 0,
        advancePaymentStatus: "NOT_REQUIRED",
        damageDepositStatus: "NOT_REQUIRED",
      },
    });

    await confirmBooking(booking.id, host.id, { decision: "NO_INSTRUCTIONS" });

    const confirmed = await db.booking.findUniqueOrThrow({
      where: { id: booking.id },
    });
    expect(confirmed.advancePaymentStatus).toBe("NOT_REQUIRED");
    expect(confirmed.damageDepositStatus).toBe("NOT_REQUIRED");
    expect(confirmed.advancePaymentStatusUpdatedAt).toBeNull();
    expect(confirmed.damageDepositStatusUpdatedAt).toBeNull();
  });

  it("does not open a track whose frozen amount rounds to zero", async () => {
    const { host, property, listing } = await createListingWithDepositPolicies();
    const guest = await createTestGuest();
    fixtures = {
      hostId: host.id,
      propertyId: property.id,
      listingId: listing.id,
      extraUserIds: [guest.id],
    };

    const booking = await createPendingBooking(listing.id, guest.id);
    // A percentage small enough to round away against this total. The amount is the
    // figure the guest was quoted, so it — not the policy object — has to decide.
    await db.booking.update({
      where: { id: booking.id },
      data: {
        advancePaymentAmount: "0.000",
        damageDepositAmount: "0.000",
        advancePaymentStatus: "UNTRACKED",
        damageDepositStatus: "UNTRACKED",
      },
    });

    await confirmBooking(booking.id, host.id, { decision: "NO_INSTRUCTIONS" });

    const confirmed = await db.booking.findUniqueOrThrow({
      where: { id: booking.id },
    });
    expect(confirmed.advancePaymentStatus).toBe("NOT_REQUIRED");
    expect(confirmed.damageDepositStatus).toBe("NOT_REQUIRED");
  });

  it("keeps a track settled even when only one of the two resolved to zero", async () => {
    const { host, property, listing } = await createListingWithDepositPolicies();
    const guest = await createTestGuest();
    fixtures = {
      hostId: host.id,
      propertyId: property.id,
      listingId: listing.id,
      extraUserIds: [guest.id],
    };

    const booking = await createPendingBooking(listing.id, guest.id);
    await db.booking.update({
      where: { id: booking.id },
      data: {
        advancePaymentAmount: 0,
        advancePaymentStatus: "NOT_REQUIRED",
      },
    });

    await confirmBooking(booking.id, host.id, { decision: "NO_INSTRUCTIONS" });

    const confirmed = await db.booking.findUniqueOrThrow({
      where: { id: booking.id },
    });
    expect(confirmed.advancePaymentStatus).toBe("NOT_REQUIRED");
    // The damage deposit still asks for real money and must still open.
    expect(confirmed.damageDepositStatus).toBe("AWAITING_DEPOSIT");
  });
});
