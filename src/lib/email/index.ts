/**
 * Transactional email abstraction. Logs to the console when SMTP isn't configured
 * (local dev); otherwise sends via the same SMTP server used for magic-link auth
 * emails. Swap the "smtp" branch for Resend/SES/etc. without changing call sites.
 */

import "server-only";
import { SITE_DOMAIN } from "@/lib/branding";
import { formatDate, formatPrice } from "@/lib/utils/format";
import { createSmtpTransport } from "@/lib/email/smtp-transport";

export interface SendEmailParams {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

function resolveProvider(): "console" | "smtp" {
  const explicit = process.env.EMAIL_PROVIDER;
  if (explicit === "smtp" || explicit === "console") return explicit;
  // Auto-detect: reuse the same decision the Nodemailer auth provider makes — if SMTP
  // is configured, use it. Local dev without SMTP env vars set still just logs.
  return process.env.EMAIL_SERVER_HOST ? "smtp" : "console";
}

export async function sendTransactionalEmail(params: SendEmailParams): Promise<void> {
  const provider = resolveProvider();

  if (provider === "console") {
    console.info("[email]", {
      to: params.to,
      subject: params.subject,
      preview: params.text.slice(0, 200),
    });
    return;
  }

  const transport = createSmtpTransport();
  await transport.sendMail({
    to: params.to,
    from: process.env.EMAIL_FROM,
    subject: params.subject,
    text: params.text,
    html: params.html,
  });
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

export async function notifyGuestBookingConfirmed(bookingId: string): Promise<void> {
  const { db } = await import("@/lib/db");
  const booking = await db.booking.findUnique({
    where: { id: bookingId },
    include: {
      guest: { select: { name: true, email: true } },
      listing: { select: { title: true } },
    },
  });
  if (!booking) return;

  const lines = [
    `Hi ${booking.guest.name},`,
    ``,
    `Good news — your booking for "${booking.listing.title}" has been confirmed.`,
    `Check-in: ${formatDate(booking.checkIn)}`,
    `Check-out: ${formatDate(booking.checkOut)}`,
    `Total: ${formatPrice(Number(booking.totalPrice))}`,
    ``,
    `— ${SITE_DOMAIN}`,
  ];

  await sendTransactionalEmail({
    to: booking.guest.email,
    subject: `[${SITE_DOMAIN}] Booking confirmed: ${booking.listing.title}`,
    text: lines.join("\n"),
  });
}

export async function notifyGuestBookingRejected(bookingId: string): Promise<void> {
  const { db } = await import("@/lib/db");
  const booking = await db.booking.findUnique({
    where: { id: bookingId },
    include: {
      guest: { select: { name: true, email: true } },
      listing: { select: { title: true } },
    },
  });
  if (!booking) return;

  const lines = [
    `Hi ${booking.guest.name},`,
    ``,
    `Unfortunately your booking request for "${booking.listing.title}" (${formatDate(booking.checkIn)} – ${formatDate(booking.checkOut)}) was declined by the host.`,
    ...(booking.cancellationReason ? [``, `Reason: ${booking.cancellationReason}`] : []),
    ``,
    `You won't be charged. Feel free to look for other stays.`,
    ``,
    `— ${SITE_DOMAIN}`,
  ];

  await sendTransactionalEmail({
    to: booking.guest.email,
    subject: `[${SITE_DOMAIN}] Booking request declined: ${booking.listing.title}`,
    text: lines.join("\n"),
  });
}

/** Booking cancelled by the host or an admin — notify the guest. */
export async function notifyGuestBookingCancelled(bookingId: string): Promise<void> {
  const { db } = await import("@/lib/db");
  const booking = await db.booking.findUnique({
    where: { id: bookingId },
    include: {
      guest: { select: { name: true, email: true } },
      listing: { select: { title: true } },
    },
  });
  if (!booking) return;

  const lines = [
    `Hi ${booking.guest.name},`,
    ``,
    `Your booking for "${booking.listing.title}" (${formatDate(booking.checkIn)} – ${formatDate(booking.checkOut)}) has been cancelled.`,
    ...(booking.cancellationReason ? [``, `Reason: ${booking.cancellationReason}`] : []),
    ``,
    `— ${SITE_DOMAIN}`,
  ];

  await sendTransactionalEmail({
    to: booking.guest.email,
    subject: `[${SITE_DOMAIN}] Booking cancelled: ${booking.listing.title}`,
    text: lines.join("\n"),
  });
}

/** Booking cancelled by the guest — notify the host so they know the dates are free again. */
export async function notifyHostBookingCancelledByGuest(bookingId: string): Promise<void> {
  const { db } = await import("@/lib/db");
  const booking = await db.booking.findUnique({
    where: { id: bookingId },
    include: {
      guest: { select: { name: true } },
      listing: {
        select: {
          title: true,
          host: { select: { email: true, name: true } },
        },
      },
    },
  });
  if (!booking) return;

  const lines = [
    `Hello ${booking.listing.host.name},`,
    ``,
    `${booking.guest.name} cancelled their booking for "${booking.listing.title}" (${formatDate(booking.checkIn)} – ${formatDate(booking.checkOut)}). Those dates are available again.`,
    ``,
    `— ${SITE_DOMAIN}`,
  ];

  await sendTransactionalEmail({
    to: booking.listing.host.email,
    subject: `[${SITE_DOMAIN}] Booking cancelled: ${booking.listing.title}`,
    text: lines.join("\n"),
  });
}
