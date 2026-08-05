import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  create: vi.fn(),
  sendEmail: vi.fn(),
  rateLimit: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/db", () => ({
  db: { contactMessage: { create: mocks.create } },
}));
vi.mock("@/lib/email", () => ({ sendTransactionalEmail: mocks.sendEmail }));
vi.mock("@/lib/communication-brand.server", () => ({
  communicationSupportEmail: () => "support@example.com",
}));
vi.mock("@/lib/rate-limit", () => ({
  clientIpFromHeaders: () => "192.0.2.1",
  rateLimit: mocks.rateLimit,
}));

import { POST } from "@/app/api/contact/route";

const validBody = {
  name: "Test Person",
  email: "person@example.com",
  category: "GENERAL",
  subject: "A question",
  message: "This is a sufficiently long contact message.",
  website: "",
};

function request(body: unknown) {
  return new Request("https://lingerhomes.com/api/contact", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("contact route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rateLimit.mockReturnValue({ success: true });
    mocks.auth.mockResolvedValue(null);
    mocks.create.mockResolvedValue({ id: "contact-1" });
    mocks.sendEmail.mockResolvedValue(undefined);
  });

  it("stores a valid message and notifies support and the visitor", async () => {
    const response = await POST(request(validBody));

    expect(response.status).toBe(200);
    expect(mocks.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        email: "person@example.com",
        userId: undefined,
      }),
    });
    expect(mocks.sendEmail).toHaveBeenCalledTimes(2);
  });

  it("only links the message when the signed-in account email matches", async () => {
    mocks.auth.mockResolvedValue({
      user: { id: "user-1", email: "person@example.com" },
    });
    await POST(request(validBody));
    expect(mocks.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: "user-1" }),
    });

    mocks.create.mockClear();
    await POST(request({ ...validBody, email: "other@example.com" }));
    expect(mocks.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: undefined }),
    });
  });

  it("returns success after storage even when email transport is unavailable", async () => {
    mocks.sendEmail.mockRejectedValue(new Error("SMTP unavailable"));
    const response = await POST(request(validBody));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      message: "Thank you. Your message has been sent.",
    });
  });

  it("rejects invalid input before writing", async () => {
    const response = await POST(request({ ...validBody, subject: "bad\nheader" }));
    expect(response.status).toBe(400);
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
