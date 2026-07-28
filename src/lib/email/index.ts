/**
 * Transactional email abstraction. Logs to the console when SMTP isn't configured
 * (local dev); otherwise sends via the same SMTP server used for magic-link auth
 * emails. Swap the "smtp" branch for Resend/SES/etc. without changing call sites.
 */

import "server-only";
import { formatDate, formatPrice } from "@/lib/utils/format";
import { createSmtpTransport } from "@/lib/email/smtp-transport";
import { COMMUNICATION_BRAND } from "@/lib/communication-brand";
import {
  communicationAppUrl,
  communicationFromAddress,
  communicationSupportEmail,
} from "@/lib/communication-brand.server";

export interface SendEmailParams {
  to: string;
  subject: string;
  text: string;
  html?: string;
  sender?: "customer" | "support";
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
      from: communicationFromAddress(params.sender),
      to: params.to,
      subject: params.subject,
      preview: params.text.slice(0, 200),
    });
    return;
  }

  const transport = createSmtpTransport();
  await transport.sendMail({
    to: params.to,
    from: communicationFromAddress(params.sender),
    subject: params.subject,
    text: params.text,
    html: params.html,
  });
}

export async function notifyConversationMessage(input: {
  conversationId: string;
  senderId: string;
  recipientIds: string[];
  preview: string;
  supportSender: boolean;
}): Promise<void> {
  if (input.recipientIds.length === 0) return;
  const { db } = await import("@/lib/db");
  const [conversation, sender, recipients] = await Promise.all([
    db.conversation.findUnique({
      where: { id: input.conversationId },
      select: { listing: { select: { title: true } } },
    }),
    db.user.findUnique({
      where: { id: input.senderId },
      select: { name: true },
    }),
    db.user.findMany({
      where: { id: { in: input.recipientIds }, isActive: true },
      select: { name: true, email: true },
    }),
  ]);
  if (!conversation || !sender) return;

  const senderName = input.supportSender
    ? COMMUNICATION_BRAND.supportName
    : sender.name;
  const link = communicationAppUrl(`/messages/${input.conversationId}`);
  await Promise.allSettled(
    recipients.map((recipient) =>
      sendTransactionalEmail({
        to: recipient.email,
        sender: input.supportSender ? "support" : "customer",
        subject: `[${COMMUNICATION_BRAND.name}] New message about ${conversation.listing.title}`,
        text: [
          `Hi ${recipient.name},`,
          "",
          `${senderName} sent you a message about "${conversation.listing.title}".`,
          "",
          input.preview,
          "",
          `Reply securely in ${COMMUNICATION_BRAND.name}: ${link}`,
          "",
          `For your privacy, keep the conversation inside ${COMMUNICATION_BRAND.name}.`,
        ].join("\n"),
      })
    )
  );
}

export async function notifySafetyCaseSubmitted(input: {
  caseId: string;
}): Promise<void> {
  const { db } = await import("@/lib/db");
  const safetyCase = await db.safetyCase.findUnique({
    where: { id: input.caseId },
    include: {
      reporter: { select: { name: true, email: true } },
    },
  });
  if (!safetyCase) return;

  const link = communicationAppUrl(`/account/support/${safetyCase.id}`);
  await sendTransactionalEmail({
    to: safetyCase.reporter.email,
    sender: "support",
    subject: `[${COMMUNICATION_BRAND.name}] ${safetyCase.type === "CLAIM" ? "Claim" : "Report"} received: ${safetyCase.reference}`,
    text: [
      `Hi ${safetyCase.reporter.name},`,
      "",
      `We received your ${safetyCase.type.toLowerCase()} "${safetyCase.subject}".`,
      `Reference: ${safetyCase.reference}`,
      `Status: ${safetyCase.status.replaceAll("_", " ")}`,
      "",
      `Follow the case: ${link}`,
      "",
      COMMUNICATION_BRAND.supportName,
    ].join("\n"),
  });

  await sendTransactionalEmail({
    to: communicationSupportEmail(),
    sender: "support",
    subject: `[${COMMUNICATION_BRAND.supportName}] New ${safetyCase.type.toLowerCase()}: ${safetyCase.reference}`,
    text: [
      `${safetyCase.reference}: ${safetyCase.subject}`,
      `Category: ${safetyCase.category}`,
      `Priority: ${safetyCase.priority}`,
      "",
      communicationAppUrl(`/admin/cases/${safetyCase.id}`),
    ].join("\n"),
  });
}

export async function notifySafetyCaseUpdated(input: {
  caseId: string;
  message: string;
}): Promise<void> {
  const { db } = await import("@/lib/db");
  const safetyCase = await db.safetyCase.findUnique({
    where: { id: input.caseId },
    include: {
      reporter: { select: { name: true, email: true } },
    },
  });
  if (!safetyCase) return;

  await sendTransactionalEmail({
    to: safetyCase.reporter.email,
    sender: "support",
    subject: `[${COMMUNICATION_BRAND.name}] Update for ${safetyCase.reference}`,
    text: [
      `Hi ${safetyCase.reporter.name},`,
      "",
      input.message,
      `Current status: ${safetyCase.status.replaceAll("_", " ")}`,
      "",
      `View and respond: ${communicationAppUrl(`/account/support/${safetyCase.id}`)}`,
      "",
      COMMUNICATION_BRAND.supportName,
    ].join("\n"),
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
    `— ${COMMUNICATION_BRAND.name}`,
  ];

  await sendTransactionalEmail({
    to: hostEmail,
    subject: `[${COMMUNICATION_BRAND.name}] New booking request: ${booking.listing.title}`,
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
    `— ${COMMUNICATION_BRAND.name}`,
  ];

  await sendTransactionalEmail({
    to: booking.guest.email,
    subject: `[${COMMUNICATION_BRAND.name}] Booking confirmed: ${booking.listing.title}`,
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
    `— ${COMMUNICATION_BRAND.name}`,
  ];

  await sendTransactionalEmail({
    to: booking.guest.email,
    subject: `[${COMMUNICATION_BRAND.name}] Booking request declined: ${booking.listing.title}`,
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
    `— ${COMMUNICATION_BRAND.name}`,
  ];

  await sendTransactionalEmail({
    to: booking.guest.email,
    subject: `[${COMMUNICATION_BRAND.name}] Booking cancelled: ${booking.listing.title}`,
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
    `— ${COMMUNICATION_BRAND.name}`,
  ];

  await sendTransactionalEmail({
    to: booking.listing.host.email,
    subject: `[${COMMUNICATION_BRAND.name}] Booking cancelled: ${booking.listing.title}`,
    text: lines.join("\n"),
  });
}
