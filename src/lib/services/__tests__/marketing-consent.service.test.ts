import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import {
  canSendMarketing,
  confirmEmailMarketingConsent,
  createUnsubscribeToken,
  marketingConsentText,
  normalizeMarketingEmail,
  requestEmailMarketingConsent,
  setPushMarketingConsent,
  unsubscribeEmailMarketing,
  withdrawUserMarketing,
} from "@/lib/services/marketing-consent.service";
import { createTestGuest } from "./test-helpers";

describe("marketing consent", () => {
  const userIds: string[] = [];
  const emails: string[] = [];

  beforeEach(() => {
    vi.stubEnv("EMAIL_PROVIDER", "console");
    vi.stubEnv("MARKETING_AUDIT_SALT", "test-only-audit-salt");
  });

  afterEach(async () => {
    await db.marketingContact.deleteMany({ where: { email: { in: emails } } });
    await db.user.deleteMany({ where: { id: { in: userIds } } });
    userIds.length = 0;
    emails.length = 0;
    vi.unstubAllEnvs();
  });

  it("normalizes addresses and keeps channel-specific consent wording", () => {
    expect(normalizeMarketingEmail("  Person@Example.COM ")).toBe(
      "person@example.com"
    );
    expect(marketingConsentText("EMAIL", "GUEST")).toContain("by email");
    expect(marketingConsentText("EMAIL", "GUEST")).toContain(
      "unsubscribe at any time"
    );
    expect(marketingConsentText("PUSH", "GUEST")).toContain(
      "push notification"
    );
  });

  it("records a double-opt-in request without authorizing delivery or storing a raw IP", async () => {
    const user = await createTestGuest();
    userIds.push(user.id);
    emails.push(user.email);

    await requestEmailMarketingConsent({
      email: user.email.toUpperCase(),
      userId: user.id,
      audience: "GUEST",
      source: "automated-test",
      metadata: { ip: "192.0.2.44", userAgent: "test-agent" },
    });

    const preference = await db.marketingPreference.findFirstOrThrow({
      where: { contact: { email: user.email } },
      include: { events: true, statement: true },
    });
    expect(preference.status).toBe("PENDING");
    expect(preference.confirmedAt).toBeNull();
    expect(preference.statement?.text).toContain("Linger Homes");
    expect(preference.events).toHaveLength(1);
    expect(JSON.stringify(preference.events[0].metadata)).not.toContain(
      "192.0.2.44"
    );
    expect(
      await canSendMarketing({
        email: user.email,
        channel: "EMAIL",
        audience: "GUEST",
      })
    ).toMatchObject({ allowed: false });
  });

  it("does not attach a different public-form address to the signed-in account", async () => {
    const user = await createTestGuest();
    const alternateEmail = `newsletter-${user.id}@example.com`;
    userIds.push(user.id);
    emails.push(user.email, alternateEmail);

    await requestEmailMarketingConsent({
      email: alternateEmail,
      userId: user.id,
      audience: "GUEST",
      source: "automated-test-public-form",
    });

    expect(
      await db.marketingContact.findUniqueOrThrow({ where: { email: alternateEmail } })
    ).toMatchObject({ userId: null });
  });

  it("allows affirmative push consent and blocks it immediately after withdrawal", async () => {
    const user = await createTestGuest();
    userIds.push(user.id);
    emails.push(user.email);

    await setPushMarketingConsent({
      userId: user.id,
      email: user.email,
      audience: "GUEST",
      enabled: true,
      source: "automated-test",
    });
    expect(
      await canSendMarketing({
        email: user.email,
        channel: "PUSH",
        audience: "GUEST",
      })
    ).toMatchObject({ allowed: true });

    await withdrawUserMarketing({
      userId: user.id,
      channel: "PUSH",
      source: "automated-test",
    });
    expect(
      await canSendMarketing({
        email: user.email,
        channel: "PUSH",
        audience: "GUEST",
      })
    ).toMatchObject({ allowed: false });
    expect(
      await db.marketingSuppression.count({
        where: { contact: { email: user.email }, channel: "PUSH" },
      })
    ).toBe(1);
  });

  it("confirms once, authorizes sending, and globally suppresses on unsubscribe", async () => {
    const user = await createTestGuest();
    userIds.push(user.id);
    emails.push(user.email);
    await requestEmailMarketingConsent({
      email: user.email,
      userId: user.id,
      audience: "GUEST",
      source: "automated-test",
    });
    const preference = await db.marketingPreference.findFirstOrThrow({
      where: { contact: { email: user.email }, channel: "EMAIL" },
    });
    const confirmationToken = "known-test-confirmation-token-123456789";
    await db.marketingToken.create({
      data: {
        preferenceId: preference.id,
        purpose: "CONFIRM_EMAIL",
        tokenHash: createHash("sha256").update(confirmationToken).digest("hex"),
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    await confirmEmailMarketingConsent(
      confirmationToken,
      "automated-test-confirmation"
    );
    expect(
      await canSendMarketing({
        email: user.email,
        channel: "EMAIL",
        audience: "GUEST",
      })
    ).toMatchObject({ allowed: true });

    const unsubscribeToken = await createUnsubscribeToken(preference.id);
    await unsubscribeEmailMarketing(
      unsubscribeToken,
      "automated-test-unsubscribe"
    );
    expect(
      await canSendMarketing({
        email: user.email,
        channel: "EMAIL",
        audience: "GUEST",
      })
    ).toMatchObject({ allowed: false });
    expect(
      await db.marketingPreference.findUniqueOrThrow({
        where: { id: preference.id },
      })
    ).toMatchObject({ status: "UNSUBSCRIBED" });
  });
});
