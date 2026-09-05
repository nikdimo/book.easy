import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { buildCalendarFormats } from "@/lib/host/v2/calendar-format";
import { ReservationDetail } from "@/components/host/v2/reservations/reservation-detail";
import { ReservationPanel } from "@/components/host/v2/reservations/reservation-panel";
import type {
  HostReservation,
  HostReservationsData,
} from "@/lib/host/v2/reservation-types";

// Two things this render cannot have outside the app: the server actions behind the
// accept/decline/cancel controls pull in `next-auth`, and the same controls ask for a
// router that only exists once Next has mounted one. Both are mocked so the test can
// answer the question it is actually asking — what this page puts on screen and where
// its links point.
vi.mock("@/lib/actions/booking.actions", () => ({
  acceptBookingWithPaymentAction: vi.fn(),
  getBookingAcceptancePaymentDataAction: vi.fn(),
  rejectBookingAction: vi.fn(),
  hostCancelBookingAction: vi.fn(),
}));
vi.mock("@/lib/actions/booking-payment.actions", () => ({
  recordBookingPaymentEventAction: vi.fn(),
}));
vi.mock("@/lib/actions/communication.actions", () => ({
  shareBookingPaymentInstructionsAction: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));

/**
 * These render without an `I18nProvider` on purpose: the client translator falls back
 * to the English source literal, which is exactly what an untranslated request paints.
 */

const reservation: HostReservation = {
  id: "booking-1",
  reference: "BK-1001",
  status: "CONFIRMED",
  listingId: "listing-1",
  guest: { id: "guest-1", name: "Ana Petrova", image: null },
  checkIn: "2026-09-10",
  checkOut: "2026-09-13",
  nights: 3,
  guestCount: 2,
  currency: "EUR",
  nightlyRate: 100,
  averageNightlyRate: 100,
  accommodationSubtotal: 300,
  originalAccommodationSubtotal: 300,
  cleaningFee: 25,
  originalCleaningFee: 25,
  serviceFee: 0,
  discountAmount: 0,
  total: 325,
  paymentStatus: "AWAITING_PAYMENT",
  paymentInstructionsStatus: "PENDING",
  selectedPaymentMethod: "BANK_TRANSFER_LOCAL_SEPA",
  paymentMethodOtherLabel: null,
  advancePaymentStatus: "AWAITING_PAYMENT",
  damageDepositStatus: "AWAITING_DEPOSIT",
  advancePaymentAmount: 40,
  damageDepositAmount: 75,
  depositPolicies: {
    version: 2,
    status: "REVIEWED",
    advancePayment: {
      amountType: "FIXED",
      value: "40",
      currency: "EUR",
      dueTiming: "AFTER_ACCEPTANCE",
      dueDaysBeforeCheckIn: null,
    },
    damageDeposit: {
      amountType: "FIXED",
      value: "75",
      currency: "EUR",
      dueTiming: "AFTER_ACCEPTANCE",
      dueDaysBeforeCheckIn: null,
      returnDaysAfterCheckout: 7,
    },
  },
  paymentStatusEvents: [],
  guestNote: "Arriving late on the first night.",
  cancellationReason: null,
  createdAt: "2026-08-01T09:00:00.000Z",
  respondedAt: "2026-08-01T10:00:00.000Z",
  responseDueAt: "2026-08-02T09:00:00.000Z",
  ratingDueAt: null,
  unreadCount: 0,
  conversationId: "conversation-1",
  checkInTime: "15:00",
  checkOutTime: "11:00",
};

const data: HostReservationsData = {
  today: "2026-09-01",
  now: "2026-09-01T08:00:00.000Z",
  formats: buildCalendarFormats("en", ["EUR"]),
  properties: [
    {
      id: "listing-1",
      title: "Sunny loft",
      photoUrl: null,
      photoAlt: null,
      city: "Ohrid",
    },
  ],
  reservations: [reservation],
};

function render(node: React.ReactElement) {
  return renderToStaticMarkup(node);
}

describe("ReservationDetail", () => {
  const html = render(
    <ReservationDetail
      data={data}
      reservation={reservation}
      action={null}
      initialCountdown={null}
    />,
  );

  it("never sends a host to the classic booking page", () => {
    expect(html).not.toContain("/host/bookings/");
  });

  it("leads back to the reservations list", () => {
    expect(html).toContain('href="/host/reservations"');
    expect(html).toContain("All reservations");
  });

  it("keeps the reservation's own facts on the page", () => {
    expect(html).toContain("Sunny loft");
    expect(html).toContain("BK-1001");
    expect(html).toContain("Ana Petrova");
    expect(html).toContain("Arriving late on the first night.");
  });

  it("keeps the host's ways out: the listing, the guest and support", () => {
    expect(html).toContain('href="/host/listings/listing-1"');
    expect(html).toContain("/host/messages/conversation-1");
    expect(html).toContain("bookingId=booking-1");
  });

  it("offers no link back to the page the host is already on", () => {
    expect(html).not.toContain('href="/host/reservations/booking-1"');
    expect(html).not.toContain("Open full reservation");
  });

  it("still offers to cancel a confirmed stay", () => {
    expect(html).toContain("Cancel booking");
  });

  it("projects the confirmed booking's manual payment controls", () => {
    expect(html).toContain("Payment progress");
    expect(html).toContain('data-payment-track="accommodation-balance"');
    expect(html).toContain('data-payment-track="advance-payment"');
    expect(html).toContain('data-payment-track="damage-deposit"');
    // Named for the track it moves. "Mark payment received" read as "everything is
    // settled" on a booking with an advance, when what it confirms is the balance (#1).
    expect(html).toContain("Mark accommodation balance received");
  });
});

describe("ReservationDetail, on an open request", () => {
  const pending: HostReservation = {
    ...reservation,
    status: "PENDING",
    respondedAt: null,
    responseDueAt: "2026-09-01T20:00:00.000Z",
  };
  const html = render(
    <ReservationDetail
      data={{ ...data, reservations: [pending] }}
      reservation={pending}
      action={{
        bookingId: pending.id,
        kind: "RESPOND_TO_REQUEST",
        urgency: "critical",
        dueAt: new Date(pending.responseDueAt),
        alsoNeeds: [],
      }}
      initialCountdown="12h left"
    />,
  );

  it("puts the decision and its deadline on the page", () => {
    expect(html).toContain("Accept request");
    expect(html).toContain("Decline");
    expect(html).toContain("12h left");
  });

  it("does not offer to cancel a booking that is not confirmed yet", () => {
    expect(html).not.toContain("Cancel booking");
  });
});

describe("ReservationPanel", () => {
  it("opens the v2 reservation page rather than the classic one", () => {
    const html = render(
      <ReservationPanel
        reservation={reservation}
        property={data.properties[0]}
        data={data}
        action={null}
        initialCountdown={null}
      />,
    );

    expect(html).toContain('href="/host/reservations/booking-1"');
    expect(html).not.toContain("/host/bookings/");
  });

  it("does not offer a decision without an open request deadline", () => {
    const html = render(
      <ReservationPanel
        reservation={reservation}
        property={data.properties[0]}
        data={data}
        action={null}
        initialCountdown={null}
      />,
    );

    expect(html).not.toContain("Accept request");
  });

  /**
   * Audit L2. The accommodation row used to be `nightlyRate * nights`, and that column
   * is a rounded effective average: a stay priced 100 / 100 / 101 stores 100.33 and the
   * product is 300.99, a cent short of the nights and a cent short of the total printed
   * below it. The row now comes from the resolved subtotal.
   */
  describe("price rows", () => {
    const uneven: HostReservation = {
      ...reservation,
      nights: 3,
      nightlyRate: 100.33,
      averageNightlyRate: 100.33,
      accommodationSubtotal: 301,
      originalAccommodationSubtotal: 301,
      cleaningFee: 25,
      originalCleaningFee: 25,
      total: 326,
    };

    it("prints the resolved subtotal, not the average times the nights", () => {
      const html = render(
        <ReservationPanel
          reservation={uneven}
          property={data.properties[0]}
          data={data}
          action={null}
          initialCountdown={null}
        />,
      );

      expect(html).toContain("€301.00");
      expect(html).not.toContain("€300.99");
      // Cleaning fee and total, so the three rows are visibly 301 + 25 = 326.
      expect(html).toContain("€25.00");
      expect(html).toContain("€326.00");
    });

    it("prints the gross figures beside an itemised discount", () => {
      const discounted: HostReservation = {
        ...uneven,
        accommodationSubtotal: 270,
        originalAccommodationSubtotal: 300,
        cleaningFee: 0,
        originalCleaningFee: 25,
        discountAmount: 55,
        total: 270,
      };
      const html = render(
        <ReservationPanel
          reservation={discounted}
          property={data.properties[0]}
          data={data}
          action={null}
          initialCountdown={null}
        />,
      );

      // 300 + 25 − 55 = 270. Printing the net 270 beside the −55 row would have shown
      // a receipt that subtracts the promotion twice.
      expect(html).toContain("€300.00");
      expect(html).toContain("€25.00");
      expect(html).toContain("€55.00");
      expect(html).toContain("€270.00");
    });
  });
});
