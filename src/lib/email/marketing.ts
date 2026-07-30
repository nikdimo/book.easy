import "server-only";

import type { MarketingAudience } from "@prisma/client";
import { db } from "@/lib/db";
import { communicationAppUrl } from "@/lib/communication-brand.server";
import { sendTransactionalEmail } from "@/lib/email";
import {
  canSendMarketing,
  createUnsubscribeToken,
} from "@/lib/services/marketing-consent.service";

export async function sendMarketingEmail(input: {
  to: string;
  audience: MarketingAudience;
  subject: string;
  text: string;
  html?: string;
  campaignId?: string;
}) {
  const eligibility = await canSendMarketing({
    email: input.to,
    channel: "EMAIL",
    audience: input.audience,
  });
  if (!eligibility.allowed || !eligibility.preference) {
    if (input.campaignId && eligibility.contact) {
      await db.marketingDelivery.upsert({
        where: {
          campaignId_contactId: {
            campaignId: input.campaignId,
            contactId: eligibility.contact.id,
          },
        },
        create: {
          campaignId: input.campaignId,
          contactId: eligibility.contact.id,
          preferenceId: eligibility.preference?.id,
          status: "SKIPPED",
          failureReason: "No active consent or contact is suppressed",
        },
        update: {
          status: "SKIPPED",
          failureReason: "No active consent or contact is suppressed",
        },
      });
    }
    return { sent: false as const, reason: "not-consented-or-suppressed" as const };
  }

  // A fresh opaque token per delivery keeps unsubscribe credentials out of the
  // database while allowing both a normal landing page and RFC 8058 one-click POST.
  const token = await createUnsubscribeToken(eligibility.preference.id);
  const unsubscribeUrl = communicationAppUrl(
    `/unsubscribe/${encodeURIComponent(token)}`
  );
  const oneClickUrl = communicationAppUrl(
    `/api/marketing/unsubscribe?token=${encodeURIComponent(token)}`
  );
  const footerText = [
    "",
    "You are receiving this because you opted in to marketing from Linger Homes.",
    `Unsubscribe from all marketing emails: ${unsubscribeUrl}`,
  ].join("\n");
  const footerHtml = `<hr><p style="font-size:12px;color:#666">You are receiving this because you opted in to marketing from Linger Homes. <a href="${unsubscribeUrl}">Unsubscribe from all marketing emails</a>.</p>`;

  try {
    await sendTransactionalEmail({
      to: input.to,
      subject: input.subject,
      text: `${input.text}${footerText}`,
      html: input.html ? `${input.html}${footerHtml}` : undefined,
      headers: {
        "List-Unsubscribe": `<${oneClickUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    });
    if (input.campaignId && eligibility.contact) {
      await db.marketingDelivery.upsert({
        where: {
          campaignId_contactId: {
            campaignId: input.campaignId,
            contactId: eligibility.contact.id,
          },
        },
        create: {
          campaignId: input.campaignId,
          contactId: eligibility.contact.id,
          preferenceId: eligibility.preference.id,
          status: "SENT",
          sentAt: new Date(),
        },
        update: { status: "SENT", sentAt: new Date(), failureReason: null },
      });
    }
  } catch (error) {
    if (input.campaignId && eligibility.contact) {
      await db.marketingDelivery.upsert({
        where: {
          campaignId_contactId: {
            campaignId: input.campaignId,
            contactId: eligibility.contact.id,
          },
        },
        create: {
          campaignId: input.campaignId,
          contactId: eligibility.contact.id,
          preferenceId: eligibility.preference.id,
          status: "FAILED",
          failureReason: error instanceof Error ? error.message.slice(0, 500) : "Email failed",
        },
        update: {
          status: "FAILED",
          failureReason: error instanceof Error ? error.message.slice(0, 500) : "Email failed",
        },
      });
    }
    throw error;
  }
  return { sent: true as const };
}
