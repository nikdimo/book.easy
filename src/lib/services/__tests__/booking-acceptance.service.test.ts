import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * M1: one acceptance rule, one resulting state, whichever screen the host used.
 *
 * Accepting a request used to mean three different things. The web dialog forced a
 * payment decision; the mobile PATCH sent none and `confirmBooking` derived one from
 * the payment method; `confirmBookingAction` did the same and was dead code. A host
 * accepting on their phone landed on `PENDING` instructions nothing had asked them
 * about, and the same booking accepted from the laptop landed somewhere else.
 *
 * Both transports now go through `acceptBookingAsHost`, so this file drives the real
 * server action and the real route handler against the real local Postgres and compares
 * what they leave behind. Only the two edges are stubbed: `auth`/`next/cache`, which
 * need a request scope, and the mobile transport helper, whose CORS and bearer plumbing
 * has its own suite.
 *
 * Run `npm run db:docker` first if the container isn't already up.
 */

const mocks = vi.hoisted(() => ({
  session: { current: null as { user: { id: string; isHost: boolean } } | null },
  mobileHost: { current: "" },
}));

vi.mock("@/lib/auth", () => ({ auth: async () => mocks.session.current }));
// Only the request-scoped invalidation is stubbed; everything else next/cache exports
// (the rate table's `unstable_cache`, among others) stays real.
vi.mock("next/cache", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/cache")>()),
  revalidatePath: () => {},
  revalidateTag: () => {},
}));
vi.mock("@/lib/mobile-api", () => ({
  requireMobileHost: async () => ({
    user: { id: mocks.mobileHost.current, isHost: true, role: "USER" },
  }),
  mobileOptions: () => new Response(null, { status: 204 }),
  mobileJson: (_request: Request, body: unknown, init?: { status?: number }) =>
    Response.json(body, { status: init?.status ?? 200 }),
}));

import { db } from "@/lib/db";
import { createBooking } from "@/lib/services/booking.service";
import { acceptBookingAsHost } from "@/lib/services/booking-acceptance.service";
import { acceptBookingWithPaymentAction } from "@/lib/actions/booking.actions";
import { PATCH as patchBooking } from "@/app/api/mobile/v1/bookings/[id]/route";
import { GET as getBooking } from "@/app/api/mobile/v1/bookings/[id]/route";
import { buildHostActionQueue } from "@/lib/host/booking-action-queue";
import {
  cleanupTestFixtures,
  createTestGuest,
  createTestHostAndListing,
  type TestFixtures,
} from "./test-helpers";

const BANK_FIELDS = {
  accountHolder: "Test Host",
  bankName: "Test Bank",
  accountIdentifier: "DK5000400440116243",
  swiftBic: "DABADKKK",
};

/** A V2 instruction store as it is actually written to a listing row. */
const storeV2 = (details: Record<string, unknown>) => ({
  version: 2,
  templates: {},
  details,
});

function stayDates(offsetDays: number) {
  const checkIn = new Date();
  checkIn.setUTCHours(0, 0, 0, 0);
  checkIn.setUTCDate(checkIn.getUTCDate() + offsetDays);
  const checkOut = new Date(checkIn);
  checkOut.setUTCDate(checkOut.getUTCDate() + 3);
  return { checkIn, checkOut };
}

const ymd = (date: Date) => date.toISOString().slice(0, 10);

/** Everything an acceptance is allowed to have decided, in one comparable shape. */
async function acceptedState(bookingId: string) {
  const booking = await db.booking.findUniqueOrThrow({
    where: { id: bookingId },
    select: {
      status: true,
      paymentStatus: true,
      paymentInstructionsStatus: true,
      advancePaymentStatus: true,
      damageDepositStatus: true,
    },
  });
  const requests = await db.bookingPaymentRequest.findMany({
    where: { bookingId },
    orderBy: { type: "asc" },
    select: { type: true, status: true, amount: true },
  });
  return {
    ...booking,
    requests: requests.map((request) => ({
      type: request.type,
      status: request.status,
      amount: Number(request.amount),
    })),
  };
}

const mobileRequest = (body: unknown) =>
  new Request("https://example.test/api/mobile/v1/bookings/x", {
    method: "PATCH",
    body: JSON.stringify(body),
  });

async function mobileAccept(bookingId: string, body: Record<string, unknown>) {
  const response = (await patchBooking(mobileRequest({ action: "confirm", ...body }), {
    params: Promise.resolve({ id: bookingId }),
  })) as Response;
  return { status: response.status, body: await response.json() };
}

/** The acceptance question as the phone receives it. */
async function mobileAcceptanceBlock(bookingId: string) {
  const response = (await getBooking(
    new Request("https://example.test/api/mobile/v1/bookings/x"),
    { params: Promise.resolve({ id: bookingId }) },
  )) as Response;
  const body = (await response.json()) as {
    booking: {
      acceptance: {
        allowedDecisions: string[];
        instructionsRequired: boolean;
        canSendNow: boolean;
        dueDate: string;
        savedInstructionsPreview: string | null;
      };
    };
  };
  return body.booking.acceptance;
}

describe("host booking acceptance", () => {
  const fixtures: TestFixtures[] = [];
  const auditUsers: string[] = [];
  const bookingIds: string[] = [];

  beforeEach(() => {
    mocks.session.current = null;
    mocks.mobileHost.current = "";
  });

  afterEach(async () => {
    // Payment requests first, and only then the bookings that own them. The reminder
    // sweep scans every SENT request on a confirmed booking and reads the booking in a
    // second query, so a file that let the cascade take both at once could leave that
    // scan holding a request whose booking had just disappeared.
    if (bookingIds.length > 0) {
      await db.bookingPaymentRequest.deleteMany({
        where: { bookingId: { in: bookingIds.splice(0) } },
      });
    }
    // Audit rows hold a required FK to the actor, so they have to go before the users.
    if (auditUsers.length > 0) {
      await db.auditLog.deleteMany({ where: { userId: { in: auditUsers.splice(0) } } });
    }
    for (const fixture of fixtures.splice(0)) await cleanupTestFixtures(fixture);
  });

  async function setup(options: {
    methods?: string[];
    selectedPaymentMethod?: string | null;
    instructionTemplates?: unknown;
    deposits?: Record<string, unknown>;
  } = {}) {
    const { host, property, listing } = await createTestHostAndListing();
    const guest = await createTestGuest();
    fixtures.push({
      hostId: host.id,
      propertyId: property.id,
      listingId: listing.id,
      extraUserIds: [guest.id],
    });
    auditUsers.push(host.id, guest.id);

    await db.listing.update({
      where: { id: listing.id },
      data: {
        acceptedPaymentMethods: (options.methods ?? []) as never,
        paymentMethodsReviewedAt: new Date(),
        paymentInstructionTemplates: (options.instructionTemplates ?? null) as never,
        ...(options.deposits ?? {}),
      },
    });

    const booking = await createBooking({
      listingId: listing.id,
      guestId: guest.id,
      guestCount: 2,
      ...stayDates(120),
      ...({
        selectedPaymentMethod: options.selectedPaymentMethod,
      } as Record<string, unknown>),
    } as Parameters<typeof createBooking>[0]);

    bookingIds.push(booking.id);
    mocks.session.current = { user: { id: host.id, isHost: true } };
    mocks.mobileHost.current = host.id;
    return { host, guest, listing, booking };
  }

  /** A booking the guest asked to settle by bank transfer, with details ready to send. */
  const bankSetup = () =>
    setup({
      methods: ["BANK_TRANSFER_INTERNATIONAL"],
      selectedPaymentMethod: "BANK_TRANSFER_INTERNATIONAL",
      instructionTemplates: storeV2({
        BANK_TRANSFER_INTERNATIONAL: {
          version: 2,
          fields: BANK_FIELDS,
          updatedAt: "2026-08-01T10:00:00.000Z",
        },
      }),
    });

  const cashSetup = () =>
    setup({
      methods: ["CASH_AT_PROPERTY"],
      selectedPaymentMethod: "CASH_AT_PROPERTY",
    });

  describe("web acceptance", () => {
    it("sends the reviewed details on SEND_NOW", async () => {
      const { booking } = await bankSetup();

      const result = await acceptBookingWithPaymentAction({
        bookingId: booking.id,
        decision: "SEND_NOW",
        detailFields: BANK_FIELDS,
        dueDate: ymd(booking.checkIn),
      });

      expect(result).toMatchObject({ success: true, instructionsSent: true });
      const state = await acceptedState(booking.id);
      expect(state.status).toBe("CONFIRMED");
      // The send itself moves this past PENDING — the promise was kept.
      expect(state.paymentInstructionsStatus).toBe("SENT");
      expect(state.requests).toEqual([
        { type: "ACCOMMODATION_BALANCE", status: "SENT", amount: Number(booking.totalPrice) },
      ]);

      const messages = await db.message.findMany({
        where: { conversation: { bookingId: booking.id } },
        select: { kind: true, body: true },
      });
      const sent = messages.filter((message) => message.kind === "PAYMENT_INSTRUCTIONS");
      expect(sent).toHaveLength(1);
      expect(sent[0]?.body).toContain(BANK_FIELDS.accountIdentifier);
      expect(sent[0]?.body).toContain(booking.reference);
    });

    it("leaves a visible follow-up task on SEND_LATER", async () => {
      const { booking } = await bankSetup();

      const result = await acceptBookingWithPaymentAction({
        bookingId: booking.id,
        decision: "SEND_LATER",
      });

      expect(result).toMatchObject({ success: true, instructionsSent: false });
      const state = await acceptedState(booking.id);
      expect(state.paymentInstructionsStatus).toBe("PENDING");
      expect(state.requests).toEqual([
        { type: "ACCOMMODATION_BALANCE", status: "DRAFT", amount: Number(booking.totalPrice) },
      ]);

      // PENDING is not a silent limbo: it is what puts the send on the host's queue.
      const accepted = await db.booking.findUniqueOrThrow({ where: { id: booking.id } });
      const queue = buildHostActionQueue([
        {
          id: accepted.id,
          status: accepted.status,
          checkIn: accepted.checkIn,
          responseDueAt: accepted.responseDueAt,
          unreadCount: 0,
          ratingDueAt: null,
          paymentInstructionsStatus: accepted.paymentInstructionsStatus,
        },
      ]);
      expect(queue[0]).toMatchObject({
        bookingId: booking.id,
        kind: "SEND_PAYMENT_INSTRUCTIONS",
      });
      expect(
        await db.message.count({
          where: { conversation: { bookingId: booking.id }, kind: "PAYMENT_INSTRUCTIONS" },
        }),
      ).toBe(0);
    });

    it("settles the instructions question on NO_INSTRUCTIONS", async () => {
      const { booking } = await cashSetup();

      const result = await acceptBookingWithPaymentAction({
        bookingId: booking.id,
        decision: "NO_INSTRUCTIONS",
      });

      expect(result).toMatchObject({ success: true, instructionsSent: false });
      const state = await acceptedState(booking.id);
      expect(state.paymentInstructionsStatus).toBe("NOT_NEEDED");
      // The obligation still exists and still has a date — there is simply nothing
      // private to send for it, which is recorded rather than left as a task.
      expect(state.requests[0]).toMatchObject({
        type: "ACCOMMODATION_BALANCE",
        status: "SENT",
      });
      const stored = await db.bookingPaymentRequest.findFirstOrThrow({
        where: { bookingId: booking.id },
      });
      expect(stored.instructionsSnapshot).toEqual({ version: 1, kind: "NO_INSTRUCTIONS" });
    });
  });

  describe("mobile acceptance", () => {
    it("sends the host's saved details on SEND_NOW", async () => {
      const { booking } = await bankSetup();

      const response = await mobileAccept(booking.id, {
        decision: "SEND_NOW",
        useSavedInstructions: true,
        dueDate: ymd(booking.checkIn),
      });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        success: true,
        decision: "SEND_NOW",
        instructionsSent: true,
      });
      const state = await acceptedState(booking.id);
      expect(state.paymentInstructionsStatus).toBe("SENT");
      const message = await db.message.findFirstOrThrow({
        where: { conversation: { bookingId: booking.id }, kind: "PAYMENT_INSTRUCTIONS" },
      });
      expect(message.body).toContain(BANK_FIELDS.accountIdentifier);
    });

    it("leaves a follow-up task on SEND_LATER", async () => {
      const { booking } = await bankSetup();

      const response = await mobileAccept(booking.id, { decision: "SEND_LATER" });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ decision: "SEND_LATER", instructionsSent: false });
      expect((await acceptedState(booking.id)).paymentInstructionsStatus).toBe("PENDING");
    });

    it("settles the question on NO_INSTRUCTIONS", async () => {
      const { booking } = await cashSetup();

      const response = await mobileAccept(booking.id, { decision: "NO_INSTRUCTIONS" });

      expect(response.status).toBe(200);
      expect((await acceptedState(booking.id)).paymentInstructionsStatus).toBe("NOT_NEEDED");
    });

    it("offers the host the answers this booking allows, and no others", async () => {
      const { booking } = await bankSetup();

      const acceptance = await mobileAcceptanceBlock(booking.id);

      // A bank transfer needs coordinates, so "no instructions needed" is not on offer.
      expect(acceptance.allowedDecisions).toEqual(["SEND_NOW", "SEND_LATER"]);
      expect(acceptance.instructionsRequired).toBe(true);
      expect(acceptance.canSendNow).toBe(true);
      expect(acceptance.dueDate).toBe(ymd(booking.checkIn));
      expect(acceptance.savedInstructionsPreview).toContain(
        BANK_FIELDS.accountIdentifier,
      );
    });

    it("offers no send-now when nothing reviewed is saved to send", async () => {
      const { booking } = await setup({
        methods: ["BANK_TRANSFER_INTERNATIONAL"],
        selectedPaymentMethod: "BANK_TRANSFER_INTERNATIONAL",
      });

      const acceptance = await mobileAcceptanceBlock(booking.id);

      expect(acceptance.canSendNow).toBe(false);
      expect(acceptance.savedInstructionsPreview).toBeNull();
      // Send-later stays on offer: the money is still owed, it just cannot be
      // coordinated from a screen with no composer.
      expect(acceptance.allowedDecisions).toEqual(["SEND_NOW", "SEND_LATER"]);
    });
  });

  describe("web and mobile agree", () => {
    it("leaves identical state for the same decision on the same kind of booking", async () => {
      for (const decision of ["SEND_LATER", "NO_INSTRUCTIONS"] as const) {
        const web = decision === "NO_INSTRUCTIONS" ? await cashSetup() : await bankSetup();
        const webResult = await acceptBookingWithPaymentAction({
          bookingId: web.booking.id,
          decision,
        });
        expect(webResult, decision).toMatchObject({ success: true });

        const mobile =
          decision === "NO_INSTRUCTIONS" ? await cashSetup() : await bankSetup();
        const mobileResult = await mobileAccept(mobile.booking.id, { decision });
        expect(mobileResult.status, decision).toBe(200);

        expect(await acceptedState(mobile.booking.id), decision).toEqual(
          await acceptedState(web.booking.id),
        );
      }
    });
  });

  describe("the decision is required and checked", () => {
    it("refuses an acceptance that carries no decision", async () => {
      const { booking } = await bankSetup();

      const web = await acceptBookingWithPaymentAction({ bookingId: booking.id });
      expect(web).toEqual({ error: expect.stringMatching(/Choose what happens/) });

      const mobile = await mobileAccept(booking.id, {});
      expect(mobile.status).toBe(400);
      expect(mobile.body).toEqual({ error: expect.stringMatching(/Choose what happens/) });

      // Not accepted by either attempt, and no state guessed on the host's behalf:
      // the instructions question is still literally undecided.
      const state = await acceptedState(booking.id);
      expect(state.status).toBe("PENDING");
      expect(state.paymentInstructionsStatus).toBe("NOT_DECIDED");
      expect(state.requests).toEqual([]);
    });

    it("refuses an unknown decision", async () => {
      const { booking } = await bankSetup();

      const mobile = await mobileAccept(booking.id, { decision: "SEND_EVENTUALLY" });
      expect(mobile.status).toBe(400);
      expect((await acceptedState(booking.id)).status).toBe("PENDING");
    });

    it("refuses 'no instructions' for a method that needs them", async () => {
      const { booking } = await bankSetup();

      const web = await acceptBookingWithPaymentAction({
        bookingId: booking.id,
        decision: "NO_INSTRUCTIONS",
      });
      expect(web).toEqual({ error: expect.stringMatching(/send now or send later/) });
      expect((await acceptedState(booking.id)).status).toBe("PENDING");
    });

    it("refuses a host-supplied method used to dodge the question", async () => {
      // No recorded guest choice, so a posted method is honoured — and then held to
      // that method's own answer rather than to null's.
      const { booking } = await setup({
        methods: ["BANK_TRANSFER_INTERNATIONAL"],
        selectedPaymentMethod: null,
      });

      const result = await acceptBookingWithPaymentAction({
        bookingId: booking.id,
        decision: "NO_INSTRUCTIONS",
        method: "BANK_TRANSFER_INTERNATIONAL",
      });

      expect(result).toEqual({ error: expect.stringMatching(/send now or send later/) });
      expect((await acceptedState(booking.id)).status).toBe("PENDING");
    });

    it("requires a real method before recording that instructions are unnecessary", async () => {
      const { host, booking } = await cashSetup();
      // Recreate a legacy request that froze several choices but no guest selection.
      // Missing is not equivalent to cash: the host has to identify the cash/direct
      // method before the service may settle the instructions question.
      await db.booking.update({
        where: { id: booking.id },
        data: {
          selectedPaymentMethod: null,
          paymentMethodsSnapshot: {
            version: 1,
            status: "REVIEWED",
            methods: ["BANK_TRANSFER_INTERNATIONAL", "CASH_AT_PROPERTY"],
            otherLabel: null,
          },
        },
      });

      const missing = await acceptBookingAsHost({
        bookingId: booking.id,
        hostId: host.id,
        decision: "NO_INSTRUCTIONS",
        source: "WEB",
      });
      expect(missing).toEqual({
        success: false,
        error: expect.stringMatching(/send now or send later/),
      });

      const accepted = await acceptBookingAsHost({
        bookingId: booking.id,
        hostId: host.id,
        decision: "NO_INSTRUCTIONS",
        method: "CASH_AT_PROPERTY",
        source: "WEB",
      });
      expect(accepted).toMatchObject({ success: true });
      const stored = await db.booking.findUniqueOrThrow({
        where: { id: booking.id },
        select: { selectedPaymentMethod: true },
      });
      expect(stored.selectedPaymentMethod).toBe("CASH_AT_PROPERTY");
      const request = await db.bookingPaymentRequest.findFirstOrThrow({
        where: { bookingId: booking.id },
        select: { method: true, status: true },
      });
      expect(request).toEqual({ method: "CASH_AT_PROPERTY", status: "SENT" });
    });

    it("refuses a fallback method outside the booking's frozen choices", async () => {
      const { host, booking } = await cashSetup();
      await db.booking.update({
        where: { id: booking.id },
        data: {
          selectedPaymentMethod: null,
          paymentMethodsSnapshot: {
            version: 1,
            status: "REVIEWED",
            methods: ["CASH_AT_PROPERTY", "BANK_TRANSFER_INTERNATIONAL"],
            otherLabel: null,
          },
        },
      });

      const result = await acceptBookingAsHost({
        bookingId: booking.id,
        hostId: host.id,
        decision: "SEND_LATER",
        method: "PAYPAL",
        source: "WEB",
      });

      expect(result).toEqual({
        success: false,
        error: "That payment method is not valid for this booking.",
      });
      expect((await acceptedState(booking.id)).status).toBe("PENDING");
    });

    it("refuses SEND_NOW with no reviewed details to send", async () => {
      const { booking } = await setup({
        methods: ["BANK_TRANSFER_INTERNATIONAL"],
        selectedPaymentMethod: "BANK_TRANSFER_INTERNATIONAL",
      });

      const web = await acceptBookingWithPaymentAction({
        bookingId: booking.id,
        decision: "SEND_NOW",
        dueDate: ymd(booking.checkIn),
      });
      expect(web).toEqual({
        error: expect.stringMatching(/Add the payment details/),
      });

      // Same booking, same answer from the phone: nothing saved is nothing to send.
      const mobile = await mobileAccept(booking.id, {
        decision: "SEND_NOW",
        useSavedInstructions: true,
        dueDate: ymd(booking.checkIn),
      });
      expect(mobile.status).toBe(400);
      expect((await acceptedState(booking.id)).status).toBe("PENDING");
    });

    it("refuses SEND_NOW with an incomplete detail set", async () => {
      const { booking } = await bankSetup();

      const result = await acceptBookingWithPaymentAction({
        bookingId: booking.id,
        decision: "SEND_NOW",
        detailFields: { accountHolder: BANK_FIELDS.accountHolder },
        dueDate: ymd(booking.checkIn),
      });

      expect(result).toHaveProperty("error");
      expect((await acceptedState(booking.id)).status).toBe("PENDING");
    });

    it("refuses a deadline past check-in", async () => {
      const { booking } = await bankSetup();
      const afterCheckIn = new Date(booking.checkIn);
      afterCheckIn.setUTCDate(afterCheckIn.getUTCDate() + 1);

      const result = await acceptBookingWithPaymentAction({
        bookingId: booking.id,
        decision: "SEND_NOW",
        detailFields: BANK_FIELDS,
        dueDate: ymd(afterCheckIn),
      });

      expect(result).toEqual({
        error: expect.stringMatching(/between today and check-in/),
      });
      expect((await acceptedState(booking.id)).status).toBe("PENDING");
    });
  });

  describe("nothing left to collect", () => {
    it("allows only 'no instructions' for a zero-value stay", async () => {
      const { host, booking } = await bankSetup();
      await db.booking.update({
        where: { id: booking.id },
        data: { totalPrice: 0, advancePaymentAmount: null, damageDepositAmount: null },
      });

      for (const decision of ["SEND_NOW", "SEND_LATER"] as const) {
        const refused = await acceptBookingAsHost({
          bookingId: booking.id,
          hostId: host.id,
          decision,
          source: "WEB",
        });
        expect(refused, decision).toEqual({
          success: false,
          error: expect.stringMatching(/nothing left to collect/),
        });
      }

      const accepted = await acceptBookingAsHost({
        bookingId: booking.id,
        hostId: host.id,
        decision: "NO_INSTRUCTIONS",
        source: "WEB",
      });
      expect(accepted).toMatchObject({ success: true, instructionsSent: false });
      const state = await acceptedState(booking.id);
      expect(state.status).toBe("CONFIRMED");
      expect(state.paymentInstructionsStatus).toBe("NOT_NEEDED");
      // No obligation is invented for a stay that costs nothing.
      expect(state.requests).toEqual([]);
    });

    it("does not reopen a NOT_REQUIRED price track", async () => {
      const { host, booking } = await bankSetup();
      await db.booking.update({
        where: { id: booking.id },
        data: { paymentStatus: "NOT_REQUIRED" },
      });

      const refused = await acceptBookingAsHost({
        bookingId: booking.id,
        hostId: host.id,
        decision: "SEND_LATER",
        source: "MOBILE",
      });
      expect(refused).toEqual({
        success: false,
        error: expect.stringMatching(/nothing left to collect/),
      });

      const accepted = await acceptBookingAsHost({
        bookingId: booking.id,
        hostId: host.id,
        decision: "NO_INSTRUCTIONS",
        source: "MOBILE",
      });
      expect(accepted).toMatchObject({ success: true });
      const state = await acceptedState(booking.id);
      // The waiver survives acceptance, and no request is raised against it.
      expect(state.paymentStatus).toBe("NOT_REQUIRED");
      expect(state.requests).toEqual([]);
    });
  });

  describe("deposit tracks survive acceptance", () => {
    it("keeps the follow-up task when SEND_NOW sends only the first obligation", async () => {
      const { booking } = await setup({
        methods: ["BANK_TRANSFER_INTERNATIONAL"],
        selectedPaymentMethod: "BANK_TRANSFER_INTERNATIONAL",
        instructionTemplates: storeV2({
          BANK_TRANSFER_INTERNATIONAL: {
            version: 2,
            fields: BANK_FIELDS,
            updatedAt: "2026-08-01T10:00:00.000Z",
          },
        }),
        deposits: {
          depositPoliciesCurrency: "EUR",
          depositPoliciesReviewedAt: new Date(),
          advancePaymentEnabled: true,
          advancePaymentType: "PERCENTAGE",
          advancePaymentValue: 20,
          advancePaymentDueTiming: "AFTER_ACCEPTANCE",
          damageDepositEnabled: true,
          damageDepositType: "FIXED",
          damageDepositValue: 100,
          damageDepositDueTiming: "AT_CHECK_IN",
        },
      });

      const result = await acceptBookingWithPaymentAction({
        bookingId: booking.id,
        decision: "SEND_NOW",
        detailFields: BANK_FIELDS,
        dueDate: ymd(booking.checkIn),
      });

      expect(result).toMatchObject({ success: true, instructionsSent: true });
      const state = await acceptedState(booking.id);
      expect(state.requests.filter((request) => request.status === "SENT")).toHaveLength(1);
      expect(state.requests.filter((request) => request.status === "DRAFT")).toHaveLength(2);
      expect(state.paymentInstructionsStatus).toBe("PENDING");
      const accepted = await db.booking.findUniqueOrThrow({ where: { id: booking.id } });
      expect(
        buildHostActionQueue([
          {
            id: accepted.id,
            status: accepted.status,
            checkIn: accepted.checkIn,
            responseDueAt: accepted.responseDueAt,
            unreadCount: 0,
            ratingDueAt: null,
            paymentInstructionsStatus: accepted.paymentInstructionsStatus,
          },
        ]).map((item) => item.kind),
      ).toContain("SEND_PAYMENT_INSTRUCTIONS");
    });

    it("opens the tracks the frozen amounts asked for, and only those", async () => {
      const { host, booking } = await setup({
        methods: ["BANK_TRANSFER_INTERNATIONAL"],
        selectedPaymentMethod: "BANK_TRANSFER_INTERNATIONAL",
        deposits: {
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
      expect(Number(booking.advancePaymentAmount)).toBeGreaterThan(0);
      expect(Number(booking.damageDepositAmount)).toBeGreaterThan(0);

      const result = await acceptBookingAsHost({
        bookingId: booking.id,
        hostId: host.id,
        decision: "SEND_LATER",
        source: "WEB",
      });

      expect(result).toMatchObject({ success: true });
      const state = await acceptedState(booking.id);
      expect(state.advancePaymentStatus).toBe("AWAITING_PAYMENT");
      expect(state.damageDepositStatus).toBe("AWAITING_DEPOSIT");
      expect(state.requests.map((request) => request.type).sort()).toEqual([
        "ACCOMMODATION_BALANCE",
        "ADVANCE_PAYMENT",
        "DAMAGE_DEPOSIT",
      ]);
    });

    it("keeps a track the guest was told was not required settled (M3)", async () => {
      const { host, booking } = await setup({
        methods: ["BANK_TRANSFER_INTERNATIONAL"],
        selectedPaymentMethod: "BANK_TRANSFER_INTERNATIONAL",
        deposits: {
          depositPoliciesCurrency: "EUR",
          depositPoliciesReviewedAt: new Date(),
          // A policy object that resolves to nothing. Creation settles the track as
          // NOT_REQUIRED, and acceptance must not talk it back open.
          advancePaymentEnabled: true,
          advancePaymentType: "FIXED",
          advancePaymentValue: 0,
          advancePaymentDueTiming: "AFTER_ACCEPTANCE",
        },
      });
      expect(booking.advancePaymentStatus).toBe("NOT_REQUIRED");

      await acceptBookingAsHost({
        bookingId: booking.id,
        hostId: host.id,
        decision: "SEND_LATER",
        source: "WEB",
      });

      const state = await acceptedState(booking.id);
      expect(state.advancePaymentStatus).toBe("NOT_REQUIRED");
      expect(state.requests.map((request) => request.type)).toEqual([
        "ACCOMMODATION_BALANCE",
      ]);
    });
  });

  describe("who may accept, and how often", () => {
    it("refuses a host who does not own the listing", async () => {
      const { booking } = await bankSetup();
      const outsider = await createTestHostAndListing();
      fixtures.push({
        hostId: outsider.host.id,
        propertyId: outsider.property.id,
        listingId: outsider.listing.id,
        extraUserIds: [],
      });
      auditUsers.push(outsider.host.id);

      const direct = await acceptBookingAsHost({
        bookingId: booking.id,
        hostId: outsider.host.id,
        decision: "SEND_LATER",
        source: "WEB",
      });
      expect(direct).toEqual({ success: false, error: expect.stringMatching(/not found/i) });

      // And through both transports, where the session is the only thing that changes.
      mocks.session.current = { user: { id: outsider.host.id, isHost: true } };
      mocks.mobileHost.current = outsider.host.id;
      expect(
        await acceptBookingWithPaymentAction({
          bookingId: booking.id,
          decision: "SEND_LATER",
        }),
      ).toHaveProperty("error");
      expect((await mobileAccept(booking.id, { decision: "SEND_LATER" })).status).toBe(400);

      expect((await acceptedState(booking.id)).status).toBe("PENDING");
    });

    it("refuses a signed-out caller before the service is reached", async () => {
      const { booking } = await bankSetup();
      mocks.session.current = null;

      expect(
        await acceptBookingWithPaymentAction({
          bookingId: booking.id,
          decision: "SEND_LATER",
        }),
      ).toEqual({ error: "Not authorized" });
      expect((await acceptedState(booking.id)).status).toBe("PENDING");
    });

    it("accepts once, whatever the second tap says", async () => {
      const { booking } = await bankSetup();

      const first = await acceptBookingWithPaymentAction({
        bookingId: booking.id,
        decision: "SEND_NOW",
        detailFields: BANK_FIELDS,
        dueDate: ymd(booking.checkIn),
      });
      expect(first).toMatchObject({ success: true, instructionsSent: true });

      // A second acceptance from either transport, with a decision that would have
      // written a different state had it landed.
      const second = await acceptBookingWithPaymentAction({
        bookingId: booking.id,
        decision: "SEND_LATER",
      });
      expect(second).toEqual({ error: "Only pending bookings can be accepted." });
      const third = await mobileAccept(booking.id, { decision: "SEND_LATER" });
      expect(third.status).toBe(400);

      const state = await acceptedState(booking.id);
      expect(state.paymentInstructionsStatus).toBe("SENT");
      expect(state.requests).toHaveLength(1);
      expect(
        await db.message.count({
          where: { conversation: { bookingId: booking.id }, kind: "PAYMENT_INSTRUCTIONS" },
        }),
      ).toBe(1);
      expect(
        await db.auditLog.count({
          where: { entityId: booking.id, action: "booking.confirm" },
        }),
      ).toBe(1);
    });
  });
});
