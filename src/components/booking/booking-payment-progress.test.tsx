import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { BookingPaymentProgress, type BookingPaymentProgressView } from "./booking-payment-progress";

vi.mock("@/lib/actions/booking-payment.actions", () => ({
  recordBookingPaymentEventAction: vi.fn(),
}));
vi.mock("@/lib/actions/booking.actions", () => ({
  sendBookingPaymentRequestAction: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

const confirmed: BookingPaymentProgressView = {
  bookingId: "booking-1",
  status: "CONFIRMED",
  checkIn: "2027-01-10",
  currency: "EUR",
  total: 325,
  depositAmount: 75,
  depositPolicy: {
    version: 1,
    status: "REVIEWED",
    policy: "FIXED",
    purpose: "DAMAGE_SECURITY",
    value: "75",
    currency: "EUR",
    dueTiming: "AFTER_ACCEPTANCE",
    dueDaysBeforeCheckIn: null,
    returnDaysAfterCheckout: 7,
  },
  paymentStatus: "AWAITING_PAYMENT",
  paymentInstructionsStatus: "PENDING",
  selectedPaymentMethod: "BANK_TRANSFER_LOCAL_SEPA",
  depositStatus: "RETURN_REPORTED",
  paymentStatusEvents: [
    {
      id: "event-1",
      actor: "HOST",
      eventType: "HOST_MARK_PAYMENT_DUE",
      createdAt: "2026-08-25T09:00:00.000Z",
    },
  ],
};

describe("BookingPaymentProgress", () => {
  it("renders host-only instruction and status controls after confirmation", () => {
    const html = renderToStaticMarkup(
      <BookingPaymentProgress
        progress={{ ...confirmed, depositStatus: "DEPOSIT_CONFIRMED" }}
        actor="HOST"
      />,
    );

    expect(html).toContain("Secure payment instructions");
    expect(html).toContain("This is sent only inside the Linger Homes conversation.");
    expect(html).toContain("Never ask for or send a card number, CVV, PIN, password, seed phrase, or private key.");
    expect(html).not.toContain('data-payment-event="HOST_MARK_PAYMENT_DUE"');
    expect(html).toContain('data-payment-event="HOST_REPORT_DEPOSIT_RETURNED"');
    expect(html).toContain("Reported by host");
    expect(html).not.toContain("IBAN:");
  });

  it("prefills saved instructions for the host to review but never for the guest", () => {
    const savedPaymentInstructionTemplates = [{
      methodCode: "BANK_TRANSFER_INTERNATIONAL" as const,
      body: "IBAN: DK5000400440116243",
    }];
    const hostHtml = renderToStaticMarkup(
      <BookingPaymentProgress
        progress={{ ...confirmed, savedPaymentInstructionTemplates }}
        actor="HOST"
      />,
    );
    const guestHtml = renderToStaticMarkup(
      <BookingPaymentProgress
        progress={{ ...confirmed, savedPaymentInstructionTemplates }}
        actor="GUEST"
      />,
    );

    expect(hostHtml).toContain("IBAN: DK5000400440116243");
    expect(guestHtml).not.toContain("IBAN: DK5000400440116243");
  });

  it("does not offer post-acceptance mutations before confirmation", () => {
    const html = renderToStaticMarkup(
      <BookingPaymentProgress progress={{ ...confirmed, status: "PENDING" }} actor="HOST" />,
    );

    expect(html).not.toContain("Secure payment instructions");
    expect(html).not.toContain("data-payment-event");
  });

  it("gives the guest only their allowed report and return-confirmation controls", () => {
    const html = renderToStaticMarkup(
      <BookingPaymentProgress progress={{ ...confirmed, depositStatus: "AWAITING_DEPOSIT" }} actor="GUEST" />,
    );

    expect(html).toContain('data-payment-event="GUEST_REPORT_PAYMENT_SENT"');
    expect(html).toContain('data-payment-event="GUEST_REPORT_DEPOSIT_SENT"');
    expect(html).not.toContain('data-payment-event="GUEST_CONFIRM_DEPOSIT_RETURNED"');
    expect(html).not.toContain("Secure payment instructions");
    expect(html).toContain("Reported by host/guest. Linger Homes has not verified or processed this.");
  });

  it("does not offer return or retention controls for an advance-payment deposit", () => {
    const html = renderToStaticMarkup(
      <BookingPaymentProgress
        progress={{
          ...confirmed,
          depositStatus: "DEPOSIT_CONFIRMED",
          depositPolicy: { ...confirmed.depositPolicy!, purpose: "ADVANCE_PAYMENT" },
        }}
        actor="HOST"
      />,
    );

    expect(html).not.toContain('data-payment-event="HOST_REPORT_DEPOSIT_RETURNED"');
    expect(html).not.toContain('data-payment-event="HOST_MARK_DEPOSIT_RETAINED"');
  });
});
