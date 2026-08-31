/**
 * Transactional email abstraction. Logs to the console when SMTP isn't configured
 * (local dev); otherwise sends via the same SMTP server used for magic-link auth
 * emails. Swap the "smtp" branch for Resend/SES/etc. without changing call sites.
 */

import "server-only";
import {
  formatCalendarDate,
  formatDate,
  formatPrice,
} from "@/lib/utils/format";
import { createSmtpTransport } from "@/lib/email/smtp-transport";
import { COMMUNICATION_BRAND } from "@/lib/communication-brand";
import {
  communicationAppUrl,
  communicationFromAddress,
  communicationReplyToAddress,
  communicationSupportEmail,
} from "@/lib/communication-brand.server";
import { renderBookingEmail } from "@/lib/email/booking-template";
import {
  translateEmailUserContent,
  type TranslatedText,
} from "@/lib/email/user-content-translation";
import { PAYMENT_INSTRUCTIONS_PREVIEW } from "@/lib/services/payment-instructions";
import { getEmailT, type EmailTranslator } from "@/lib/email/i18n";
import { guestEmailLocale } from "@/lib/email/i18n/recipient-locale";
import {
  CASE_STATUS_LABELS,
  CLAIM_KIND_LABELS,
  CLAIM_RESPONSE_LABELS,
  caseStatusKey,
  claimKindKey,
  claimResponseKey,
  guestCountKey,
  guestCountSource,
} from "@/lib/email/i18n/dynamic-keys";

export interface SendEmailParams {
  to: string;
  subject: string;
  text: string;
  html?: string;
  sender?: "customer" | "support";
  headers?: Record<string, string>;
  replyTo?: string;
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
      replyTo: params.replyTo || communicationReplyToAddress(),
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
    replyTo: params.replyTo || communicationReplyToAddress(),
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
        locale: true,
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
      .map(async (recipient) => {
        // Recipients of one conversation can have different languages, so the body
        // is rendered per person rather than once for the whole list.
        const t = getEmailT(recipient.locale);
        // A payment-instructions preview is a redaction, not a message: it stands in
        // for a body that must never leave the thread. It is translated from the
        // reviewed catalog like any other system sentence and is never sent to an
        // external translation service.
        const redacted = input.preview === PAYMENT_INSTRUCTIONS_PREVIEW;
        const [listing, preview] = await translateEmailUserContent(
          [conversation.listing.title, redacted ? null : input.preview],
          t.locale
        );
        const previewLine = redacted
          ? t.ti(
              "email.message.payment_instructions",
              "Payment instructions are available in {brand}",
              { brand: COMMUNICATION_BRAND.name }
            )
          : preview.text;
        const notice = translationNotice(t, listing, redacted ? null : preview);
        return sendTransactionalEmail({
          to: recipient.email,
          sender: input.supportSender ? "support" : "customer",
          subject: `[${COMMUNICATION_BRAND.name}] ${t.ti(
            "email.message.subject",
            "New message about {listing}",
            { listing: conversation.listing.title }
          )}`,
          text: [
            greeting(recipient.name, t),
            "",
            t.ti(
              "email.message.body",
              '{sender} sent you a message about "{listing}".',
              { sender: senderName, listing: listing.text }
            ),
            "",
            previewLine,
            "",
            `${t.ti("email.message.reply_securely", "Reply securely in {brand}", {
              brand: COMMUNICATION_BRAND.name,
            })}: ${link}`,
            "",
            t.ti(
              "email.message.privacy",
              "For your privacy, keep the conversation inside {brand}.",
              { brand: COMMUNICATION_BRAND.name }
            ),
            ...notice.lines,
          ].join("\n"),
        });
      })
  );
}

/** Enum → sentence. The previous `replaceAll("_", " ")` leaked a raw database value
 * into user-facing copy ("AWAITING_INFORMATION" → "AWAITING INFORMATION"), which has
 * no translation to key off. Each status gets its own key instead; an unrecognised
 * value still degrades to the old formatting rather than showing nothing. */
function caseStatusLabel(status: string, t: EmailTranslator): string {
  const source = CASE_STATUS_LABELS[status];
  if (!source) return status.replaceAll("_", " ");
  return t.t(caseStatusKey(status), source);
}

/** The claim kind appears mid-sentence ("a booking-related damage request"), so it
 * needs a translated noun rather than a lower-cased enum. */
function claimKindLabel(kind: string | null | undefined, t: EmailTranslator): string {
  const resolved = (kind && CLAIM_KIND_LABELS[kind] && kind) || "PAYMENT";
  return t.t(claimKindKey(resolved), CLAIM_KIND_LABELS[resolved]);
}

/** Same treatment for the claim-response enum. */
function claimResponseLabel(status: string | null | undefined, t: EmailTranslator): string {
  if (!status) return t.t("email.claim.response.updated", "Updated");
  const source = CLAIM_RESPONSE_LABELS[status];
  if (!source) return status.replaceAll("_", " ");
  return t.t(claimResponseKey(status), source);
}

export async function notifySafetyCaseSubmitted(input: {
  caseId: string;
}): Promise<void> {
  const { db } = await import("@/lib/db");
  const safetyCase = await db.safetyCase.findUnique({
    where: { id: input.caseId },
    include: {
      reporter: { select: { name: true, email: true, locale: true } },
    },
  });
  if (!safetyCase) return;

  const t = getEmailT(safetyCase.reporter.locale);
  const isClaim = safetyCase.type === "CLAIM";
  const link = communicationAppUrl(`/account/support/${safetyCase.id}`);
  const [caseSubject] = await translateEmailUserContent(
    [safetyCase.subject],
    t.locale,
  );
  const notice = translationNotice(t, caseSubject);
  await sendTransactionalEmail({
    to: safetyCase.reporter.email,
    sender: "support",
    subject: `[${COMMUNICATION_BRAND.name}] ${
      isClaim
        ? t.t("email.case.claim_received", "Claim received")
        : t.t("email.case.report_received", "Report received")
    }: ${safetyCase.reference}`,
    text: [
      greeting(safetyCase.reporter.name, t),
      "",
      // The case type is interpolated as a separate translated noun rather than
      // lower-casing the enum into an English sentence — Macedonian inflects it.
      isClaim
        ? t.ti("email.case.received_claim", 'We received your claim "{subject}".', {
            subject: caseSubject.text,
          })
        : t.ti("email.case.received_report", 'We received your report "{subject}".', {
            subject: caseSubject.text,
          }),
      `${t.t("email.booking.reference", "Reference")}: ${safetyCase.reference}`,
      `${t.t("email.case.status", "Status")}: ${caseStatusLabel(safetyCase.status, t)}`,
      "",
      `${t.t("email.case.follow", "Follow the case")}: ${link}`,
      "",
      COMMUNICATION_BRAND.supportName,
      ...notice.lines,
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
      reporter: { select: { name: true, email: true, locale: true } },
    },
  });
  if (!safetyCase) return;

  const t = getEmailT(safetyCase.reporter.locale);
  const [message] = await translateEmailUserContent([input.message], t.locale);
  const notice = translationNotice(t, message);
  await sendTransactionalEmail({
    to: safetyCase.reporter.email,
    sender: "support",
    subject: `[${COMMUNICATION_BRAND.name}] ${t.ti("email.case.update_subject", "Update for {reference}", { reference: safetyCase.reference })}`,
    text: [
      greeting(safetyCase.reporter.name, t),
      "",
      message.text,
      `${t.t("email.case.current_status", "Current status")}: ${caseStatusLabel(safetyCase.status, t)}`,
      "",
      `${t.t("email.case.view_and_respond", "View and respond")}: ${communicationAppUrl(`/account/support/${safetyCase.id}`)}`,
      "",
      COMMUNICATION_BRAND.supportName,
      ...notice.lines,
    ].join("\n"),
  });
}

async function loadBookingEmailContext(bookingId: string) {
  const { db } = await import("@/lib/db");
  return db.booking.findUnique({
    where: { id: bookingId },
    include: {
      guest: { select: { name: true, email: true, locale: true } },
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
          host: { select: { email: true, name: true, locale: true } },
        },
      },
    },
  });
}

type BookingEmailContext = NonNullable<
  Awaited<ReturnType<typeof loadBookingEmailContext>>
>;

/**
 * The words a person wrote — a listing title, a decline reason, a guest's note —
 * rendered in the recipient's language where Google could manage it, and left exactly
 * as typed where it could not.
 *
 * One call per email covers every field, so a booking confirmation waits on at most
 * one bounded round trip. The subject line deliberately keeps the original listing
 * title: it is what the guest sees on the site and searches their inbox for.
 */
async function bookingUserContent(
  booking: BookingEmailContext,
  t: EmailTranslator,
  // Only the fields this particular email renders. Translating a field the template
  // never prints would bill for it and, worse, list the original underneath a
  // "translated from" notice for text the recipient cannot see anywhere above it.
  shows: { reason?: boolean; note?: boolean } = {},
) {
  const [title, reason, note] = await translateEmailUserContent(
    [
      booking.listing.title,
      shows.reason ? booking.cancellationReason : null,
      shows.note ? booking.guestNote : null,
    ],
    t.locale,
  );
  return { title, reason, note, notice: translationNotice(t, title, reason, note) };
}

/**
 * The footnote that has to accompany anything machine-translated: what happened, and
 * the untouched original underneath it. A host disputing what a guest asked for reads
 * their guest's actual words here, not Google's reading of them.
 */
function translationNotice(
  t: EmailTranslator,
  ...values: (TranslatedText | null | undefined)[]
) {
  const originals = values
    .filter((value): value is TranslatedText => Boolean(value?.machineTranslated))
    .map((value) => value.original);
  if (originals.length === 0) return { lines: [] as string[], note: undefined };

  const notice = t.t(
    "email.user_content.machine_translated",
    "Automatically translated by Google."
  );
  const originalLabel = t.t("email.user_content.original", "Original as written:");
  return {
    lines: ["", notice, originalLabel, ...originals],
    note: { notice, originalLabel, originals },
  };
}

/** The English copy greets guests with "Hi" and hosts with "Hello". Two keys keep
 * that distinction available to translators, even where a language renders both the
 * same way. */
function greeting(name: string, t: EmailTranslator): string {
  return t.ti("email.greeting.hi", "Hi {name},", { name });
}

function greetingFormal(name: string, t: EmailTranslator): string {
  return t.ti("email.greeting.hello", "Hello {name},", { name });
}

function bookingEmailLinks(booking: BookingEmailContext) {
  return {
    guest: communicationAppUrl(`/account/bookings/${booking.id}`),
    host: communicationAppUrl(`/host/reservations/${booking.id}`),
    listing: communicationAppUrl(`/properties/${booking.listing.slug}`),
  };
}

function bookingEmailDetails(booking: BookingEmailContext, t: EmailTranslator) {
  const details = [
    {
      label: t.t("email.booking.check_in", "Check-in"),
      value: formatCalendarDate(booking.checkIn, t.locale),
    },
    {
      label: t.t("email.booking.check_out", "Check-out"),
      value: formatCalendarDate(booking.checkOut, t.locale),
    },
    {
      label: t.t("email.booking.guests", "Guests"),
      value: guestCountLabel(booking.guestCount, t),
    },
    {
      label: t.t("email.booking.total", "Total"),
      value: formatPrice(Number(booking.totalPrice), booking.currency, t.locale),
    },
  ];

  if (booking.displayCurrency && booking.displayTotal !== null) {
    details.push({
      label: t.t(
        "email.booking.display_value_at_booking",
        "Guest display value at booking",
      ),
      value: t.ti(
        "email.booking.approximate_amount",
        "Approximately {amount}",
        {
          amount: formatPrice(
            Number(booking.displayTotal),
            booking.displayCurrency,
            t.locale,
          ),
        },
      ),
    });
  }

  return details;
}

function bookingEmailAmountLines(booking: BookingEmailContext, t: EmailTranslator) {
  const lines = [
    `${t.t("email.booking.total", "Total")}: ${formatPrice(Number(booking.totalPrice), booking.currency, t.locale)}`,
  ];
  if (booking.displayCurrency && booking.displayTotal !== null) {
    lines.push(
      `${t.t("email.booking.display_value_at_booking", "Guest display value at booking")}: ${t.ti(
        "email.booking.approximate_amount",
        "Approximately {amount}",
        {
          amount: formatPrice(
            Number(booking.displayTotal),
            booking.displayCurrency,
            t.locale,
          ),
        },
      )}`,
    );
  }
  return lines;
}

/** Macedonian's plural rule splits on the final digit (1 гостин, 2 гости), not on
 * "exactly one" like English, so the category has to be chosen by Intl rather than
 * by a `=== 1` check. */
function guestCountLabel(count: number, t: EmailTranslator): string {
  const key = guestCountKey(t.locale, count);
  return t.ti(key, guestCountSource(key.split(".").pop()!), { n: count });
}

function bookingLocation(booking: BookingEmailContext) {
  return [booking.listing.property.city, booking.listing.property.country]
    .filter(Boolean)
    .join(", ");
}

function bookingDeadline(booking: BookingEmailContext, locale: string) {
  return new Intl.DateTimeFormat(locale, {
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
  const t = getEmailT(guestEmailLocale(booking));
  const content = await bookingUserContent(booking, t);
  const deadline = bookingDeadline(booking, t.locale);
  const viewRequest = t.t("email.booking.view_request", "View request");
  const viewListing = t.t("email.booking.view_listing", "View listing");
  // Deliberately not "no payment has been collected yet": nothing is ever collected
  // here, and a sentence shaped like a stage in a payment flow is what sends a guest
  // looking for the next stage.
  const paymentNotice = t.t(
    "email.booking.payment_after_acceptance",
    "Linger Homes does not collect or hold booking payments. If the host accepts, they will share payment instructions with you directly."
  );

  await sendTransactionalEmail({
    to: booking.guest.email,
    subject: `${t.t("email.booking.request_received.subject", "Request received")} · ${booking.reference} · ${booking.listing.title}`,
    text: [
      greeting(booking.guest.name, t),
      "",
      t.ti(
        "email.booking.request_received.sent",
        'Your request for "{listing}" has been sent to {host}.',
        { listing: content.title.text, host: booking.listing.host.name }
      ),
      t.ti(
        "email.booking.request_received.not_confirmed",
        "This booking is not confirmed yet. The host has until {deadline} to respond.",
        { deadline }
      ),
      paymentNotice,
      "",
      `${t.t("email.booking.reference", "Reference")}: ${booking.reference}`,
      `${t.t("email.booking.check_in", "Check-in")}: ${formatCalendarDate(booking.checkIn, t.locale)}`,
      `${t.t("email.booking.check_out", "Check-out")}: ${formatCalendarDate(booking.checkOut, t.locale)}`,
      `${t.t("email.booking.guests", "Guests")}: ${booking.guestCount}`,
      ...bookingEmailAmountLines(booking, t),
      "",
      `${viewRequest}: ${links.guest}`,
      `${viewListing}: ${links.listing}`,
      "",
      `— ${COMMUNICATION_BRAND.name}`,
      ...content.notice.lines,
    ].join("\n"),
    html: renderBookingEmail({
      preheader: t.ti(
        "email.booking.request_received.preheader",
        "Your request is awaiting host approval until {deadline}.",
        { deadline }
      ),
      eyebrow: t.t(
        "email.booking.request_received.eyebrow",
        "Request sent · Awaiting host approval"
      ),
      headline: t.ti(
        "email.booking.request_received.headline",
        "Your request has been sent to {host}",
        { host: booking.listing.host.name }
      ),
      intro: t.t(
        "email.booking.request_received.intro",
        "This is a booking request, not a confirmed reservation yet."
      ),
      reference: booking.reference,
      listingTitle: content.title.text,
      translationNote: content.notice.note,
      listingHref: links.listing,
      imageUrl: booking.listing.images[0]?.url,
      location: bookingLocation(booking),
      details: bookingEmailDetails(booking, t),
      callout: t.ti(
        "email.booking.request_received.callout_payment",
        "The host has until {deadline} to accept or decline. If they accept, they will share payment instructions with you directly.",
        { deadline }
      ),
      buttons: [
        { label: viewRequest, href: links.guest },
        { label: viewListing, href: links.listing, secondary: true },
      ],
    }),
  });
}

export async function notifyHostNewBookingRequest(bookingId: string): Promise<void> {
  const booking = await loadBookingEmailContext(bookingId);

  if (!booking) return;

  const links = bookingEmailLinks(booking);
  const t = getEmailT(booking.listing.host.locale);
  const content = await bookingUserContent(booking, t, { note: true });
  const deadline = bookingDeadline(booking, t.locale);
  const hostEmail = booking.listing.host.email;
  const dates = `${formatCalendarDate(booking.checkIn, t.locale)}–${formatCalendarDate(booking.checkOut, t.locale)}`;
  const lines = [
    greetingFormal(booking.listing.host.name, t),
    ``,
    t.ti(
      "email.booking.host_request.requested",
      '{guest} requested a booking for "{listing}".',
      { guest: booking.guest.name, listing: content.title.text }
    ),
    t.t(
      "email.booking.host_request.check_dashboard",
      "Check your host dashboard to confirm or reject."
    ),
    ``,
    `— ${COMMUNICATION_BRAND.name}`,
    ...content.notice.lines,
  ];

  await sendTransactionalEmail({
    to: hostEmail,
    subject: `${t.t("email.booking.host_request.subject", "Action required")} · ${booking.reference} · ${dates}`,
    text: lines.join("\n"),
    html: renderBookingEmail({
      preheader: t.ti(
        "email.booking.host_request.preheader",
        "{guest} requested {dates}. Respond by {deadline}.",
        { guest: booking.guest.name, dates, deadline }
      ),
      eyebrow: t.t(
        "email.booking.host_request.eyebrow",
        "New booking request · Action required"
      ),
      headline: t.ti(
        "email.booking.host_request.headline",
        "{guest} wants to stay at your place",
        { guest: booking.guest.name }
      ),
      intro: booking.guestNote
        ? t.ti("email.booking.host_request.guest_note", "Guest message: “{note}”", {
            note: content.note.text,
          })
        : t.t(
            "email.booking.host_request.intro",
            "Review the stay details and respond before the request expires."
          ),
      reference: booking.reference,
      listingTitle: content.title.text,
      translationNote: content.notice.note,
      listingHref: links.listing,
      imageUrl: booking.listing.images[0]?.url,
      location: bookingLocation(booking),
      details: bookingEmailDetails(booking, t),
      callout: t.ti(
        "email.booking.host_request.callout",
        "Accept or decline by {deadline}. Opening the request does not change its status.",
        { deadline }
      ),
      buttons: [
        { label: t.t("email.booking.review_request", "Review request"), href: links.host },
        {
          label: t.t("email.booking.view_listing", "View listing"),
          href: links.listing,
          secondary: true,
        },
      ],
    }),
  });
}

export async function notifyHostBookingRequestReminder(bookingId: string): Promise<void> {
  const booking = await loadBookingEmailContext(bookingId);
  if (!booking || booking.status !== "PENDING") return;
  const links = bookingEmailLinks(booking);
  const t = getEmailT(booking.listing.host.locale);
  const content = await bookingUserContent(booking, t);
  const deadline = bookingDeadline(booking, t.locale);
  const reviewRequest = t.t("email.booking.review_request", "Review request");

  await sendTransactionalEmail({
    to: booking.listing.host.email,
    subject: `${t.t("email.booking.host_reminder.subject", "Reminder")} · ${booking.reference} · ${t.t("email.booking.host_reminder.subject_detail", "Booking request awaiting response")}`,
    text: [
      greetingFormal(booking.listing.host.name, t),
      "",
      t.ti(
        "email.booking.host_reminder.waiting",
        "{guest}'s booking request is still waiting for your response.",
        { guest: booking.guest.name }
      ),
      t.ti("email.booking.host_reminder.respond_by", "Respond by {deadline}.", {
        deadline,
      }),
      `${t.t("email.booking.reference", "Reference")}: ${booking.reference}`,
      `${reviewRequest}: ${links.host}`,
      "",
      `— ${COMMUNICATION_BRAND.name}`,
      ...content.notice.lines,
    ].join("\n"),
    html: renderBookingEmail({
      preheader: t.ti(
        "email.booking.host_reminder.preheader",
        "{reference} is still waiting for your response.",
        { reference: booking.reference }
      ),
      eyebrow: t.t("email.booking.host_reminder.eyebrow", "Reminder · Response required"),
      headline: t.t("email.booking.host_reminder.headline", "A booking request is waiting"),
      intro: t.ti(
        "email.booking.host_reminder.intro",
        "{guest} is still waiting for your decision.",
        { guest: booking.guest.name }
      ),
      reference: booking.reference,
      listingTitle: content.title.text,
      translationNote: content.notice.note,
      listingHref: links.listing,
      imageUrl: booking.listing.images[0]?.url,
      location: bookingLocation(booking),
      details: bookingEmailDetails(booking, t),
      callout: t.ti(
        "email.booking.host_reminder.callout",
        "Respond by {deadline} or the request will expire automatically.",
        { deadline }
      ),
      buttons: [{ label: reviewRequest, href: links.host }],
    }),
  });
}

export async function notifyGuestBookingConfirmed(bookingId: string): Promise<void> {
  const booking = await loadBookingEmailContext(bookingId);
  if (!booking) return;
  const links = bookingEmailLinks(booking);

  const t = getEmailT(guestEmailLocale(booking));
  const content = await bookingUserContent(booking, t);
  const lines = [
    greeting(booking.guest.name, t),
    ``,
    t.ti(
      "email.booking.confirmed.accepted",
      'Good news — your booking for "{listing}" has been accepted. The host will share payment instructions with you.',
      { listing: content.title.text }
    ),
    `${t.t("email.booking.check_in", "Check-in")}: ${formatCalendarDate(booking.checkIn, t.locale)}`,
    `${t.t("email.booking.check_out", "Check-out")}: ${formatCalendarDate(booking.checkOut, t.locale)}`,
    ...bookingEmailAmountLines(booking, t),
    ``,
    `— ${COMMUNICATION_BRAND.name}`,
    ...content.notice.lines,
  ];

  await sendTransactionalEmail({
    to: booking.guest.email,
    subject: `${t.t("email.booking.confirmed.subject", "Confirmed")} · ${booking.reference} · ${booking.listing.title}`,
    text: lines.join("\n"),
    html: renderBookingEmail({
      preheader: t.ti(
        "email.booking.confirmed.preheader",
        "Your stay at {listing} is confirmed.",
        { listing: content.title.text }
      ),
      eyebrow: t.t("email.booking.confirmed.eyebrow", "Booking confirmed"),
      headline: t.t(
        "email.booking.confirmed.headline_accepted",
        "Your booking has been accepted"
      ),
      intro: t.ti(
        "email.booking.confirmed.intro",
        "{host} accepted your booking request.",
        { host: booking.listing.host.name }
      ),
      reference: booking.reference,
      listingTitle: content.title.text,
      translationNote: content.notice.note,
      listingHref: links.listing,
      imageUrl: booking.listing.images[0]?.url,
      location: bookingLocation(booking),
      details: bookingEmailDetails(booking, t),
      callout: t.ti(
        "email.booking.confirmed.callout_payment",
        "Linger Homes does not collect or hold booking payments — the host will share payment instructions with you directly. Keep your messages inside {brand} for support and security.",
        { brand: COMMUNICATION_BRAND.name }
      ),
      buttons: [
        { label: t.t("email.booking.view_booking", "View booking"), href: links.guest },
        {
          label: t.t("email.booking.view_listing", "View listing"),
          href: links.listing,
          secondary: true,
        },
      ],
    }),
  });
}

export async function notifyGuestBookingRejected(bookingId: string): Promise<void> {
  const booking = await loadBookingEmailContext(bookingId);
  if (!booking) return;
  const links = bookingEmailLinks(booking);

  const t = getEmailT(guestEmailLocale(booking));
  const content = await bookingUserContent(booking, t, { reason: true });
  const datesFreeCallout = t.t(
    "email.booking.dates_free",
    "Your dates are free to use for another booking. This request was not accepted, and Linger Homes does not collect or hold booking payments."
  );
  const lines = [
    greeting(booking.guest.name, t),
    ``,
    t.ti(
      "email.booking.declined.body",
      'Unfortunately your booking request for "{listing}" ({checkIn} – {checkOut}) was declined by the host.',
      {
        listing: content.title.text,
        checkIn: formatCalendarDate(booking.checkIn, t.locale),
        checkOut: formatCalendarDate(booking.checkOut, t.locale),
      }
    ),
    ...(booking.cancellationReason
      ? [
          ``,
          t.ti("email.booking.reason", "Reason: {reason}", {
            reason: content.reason.text,
          }),
        ]
      : []),
    ``,
    t.t(
      "email.booking.request_not_accepted",
      "This booking request was not accepted. Linger Homes does not collect or hold booking payments."
    ),
    ``,
    `— ${COMMUNICATION_BRAND.name}`,
    ...content.notice.lines,
  ];

  await sendTransactionalEmail({
    to: booking.guest.email,
    subject: `${t.t("email.booking.declined.subject", "Request update")} · ${booking.reference} · ${booking.listing.title}`,
    text: lines.join("\n"),
    html: renderBookingEmail({
      preheader: t.ti(
        "email.booking.declined.preheader",
        "Your request for {listing} was not accepted.",
        { listing: content.title.text }
      ),
      eyebrow: t.t("email.booking.declined.eyebrow", "Booking request declined"),
      headline: t.t("email.booking.declined.headline", "This stay wasn’t confirmed"),
      intro: booking.cancellationReason
        ? t.ti("email.booking.declined.host_reason", "Host’s reason: {reason}", {
            reason: content.reason.text,
          })
        : t.t(
            "email.booking.declined.intro",
            "The host was unable to accept this request."
          ),
      reference: booking.reference,
      listingTitle: content.title.text,
      translationNote: content.notice.note,
      listingHref: links.listing,
      imageUrl: booking.listing.images[0]?.url,
      location: bookingLocation(booking),
      details: bookingEmailDetails(booking, t),
      callout: datesFreeCallout,
      buttons: [{ label: t.t("email.booking.view_request", "View request"), href: links.guest }],
    }),
  });
}

/** Booking cancelled by the host or an admin — notify the guest. */
export async function notifyGuestBookingExpired(bookingId: string): Promise<void> {
  const booking = await loadBookingEmailContext(bookingId);
  if (!booking) return;
  const links = bookingEmailLinks(booking);

  const t = getEmailT(guestEmailLocale(booking));
  const content = await bookingUserContent(booking, t);
  const viewRequest = t.t("email.booking.view_request", "View request");

  await sendTransactionalEmail({
    to: booking.guest.email,
    subject: `${t.t("email.booking.expired.subject", "Request expired")} · ${booking.reference} · ${booking.listing.title}`,
    text: [
      greeting(booking.guest.name, t),
      "",
      t.ti(
        "email.booking.expired.body",
        'The host did not respond in time to your request for "{listing}".',
        { listing: content.title.text }
      ),
      `${t.t("email.booking.reference", "Reference")}: ${booking.reference}`,
      t.t(
        "email.booking.request_not_accepted",
        "This booking request was not accepted. Linger Homes does not collect or hold booking payments."
      ),
      "",
      `${viewRequest}: ${links.guest}`,
      "",
      `— ${COMMUNICATION_BRAND.name}`,
      ...content.notice.lines,
    ].join("\n"),
    html: renderBookingEmail({
      preheader: t.ti(
        "email.booking.expired.preheader",
        "The host did not respond to {reference} in time.",
        { reference: booking.reference }
      ),
      eyebrow: t.t("email.booking.expired.eyebrow", "Booking request expired"),
      headline: t.t("email.booking.expired.headline", "The host didn’t respond in time"),
      intro: t.t(
        "email.booking.expired.intro",
        "This request expired and did not become a confirmed reservation."
      ),
      reference: booking.reference,
      listingTitle: content.title.text,
      translationNote: content.notice.note,
      listingHref: links.listing,
      imageUrl: booking.listing.images[0]?.url,
      location: bookingLocation(booking),
      details: bookingEmailDetails(booking, t),
      callout: t.t(
        "email.booking.dates_free",
        "Your dates are free to use for another booking. This request was not accepted, and Linger Homes does not collect or hold booking payments."
      ),
      buttons: [{ label: viewRequest, href: links.guest }],
    }),
  });
}

export async function notifyGuestBookingCancelled(bookingId: string): Promise<void> {
  const booking = await loadBookingEmailContext(bookingId);
  if (!booking) return;
  const links = bookingEmailLinks(booking);

  const t = getEmailT(guestEmailLocale(booking));
  const content = await bookingUserContent(booking, t, { reason: true });
  const lines = [
    greeting(booking.guest.name, t),
    ``,
    t.ti(
      "email.booking.cancelled.body",
      'Your booking for "{listing}" ({checkIn} – {checkOut}) has been cancelled.',
      {
        listing: content.title.text,
        checkIn: formatCalendarDate(booking.checkIn, t.locale),
        checkOut: formatCalendarDate(booking.checkOut, t.locale),
      }
    ),
    ...(booking.cancellationReason
      ? [
          ``,
          t.ti("email.booking.reason", "Reason: {reason}", {
            reason: content.reason.text,
          }),
        ]
      : []),
    ``,
    t.t(
      "email.booking.cancelled.payment_note",
      "Linger Homes does not collect or hold booking payments, so there is nothing for us to refund. Settle anything you arranged directly with the host."
    ),
    ``,
    `— ${COMMUNICATION_BRAND.name}`,
    ...content.notice.lines,
  ];

  await sendTransactionalEmail({
    to: booking.guest.email,
    subject: `${t.t("email.booking.cancelled.subject", "Cancelled")} · ${booking.reference} · ${booking.listing.title}`,
    text: lines.join("\n"),
    html: renderBookingEmail({
      preheader: t.ti(
        "email.booking.cancelled.preheader",
        "Booking {reference} has been cancelled.",
        { reference: booking.reference }
      ),
      eyebrow: t.t("email.booking.cancelled.eyebrow", "Booking cancelled"),
      headline: t.t("email.booking.cancelled.headline", "This booking is no longer active"),
      intro: booking.cancellationReason
        ? t.ti("email.booking.reason", "Reason: {reason}", {
            reason: content.reason.text,
          })
        : t.t("email.booking.cancelled.intro", "The booking has been cancelled."),
      reference: booking.reference,
      listingTitle: content.title.text,
      translationNote: content.notice.note,
      listingHref: links.listing,
      imageUrl: booking.listing.images[0]?.url,
      location: bookingLocation(booking),
      details: bookingEmailDetails(booking, t),
      callout: t.t(
        "email.booking.cancelled.callout_payment",
        "Linger Homes does not collect or hold booking payments, so there is nothing for us to refund — settle anything you arranged directly with the host. View the booking page for the current status and contact support if you need help."
      ),
      buttons: [{ label: t.t("email.booking.view_booking", "View booking"), href: links.guest }],
    }),
  });
}

/** Booking cancelled by the guest — notify the host so they know the dates are free again. */
export async function notifyHostBookingCancelledByGuest(bookingId: string): Promise<void> {
  const booking = await loadBookingEmailContext(bookingId);
  if (!booking) return;
  const links = bookingEmailLinks(booking);

  const t = getEmailT(booking.listing.host.locale);
  const content = await bookingUserContent(booking, t);
  const lines = [
    greetingFormal(booking.listing.host.name, t),
    ``,
    t.ti(
      "email.booking.guest_cancelled.body",
      '{guest} cancelled their booking for "{listing}" ({checkIn} – {checkOut}). Those dates are available again.',
      {
        guest: booking.guest.name,
        listing: content.title.text,
        checkIn: formatCalendarDate(booking.checkIn, t.locale),
        checkOut: formatCalendarDate(booking.checkOut, t.locale),
      }
    ),
    ``,
    `— ${COMMUNICATION_BRAND.name}`,
    ...content.notice.lines,
  ];

  await sendTransactionalEmail({
    to: booking.listing.host.email,
    subject: `${t.t("email.booking.guest_cancelled.subject", "Guest cancelled")} · ${booking.reference} · ${booking.listing.title}`,
    text: lines.join("\n"),
    html: renderBookingEmail({
      preheader: t.ti(
        "email.booking.guest_cancelled.preheader",
        "{guest} cancelled booking {reference}.",
        { guest: booking.guest.name, reference: booking.reference }
      ),
      eyebrow: t.t("email.booking.guest_cancelled.eyebrow", "Booking cancelled by guest"),
      headline: t.ti(
        "email.booking.guest_cancelled.headline",
        "{guest} cancelled their booking",
        { guest: booking.guest.name }
      ),
      intro: t.t(
        "email.booking.guest_cancelled.intro",
        "The reserved dates have been released in your calendar."
      ),
      reference: booking.reference,
      listingTitle: content.title.text,
      translationNote: content.notice.note,
      listingHref: links.listing,
      imageUrl: booking.listing.images[0]?.url,
      location: bookingLocation(booking),
      details: bookingEmailDetails(booking, t),
      callout: t.t(
        "email.booking.guest_cancelled.callout",
        "No action is required from you."
      ),
      buttons: [{ label: t.t("email.booking.view_booking", "View booking"), href: links.host }],
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
          locale: true,
          communicationPreference: { select: { reviewEmail: true } },
        },
      },
      booking: { select: { id: true, listing: { select: { title: true } } } },
    },
  });
  if (!invitation) return;
  if (invitation.recipient.communicationPreference?.reviewEmail === false) return;

  const t = getEmailT(invitation.recipient.locale);
  const [translatedListing] = await translateEmailUserContent(
    [invitation.booking.listing.title],
    t.locale,
  );
  const listing = translatedListing.text;
  const notice = translationNotice(t, translatedListing);
  const link = communicationAppUrl(
    `/account/bookings/${invitation.booking.id}/after-stay`
  );
  await sendTransactionalEmail({
    to: invitation.recipient.email,
    subject: `[${COMMUNICATION_BRAND.name}] ${
      input.waitingForYourReview
        ? t.t(
            "email.review.reminder.waiting_subject",
            "A private rating is waiting for you"
          )
        : t.ti("email.review.reminder.subject", "How was {listing}?", { listing })
    }`,
    text: [
      greeting(invitation.recipient.name, t),
      "",
      input.waitingForYourReview
        ? t.ti(
            "email.review.reminder.waiting_body",
            'The other party has submitted a private rating for "{listing}".',
            { listing }
          )
        : t.ti(
            "email.review.reminder.body",
            'Your stay connected to "{listing}" has ended.',
            { listing }
          ),
      input.waitingForYourReview
        ? t.t(
            "email.review.reminder.waiting_instructions",
            "Submit your own rating to unlock both after admin approval. We will not reveal their stars or comments beforehand."
          )
        : t.t(
            "email.review.reminder.instructions",
            "Share an honest rating before the 14-day review window closes."
          ),
      "",
      `${t.t("email.review.leave_rating", "Leave your rating")}: ${link}`,
      `${t.t("email.review.deadline", "Deadline")}: ${formatDate(invitation.deadline, t.locale)}`,
      "",
      COMMUNICATION_BRAND.name,
      ...notice.lines,
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
      author: { select: { name: true, email: true, locale: true } },
      listing: { select: { title: true } },
    },
  });
  if (!review?.author) return;

  const t = getEmailT(review.author.locale);
  const [listing] = await translateEmailUserContent([review.listing.title], t.locale);
  const notice = translationNotice(t, listing);
  await Promise.allSettled([
    sendTransactionalEmail({
      to: review.author.email,
      subject: `[${COMMUNICATION_BRAND.name}] ${t.t("email.review.submitted.subject", "Rating received")}`,
      text: [
        greeting(review.author.name, t),
        "",
        t.ti(
          "email.review.submitted.body",
          'We received your private rating for "{listing}".',
          { listing: listing.text }
        ),
        t.t(
          "email.review.submitted.sealed",
          "It will remain sealed until the other party submits or the review period closes, and an administrator approves the public content."
        ),
        "",
        `${t.t("email.review.status", "Review status")}: ${communicationAppUrl(`/account/bookings/${review.bookingId}/after-stay`)}`,
        "",
        COMMUNICATION_BRAND.name,
        ...notice.lines,
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
      guest: { select: { name: true, email: true, locale: true } },
      listing: {
        select: {
          title: true,
          host: { select: { name: true, email: true, locale: true } },
        },
      },
    },
  });
  if (!booking) return;

  const link = communicationAppUrl(`/account/bookings/${booking.id}/after-stay`);
  await Promise.allSettled(
    // Guest and host can have different languages — render once per recipient.
    [booking.guest, booking.listing.host].map(async (recipient) => {
      const t = getEmailT(recipient.locale);
      const [listing] = await translateEmailUserContent(
        [booking.listing.title],
        t.locale
      );
      const notice = translationNotice(t, listing);
      return sendTransactionalEmail({
        to: recipient.email,
        subject: `[${COMMUNICATION_BRAND.name}] ${t.t("email.review.published.subject", "Ratings are now available")}`,
        text: [
          greeting(recipient.name, t),
          "",
          t.ti(
            "email.review.published.body",
            'The approved ratings for "{listing}" are now available.',
            { listing: listing.text }
          ),
          "",
          `${t.t("email.review.view_ratings", "View ratings")}: ${link}`,
          "",
          COMMUNICATION_BRAND.name,
          ...notice.lines,
        ].join("\n"),
      });
    })
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
      author: { select: { name: true, email: true, locale: true } },
      listing: { select: { title: true } },
    },
  });
  if (!review?.author) return;

  const t = getEmailT(review.author.locale);
  const [listing, reason] = await translateEmailUserContent(
    [review.listing.title, input.reason],
    t.locale,
  );
  const notice = translationNotice(t, listing, reason);
  await sendTransactionalEmail({
    to: review.author.email,
    sender: "support",
    subject: `[${COMMUNICATION_BRAND.name}] ${t.t("email.review.rejected.subject", "Review moderation update")}`,
    text: [
      greeting(review.author.name, t),
      "",
      t.ti(
        "email.review.rejected.body",
        'Your review for "{listing}" was not approved for publication.',
        { listing: listing.text }
      ),
      t.ti("email.booking.reason", "Reason: {reason}", { reason: reason.text }),
      "",
      `${t.t("email.view_status", "View status")}: ${communicationAppUrl(`/account/bookings/${review.bookingId}/after-stay`)}`,
      "",
      COMMUNICATION_BRAND.supportName,
      ...notice.lines,
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
      reportedUser: { select: { name: true, email: true, locale: true } },
      reporter: { select: { name: true } },
    },
  });
  if (!claim?.reportedUser || !claim.requestedAmount) return;

  const t = getEmailT(claim.reportedUser.locale);
  const [reason] = await translateEmailUserContent([claim.subject], t.locale);
  const notice = translationNotice(t, reason);
  await sendTransactionalEmail({
    to: claim.reportedUser.email,
    sender: "support",
    subject: `[${COMMUNICATION_BRAND.name}] ${t.ti("email.claim.released.subject", "Response required for {reference}", { reference: claim.reference })}`,
    text: [
      greeting(claim.reportedUser.name, t),
      "",
      t.ti(
        "email.claim.released.body",
        "{reporter} submitted a booking-related {kind} request.",
        {
          reporter: claim.reporter.name,
          kind: claimKindLabel(claim.claimKind, t),
        }
      ),
      `${t.t("email.claim.amount", "Amount")}: ${Number(claim.requestedAmount).toFixed(2)} ${claim.currency || "EUR"}`,
      t.ti("email.booking.reason", "Reason: {reason}", { reason: reason.text }),
      "",
      t.t(
        "email.claim.released.rights_direct",
        "You can accept, counter, or reject after reviewing the evidence. Linger Homes does not collect or hold payments, so nothing is taken from you either way."
      ),
      "",
      `${t.t("email.claim.respond_securely", "Respond securely")}: ${communicationAppUrl(`/account/support/${claim.id}`)}`,
      "",
      COMMUNICATION_BRAND.supportName,
      ...notice.lines,
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
      reporter: { select: { name: true, email: true, locale: true } },
    },
  });
  if (!claim) return;

  const t = getEmailT(claim.reporter.locale);
  const [responseNote] = await translateEmailUserContent(
    [claim.responseNote],
    t.locale,
  );
  const notice = translationNotice(t, responseNote);
  await Promise.allSettled([
    sendTransactionalEmail({
      to: claim.reporter.email,
      subject: `[${COMMUNICATION_BRAND.name}] ${t.ti("email.claim.response.subject", "Response to {reference}", { reference: claim.reference })}`,
      text: [
        greeting(claim.reporter.name, t),
        "",
        t.t(
          "email.claim.response.body",
          "The other party responded to your request."
        ),
        `${t.t("email.claim.response.label", "Response")}: ${claimResponseLabel(claim.responseStatus, t)}`,
        ...(claim.counterAmount
          ? [
              `${t.t("email.claim.counteroffer", "Counteroffer")}: ${Number(claim.counterAmount).toFixed(2)} ${claim.currency || "EUR"}`,
            ]
          : []),
        ...(claim.responseNote
          ? [`${t.t("email.claim.note", "Note")}: ${responseNote.text}`]
          : []),
        "",
        `${t.t("email.claim.view_case", "View the case")}: ${communicationAppUrl(`/account/support/${claim.id}`)}`,
        "",
        COMMUNICATION_BRAND.name,
        ...notice.lines,
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
