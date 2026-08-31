import { createHash, randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { addDaysToYmd, todayYmd, ymdToDbDate } from "@/lib/utils/date-only";
import {
  AccountDeletionBlockedError,
  ERASED_USER_NAME,
  deleteUserAccount,
  erasedEmailFor,
} from "@/lib/services/gdpr.service";
import { confirmAccountDeletion } from "@/lib/services/account-deletion.service";

/**
 * Erasure against the real database (see vitest.config.ts) — which is the only place
 * this can be tested honestly. The bug these cover was a foreign-key violation, and a
 * mocked Prisma client has no foreign keys to violate: every one of these tests passed
 * against the broken implementation until the query actually reached Postgres.
 *
 * Four constraints onto `User` are `ON DELETE RESTRICT` — `Booking.guestId`,
 * `Listing.hostId`, `Property.ownerId`, `Suggestion.hostId`. Each scenario below leaves
 * at least one of them populated on purpose.
 */

const ymd = (offset: number) => addDaysToYmd(todayYmd(), offset);
const dbDate = (offset: number) => ymdToDbDate(ymd(offset));
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

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
  // Ordered by the same RESTRICT constraints the code under test has to satisfy.
  await db.availabilityBlock.deleteMany({ where: { listingId: { in: fixture.listingIds } } });
  await db.booking.deleteMany({ where: { listingId: { in: fixture.listingIds } } });
  await db.booking.deleteMany({ where: { guestId: { in: fixture.userIds } } });
  await db.suggestion.deleteMany({ where: { hostId: { in: fixture.userIds } } });
  await db.contactMessage.deleteMany({ where: { userId: { in: fixture.userIds } } });
  await db.accountDeletionToken.deleteMany({ where: { userId: { in: fixture.userIds } } });
  await db.listing.deleteMany({ where: { id: { in: fixture.listingIds } } });
  await db.property.deleteMany({ where: { id: { in: fixture.propertyIds } } });
  await db.user.deleteMany({ where: { id: { in: fixture.userIds } } });
  vi.restoreAllMocks();
});

async function makeUser(overrides: { isHost?: boolean; name?: string } = {}) {
  const user = await db.user.create({
    data: {
      email: `erasure-${randomUUID()}@example.test`,
      name: overrides.name ?? "Real Person",
      isHost: overrides.isHost ?? false,
      image: null,
      locale: "mk",
      displayCurrency: "MKD",
      emailVerified: new Date(),
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
      name: "Erasure Test Property",
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
      title: `Erasure Listing ${id}`,
      slug: `erasure-listing-${id}`,
      description: "A listing created for account-erasure tests.",
      status: "APPROVED",
      maxGuests: 4,
      bedrooms: 1,
      bathrooms: 1,
      beds: 1,
      paymentMethodOther: "Pay Nikola directly",
      paymentInstructionTemplates: {
        version: 2,
        templates: { PAYPAL: "Send to private@example.test" },
      },
    },
  });
  fixture.listingIds.push(listing.id);
  return { property, listing };
}

async function makeBooking(opts: {
  listingId: string;
  guestId: string;
  status: "PENDING" | "CONFIRMED" | "COMPLETED";
  checkIn: number;
  checkOut: number;
  guestNote?: string;
}) {
  return db.booking.create({
    data: {
      listingId: opts.listingId,
      guestId: opts.guestId,
      checkIn: dbDate(opts.checkIn),
      checkOut: dbDate(opts.checkOut),
      guestCount: 2,
      nightlyRate: 50,
      totalPrice: 100,
      numberOfNights: Math.max(1, opts.checkOut - opts.checkIn),
      status: opts.status,
      guestNote: opts.guestNote ?? null,
    },
  });
}

/** The whole point of the exercise: is there a person left in this row? */
async function expectErased(userId: string, originalEmail: string) {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  expect(user.deletedAt).not.toBeNull();
  expect(user.email).toBe(erasedEmailFor(userId));
  expect(user.name).toBe(ERASED_USER_NAME);
  expect(user.image).toBeNull();
  expect(user.locale).toBeNull();
  expect(user.displayCurrency).toBeNull();
  expect(user.emailVerified).toBeNull();
  // The sign-in callback refuses an inactive account, so the husk cannot be entered.
  expect(user.isActive).toBe(false);
  // And the real address is free again for a fresh signup.
  expect(await db.user.findUnique({ where: { email: originalEmail } })).toBeNull();
  expect(await db.profile.findUnique({ where: { userId } })).toBeNull();
}

describe("deleteUserAccount — accounts with history", () => {
  it("erases an account that has never booked or hosted", async () => {
    const user = await makeUser();
    await db.profile.create({ data: { userId: user.id, phone: "+38970123456", bio: "Hi" } });

    const result = await deleteUserAccount(user.id);

    expect(result.success).toBe(true);
    expect(result.alreadyErased).toBe(false);
    await expectErased(user.id, user.email);
  });

  it("erases a guest who has a completed stay, and keeps the stay", async () => {
    const host = await makeUser({ isHost: true });
    const { listing } = await makeListing(host.id);
    const guest = await makeUser();
    const booking = await makeBooking({
      listingId: listing.id,
      guestId: guest.id,
      status: "COMPLETED",
      checkIn: -10,
      checkOut: -7,
      guestNote: "Arriving late, call me on +38970123456",
    });

    const result = await deleteUserAccount(guest.id);

    expect(result.success).toBe(true);
    await expectErased(guest.id, guest.email);

    // The record survives with its money and dates intact — that is what the seven-year
    // retention is for — but the free text the guest wrote about themselves does not.
    const kept = await db.booking.findUniqueOrThrow({
      where: { id: booking.id },
      include: { guest: { select: { name: true } } },
    });
    expect(kept.status).toBe("COMPLETED");
    expect(kept.totalPrice.toString()).toBe(booking.totalPrice.toString());
    expect(kept.guestId).toBe(guest.id);
    expect(kept.guestNote).toBeNull();
    // Nothing downstream has to learn about nulls: the join still resolves.
    expect(kept.guest.name).toBe(ERASED_USER_NAME);
  });

  it("erases a host who has listings, a property and a suggestion", async () => {
    const host = await makeUser({ isHost: true });
    const { property, listing } = await makeListing(host.id);
    const suggestion = await db.suggestion.create({
      data: { kind: "AMENITY", label: "Ski locker", hostId: host.id },
    });
    const conversation = await db.conversation.create({
      data: {
        listingId: listing.id,
        participants: { create: { userId: host.id } },
      },
    });

    const result = await deleteUserAccount(host.id);

    expect(result.success).toBe(true);
    await expectErased(host.id, host.email);

    // All three RESTRICT rows still exist and still point at the husk.
    const archived = await db.listing.findUniqueOrThrow({ where: { id: listing.id } });
    expect(archived.status).toBe("ARCHIVED");
    expect(archived.hostId).toBe(host.id);
    expect(archived.paymentInstructionTemplates).toBeNull();
    expect(archived.paymentMethodOther).toBeNull();
    expect(await db.property.findUnique({ where: { id: property.id } })).not.toBeNull();
    expect(await db.suggestion.findUnique({ where: { id: suggestion.id } })).not.toBeNull();
    expect(
      await db.conversationParticipant.count({
        where: { conversationId: conversation.id, userId: host.id },
      }),
    ).toBe(0);
  });

  it("erases a host whose guest already checked out", async () => {
    const host = await makeUser({ isHost: true });
    const { listing } = await makeListing(host.id);
    const guest = await makeUser();
    const booking = await makeBooking({
      listingId: listing.id,
      guestId: guest.id,
      status: "COMPLETED",
      checkIn: -5,
      checkOut: -2,
    });
    await db.booking.update({
      where: { id: booking.id },
      data: {
        paymentInstructionsSnapshot: {
          version: 2,
          method: "BANK_TRANSFER",
          fields: { iban: "PRIVATE-IBAN" },
        },
      },
    });
    const conversation = await db.conversation.create({
      data: { listingId: listing.id, bookingId: booking.id },
    });
    const paymentMessage = await db.message.create({
      data: {
        conversationId: conversation.id,
        senderId: host.id,
        kind: "PAYMENT_INSTRUCTIONS",
        body: "Send payment to PRIVATE-IBAN",
      },
    });

    const result = await deleteUserAccount(host.id);

    expect(result.success).toBe(true);
    await expectErased(host.id, host.email);
    await expect(
      db.booking.findUniqueOrThrow({ where: { id: booking.id } }),
    ).resolves.toMatchObject({ paymentInstructionsSnapshot: null });
    await expect(
      db.message.findUniqueOrThrow({ where: { id: paymentMessage.id } }),
    ).resolves.toMatchObject({
      senderId: null,
      body: "Payment details removed after account deletion",
      deletedAt: expect.any(Date),
    });
  });

  it("withdraws the guest's own pending requests and releases their hold", async () => {
    const host = await makeUser({ isHost: true });
    const { listing } = await makeListing(host.id);
    const guest = await makeUser();
    const pending = await makeBooking({
      listingId: listing.id,
      guestId: guest.id,
      status: "PENDING",
      checkIn: 20,
      checkOut: 23,
    });
    await db.availabilityBlock.create({
      data: {
        listingId: listing.id,
        bookingId: pending.id,
        blockType: "BOOKING_HOLD",
        startDate: dbDate(20),
        endDate: dbDate(23),
      },
    });

    await deleteUserAccount(guest.id);

    const after = await db.booking.findUniqueOrThrow({ where: { id: pending.id } });
    expect(after.status).toBe("CANCELLED_BY_GUEST");
    // A withdrawn request must not keep sitting on the host's calendar.
    expect(
      await db.availabilityBlock.count({ where: { bookingId: pending.id } })
    ).toBe(0);
  });

  it("records the withdrawal in the booking's permanent history", async () => {
    const host = await makeUser({ isHost: true });
    const { listing } = await makeListing(host.id);
    const guest = await makeUser();
    const pending = await makeBooking({
      listingId: listing.id,
      guestId: guest.id,
      status: "PENDING",
      checkIn: 30,
      checkOut: 33,
    });

    await deleteUserAccount(guest.id);

    // The host is left holding a booking whose status says the guest cancelled it, so
    // the history has to say so too — written inside the erasure's own transaction,
    // because nothing downstream of it ever will. The actor id is deliberately absent:
    // that account is erased in this same transaction, and every timeline row pointing
    // at it was nulled a few statements earlier. "The guest did this" is what survives.
    const events = await db.bookingTimelineEvent.findMany({
      where: { bookingId: pending.id },
    });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "CANCELLED_BY_GUEST",
      actorId: null,
      data: { actor: "GUEST", reason: "ACCOUNT_DELETION" },
    });
  });

  it("detaches contributed content instead of destroying it", async () => {
    const user = await makeUser();
    const message = await db.contactMessage.create({
      data: {
        userId: user.id,
        name: "Real Person",
        email: user.email,
        category: "support",
        subject: "Hello",
        message: "A question.",
      },
    });

    await deleteUserAccount(user.id);

    const kept = await db.contactMessage.findUniqueOrThrow({ where: { id: message.id } });
    expect(kept.userId).toBeNull();
    expect(kept.subject).toBe("Hello");
  });

  it("reports success and writes nothing when the account is already a husk", async () => {
    const user = await makeUser();
    await deleteUserAccount(user.id);
    const first = await db.user.findUniqueOrThrow({ where: { id: user.id } });

    const again = await deleteUserAccount(user.id);

    expect(again.success).toBe(true);
    expect(again.alreadyErased).toBe(true);
    const second = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(second.deletedAt).toEqual(first.deletedAt);
  });
});

describe("deleteUserAccount — refusals", () => {
  it("refuses a guest with a confirmed stay still to come, and changes nothing", async () => {
    const host = await makeUser({ isHost: true });
    const { listing } = await makeListing(host.id);
    const guest = await makeUser();
    await makeBooking({
      listingId: listing.id,
      guestId: guest.id,
      status: "CONFIRMED",
      checkIn: 7,
      checkOut: 10,
    });

    await expect(deleteUserAccount(guest.id)).rejects.toBeInstanceOf(
      AccountDeletionBlockedError
    );

    const untouched = await db.user.findUniqueOrThrow({ where: { id: guest.id } });
    expect(untouched.deletedAt).toBeNull();
    expect(untouched.email).toBe(guest.email);
    expect(untouched.isActive).toBe(true);
  });

  it("refuses a guest whose stay is under way right now", async () => {
    const host = await makeUser({ isHost: true });
    const { listing } = await makeListing(host.id);
    const guest = await makeUser();
    await makeBooking({
      listingId: listing.id,
      guestId: guest.id,
      status: "CONFIRMED",
      checkIn: -1,
      checkOut: 2,
    });

    await expect(deleteUserAccount(guest.id)).rejects.toThrow(/has not finished yet/);
  });

  it("refuses a host who owes an arriving guest a room, and says so", async () => {
    const host = await makeUser({ isHost: true });
    const { listing } = await makeListing(host.id);
    const guest = await makeUser();
    await makeBooking({
      listingId: listing.id,
      guestId: guest.id,
      status: "CONFIRMED",
      checkIn: 3,
      checkOut: 6,
    });

    const error = await deleteUserAccount(host.id).catch((err: unknown) => err);

    expect(error).toBeInstanceOf(AccountDeletionBlockedError);
    const message = (error as Error).message;
    expect(message).toContain("1 reservation at your listing");
    expect(message).toContain(ymd(6));
    // The listing is still live — a refusal must not half-apply the erasure.
    const listingAfter = await db.listing.findUniqueOrThrow({ where: { id: listing.id } });
    expect(listingAfter.status).toBe("APPROVED");
  });

  it("counts both sides when the account is blocked as guest and as host", async () => {
    const other = await makeUser({ isHost: true });
    const { listing: theirListing } = await makeListing(other.id);
    const user = await makeUser({ isHost: true });
    const { listing: ownListing } = await makeListing(user.id);
    const visitor = await makeUser();

    await makeBooking({
      listingId: theirListing.id,
      guestId: user.id,
      status: "CONFIRMED",
      checkIn: 2,
      checkOut: 4,
    });
    await makeBooking({
      listingId: ownListing.id,
      guestId: visitor.id,
      status: "CONFIRMED",
      checkIn: 8,
      checkOut: 12,
    });

    const error = await deleteUserAccount(user.id).catch((err: unknown) => err);

    const message = (error as Error).message;
    expect(message).toContain("1 stay you booked");
    expect(message).toContain("1 reservation at your listing");
    expect(message).toContain(ymd(12));
  });

  // A request nobody has accepted is not a commitment anyone is relying on, so it is
  // withdrawn rather than treated as a reason to keep the account alive.
  it("does not refuse over a pending future request the guest made", async () => {
    const host = await makeUser({ isHost: true });
    const { listing } = await makeListing(host.id);
    const guest = await makeUser();
    await makeBooking({
      listingId: listing.id,
      guestId: guest.id,
      status: "PENDING",
      checkIn: 15,
      checkOut: 18,
    });

    const result = await deleteUserAccount(guest.id);

    expect(result.success).toBe(true);
    await expectErased(guest.id, guest.email);
  });
});

describe("confirmAccountDeletion — the token and the erasure are one transaction", () => {
  async function issueToken(userId: string) {
    const raw = randomUUID().replace(/-/g, "");
    await db.accountDeletionToken.create({
      data: {
        userId,
        tokenHash: hashToken(raw),
        expires: new Date(Date.now() + 60 * 60 * 1000),
      },
    });
    return raw;
  }

  it("consumes the link and erases the account", async () => {
    const user = await makeUser();
    const token = await issueToken(user.id);

    await expect(confirmAccountDeletion(token, user.id)).resolves.toEqual({ ok: true });

    await expectErased(user.id, user.email);
    // Spent links are cleared out with the rest of the account.
    expect(await db.accountDeletionToken.count({ where: { userId: user.id } })).toBe(0);
  });

  it("leaves the link usable when the erasure is refused", async () => {
    const host = await makeUser({ isHost: true });
    const { listing } = await makeListing(host.id);
    const guest = await makeUser();
    const blocker = await makeBooking({
      listingId: listing.id,
      guestId: guest.id,
      status: "CONFIRMED",
      checkIn: 5,
      checkOut: 9,
    });
    const token = await issueToken(guest.id);

    const refused = await confirmAccountDeletion(token, guest.id);

    expect(refused.ok).toBe(false);
    expect(refused).toMatchObject({ error: expect.stringContaining("1 stay you booked") });
    // The link is the thing this whole finding turned on: a refusal must not spend it.
    const stillLive = await db.accountDeletionToken.findFirstOrThrow({
      where: { userId: guest.id },
    });
    expect(stillLive.usedAt).toBeNull();

    // Clear the blocker and the same emailed link still works.
    await db.booking.update({
      where: { id: blocker.id },
      data: { status: "CANCELLED_BY_GUEST" },
    });
    await expect(confirmAccountDeletion(token, guest.id)).resolves.toEqual({ ok: true });
    await expectErased(guest.id, guest.email);
  });

  it("rolls the token back when the transaction fails outright", async () => {
    const user = await makeUser();
    const token = await issueToken(user.id);

    // A real, uncontrived failure inside the transaction: the placeholder address the
    // erasure writes is already taken, so the final update violates User.email's unique
    // index and Postgres rolls the whole thing back.
    const squatter = await db.user.create({
      data: { email: erasedEmailFor(user.id), name: "Squatter" },
    });
    fixture.userIds.push(squatter.id);
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    const failed = await confirmAccountDeletion(token, user.id);

    expect(failed.ok).toBe(false);
    expect(failed).toMatchObject({ error: expect.stringContaining("Contact support") });
    logged.mockRestore();

    // Nothing was applied…
    const intact = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(intact.deletedAt).toBeNull();
    expect(intact.email).toBe(user.email);
    expect(intact.isActive).toBe(true);
    // …and the confirmation link was not burned.
    const stillLive = await db.accountDeletionToken.findFirstOrThrow({
      where: { userId: user.id },
    });
    expect(stillLive.usedAt).toBeNull();

    // Remove the cause and retry with the same link.
    await db.user.delete({ where: { id: squatter.id } });
    await expect(confirmAccountDeletion(token, user.id)).resolves.toEqual({ ok: true });
    await expectErased(user.id, user.email);
  });

  it("refuses a second use of a link that already worked", async () => {
    const user = await makeUser();
    const token = await issueToken(user.id);

    await confirmAccountDeletion(token, user.id);
    const replayed = await confirmAccountDeletion(token, user.id);

    expect(replayed.ok).toBe(false);
  });

  it("refuses a link that belongs to somebody else", async () => {
    const owner = await makeUser();
    const bystander = await makeUser();
    const token = await issueToken(owner.id);

    const result = await confirmAccountDeletion(token, bystander.id);

    expect(result).toMatchObject({ ok: false });
    const untouched = await db.user.findUniqueOrThrow({ where: { id: owner.id } });
    expect(untouched.deletedAt).toBeNull();
  });
});
