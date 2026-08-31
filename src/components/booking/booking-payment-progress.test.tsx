import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { BookingPaymentProgress, type BookingPaymentProgressView } from "./booking-payment-progress";

vi.mock("@/lib/actions/booking-payment.actions", () => ({
  recordBookingPaymentEventAction: vi.fn(),
  reportBookingTransactionAction: vi.fn(),
}));
vi.mock("@/lib/actions/booking.actions", () => ({
  sendBookingPaymentRequestAction: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

const ADVANCE = {
  amountType: "PERCENTAGE" as const,
  value: "20",
  currency: "EUR",
  dueTiming: "AFTER_ACCEPTANCE" as const,
  dueDaysBeforeCheckIn: null,
};
const DAMAGE = {
  amountType: "FIXED" as const,
  value: "75",
  currency: "EUR",
  dueTiming: "AFTER_ACCEPTANCE" as const,
  dueDaysBeforeCheckIn: null,
  returnDaysAfterCheckout: 7,
};

const confirmed: BookingPaymentProgressView = {
  bookingId: "booking-1",
  status: "CONFIRMED",
  checkIn: "2027-01-10",
  currency: "EUR",
  total: 325,
  advancePaymentAmount: 65,
  damageDepositAmount: 75,
  depositPolicies: {
    version: 2,
    status: "REVIEWED",
    advancePayment: ADVANCE,
    damageDeposit: DAMAGE,
  },
  paymentStatus: "AWAITING_PAYMENT",
  paymentInstructionsStatus: "PENDING",
  selectedPaymentMethod: "BANK_TRANSFER_LOCAL_SEPA",
  advancePaymentStatus: "AWAITING_PAYMENT",
  damageDepositStatus: "RETURN_REPORTED",
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
        progress={{ ...confirmed, damageDepositStatus: "DEPOSIT_CONFIRMED" }}
        actor="HOST"
      />,
    );

    expect(html).toContain("Payment due");
    expect(html).toContain("Send payment request");
    expect(html).not.toContain('data-payment-event="HOST_MARK_PAYMENT_DUE"');
    expect(html).toContain('data-payment-event="HOST_REPORT_DAMAGE_DEPOSIT_RETURNED"');
    expect(html).toContain("Reported by host");
    expect(html).not.toContain("IBAN:");
  });

  it("shows both frozen amounts separately and never their sum", () => {
    const html = renderToStaticMarkup(
      <BookingPaymentProgress progress={confirmed} actor="GUEST" />,
    );

    expect(html).toContain('data-payment-track="advance-payment"');
    expect(html).toContain('data-payment-track="damage-deposit"');
    expect(html).toContain("Counts toward the payment total above.");
    expect(html).toContain("Additional to the payment total above, and returned by the host.");
    // 65 and 75 stand on their own; 140 is a figure that exists nowhere.
    expect(html).toContain("65");
    expect(html).toContain("75");
    expect(html).not.toContain("140");
  });

  it("gives each track its own status line", () => {
    const html = renderToStaticMarkup(
      <BookingPaymentProgress
        progress={{
          ...confirmed,
          advancePaymentStatus: "PAYMENT_CONFIRMED",
          damageDepositStatus: "AWAITING_DEPOSIT",
        }}
        actor="HOST"
      />,
    );

    expect(html).toContain("Host confirmed receiving it");
    expect(html).toContain("Awaiting damage deposit");
  });

  it("prefills legacy saved instructions for the host to review but never for the guest", () => {
    const savedPaymentInstructionTemplates = [{
      methodCode: "BANK_TRANSFER_INTERNATIONAL" as const,
      body: "IBAN: DK5000400440116243",
    }];
    const paymentRequestPrefill = {
      method: "BANK_TRANSFER_INTERNATIONAL" as const,
      methodSource: "GUEST" as const,
      availableMethods: ["BANK_TRANSFER_INTERNATIONAL" as const],
      otherLabel: null,
      savedDetailsKind: "LEGACY_TEXT" as const,
      savedDetailFields: {},
      savedInstructions: "IBAN: DK5000400440116243",
    };
    const hostHtml = renderToStaticMarkup(
      <BookingPaymentProgress
        progress={{ ...confirmed, savedPaymentInstructionTemplates, paymentRequestPrefill }}
        actor="HOST"
      />,
    );
    // A guest never receives the prefill prop at all; passing it here proves the
    // component would still not render it on the guest's side of the same booking.
    const guestHtml = renderToStaticMarkup(
      <BookingPaymentProgress
        progress={{ ...confirmed, savedPaymentInstructionTemplates, paymentRequestPrefill }}
        actor="GUEST"
      />,
    );

    expect(hostHtml).toContain("IBAN: DK5000400440116243");
    expect(guestHtml).not.toContain("IBAN: DK5000400440116243");
  });

  it("prefills structured details as a reviewable preview for the host only", () => {
    const paymentRequestPrefill = {
      method: "BANK_TRANSFER_INTERNATIONAL" as const,
      methodSource: "GUEST" as const,
      availableMethods: ["BANK_TRANSFER_INTERNATIONAL" as const],
      otherLabel: null,
      savedDetailsKind: "STRUCTURED" as const,
      savedDetailFields: {
        accountHolder: "Nikola Dimovski",
        bankName: "Komercijalna Banka",
        accountIdentifier: "DK5000400440116243",
        swiftBic: "KOBSMK2X",
      },
      savedInstructions: "",
    };
    const hostHtml = renderToStaticMarkup(
      <BookingPaymentProgress
        progress={{ ...confirmed, paymentRequestPrefill }}
        actor="HOST"
      />,
    );
    const guestHtml = renderToStaticMarkup(
      <BookingPaymentProgress
        progress={{ ...confirmed, paymentRequestPrefill }}
        actor="GUEST"
      />,
    );

    expect(hostHtml).toContain("What the guest will receive");
    expect(hostHtml).toContain("DK5000400440116243");
    expect(hostHtml).toContain("KOBSMK2X");
    expect(hostHtml).toContain("Edit for this booking");
    expect(guestHtml).not.toContain("DK5000400440116243");
    expect(guestHtml).not.toContain("KOBSMK2X");
  });

  it("renders the guest's structured card with copy controls once details are sent", () => {
    const html = renderToStaticMarkup(
      <BookingPaymentProgress
        progress={{
          ...confirmed,
          paymentInstructionsStatus: "SENT",
          reference: "BE-4417",
          paymentInstructionsDueAt: "2026-09-14T00:00:00.000Z",
          sentPaymentDetails: {
            version: 2,
            method: "BANK_TRANSFER_INTERNATIONAL",
            otherLabel: null,
            fields: {
              accountHolder: "Nikola Dimovski",
              bankName: "Komercijalna Banka",
              accountIdentifier: "DK5000400440116243",
              swiftBic: "KOBSMK2X",
            },
            sentAt: "2026-08-27T10:00:00.000Z",
          },
        }}
        actor="GUEST"
      />,
    );

    expect(html).toContain("How to pay the host");
    expect(html).toContain("DK5000400440116243");
    expect(html).toContain("BE-4417");
    // One copy button per copyable value, and the booking reference.
    expect(html.match(/>Copy</g)?.length).toBeGreaterThanOrEqual(4);
    expect(html).toContain(
      "You pay the host directly. Linger Homes does not collect, hold, verify, protect, or refund this payment.",
    );
  });

  it("keeps a legacy free-text send rendering as the conversation message only", () => {
    const html = renderToStaticMarkup(
      <BookingPaymentProgress
        progress={{
          ...confirmed,
          paymentInstructionsStatus: "SENT",
          sentPaymentDetails: null,
        }}
        actor="GUEST"
      />,
    );

    expect(html).toContain(
      "Payment instructions were sent in the private conversation.",
    );
    expect(html).not.toContain("How to pay the host");
  });

  it("does not claim a private message was sent for cash at the property", () => {
    const html = renderToStaticMarkup(
      <BookingPaymentProgress
        progress={{
          ...confirmed,
          paymentInstructionsStatus: "NOT_NEEDED",
          selectedPaymentMethod: "CASH_AT_PROPERTY",
          paymentRequests: [
            {
              id: "cash-balance",
              type: "ACCOMMODATION_BALANCE",
              amount: 260,
              currency: "EUR",
              dueAt: "2027-01-10T00:00:00.000Z",
              status: "SENT",
              sentPaymentDetails: null,
              instructionsNotRequired: true,
            },
          ],
        }}
        actor="GUEST"
      />,
    );

    expect(html).toContain(
      "No private payment instructions are needed for this payment method.",
    );
    expect(html).not.toContain(
      "Payment instructions were sent in the private conversation.",
    );
  });

  it("does not offer post-acceptance mutations before confirmation", () => {
    const html = renderToStaticMarkup(
      <BookingPaymentProgress progress={{ ...confirmed, status: "PENDING" }} actor="HOST" />,
    );

    expect(html).not.toContain("Send payment request");
    expect(html).not.toContain("data-payment-event");
  });

  it("gives the guest only their allowed report and return-confirmation controls", () => {
    const html = renderToStaticMarkup(
      <BookingPaymentProgress
        progress={{ ...confirmed, damageDepositStatus: "AWAITING_DEPOSIT" }}
        actor="GUEST"
      />,
    );

    expect(html).toContain('data-payment-event="GUEST_REPORT_PAYMENT_SENT"');
    expect(html).toContain('data-payment-event="GUEST_REPORT_ADVANCE_PAYMENT_SENT"');
    expect(html).toContain('data-payment-event="GUEST_REPORT_DAMAGE_DEPOSIT_SENT"');
    expect(html).not.toContain('data-payment-event="GUEST_CONFIRM_DAMAGE_DEPOSIT_RETURNED"');
    expect(html).not.toContain("Send payment request");
    expect(html).toContain("Reported by host/guest. Linger Homes has not verified or processed this.");
  });

  it("offers no damage-deposit controls when only an advance payment was frozen", () => {
    const html = renderToStaticMarkup(
      <BookingPaymentProgress
        progress={{
          ...confirmed,
          damageDepositAmount: null,
          damageDepositStatus: "NOT_REQUIRED",
          depositPolicies: {
            version: 2,
            status: "REVIEWED",
            advancePayment: ADVANCE,
            damageDeposit: null,
          },
        }}
        actor="HOST"
      />,
    );

    expect(html).toContain('data-payment-track="advance-payment"');
    expect(html).not.toContain('data-payment-track="damage-deposit"');
    expect(html).not.toContain('data-payment-event="HOST_REPORT_DAMAGE_DEPOSIT_RETURNED"');
    expect(html).not.toContain('data-payment-event="HOST_MARK_DAMAGE_DEPOSIT_RETAINED"');
  });

  it("offers no advance-payment controls when only a damage deposit was frozen", () => {
    const html = renderToStaticMarkup(
      <BookingPaymentProgress
        progress={{
          ...confirmed,
          advancePaymentAmount: null,
          advancePaymentStatus: "NOT_REQUIRED",
          depositPolicies: {
            version: 2,
            status: "REVIEWED",
            advancePayment: null,
            damageDeposit: DAMAGE,
          },
        }}
        actor="GUEST"
      />,
    );

    expect(html).not.toContain('data-payment-track="advance-payment"');
    expect(html).toContain('data-payment-track="damage-deposit"');
    expect(html).not.toContain('data-payment-event="GUEST_REPORT_ADVANCE_PAYMENT_SENT"');
  });

  it("shows no policy tracks at all when the host asked for neither", () => {
    const html = renderToStaticMarkup(
      <BookingPaymentProgress
        progress={{
          ...confirmed,
          advancePaymentAmount: null,
          damageDepositAmount: null,
          advancePaymentStatus: "NOT_REQUIRED",
          damageDepositStatus: "NOT_REQUIRED",
          depositPolicies: {
            version: 2,
            status: "REVIEWED",
            advancePayment: null,
            damageDeposit: null,
          },
        }}
        actor="HOST"
      />,
    );

    expect(html).not.toContain("data-payment-track=");
    expect(html).toContain("does not ask for an advance payment or a refundable damage deposit");
  });

  // ---- After checkout ----------------------------------------------------------
  //
  // The card and its history were always rendered for a completed booking; what
  // vanished was every control on it, including the deposit return leg, which only ever
  // happens after checkout.

  const completed: BookingPaymentProgressView = {
    ...confirmed,
    status: "COMPLETED",
    paymentInstructionsStatus: "SENT",
  };

  it("keeps the host's deposit return and retain controls after checkout", () => {
    const html = renderToStaticMarkup(
      <BookingPaymentProgress
        progress={{ ...completed, damageDepositStatus: "DEPOSIT_CONFIRMED" }}
        actor="HOST"
      />,
    );

    expect(html).toContain('data-payment-event="HOST_REPORT_DAMAGE_DEPOSIT_RETURNED"');
    expect(html).toContain('data-payment-event="HOST_MARK_DAMAGE_DEPOSIT_RETAINED"');
    // The card and its history stay, as they always did.
    expect(html).toContain("Payment progress");
    expect(html).toContain("Status history");
  });

  it("lets the guest confirm the deposit came back after checkout", () => {
    const html = renderToStaticMarkup(
      <BookingPaymentProgress progress={completed} actor="GUEST" />,
    );

    expect(html).toContain('data-payment-event="GUEST_CONFIRM_DAMAGE_DEPOSIT_RETURNED"');
  });

  it("still lets the host confirm cash taken at the property after checkout", () => {
    const html = renderToStaticMarkup(
      <BookingPaymentProgress
        progress={{
          ...completed,
          selectedPaymentMethod: "CASH_AT_PROPERTY",
          paymentStatus: "AWAITING_PAYMENT",
        }}
        actor="HOST"
      />,
    );

    expect(html).toContain('data-payment-event="HOST_CONFIRM_PAYMENT_RECEIVED"');
  });

  it("drops the collection-opening controls once the stay is over", () => {
    const html = renderToStaticMarkup(
      <BookingPaymentProgress
        progress={{
          ...completed,
          paymentStatus: "UNTRACKED",
          advancePaymentStatus: "UNTRACKED",
          damageDepositStatus: "UNTRACKED",
        }}
        actor="HOST"
      />,
    );

    // Announcing that money is due after the guest has left reopens collection on a
    // finished stay. Confirming what was actually received does not.
    expect(html).not.toContain('data-payment-event="HOST_MARK_PAYMENT_DUE"');
    expect(html).not.toContain('data-payment-event="HOST_MARK_ADVANCE_PAYMENT_DUE"');
    expect(html).not.toContain('data-payment-event="HOST_MARK_DAMAGE_DEPOSIT_DUE"');
    expect(html).toContain('data-payment-event="HOST_CONFIRM_PAYMENT_RECEIVED"');
    expect(html).toContain('data-payment-event="HOST_CONFIRM_DAMAGE_DEPOSIT_RECEIVED"');
  });

  it("does not reopen the send-instructions form after checkout", () => {
    const html = renderToStaticMarkup(
      <BookingPaymentProgress
        progress={{ ...completed, paymentInstructionsStatus: "PENDING" }}
        actor="HOST"
      />,
    );

    expect(html).not.toContain("Send payment request");
  });

  it("does not offer collection controls on a cancelled booking with nothing to refund", () => {
    const html = renderToStaticMarkup(
      <BookingPaymentProgress
        progress={{
          ...confirmed,
          status: "CANCELLED_BY_GUEST",
          damageDepositStatus: "RETURN_CONFIRMED",
        }}
        actor="HOST"
      />,
    );

    expect(html).not.toContain("data-payment-event");
    expect(html).not.toContain("Send payment request");
  });

  it("keeps the accommodation refund action available after cancellation", () => {
    const html = renderToStaticMarkup(
      <BookingPaymentProgress
        progress={{
          ...confirmed,
          status: "CANCELLED_BY_GUEST",
          accommodationRefundStatus: "AWAITING_REFUND",
          accommodationRefundAmount: 120,
        }}
        actor="HOST"
      />,
    );

    expect(html).toContain(
      'data-payment-event="HOST_REPORT_ACCOMMODATION_REFUND_SENT"',
    );
    expect(html).not.toContain('data-payment-event="HOST_MARK_PAYMENT_DUE"');
  });

  it("lets the guest edit a report until the host confirms it", () => {
    const html = renderToStaticMarkup(
      <BookingPaymentProgress
        progress={{
          ...confirmed,
          advancePaymentStatus: "PAYMENT_REPORTED",
          damageDepositStatus: "DEPOSIT_REPORTED",
        }}
        actor="GUEST"
      />,
    );

    expect(html).toContain('data-payment-event="GUEST_REPORT_ADVANCE_PAYMENT_SENT"');
    expect(html).toContain('data-payment-event="GUEST_REPORT_DAMAGE_DEPOSIT_SENT"');
    expect(html).toContain("Edit advance-payment report");
    expect(html).toContain("Edit damage-deposit report");
  });

  it("shows the frozen cancellation terms and resulting refund status", () => {
    const html = renderToStaticMarkup(
      <BookingPaymentProgress
        progress={{
          ...confirmed,
          status: "CANCELLED_BY_HOST",
          cancellationPolicy: {
            version: 1,
            status: "REVIEWED",
            freeCancellationDaysBeforeCheckIn: 7,
          },
          accommodationRefundStatus: "AWAITING_REFUND",
          accommodationRefundAmount: 120,
        }}
        actor="GUEST"
      />,
    );

    expect(html).toContain("Cancel at least 7 days before check-in");
    expect(html).toContain('data-payment-track="accommodation-refund"');
    expect(html).toContain("Awaiting host refund");
  });
});
