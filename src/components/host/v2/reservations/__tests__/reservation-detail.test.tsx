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
  confirmBookingAction: vi.fn(),
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
  cleaningFee: 25,
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
    expect(html).toContain('data-payment-track="advance-payment"');
    expect(html).toContain('data-payment-track="damage-deposit"');
    expect(html).toContain("Mark payment received");
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
});
