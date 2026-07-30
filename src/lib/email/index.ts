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
  communicationReplyToAddress,
  communicationSupportEmail,
} from "@/lib/communication-brand.server";
import { renderBookingEmail } from "@/lib/email/booking-template";

export interface SendEmailParams {
  to: string;
  subject: string;
  text: string;
  html?: string;
  sender?: "customer" | "support";
  headers?: Record<string, string>;
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
      from: communicationFromAddress(),
      replyTo: communicationReplyToAddress(),
      to: params.to,
      subject: params.subject,
      preview: params.text.slice(0, 200),
      headers: params.headers,
    });
    return;
  }

  const transport = createSmtpTransport();
  await transport.sendMail({
    to: params.to,
    from: communicationFromAddress(),
    replyTo: communicationReplyToAddress(),
    subject: params.subject,
    text: params.text,
    html: params.html,
    headers: params.headers,
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
      select: {
        name: true,
        email: true,
        communicationPreference: { select: { messageEmail: true } },
      },
    }),
  ]);
  if (!conversation || !sender) return;

  const senderName = input.supportSender
    ? COMMUNICATION_BRAND.supportName
    : sender.name;
  const link = communicationAppUrl(`/messages/${input.conversationId}`);
  await Promise.all(
    recipients
      .filter((recipient) => recipient.communicationPreference?.messageEmail !== false)
      .map((recipient) =>
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

async function loadBookingEmailContext(bookingId: string) {
  const { db } = await import("@/lib/db");
  return db.booking.findUnique({
    where: { id: bookingId },
    include: {
      guest: { select: { name: true, email: true } },
      listing: {
        select: {
          title: true,
          slug: true,
          images: {
            where: { isPrimary: true },
            orderBy: { displayOrder: "asc" },
            take: 1,
            select: { url: true },
          },
          property: { select: { city: true, country: true } },
          host: { select: { email: true, name: true } },
        },
      },
    },
  });
}

type BookingEmailContext = NonNullable<
  Awaited<ReturnType<typeof loadBookingEmailContext>>
>;

function bookingEmailLinks(booking: BookingEmailContext) {
  return {
    guest: communicationAppUrl(`/account/bookings/${booking.id}`),
    host: communicationAppUrl(`/host/bookings/${booking.id}`),
    listing: communicationAppUrl(`/properties/${booking.listing.slug}`),
  };
}

function bookingEmailDetails(booking: BookingEmailContext) {
  return [
    { label: "Check-in", value: formatDate(booking.checkIn) },
    { label: "Check-out", value: formatDate(booking.checkOut) },
    {
      label: "Guests",
      value: `${booking.guestCount} guest${booking.guestCount === 1 ? "" : "s"}`,
    },
    {
      label: "Total",
      value: formatPrice(Number(booking.totalPrice), booking.currency),
    },
  ];
}

function bookingLocation(booking: BookingEmailContext) {
  return [booking.listing.property.city, booking.listing.property.country]
    .filter(Boolean)
    .join(", ");
}

function bookingDeadline(booking: BookingEmailContext) {
  return new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
    timeZone: process.env.BOOKING_TIME_ZONE || "Europe/Skopje",
  }).format(booking.responseDueAt);
}

export async function notifyGuestBookingRequestReceived(bookingId: string): Promise<void> {
  const booking = await loadBookingEmailContext(bookingId);
  if (!booking) return;
  const links = bookingEmailLinks(booking);
  const deadline = bookingDeadline(booking);

  await sendTransactionalEmail({
    to: booking.guest.email,
    subject: `Request received · ${booking.reference} · ${booking.listing.title}`,
    text: [
      `Hi ${booking.guest.name},`,
      "",
      `Your request for "${booking.listing.title}" has been sent to ${booking.listing.host.name}.`,
      `This booking is not confirmed yet. The host has until ${deadline} to respond.`,
      `No payment has been collected for this request.`,
      "",
      `Reference: ${booking.reference}`,
      `Check-in: ${formatDate(booking.checkIn)}`,
      `Check-out: ${formatDate(booking.checkOut)}`,
      `Guests: ${booking.guestCount}`,
      `Total: ${formatPrice(Number(booking.totalPrice), booking.currency)}`,
      "",
      `View request: ${links.guest}`,
      `View listing: ${links.listing}`,
      "",
      `— ${COMMUNICATION_BRAND.name}`,
    ].join("\n"),
    html: renderBookingEmail({
      preheader: `Your request is awaiting host approval until ${deadline}.`,
      eyebrow: "Request sent · Awaiting host approval",
      headline: `Your request has been sent to ${booking.listing.host.name}`,
      intro: "This is a booking request, not a confirmed reservation yet.",
      reference: booking.reference,
      listingTitle: booking.listing.title,
      listingHref: links.listing,
      imageUrl: booking.listing.images[0]?.url,
      location: bookingLocation(booking),
      details: bookingEmailDetails(booking),
      callout: `The host has until ${deadline} to accept or decline. No payment has been collected for this request.`,
      buttons: [
        { label: "View request", href: links.guest },
        { label: "View listing", href: links.listing, secondary: true },
      ],
    }),
  });
}

export async function notifyHostNewBookingRequest(bookingId: string): Promise<void> {
  const booking = await loadBookingEmailContext(bookingId);

  if (!booking) return;

  const links = bookingEmailLinks(booking);
  const deadline = bookingDeadline(booking);
  const hostEmail = booking.listing.host.email;
  const lines = [
    `Hello ${booking.listing.host.name},`,
    ``,
    `${booking.guest.name} requested a booking for "${booking.listing.title}".`,
    `Check your host dashboard to confirm or reject.`,
    ``,
    `— ${COMMUNICATION_BRAND.name}`,
  ];

  await sendTransactionalEmail({
    to: hostEmail,
    subject: `Action required · ${booking.reference} · ${formatDate(booking.checkIn)}–${formatDate(booking.checkOut)}`,
    text: lines.join("\n"),
    html: renderBookingEmail({
      preheader: `${booking.guest.name} requested ${formatDate(booking.checkIn)}–${formatDate(booking.checkOut)}. Respond by ${deadline}.`,
      eyebrow: "New booking request · Action required",
      headline: `${booking.guest.name} wants to stay at your place`,
      intro: booking.guestNote
        ? `Guest message: “${booking.guestNote}”`
        : "Review the stay details and respond before the request expires.",
      reference: booking.reference,
      listingTitle: booking.listing.title,
      listingHref: links.listing,
      imageUrl: booking.listing.images[0]?.url,
      location: bookingLocation(booking),
      details: bookingEmailDetails(booking),
      callout: `Accept or decline by ${deadline}. Opening the request does not change its status.`,
      buttons: [
        { label: "Review request", href: links.host },
        { label: "View listing", href: links.listing, secondary: true },
      ],
    }),
  });
}

export async function notifyHostBookingRequestReminder(bookingId: string): Promise<void> {
  const booking = await loadBookingEmailContext(bookingId);
  if (!booking || booking.status !== "PENDING") return;
  const links = bookingEmailLinks(booking);
  const deadline = bookingDeadline(booking);

  await sendTransactionalEmail({
    to: booking.listing.host.email,
    subject: `Reminder · ${booking.reference} · Booking request awaiting response`,
    text: [
      `Hello ${booking.listing.host.name},`,
      "",
      `${booking.guest.name}'s booking request is still waiting for your response.`,
      `Respond by ${deadline}.`,
      `Reference: ${booking.reference}`,
      `Review request: ${links.host}`,
      "",
      `— ${COMMUNICATION_BRAND.name}`,
    ].join("\n"),
    html: renderBookingEmail({
      preheader: `${booking.reference} is still waiting for your response.`,
      eyebrow: "Reminder · Response required",
      headline: "A booking request is waiting",
      intro: `${booking.guest.name} is still waiting for your decision.`,
      reference: booking.reference,
      listingTitle: booking.listing.title,
      listingHref: links.listing,
      imageUrl: booking.listing.images[0]?.url,
      location: bookingLocation(booking),
      details: bookingEmailDetails(booking),
      callout: `Respond by ${deadline} or the request will expire automatically.`,
      buttons: [{ label: "Review request", href: links.host }],
    }),
  });
}

export async function notifyGuestBookingConfirmed(bookingId: string): Promise<void> {
  const booking = await loadBookingEmailContext(bookingId);
  if (!booking) return;
  const links = bookingEmailLinks(booking);

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
    subject: `Confirmed · ${booking.reference} · ${booking.listing.title}`,
    text: lines.join("\n"),
    html: renderBookingEmail({
      preheader: `Your stay at ${booking.listing.title} is confirmed.`,
      eyebrow: "Booking confirmed",
      headline: "You’re all set",
      intro: `${booking.listing.host.name} accepted your booking request.`,
      reference: booking.reference,
      listingTitle: booking.listing.title,
      listingHref: links.listing,
      imageUrl: booking.listing.images[0]?.url,
      location: bookingLocation(booking),
      details: bookingEmailDetails(booking),
      callout: "Keep your messages and any payment arrangements inside Linger Homes for support and security.",
      buttons: [
        { label: "View booking", href: links.guest },
        { label: "View listing", href: links.listing, secondary: true },
      ],
    }),
  });
}

export async function notifyGuestBookingRejected(bookingId: string): Promise<void> {
  const booking = await loadBookingEmailContext(bookingId);
  if (!booking) return;
  const links = bookingEmailLinks(booking);

  const lines = [
    `Hi ${booking.guest.name},`,
    ``,
    `Unfortunately your booking request for "${booking.listing.title}" (${formatDate(booking.checkIn)} – ${formatDate(booking.checkOut)}) was declined by the host.`,
    ...(booking.cancellationReason ? [``, `Reason: ${booking.cancellationReason}`] : []),
    ``,
    `No payment was collected for this request.`,
    ``,
    `— ${COMMUNICATION_BRAND.name}`,
  ];

  await sendTransactionalEmail({
    to: booking.guest.email,
    subject: `Request update · ${booking.reference} · ${booking.listing.title}`,
    text: lines.join("\n"),
    html: renderBookingEmail({
      preheader: `Your request for ${booking.listing.title} was not accepted.`,
      eyebrow: "Booking request declined",
      headline: "This stay wasn’t confirmed",
      intro: booking.cancellationReason
        ? `Host’s reason: ${booking.cancellationReason}`
        : "The host was unable to accept this request.",
      reference: booking.reference,
      listingTitle: booking.listing.title,
      listingHref: links.listing,
      imageUrl: booking.listing.images[0]?.url,
      location: bookingLocation(booking),
      details: bookingEmailDetails(booking),
      callout: "No payment was collected. Your dates are free to use for another booking.",
      buttons: [{ label: "View request", href: links.guest }],
    }),
  });
}

/** Booking cancelled by the host or an admin — notify the guest. */
export async function notifyGuestBookingExpired(bookingId: string): Promise<void> {
  const booking = await loadBookingEmailContext(bookingId);
  if (!booking) return;
  const links = bookingEmailLinks(booking);

  await sendTransactionalEmail({
    to: booking.guest.email,
    subject: `Request expired · ${booking.reference} · ${booking.listing.title}`,
    text: [
      `Hi ${booking.guest.name},`,
      "",
      `The host did not respond in time to your request for "${booking.listing.title}".`,
      `Reference: ${booking.reference}`,
      `No payment was collected for this request.`,
      "",
      `View request: ${links.guest}`,
      "",
      `— ${COMMUNICATION_BRAND.name}`,
    ].join("\n"),
    html: renderBookingEmail({
      preheader: `The host did not respond to ${booking.reference} in time.`,
      eyebrow: "Booking request expired",
      headline: "The host didn’t respond in time",
      intro: "This request expired and did not become a confirmed reservation.",
      reference: booking.reference,
      listingTitle: booking.listing.title,
      listingHref: links.listing,
      imageUrl: booking.listing.images[0]?.url,
      location: bookingLocation(booking),
      details: bookingEmailDetails(booking),
      callout: "No payment was collected. Your dates are free to use for another booking.",
      buttons: [{ label: "View request", href: links.guest }],
    }),
  });
}

export async function notifyGuestBookingCancelled(bookingId: string): Promise<void> {
  const booking = await loadBookingEmailContext(bookingId);
  if (!booking) return;
  const links = bookingEmailLinks(booking);

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
    subject: `Cancelled · ${booking.reference} · ${booking.listing.title}`,
    text: lines.join("\n"),
    html: renderBookingEmail({
      preheader: `Booking ${booking.reference} has been cancelled.`,
      eyebrow: "Booking cancelled",
      headline: "This booking is no longer active",
      intro: booking.cancellationReason
        ? `Reason: ${booking.cancellationReason}`
        : "The booking has been cancelled.",
      reference: booking.reference,
      listingTitle: booking.listing.title,
      listingHref: links.listing,
      imageUrl: booking.listing.images[0]?.url,
      location: bookingLocation(booking),
      details: bookingEmailDetails(booking),
      callout: "View the booking page for the current status and contact support if you need help.",
      buttons: [{ label: "View booking", href: links.guest }],
    }),
  });
}

/** Booking cancelled by the guest — notify the host so they know the dates are free again. */
export async function notifyHostBookingCancelledByGuest(bookingId: string): Promise<void> {
  const booking = await loadBookingEmailContext(bookingId);
  if (!booking) return;
  const links = bookingEmailLinks(booking);

  const lines = [
    `Hello ${booking.listing.host.name},`,
    ``,
    `${booking.guest.name} cancelled their booking for "${booking.listing.title}" (${formatDate(booking.checkIn)} – ${formatDate(booking.checkOut)}). Those dates are available again.`,
    ``,
    `— ${COMMUNICATION_BRAND.name}`,
  ];

  await sendTransactionalEmail({
    to: booking.listing.host.email,
    subject: `Guest cancelled · ${booking.reference} · ${booking.listing.title}`,
    text: lines.join("\n"),
    html: renderBookingEmail({
      preheader: `${booking.guest.name} cancelled booking ${booking.reference}.`,
      eyebrow: "Booking cancelled by guest",
      headline: `${booking.guest.name} cancelled their booking`,
      intro: "The reserved dates have been released in your calendar.",
      reference: booking.reference,
      listingTitle: booking.listing.title,
      listingHref: links.listing,
      imageUrl: booking.listing.images[0]?.url,
      location: bookingLocation(booking),
      details: bookingEmailDetails(booking),
      callout: "No action is required from you.",
      buttons: [{ label: "View booking", href: links.host }],
    }),
  });
}

export async function notifyReviewReminder(input: {
  invitationId: string;
  waitingForYourReview: boolean;
}): Promise<void> {
  const { db } = await import("@/lib/db");
  const invitation = await db.reviewInvitation.findUnique({
    where: { id: input.invitationId },
    include: {
      recipient: {
        select: {
          name: true,
          email: true,
          communicationPreference: { select: { reviewEmail: true } },
        },
      },
      booking: { select: { id: true, listing: { select: { title: true } } } },
    },
  });
  if (!invitation) return;
  if (invitation.recipient.communicationPreference?.reviewEmail === false) return;

  const link = communicationAppUrl(
    `/account/bookings/${invitation.booking.id}/after-stay`
  );
  await sendTransactionalEmail({
    to: invitation.recipient.email,
    subject: input.waitingForYourReview
      ? `[${COMMUNICATION_BRAND.name}] A private rating is waiting for you`
      : `[${COMMUNICATION_BRAND.name}] How was ${invitation.booking.listing.title}?`,
    text: [
      `Hi ${invitation.recipient.name},`,
      "",
      input.waitingForYourReview
        ? `The other party has submitted a private rating for "${invitation.booking.listing.title}".`
        : `Your stay connected to "${invitation.booking.listing.title}" has ended.`,
      input.waitingForYourReview
        ? "Submit your own rating to unlock both after admin approval. We will not reveal their stars or comments beforehand."
        : "Share an honest rating before the 14-day review window closes.",
      "",
      `Leave your rating: ${link}`,
      `Deadline: ${formatDate(invitation.deadline)}`,
      "",
      COMMUNICATION_BRAND.name,
    ].join("\n"),
  });
}

export async function notifyReviewSubmitted(input: {
  reviewId: string;
}): Promise<void> {
  const { db } = await import("@/lib/db");
  const review = await db.review.findUnique({
    where: { id: input.reviewId },
    include: {
      author: { select: { name: true, email: true } },
      listing: { select: { title: true } },
    },
  });
  if (!review?.author) return;

  await Promise.allSettled([
    sendTransactionalEmail({
      to: review.author.email,
      subject: `[${COMMUNICATION_BRAND.name}] Rating received`,
      text: [
        `Hi ${review.author.name},`,
        "",
        `We received your private rating for "${review.listing.title}".`,
        "It will remain sealed until the other party submits or the review period closes, and an administrator approves the public content.",
        "",
        `Review status: ${communicationAppUrl(`/account/bookings/${review.bookingId}/after-stay`)}`,
        "",
        COMMUNICATION_BRAND.name,
      ].join("\n"),
    }),
    sendTransactionalEmail({
      to: communicationSupportEmail(),
      sender: "support",
      subject: `[${COMMUNICATION_BRAND.supportName}] Rating awaiting approval`,
      text: [
        `${review.listing.title}`,
        `Booking: ${review.bookingId.slice(0, 8).toUpperCase()}`,
        "",
        communicationAppUrl(`/admin/ratings/${review.id}`),
      ].join("\n"),
    }),
  ]);
}

export async function notifyReviewsPublished(input: {
  bookingId: string;
}): Promise<void> {
  const { db } = await import("@/lib/db");
  const booking = await db.booking.findUnique({
    where: { id: input.bookingId },
    select: {
      id: true,
      guest: { select: { name: true, email: true } },
      listing: {
        select: {
          title: true,
          host: { select: { name: true, email: true } },
        },
      },
    },
  });
  if (!booking) return;

  const link = communicationAppUrl(`/account/bookings/${booking.id}/after-stay`);
  await Promise.allSettled(
    [booking.guest, booking.listing.host].map((recipient) =>
      sendTransactionalEmail({
        to: recipient.email,
        subject: `[${COMMUNICATION_BRAND.name}] Ratings are now available`,
        text: [
          `Hi ${recipient.name},`,
          "",
          `The approved ratings for "${booking.listing.title}" are now available.`,
          "",
          `View ratings: ${link}`,
          "",
          COMMUNICATION_BRAND.name,
        ].join("\n"),
      })
    )
  );
}

export async function notifyReviewRejected(input: {
  reviewId: string;
  reason: string;
}): Promise<void> {
  const { db } = await import("@/lib/db");
  const review = await db.review.findUnique({
    where: { id: input.reviewId },
    include: {
      author: { select: { name: true, email: true } },
      listing: { select: { title: true } },
    },
  });
  if (!review?.author) return;

  await sendTransactionalEmail({
    to: review.author.email,
    sender: "support",
    subject: `[${COMMUNICATION_BRAND.name}] Review moderation update`,
    text: [
      `Hi ${review.author.name},`,
      "",
      `Your review for "${review.listing.title}" was not approved for publication.`,
      `Reason: ${input.reason}`,
      "",
      `View status: ${communicationAppUrl(`/account/bookings/${review.bookingId}/after-stay`)}`,
      "",
      COMMUNICATION_BRAND.supportName,
    ].join("\n"),
  });
}

export async function notifyClaimReleased(input: {
  caseId: string;
}): Promise<void> {
  const { db } = await import("@/lib/db");
  const claim = await db.safetyCase.findUnique({
    where: { id: input.caseId },
    include: {
      reportedUser: { select: { name: true, email: true } },
      reporter: { select: { name: true } },
    },
  });
  if (!claim?.reportedUser || !claim.requestedAmount) return;

  await sendTransactionalEmail({
    to: claim.reportedUser.email,
    sender: "support",
    subject: `[${COMMUNICATION_BRAND.name}] Response required for ${claim.reference}`,
    text: [
      `Hi ${claim.reportedUser.name},`,
      "",
      `${claim.reporter.name} submitted a booking-related ${claim.claimKind?.toLowerCase() || "payment"} request.`,
      `Amount: ${Number(claim.requestedAmount).toFixed(2)} ${claim.currency || "EUR"}`,
      `Reason: ${claim.subject}`,
      "",
      "You can accept, counter, or reject after reviewing the evidence. You will not be silently charged for failing to respond.",
      "",
      `Respond securely: ${communicationAppUrl(`/account/support/${claim.id}`)}`,
      "",
      COMMUNICATION_BRAND.supportName,
    ].join("\n"),
  });
}

export async function notifyClaimResponse(input: {
  caseId: string;
}): Promise<void> {
  const { db } = await import("@/lib/db");
  const claim = await db.safetyCase.findUnique({
    where: { id: input.caseId },
    include: {
      reporter: { select: { name: true, email: true } },
    },
  });
  if (!claim) return;

  await Promise.allSettled([
    sendTransactionalEmail({
      to: claim.reporter.email,
      subject: `[${COMMUNICATION_BRAND.name}] Response to ${claim.reference}`,
      text: [
        `Hi ${claim.reporter.name},`,
        "",
        `The other party responded to your request.`,
        `Response: ${claim.responseStatus?.replaceAll("_", " ") || "UPDATED"}`,
        ...(claim.counterAmount
          ? [`Counteroffer: ${Number(claim.counterAmount).toFixed(2)} ${claim.currency || "EUR"}`]
          : []),
        ...(claim.responseNote ? [`Note: ${claim.responseNote}`] : []),
        "",
        `View the case: ${communicationAppUrl(`/account/support/${claim.id}`)}`,
        "",
        COMMUNICATION_BRAND.name,
      ].join("\n"),
    }),
    sendTransactionalEmail({
      to: communicationSupportEmail(),
      sender: "support",
      subject: `[${COMMUNICATION_BRAND.supportName}] Claim response: ${claim.reference}`,
      text: [
        `Response: ${claim.responseStatus?.replaceAll("_", " ")}`,
        communicationAppUrl(`/admin/cases/${claim.id}`),
      ].join("\n"),
    }),
  ]);
}
