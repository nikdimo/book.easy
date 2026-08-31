import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  isBookingPaymentEvent: vi.fn(),
  recordBookingPaymentEvent: vi.fn(),
  paymentEventNeedsPrivateRecord: vi.fn(),
  createAuditLog: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/services/booking-payment-status.service", () => ({
  isBookingPaymentEvent: mocks.isBookingPaymentEvent,
  recordBookingPaymentEvent: mocks.recordBookingPaymentEvent,
  paymentEventNeedsPrivateRecord: mocks.paymentEventNeedsPrivateRecord,
}));
vi.mock("@/lib/services/audit.service", () => ({ createAuditLog: mocks.createAuditLog }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import { recordBookingPaymentEventAction } from "../booking-payment.actions";

describe("record booking payment event action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ user: { id: "guest-1" } });
    mocks.isBookingPaymentEvent.mockReturnValue(true);
    mocks.paymentEventNeedsPrivateRecord.mockReturnValue(false);
    mocks.recordBookingPaymentEvent.mockResolvedValue({ changed: true });
  });

  it("rejects unauthenticated callers before reaching the service", async () => {
    mocks.auth.mockResolvedValue(null);

    await expect(
      recordBookingPaymentEventAction("booking-1", "GUEST_REPORT_PAYMENT_SENT"),
    ).resolves.toEqual({ error: "Sign in to update payment progress" });
    expect(mocks.recordBookingPaymentEvent).not.toHaveBeenCalled();
  });

  it("rejects an event outside the allowed status vocabulary", async () => {
    mocks.isBookingPaymentEvent.mockReturnValue(false);

    await expect(recordBookingPaymentEventAction("booking-1", "DELETE_BOOKING")).resolves.toEqual({
      error: "Invalid payment update",
    });
    expect(mocks.recordBookingPaymentEvent).not.toHaveBeenCalled();
  });

  it("passes only the authenticated actor to the gated service and refreshes views", async () => {
    await expect(
      recordBookingPaymentEventAction("booking-1", "GUEST_REPORT_PAYMENT_SENT"),
    ).resolves.toEqual({ success: true, changed: true });

    expect(mocks.recordBookingPaymentEvent).toHaveBeenCalledWith({
      bookingId: "booking-1",
      actorId: "guest-1",
      event: "GUEST_REPORT_PAYMENT_SENT",
    });
    expect(mocks.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "guest-1",
        action: "booking.payment_status.update",
        entityId: "booking-1",
      }),
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/account/bookings/booking-1");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/host/reservations/booking-1");
  });
});
