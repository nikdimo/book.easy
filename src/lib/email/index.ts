/**
 * Transactional email abstraction. Default implementation logs to the server console.
 * Swap the implementation for Resend, SMTP, etc. without changing call sites.
 */

import { SITE_DOMAIN } from "@/lib/branding";

export interface SendEmailParams {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export async function sendTransactionalEmail(params: SendEmailParams): Promise<void> {
  const provider = process.env.EMAIL_PROVIDER ?? "console";

  if (provider === "console") {
    console.info("[email]", {
      to: params.to,
      subject: params.subject,
      preview: params.text.slice(0, 200),
    });
    return;
  }

  // Future: provider === "resend" | "smtp"
  console.warn("[email] Unknown EMAIL_PROVIDER, falling back to console");
  console.info("[email]", params);
}

export async function notifyHostNewBookingRequest(bookingId: string): Promise<void> {
  const { db } = await import("@/lib/db");
  const booking = await db.booking.findUnique({
    where: { id: bookingId },
    include: {
      guest: { select: { name: true, email: true } },
      listing: {
        select: {
          title: true,
          host: { select: { email: true, name: true } },
        },
      },
    },
  });

  if (!booking) return;

  const hostEmail = booking.listing.host.email;
  const lines = [
    `Hello ${booking.listing.host.name},`,
    ``,
    `${booking.guest.name} (${booking.guest.email}) requested a booking for "${booking.listing.title}".`,
    `Check your host dashboard to confirm or reject.`,
    ``,
    `— ${SITE_DOMAIN}`,
  ];

  await sendTransactionalEmail({
    to: hostEmail,
    subject: `[${SITE_DOMAIN}] New booking request: ${booking.listing.title}`,
    text: lines.join("\n"),
  });
}
