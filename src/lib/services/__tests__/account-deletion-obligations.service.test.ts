import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { addDaysToYmd, todayYmd, ymdToDbDate } from "@/lib/utils/date-only";
import {
  AccountDeletionBlockedError,
  deleteUserAccount,
} from "@/lib/services/gdpr.service";

/**
 * #10: erasure and open money.
 *
 * Deletion already refused a confirmed stay that had not finished. It did not refuse an
 * open *financial* obligation, so a host holding a guest's confirmed damage deposit —
 * or one the platform had recorded as owing an accommodation refund — could erase
 * themselves. The refund reminder job then kept targeting a deleted user and the guest
 * lost the counterparty to an obligation the platform itself opened.
 *
 * The interesting half of this guard is what it deliberately does *not* block, so those
 * cases are pinned as hard as the refusals.
 *
 * Integration test against the real local Postgres. Run `npm run db:docker` first if the
 * container isn't up.
 */

const dbDate = (offset: number) => ymdToDbDate(addDaysToYmd(todayYmd(), offset));

interface Fixture {
  userIds: string[];
  listingIds: string[];
  propertyIds: string[];
}

let fixture: Fixture;

beforeEach(() => {
  fixture = { userIds: [], listingIds: [], propertyIds: [] };
});

afterEach(async () => {
  await db.availabilityBlock.deleteMany({
    where: { listingId: { in: fixture.listingIds } },
  });
  await db.booking.deleteMany({ where: { listingId: { in: fixture.listingIds } } });
  await db.booking.deleteMany({ where: { guestId: { in: fixture.userIds } } });
  await db.listing.deleteMany({ where: { id: { in: fixture.listingIds } } });
  await db.property.deleteMany({ where: { id: { in: fixture.propertyIds } } });
  await db.user.deleteMany({ where: { id: { in: fixture.userIds } } });
});

async function makeUser(isHost = false) {
  const user = await db.user.create({
    data: {
      email: `obligation-${randomUUID()}@example.test`,
      name: "Real Person",
      isHost,
    },
  });
  fixture.userIds.push(user.id);
  return user;
}

async function makeListing(hostId: string) {
  const id = randomUUID();
  const property = await db.property.create({
    data: {
      ownerId: hostId,
      name: "Obligation Test Property",
      propertyType: "APARTMENT",
      address: "1 Test St",
      city: "Testville",
      country: "North Macedonia",
    },
  });
  fixture.propertyIds.push(property.id);
  const listing = await db.listing.create({
    data: {
      propertyId: property.id,
      hostId,
      title: `Obligation Listing ${id}`,
      slug: `obligation-listing-${id}`,
      description: "A listing created for erasure-obligation tests.",
      status: "APPROVED",
      maxGuests: 4,
      bedrooms: 1,
      bathrooms: 1,
      beds: 1,
    },
  });
  fixture.listingIds.push(listing.id);
  return listing;
}

/** A finished or cancelled booking — never one the ACTIVE_BOOKING guard would catch. */
async function makeSettledBooking(
  listingId: string,
  guestId: string,
  data: Record<string, unknown>,
) {
  return db.booking.create({
    data: {
      listingId,
      guestId,
      checkIn: dbDate(-10),
      checkOut: dbDate(-7),
      guestCount: 2,
      nightlyRate: 50,
      totalPrice: 150,
      numberOfNights: 3,
      status: "COMPLETED",
      ...data,
    },
  });
}

/** Runs the erasure and returns the refusal, or null when it went through. */
async function refusalFor(userId: string) {
  try {
    await deleteUserAccount(userId);
    return null;
  } catch (error) {
    if (error instanceof AccountDeletionBlockedError) return error;
    throw error;
  }
}

describe("erasure blocks a host who is still holding confirmed money", () => {
  it("refuses while a confirmed damage deposit has not been returned", async () => {
    const host = await makeUser(true);
    const guest = await makeUser();
    const listing = await makeListing(host.id);
    const booking = await makeSettledBooking(listing.id, guest.id, {
      damageDepositAmount: 120,
      damageDepositStatus: "DEPOSIT_CONFIRMED",
    });

    const refusal = await refusalFor(host.id);
    expect(refusal?.reason).toBe("OPEN_OBLIGATION");
    // Names the obligation and the route out, rather than just saying no.
    expect(refusal?.message).toContain(booking.reference);
    expect(refusal?.message).toMatch(/damage deposit/i);
    expect(refusal?.message).toMatch(/contact support/i);
  });

  it("lets the host go once the deposit return is reported", async () => {
    const host = await makeUser(true);
    const guest = await makeUser();
    const listing = await makeListing(host.id);
    await makeSettledBooking(listing.id, guest.id, {
      damageDepositAmount: 120,
      damageDepositStatus: "RETURN_REPORTED",
    });

    // A report discharges the reporter's own obligation, exactly as it does for
    // reminders. The host has said they returned it; waiting on the guest to confirm
    // would make somebody else's silence an indefinite blocker.
    expect(await refusalFor(host.id)).toBeNull();
  });

  it("does not block the guest for the deposit the host is holding", async () => {
    const host = await makeUser(true);
    const guest = await makeUser();
    const listing = await makeListing(host.id);
    await makeSettledBooking(listing.id, guest.id, {
      damageDepositAmount: 120,
      damageDepositStatus: "DEPOSIT_CONFIRMED",
    });

    // Role sensitivity: this is money the *host* holds. Blocking the guest would refuse
    // erasure to the person who is owed rather than the one who owes.
    expect(await refusalFor(guest.id)).toBeNull();
  });
});

describe("erasure and an accommodation refund", () => {
  const settlement = (basis: string, version = 2) => ({
    version,
    calculatedAt: new Date().toISOString(),
    freeCancellation: true,
    accommodationRefundAmount: 150,
    retainableAdvanceAmount: 0,
    damageDepositReturnRequired: false,
    ...(version === 2
      ? {
          confirmedRefundAmount: basis === "CONFIRMED" ? 150 : 0,
          refundBasis: basis,
          depositReturnBasis: "CONFIRMED",
        }
      : {}),
  });

  it("refuses a host who owes a refund built on confirmed money", async () => {
    const host = await makeUser(true);
    const guest = await makeUser();
    const listing = await makeListing(host.id);
    const booking = await makeSettledBooking(listing.id, guest.id, {
      status: "CANCELLED_BY_GUEST",
      accommodationRefundAmount: 150,
      accommodationRefundStatus: "AWAITING_REFUND",
      cancellationSettlementSnapshot: settlement("CONFIRMED"),
    });

    const refusal = await refusalFor(host.id);
    expect(refusal?.reason).toBe("OPEN_OBLIGATION");
    expect(refusal?.message).toContain(booking.reference);
    expect(refusal?.message).toMatch(/accommodation refund/i);
  });

  /**
   * The case the audit singled out. `AWAITING_REFUND` can be opened from a settlement
   * that counted an unconfirmed `PAYMENT_REPORTED` as received, so the status alone is
   * not proof that confirmed money moved — and suspending someone's right to erasure on
   * an unverified counterparty claim they cannot make anybody resolve is exactly the
   * indefinite blocker the audit warned against.
   */
  it("does not refuse a host whose refund rests only on a guest's claim", async () => {
    const host = await makeUser(true);
    const guest = await makeUser();
    const listing = await makeListing(host.id);
    await makeSettledBooking(listing.id, guest.id, {
      status: "CANCELLED_BY_GUEST",
      accommodationRefundAmount: 150,
      accommodationRefundStatus: "AWAITING_REFUND",
      cancellationSettlementSnapshot: settlement("CLAIMED"),
    });

    expect(await refusalFor(host.id)).toBeNull();
  });

  /** A version-1 snapshot said nothing about provenance, so it proves nothing either. */
  it("does not refuse on a legacy settlement whose basis is unknown", async () => {
    const host = await makeUser(true);
    const guest = await makeUser();
    const listing = await makeListing(host.id);
    await makeSettledBooking(listing.id, guest.id, {
      status: "CANCELLED_BY_GUEST",
      accommodationRefundAmount: 150,
      accommodationRefundStatus: "AWAITING_REFUND",
      cancellationSettlementSnapshot: settlement("UNKNOWN", 1),
    });

    expect(await refusalFor(host.id)).toBeNull();
  });

  /** Symmetry with RETURN_REPORTED: the host has said they sent it. */
  it("lets the host go once the refund is reported sent", async () => {
    const host = await makeUser(true);
    const guest = await makeUser();
    const listing = await makeListing(host.id);
    await makeSettledBooking(listing.id, guest.id, {
      status: "CANCELLED_BY_GUEST",
      accommodationRefundAmount: 150,
      accommodationRefundStatus: "REFUND_REPORTED",
      cancellationSettlementSnapshot: settlement("CONFIRMED"),
    });

    expect(await refusalFor(host.id)).toBeNull();
  });
});

describe("erasure and money the guest owes", () => {
  it("refuses a guest with an accommodation balance still recorded as due", async () => {
    const host = await makeUser(true);
    const guest = await makeUser();
    const listing = await makeListing(host.id);
    const booking = await makeSettledBooking(listing.id, guest.id, {
      paymentStatus: "AWAITING_PAYMENT",
    });

    const refusal = await refusalFor(guest.id);
    expect(refusal?.reason).toBe("OPEN_OBLIGATION");
    expect(refusal?.message).toContain(booking.reference);
    expect(refusal?.message).toMatch(/accommodation balance/i);
  });

  it("refuses a guest with an advance payment still recorded as due", async () => {
    const host = await makeUser(true);
    const guest = await makeUser();
    const listing = await makeListing(host.id);
    await makeSettledBooking(listing.id, guest.id, {
      advancePaymentAmount: 40,
      advancePaymentStatus: "AWAITING_PAYMENT",
    });

    const refusal = await refusalFor(guest.id);
    expect(refusal?.reason).toBe("OPEN_OBLIGATION");
    expect(refusal?.message).toMatch(/advance payment/i);
  });

  /** A report discharges the reporter's own prompt here too. */
  it("lets the guest go once they have reported paying", async () => {
    const host = await makeUser(true);
    const guest = await makeUser();
    const listing = await makeListing(host.id);
    await makeSettledBooking(listing.id, guest.id, {
      paymentStatus: "PAYMENT_REPORTED",
    });

    expect(await refusalFor(guest.id)).toBeNull();
  });

  it("does not block the host for the balance the guest owes them", async () => {
    const host = await makeUser(true);
    const guest = await makeUser();
    const listing = await makeListing(host.id);
    await makeSettledBooking(listing.id, guest.id, {
      paymentStatus: "AWAITING_PAYMENT",
    });

    expect(await refusalFor(host.id)).toBeNull();
  });

  /** A booking nobody ever accepted put no money in play. */
  it("ignores a pending request that was never accepted", async () => {
    const host = await makeUser(true);
    const guest = await makeUser();
    const listing = await makeListing(host.id);
    await makeSettledBooking(listing.id, guest.id, {
      status: "EXPIRED",
      paymentStatus: "AWAITING_PAYMENT",
    });

    expect(await refusalFor(guest.id)).toBeNull();
  });
});

describe("erasure with nothing outstanding", () => {
  it("still goes through for a settled booking on both sides", async () => {
    const host = await makeUser(true);
    const guest = await makeUser();
    const listing = await makeListing(host.id);
    await makeSettledBooking(listing.id, guest.id, {
      paymentStatus: "PAYMENT_CONFIRMED",
      damageDepositAmount: 120,
      damageDepositStatus: "RETURN_CONFIRMED",
    });

    expect(await refusalFor(guest.id)).toBeNull();
    expect(await refusalFor(host.id)).toBeNull();
  });
});
