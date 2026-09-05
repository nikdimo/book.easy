import { afterEach, describe, expect, it, vi } from "vitest";

import { COMMUNICATION_BRAND } from "@/lib/communication-brand";

async function loadBrandServer() {
  vi.resetModules();
  return import("@/lib/communication-brand.server");
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("communication brand addresses", () => {
  it("falls back to the brand address when EMAIL_FROM is on another domain", async () => {
    vi.stubEnv("EMAIL_FROM", "book.easy.mk <hello@book.easy.mk>");
    const { communicationFromAddress } = await loadBrandServer();
    expect(communicationFromAddress()).toBe(
      `"${COMMUNICATION_BRAND.name}" <${COMMUNICATION_BRAND.publicEmail}>`
    );
  });

  it("keeps an override that is on the brand domain", async () => {
    vi.stubEnv("EMAIL_FROM", "Linger Homes <bookings@lingerhomes.com>");
    const { communicationFromAddress } = await loadBrandServer();
    expect(communicationFromAddress()).toBe(
      `"${COMMUNICATION_BRAND.name}" <bookings@lingerhomes.com>`
    );
  });

  it("accepts a sending subdomain of the brand domain", async () => {
    vi.stubEnv("EMAIL_FROM", "no-reply@mail.lingerhomes.com");
    const { communicationFromAddress } = await loadBrandServer();
    expect(communicationFromAddress()).toBe(
      `"${COMMUNICATION_BRAND.name}" <no-reply@mail.lingerhomes.com>`
    );
  });

  it("warns once in production when the app URL is off the brand domain", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://book.easy.mk");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { communicationAppUrl } = await loadBrandServer();
    communicationAppUrl("/bookings");
    communicationAppUrl("/messages");
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain("book.easy.mk");
    warn.mockRestore();
  });

  it("stays quiet for localhost and for the brand domain", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const brandServer = await loadBrandServer();
    brandServer.communicationAppUrl("/bookings");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", COMMUNICATION_BRAND.canonicalUrl);
    const rebranded = await loadBrandServer();
    rebranded.communicationAppUrl("/bookings");
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("guards reply-to and support addresses the same way", async () => {
    vi.stubEnv("EMAIL_REPLY_TO", "hello@book.easy.mk");
    vi.stubEnv("SUPPORT_EMAIL", "hello@book.easy.mk");
    const { communicationReplyToAddress, communicationSupportEmail } =
      await loadBrandServer();
    expect(communicationReplyToAddress()).toBe(COMMUNICATION_BRAND.publicEmail);
    expect(communicationSupportEmail()).toBe(COMMUNICATION_BRAND.supportEmail);
  });
});
