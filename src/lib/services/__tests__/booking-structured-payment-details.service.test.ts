import { afterEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
  confirmBooking,
  createBooking,
  getBookingAcceptancePaymentData,
  getBookingPaymentRequestPrefill,
  saveBookingPaymentInstructionTemplate,
} from "@/lib/services/booking.service";
import { parsePaymentInstructionStore } from "@/lib/payments/payment-instruction-templates";
import {
  cleanupTestFixtures,
  createTestGuest,
  createTestHostAndListing,
  type TestFixtures,
} from "./test-helpers";

function stayDates(offsetDays: number) {
  const checkIn = new Date();
  checkIn.setUTCHours(0, 0, 0, 0);
  checkIn.setUTCDate(checkIn.getUTCDate() + offsetDays);
  const checkOut = new Date(checkIn);
  checkOut.setUTCDate(checkOut.getUTCDate() + 2);
  return { checkIn, checkOut };
}

const BANK_FIELDS = {
  accountHolder: "Nikola Dimovski",
  bankName: "Komercijalna Banka",
  accountIdentifier: "DK5000400440116243",
  swiftBic: "DABADKKK",
};

/** A V2 store as it is actually written to a listing row. */
function storeV2(details: Record<string, unknown>, templates: Record<string, string> = {}) {
  return { version: 2, templates, details };
}

describe("structured payment details on a booking", () => {
  let fixtures: TestFixtures | undefined;

  afterEach(async () => {
    if (fixtures) await cleanupTestFixtures(fixtures);
    fixtures = undefined;
  });

  async function setup(options: {
    methods: string[];
    otherLabel?: string | null;
    instructionTemplates?: unknown;
    selectedPaymentMethod?: string | null;
  }) {
    const { host, property, listing } = await createTestHostAndListing();
    const guest = await createTestGuest();
    fixtures = {
      hostId: host.id,
      propertyId: property.id,
      listingId: listing.id,
      extraUserIds: [guest.id],
    };
    await db.listing.update({
      where: { id: listing.id },
      data: {
        acceptedPaymentMethods: options.methods as never,
        paymentMethodOther: options.otherLabel ?? null,
        paymentMethodsReviewedAt: new Date(),
        paymentInstructionTemplates: (options.instructionTemplates ?? null) as never,
      },
    });

    const { checkIn, checkOut } = stayDates(700);
    const booking = await createBooking({
      listingId: listing.id,
      guestId: guest.id,
      checkIn,
      checkOut,
      guestCount: 2,
      ...({
        selectedPaymentMethod: options.selectedPaymentMethod,
      } as Record<string, unknown>),
    } as Parameters<typeof createBooking>[0]);

    return { host, guest, listing, booking };
  }

  it("prefills the guest's chosen method with that method's structured details", async () => {
    const { host, booking } = await setup({
      methods: ["BANK_TRANSFER_INTERNATIONAL", "PAYPAL"],
      selectedPaymentMethod: "BANK_TRANSFER_INTERNATIONAL",
      instructionTemplates: storeV2({
        BANK_TRANSFER_INTERNATIONAL: {
          version: 2,
          fields: BANK_FIELDS,
          updatedAt: "2026-08-01T10:00:00.000Z",
        },
        PAYPAL: {
          version: 2,
          fields: { providerIdentifier: "paypal@example.com" },
          updatedAt: "2026-08-01T10:00:00.000Z",
        },
      }),
    });

    const payment = await getBookingAcceptancePaymentData(booking.id, host.id);

    expect(payment.selectedPaymentMethod).toBe("BANK_TRANSFER_INTERNATIONAL");
    expect(payment.methodSource).toBe("GUEST");
    expect(payment.savedDetailsKind).toBe("STRUCTURED");
    expect(payment.savedDetailFields).toEqual(BANK_FIELDS);
    // The host's other saved method never crosses the wire for this booking.
    expect(JSON.stringify(payment)).not.toContain("paypal@example.com");
  });

  it("hands back legacy free text when that is what the host saved", async () => {
    const { host, booking } = await setup({
      methods: ["PAYPAL"],
      selectedPaymentMethod: "PAYPAL",
      instructionTemplates: {
        version: 1,
        templates: { PAYPAL: "PayPal: host@example.com" },
      },
    });

    const payment = await getBookingAcceptancePaymentData(booking.id, host.id);

    expect(payment.savedDetailsKind).toBe("LEGACY_TEXT");
    expect(payment.savedInstructions).toBe("PayPal: host@example.com");
    expect(payment.savedDetailFields).toEqual({});
  });

  it("offers the listing's methods when a booking recorded no guest choice", async () => {
    const { host, booking } = await setup({
      methods: ["PAYPAL", "WISE"],
      selectedPaymentMethod: "PAYPAL",
    });
    // What a booking taken before guests chose a method looks like: the column and the
    // frozen snapshot are both empty, so nothing on the booking names a method.
    await db.booking.update({
      where: { id: booking.id },
      data: { selectedPaymentMethod: null, paymentMethodsSnapshot: undefined },
    });

    const payment = await getBookingAcceptancePaymentData(booking.id, host.id);

    expect(payment.selectedPaymentMethod).toBeNull();
    expect(payment.methodSource).toBe("HOST_FALLBACK");
    expect(payment.availableMethods).toEqual(["PAYPAL", "WISE"]);
  });

  it("scopes the prefill to the owning host", async () => {
    const { booking } = await setup({
      methods: ["PAYPAL"],
      selectedPaymentMethod: "PAYPAL",
      instructionTemplates: storeV2({
        PAYPAL: {
          version: 2,
          fields: { providerIdentifier: "paypal@example.com" },
          updatedAt: "2026-08-01T10:00:00.000Z",
        },
      }),
    });
    const stranger = await createTestGuest();
    fixtures?.extraUserIds.push(stranger.id);

    expect(await getBookingPaymentRequestPrefill(booking.id, stranger.id)).toBeNull();
    await expect(
      getBookingAcceptancePaymentData(booking.id, stranger.id),
    ).rejects.toThrow("Booking not found");
  });

  it("saves this booking's details for reuse without touching another method", async () => {
    const { host, listing, booking } = await setup({
      methods: ["BANK_TRANSFER_INTERNATIONAL", "PAYPAL"],
      selectedPaymentMethod: "BANK_TRANSFER_INTERNATIONAL",
      instructionTemplates: storeV2(
        {
          PAYPAL: {
            version: 2,
            fields: { providerIdentifier: "paypal@example.com" },
            updatedAt: "2026-08-01T10:00:00.000Z",
          },
        },
        { BANK_TRANSFER_INTERNATIONAL: "IBAN DK5000400440116243" },
      ),
    });
    await confirmBooking(booking.id, host.id, { decision: "SEND_LATER" });

    await saveBookingPaymentInstructionTemplate({
      bookingId: booking.id,
      hostId: host.id,
      method: "BANK_TRANSFER_INTERNATIONAL",
      fields: BANK_FIELDS,
    });

    const saved = await db.listing.findUniqueOrThrow({
      where: { id: listing.id },
      select: { paymentInstructionTemplates: true },
    });
    const store = parsePaymentInstructionStore(saved.paymentInstructionTemplates);

    expect(store.details.BANK_TRANSFER_INTERNATIONAL?.fields).toEqual(BANK_FIELDS);
    // PayPal's saved details are carried through untouched.
    expect(store.details.PAYPAL?.fields).toEqual({
      providerIdentifier: "paypal@example.com",
    });
    // This method's legacy paragraph is retired only now, by the host's own save.
    expect(store.templates.BANK_TRANSFER_INTERNATIONAL).toBeUndefined();
  });

  it("refuses to save against a method this booking does not use", async () => {
    const { host, booking } = await setup({
      methods: ["BANK_TRANSFER_INTERNATIONAL", "PAYPAL"],
      selectedPaymentMethod: "BANK_TRANSFER_INTERNATIONAL",
    });
    await confirmBooking(booking.id, host.id, { decision: "SEND_LATER" });

    await expect(
      saveBookingPaymentInstructionTemplate({
        bookingId: booking.id,
        hostId: host.id,
        method: "PAYPAL",
        fields: { providerIdentifier: "paypal@example.com" },
      }),
    ).rejects.toThrow("Booking not found");
  });

  it("refuses to save values that fail validation", async () => {
    const { host, booking } = await setup({
      methods: ["BANK_TRANSFER_INTERNATIONAL"],
      selectedPaymentMethod: "BANK_TRANSFER_INTERNATIONAL",
    });
    await confirmBooking(booking.id, host.id, { decision: "SEND_LATER" });

    await expect(
      saveBookingPaymentInstructionTemplate({
        bookingId: booking.id,
        hostId: host.id,
        method: "BANK_TRANSFER_INTERNATIONAL",
        // A card number, in the field meant for an account identifier.
        fields: { ...BANK_FIELDS, accountIdentifier: "4111111111111111" },
      }),
    ).rejects.toThrow("Payment instructions could not be saved");
  });
});
