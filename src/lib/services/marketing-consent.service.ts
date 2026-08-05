import "server-only";

import {
  CommunicationChannel,
  MarketingAudience,
  MarketingConsentAction,
  MarketingPreferenceStatus,
  MarketingSuppressionReason,
  MarketingTokenPurpose,
  type Prisma,
} from "@prisma/client";
import { createHash, createHmac, randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { COMMUNICATION_BRAND } from "@/lib/communication-brand";
import { communicationAppUrl } from "@/lib/communication-brand.server";

const CONFIRMATION_TTL_MS = 48 * 60 * 60 * 1000;

const CONSENT_COPY: Record<
  CommunicationChannel,
  Record<MarketingAudience, { version: string; text: string }>
> = {
  EMAIL: {
    GUEST: {
      version: "marketing-email-guest-en-v1",
      text: "I would like to receive travel inspiration, special offers and news from Linger Homes by email. I can unsubscribe at any time.",
    },
    HOST: {
      version: "marketing-email-host-en-v1",
      text: "I would like to receive hosting inspiration, product news and special offers from Linger Homes by email. I can unsubscribe at any time.",
    },
  },
  PUSH: {
    GUEST: {
      version: "marketing-push-guest-en-v1",
      text: "I would like to receive travel inspiration and special offers from Linger Homes by push notification. I can turn these off at any time.",
    },
    HOST: {
      version: "marketing-push-host-en-v1",
      text: "I would like to receive hosting inspiration, product news and special offers from Linger Homes by push notification. I can turn these off at any time.",
    },
  },
};

export type MarketingRequestMetadata = {
  ip?: string;
  userAgent?: string;
  referrer?: string;
};

export function normalizeMarketingEmail(email: string): string {
  return email.trim().toLocaleLowerCase("en-US");
}

export function marketingConsentText(
  channel: CommunicationChannel,
  audience: MarketingAudience
): string {
  return CONSENT_COPY[channel][audience].text;
}

function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function requestFingerprint(ip: string): string {
  const secret =
    process.env.MARKETING_AUDIT_SALT ||
    process.env.AUTH_SECRET ||
    "development-only-marketing-audit-salt";
  return createHmac("sha256", secret).update(ip).digest("hex");
}

function evidenceMetadata(
  metadata?: MarketingRequestMetadata
): Prisma.InputJsonObject | undefined {
  if (!metadata) return undefined;
  const result: Record<string, string> = {};
  if (metadata.ip) result.requestFingerprint = requestFingerprint(metadata.ip);
  if (metadata.userAgent) result.userAgent = metadata.userAgent.slice(0, 500);
  if (metadata.referrer) result.referrer = metadata.referrer.slice(0, 1000);
  return Object.keys(result).length ? (result as Prisma.InputJsonObject) : undefined;
}

async function ensureStatement(
  channel: CommunicationChannel,
  audience: MarketingAudience
) {
  const copy = CONSENT_COPY[channel][audience];
  const contentHash = createHash("sha256").update(copy.text).digest("hex");
  return db.consentStatement.upsert({
    where: { version: copy.version },
    create: {
      version: copy.version,
      legalEntity: process.env.MARKETING_LEGAL_ENTITY?.trim() || "Linger Homes",
      senderName: COMMUNICATION_BRAND.name,
      text: copy.text,
      channel,
      audience,
      locale: "en",
      contentHash,
    },
    update: {},
  });
}

async function getOrCreateContact(input: {
  email: string;
  userId?: string;
  locale?: string;
}) {
  const email = normalizeMarketingEmail(input.email);
  const account = input.userId
    ? await db.user.findUnique({
        where: { id: input.userId },
        select: { email: true },
      })
    : null;
  // Never bind or rewrite an account's durable marketing identity using an
  // arbitrary address supplied by a public form.
  const verifiedUserId =
    account && normalizeMarketingEmail(account.email) === email
      ? input.userId
      : undefined;
  const existing = await db.marketingContact.findUnique({ where: { email } });
  if (existing) {
    return db.marketingContact.update({
      where: { id: existing.id },
      data: {
        locale: input.locale || existing.locale,
        ...(!existing.userId && verifiedUserId ? { userId: verifiedUserId } : {}),
      },
    });
  }

  if (verifiedUserId) {
    const byUser = await db.marketingContact.findUnique({
      where: { userId: verifiedUserId },
    });
    if (byUser) {
      return db.marketingContact.update({
        where: { id: byUser.id },
        data: { email, locale: input.locale || byUser.locale },
      });
    }
  }

  return db.marketingContact.create({
    data: { email, userId: verifiedUserId, locale: input.locale || "en" },
  });
}

async function createToken(
  preferenceId: string,
  purpose: MarketingTokenPurpose,
  expiresAt?: Date
) {
  const raw = randomBytes(32).toString("base64url");
  await db.marketingToken.create({
    data: { preferenceId, purpose, tokenHash: tokenHash(raw), expiresAt },
  });
  return raw;
}

export async function requestEmailMarketingConsent(input: {
  email: string;
  userId?: string;
  audience: MarketingAudience;
  source: string;
  locale?: string;
  metadata?: MarketingRequestMetadata;
}) {
  const contact = await getOrCreateContact(input);
  const statement = await ensureStatement("EMAIL", input.audience);
  const current = await db.marketingPreference.findUnique({
    where: {
      contactId_channel_audience: {
        contactId: contact.id,
        channel: "EMAIL",
        audience: input.audience,
      },
    },
    include: {
      contact: {
        select: {
          suppressions: { where: { channel: "EMAIL" }, select: { id: true } },
        },
      },
    },
  });
  if (
    current?.status === MarketingPreferenceStatus.SUBSCRIBED &&
    current.contact.suppressions.length === 0
  ) {
    return { status: "SUBSCRIBED" as const };
  }
  if (
    current?.status === MarketingPreferenceStatus.PENDING &&
    current.requestedAt &&
    current.requestedAt > new Date(Date.now() - 10 * 60 * 1000)
  ) {
    return { status: "PENDING" as const };
  }
  const now = new Date();
  const preference = await db.$transaction(async (tx) => {
    const saved = await tx.marketingPreference.upsert({
      where: {
        contactId_channel_audience: {
          contactId: contact.id,
          channel: "EMAIL",
          audience: input.audience,
        },
      },
      create: {
        contactId: contact.id,
        channel: "EMAIL",
        audience: input.audience,
        status: "PENDING",
        statementId: statement.id,
        requestedAt: now,
      },
      update: {
        status: "PENDING",
        statementId: statement.id,
        requestedAt: now,
        withdrawnAt: null,
      },
    });
    await tx.marketingConsentEvent.create({
      data: {
        preferenceId: saved.id,
        statementId: statement.id,
        action: "REQUESTED",
        source: input.source,
        metadata: evidenceMetadata(input.metadata),
      },
    });
    return saved;
  });

  const rawToken = await createToken(
    preference.id,
    "CONFIRM_EMAIL",
    new Date(Date.now() + CONFIRMATION_TTL_MS)
  );
  const confirmUrl = communicationAppUrl(
    `/marketing/confirm/${encodeURIComponent(rawToken)}`
  );
  const { sendTransactionalEmail } = await import("@/lib/email");
  await sendTransactionalEmail({
    to: contact.email,
    subject: `Confirm your ${COMMUNICATION_BRAND.name} email subscription`,
    text: [
      "You asked to receive marketing emails from Linger Homes.",
      "",
      `Confirm your subscription: ${confirmUrl}`,
      "",
      "This link expires in 48 hours. If you did not make this request, ignore this email. You will not be subscribed.",
    ].join("\n"),
    html: `<p>You asked to receive marketing emails from Linger Homes.</p><p><a href="${confirmUrl}">Confirm my subscription</a></p><p>This link expires in 48 hours. If you did not make this request, ignore this email. You will not be subscribed.</p>`,
  });

  return { status: "PENDING" as const };
}

async function findValidToken(rawToken: string, purpose: MarketingTokenPurpose) {
  const token = await db.marketingToken.findUnique({
    where: { tokenHash: tokenHash(rawToken) },
    include: {
      preference: {
        include: { contact: true, statement: true },
      },
    },
  });
  if (!token || token.purpose !== purpose) return null;
  if (token.usedAt || (token.expiresAt && token.expiresAt <= new Date())) return null;
  return token;
}

export async function previewMarketingToken(
  rawToken: string,
  purpose: MarketingTokenPurpose
) {
  const token = await findValidToken(rawToken, purpose);
  if (!token) return null;
  const email = token.preference.contact.email;
  const [local, domain = ""] = email.split("@");
  return {
    audience: token.preference.audience,
    email: `${local.slice(0, 2)}${"*".repeat(Math.max(1, local.length - 2))}@${domain}`,
    statement: token.preference.statement?.text || null,
  };
}

export async function confirmEmailMarketingConsent(
  rawToken: string,
  source: string,
  metadata?: MarketingRequestMetadata
) {
  const token = await findValidToken(rawToken, "CONFIRM_EMAIL");
  if (!token) throw new Error("This confirmation link is invalid or has expired.");
  const now = new Date();
  await db.$transaction(async (tx) => {
    const consumed = await tx.marketingToken.updateMany({
      where: { id: token.id, usedAt: null },
      data: { usedAt: now },
    });
    if (consumed.count !== 1) throw new Error("This confirmation link was already used.");
    await tx.marketingSuppression.deleteMany({
      where: { contactId: token.preference.contactId, channel: "EMAIL" },
    });
    await tx.marketingPreference.update({
      where: { id: token.preferenceId },
      data: {
        status: "SUBSCRIBED",
        confirmedAt: now,
        withdrawnAt: null,
      },
    });
    await tx.marketingConsentEvent.create({
      data: {
        preferenceId: token.preferenceId,
        statementId: token.preference.statementId,
        action: "CONFIRMED",
        source,
        metadata: evidenceMetadata(metadata),
      },
    });
  });
  return { audience: token.preference.audience };
}

async function suppressContact(
  contactId: string,
  channel: CommunicationChannel,
  reason: MarketingSuppressionReason,
  source: string,
  metadata?: MarketingRequestMetadata
) {
  const now = new Date();
  await db.$transaction(async (tx) => {
    await tx.marketingSuppression.upsert({
      where: { contactId_channel: { contactId, channel } },
      create: { contactId, channel, reason, source },
      update: { reason, source, createdAt: now },
    });
    const preferences = await tx.marketingPreference.findMany({
      where: { contactId, channel },
      select: { id: true, statementId: true },
    });
    await tx.marketingPreference.updateMany({
      where: { contactId, channel },
      data: {
        status:
          reason === "UNSUBSCRIBE" ? "UNSUBSCRIBED" : "SUPPRESSED",
        withdrawnAt: now,
      },
    });
    if (preferences.length) {
      await tx.marketingConsentEvent.createMany({
        data: preferences.map((preference) => ({
          preferenceId: preference.id,
          statementId: preference.statementId,
          action:
            reason === "UNSUBSCRIBE"
              ? MarketingConsentAction.WITHDRAWN
              : MarketingConsentAction.SUPPRESSED,
          source,
          metadata: evidenceMetadata(metadata),
        })),
      });
    }
  });
}

export async function unsubscribeEmailMarketing(
  rawToken: string,
  source: string,
  metadata?: MarketingRequestMetadata
) {
  const token = await findValidToken(rawToken, "UNSUBSCRIBE_EMAIL");
  if (!token) throw new Error("This unsubscribe link is invalid.");
  await suppressContact(
    token.preference.contactId,
    "EMAIL",
    "UNSUBSCRIBE",
    source,
    metadata
  );
  await db.marketingToken.updateMany({
    where: { id: token.id, usedAt: null },
    data: { usedAt: new Date() },
  });
}

export async function withdrawUserMarketing(input: {
  userId: string;
  channel: CommunicationChannel;
  source: string;
}) {
  const contact = await db.marketingContact.findUnique({
    where: { userId: input.userId },
    include: {
      suppressions: { where: { channel: input.channel }, select: { id: true } },
      preferences: {
        where: { channel: input.channel },
        select: { status: true },
      },
    },
  });
  if (!contact) return;
  if (
    contact.suppressions.length > 0 &&
    contact.preferences.every((preference) =>
      ["UNSUBSCRIBED", "SUPPRESSED", "NOT_SUBSCRIBED"].includes(
        preference.status
      )
    )
  ) {
    return;
  }
  await suppressContact(
    contact.id,
    input.channel,
    "UNSUBSCRIBE",
    input.source
  );
}

/** Provider webhook/admin entry point for complaints, hard bounces, and objections. */
export async function suppressMarketingContact(input: {
  email: string;
  channel: CommunicationChannel;
  reason: MarketingSuppressionReason;
  source: string;
}) {
  const contact = await db.marketingContact.findUnique({
    where: { email: normalizeMarketingEmail(input.email) },
  });
  if (!contact) return false;
  await suppressContact(
    contact.id,
    input.channel,
    input.reason,
    input.source
  );
  return true;
}

export async function setPushMarketingConsent(input: {
  userId: string;
  email: string;
  audience: MarketingAudience;
  enabled: boolean;
  source: string;
}) {
  if (!input.enabled) {
    await withdrawUserMarketing({
      userId: input.userId,
      channel: "PUSH",
      source: input.source,
    });
    return;
  }
  const contact = await getOrCreateContact(input);
  const current = await db.marketingPreference.findUnique({
    where: {
      contactId_channel_audience: {
        contactId: contact.id,
        channel: "PUSH",
        audience: input.audience,
      },
    },
    include: {
      contact: {
        select: {
          suppressions: { where: { channel: "PUSH" }, select: { id: true } },
        },
      },
    },
  });
  if (
    current?.status === MarketingPreferenceStatus.SUBSCRIBED &&
    current.contact.suppressions.length === 0
  ) {
    return;
  }
  const statement = await ensureStatement("PUSH", input.audience);
  const now = new Date();
  await db.$transaction(async (tx) => {
    await tx.marketingSuppression.deleteMany({
      where: { contactId: contact.id, channel: "PUSH" },
    });
    const preference = await tx.marketingPreference.upsert({
      where: {
        contactId_channel_audience: {
          contactId: contact.id,
          channel: "PUSH",
          audience: input.audience,
        },
      },
      create: {
        contactId: contact.id,
        channel: "PUSH",
        audience: input.audience,
        status: "SUBSCRIBED",
        statementId: statement.id,
        requestedAt: now,
        confirmedAt: now,
      },
      update: {
        status: "SUBSCRIBED",
        statementId: statement.id,
        requestedAt: now,
        confirmedAt: now,
        withdrawnAt: null,
      },
    });
    await tx.marketingConsentEvent.create({
      data: {
        preferenceId: preference.id,
        statementId: statement.id,
        action: "CONFIRMED",
        source: input.source,
      },
    });
  });
}

export async function canSendMarketing(input: {
  email: string;
  channel: CommunicationChannel;
  audience: MarketingAudience;
}) {
  const contact = await db.marketingContact.findUnique({
    where: { email: normalizeMarketingEmail(input.email) },
    include: {
      suppressions: { where: { channel: input.channel }, select: { id: true } },
      preferences: {
        where: { channel: input.channel, audience: input.audience },
        include: { statement: true },
      },
    },
  });
  const preference = contact?.preferences[0];
  const allowed =
    Boolean(contact) &&
    contact!.suppressions.length === 0 &&
    preference?.status === MarketingPreferenceStatus.SUBSCRIBED &&
    Boolean(preference.statement) &&
    !preference.statement?.retiredAt;
  return { allowed, contact: contact || null, preference: preference || null };
}

export async function createUnsubscribeToken(preferenceId: string) {
  return createToken(preferenceId, "UNSUBSCRIBE_EMAIL");
}

export async function getUserCommunicationSettings(userId: string) {
  const user = await db.user.findUniqueOrThrow({
    where: { id: userId },
    select: { email: true, isHost: true },
  });
  const operational = await db.communicationPreference.upsert({
    where: { userId },
    create: { userId },
    update: {},
  });
  const contact = await getOrCreateContact({ email: user.email, userId });
  const marketing = await db.marketingPreference.findMany({
    where: { contactId: contact.id },
    select: { channel: true, audience: true, status: true },
  });
  return { user, operational, marketing };
}

export async function getMarketingAdminOverview(input?: {
  status?: MarketingPreferenceStatus;
  audience?: MarketingAudience;
}) {
  const where: Prisma.MarketingPreferenceWhereInput = {
    ...(input?.status ? { status: input.status } : {}),
    ...(input?.audience ? { audience: input.audience } : {}),
  };
  const [preferences, subscribed, pending, suppressed] = await Promise.all([
    db.marketingPreference.findMany({
      where,
      include: {
        contact: { select: { email: true, userId: true } },
        statement: { select: { version: true, text: true } },
        events: { orderBy: { occurredAt: "desc" }, take: 1 },
      },
      orderBy: { updatedAt: "desc" },
      take: 250,
    }),
    db.marketingPreference.count({ where: { status: "SUBSCRIBED" } }),
    db.marketingPreference.count({ where: { status: "PENDING" } }),
    db.marketingSuppression.count(),
  ]);
  return { preferences, counts: { subscribed, pending, suppressed } };
}

export async function suppressMarketingEmailForAccountDeletion(userId: string) {
  const contact = await db.marketingContact.findUnique({ where: { userId } });
  if (!contact) return;
  await suppressContact(
    contact.id,
    "EMAIL",
    "PRIVACY_OBJECTION",
    "account-deletion"
  );
  await db.marketingContact.update({
    where: { id: contact.id },
    data: { userId: null },
  });
}
