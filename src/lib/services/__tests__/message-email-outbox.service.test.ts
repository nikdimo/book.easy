import { beforeEach, describe, expect, it, vi } from "vitest";
import { PAYMENT_INSTRUCTIONS_PREVIEW } from "@/lib/services/payment-instructions";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  updateMany: vi.fn(),
  update: vi.fn(),
  findUnique: vi.fn(),
  count: vi.fn(),
  notifyConversationMessage: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    messageEmailDelivery: {
      findMany: mocks.findMany,
      updateMany: mocks.updateMany,
      update: mocks.update,
      findUnique: mocks.findUnique,
      count: mocks.count,
    },
  },
}));
vi.mock("@/lib/email", () => ({
  notifyConversationMessage: mocks.notifyConversationMessage,
}));

import { processMessageEmailOutbox } from "@/lib/services/message-email-outbox.service";

describe("message email outbox", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findMany.mockResolvedValue([
      {
        id: "delivery-1",
        messageId: "message-1",
        recipientId: "guest-1",
        message: {
          conversationId: "conversation-1",
          senderId: "host-1",
          body: "IBAN: MK07250120000058984 https://pay.example.test/private",
          kind: "PAYMENT_INSTRUCTIONS",
          sender: { id: "host-1" },
          conversation: { participants: [] },
        },
      },
    ]);
    mocks.updateMany.mockResolvedValue({ count: 1 });
    mocks.update.mockResolvedValue({});
    mocks.count.mockResolvedValue(0);
  });

  it("never passes payment instruction text to the email notifier", async () => {
    await processMessageEmailOutbox({ messageId: "message-1" });

    expect(mocks.notifyConversationMessage).toHaveBeenCalledWith(
      expect.objectContaining({ preview: PAYMENT_INSTRUCTIONS_PREVIEW })
    );
    expect(mocks.notifyConversationMessage.mock.calls[0][0].preview).not.toContain(
      "MK07250120000058984"
    );
  });
});
