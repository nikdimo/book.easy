import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireHost: vi.fn(),
  shareBookingPaymentInstructions: vi.fn(),
  createAuditLog: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/auth-helpers", () => ({
  requireAdmin: vi.fn(),
  requireHost: mocks.requireHost,
}));
vi.mock("@/lib/services/chat.service", () => ({
  ensureInquiryConversation: vi.fn(),
  joinConversationAsSupport: vi.fn(),
  shareBookingPaymentInstructions: mocks.shareBookingPaymentInstructions,
}));
vi.mock("@/lib/services/safety-case.service", () => ({
  addUserSafetyCaseUpdate: vi.fn(),
  createSafetyCase: vi.fn(),
  releaseClaimToRecipient: vi.fn(),
  respondToClaim: vi.fn(),
  updateSafetyCaseByAdmin: vi.fn(),
}));
vi.mock("@/lib/services/audit.service", () => ({
  createAuditLog: mocks.createAuditLog,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import { shareBookingPaymentInstructionsAction } from "../communication.actions";

describe("share payment instructions action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireHost.mockResolvedValue({ id: "host-1", isHost: true });
    mocks.shareBookingPaymentInstructions.mockResolvedValue({
      id: "message-1",
      conversationId: "conversation-1",
      kind: "PAYMENT_INSTRUCTIONS",
    });
  });

  it("uses the authenticated host, revalidates affected routes, and audits no body", async () => {
    const body = "IBAN: MK07250120000058984 https://pay.example.test/private";
    const result = await shareBookingPaymentInstructionsAction({
      bookingId: "booking-1",
      body,
      sourceLocale: "mk",
    });

    expect(mocks.shareBookingPaymentInstructions).toHaveBeenCalledWith({
      bookingId: "booking-1",
      body,
      sourceLocale: "mk",
      hostId: "host-1",
    });
    expect(mocks.createAuditLog).toHaveBeenCalledWith({
      userId: "host-1",
      action: "booking.payment_instructions_shared",
      entityType: "Message",
      entityId: "message-1",
      metadata: { kind: "PAYMENT_INSTRUCTIONS" },
    });
    expect(JSON.stringify(mocks.createAuditLog.mock.calls)).not.toContain(body);
    expect(result).toEqual({ messageId: "message-1", kind: "PAYMENT_INSTRUCTIONS" });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/messages/conversation-1");
  });

  it("does not expose payment text when the service rejects it", async () => {
    mocks.shareBookingPaymentInstructions.mockRejectedValue(
      new Error("Payment instructions cannot include card or account-security credentials")
    );
    const body = "Card number 4242 4242 4242 4242";

    const result = await shareBookingPaymentInstructionsAction({
      bookingId: "booking-1",
      body,
    });

    expect(result).toEqual({ error: "Could not share payment instructions" });
    expect(JSON.stringify(result)).not.toContain(body);
    expect(mocks.createAuditLog).not.toHaveBeenCalled();
  });
});
