import type { EmailLocale } from "@/lib/email/i18n/locales";

/**
 * Reviewed translations for system email.
 *
 * Checked into the repository rather than stored in `UiTranslation`, unlike the UI
 * catalog. That table exists because 836 strings across 15 locales can't live in git
 * and need an AI sync to stay current. This is a couple of hundred strings in one
 * language, on messages where a bad translation costs someone a booking — small
 * enough that every line can be read by a person, and worth the code review, the
 * diff history and the absence of a migration whenever a word changes.
 *
 * `en` is both the English copy and the source snapshot. It must match the literal
 * at the call site byte for byte; when it doesn't, `getEmailT` falls back to English
 * for that key. So editing an English sentence in a template silently reverts that
 * one string to English until the Macedonian is re-reviewed, which is the correct
 * failure: a reviewed fallback rather than a translation that no longer matches what
 * it claims to say. `pnpm vitest src/lib/email` fails on any drift.
 *
 * Translation guidance for `mk` lives in REVIEWED_LANGUAGES (lib/i18n/reviewed-languages.ts):
 * standard idiomatic Macedonian, polite plural imperatives for guest actions,
 * оглас/огласете for listings, no Serbian or Bulgarian calques.
 */
export type EmailCatalogEntry = Record<EmailLocale, string>;

export const EMAIL_CATALOG: Record<string, EmailCatalogEntry> = {
  // ---------------------------------------------------------------- shared
  "email.greeting.hi": { en: "Hi {name},", mk: "Здраво {name}," },
  "email.greeting.hello": { en: "Hello {name},", mk: "Почитувани {name}," },
  "email.view_status": { en: "View status", mk: "Погледнете го статусот" },

  // ------------------------------------------------------------ sign-in link
  "email.signin.subject": { en: "Sign in to {product}", mk: "Најавете се на {product}" },
  "email.signin.heading": { en: "Sign in to {product}", mk: "Најавете се на {product}" },
  "email.signin.cta": {
    en: "Click here to sign in",
    mk: "Кликнете тука за да се најавите",
  },
  "email.signin.ignore": {
    en: "If you didn't request this, you can ignore this email.",
    mk: "Ако не сте го побарале ова, слободно занемарете ја пораката.",
  },

  // ------------------------------------------------------- booking: shared
  "email.booking.reference": { en: "Reference", mk: "Референца" },
  "email.booking.check_in": { en: "Check-in", mk: "Пристигнување" },
  "email.booking.check_out": { en: "Check-out", mk: "Заминување" },
  "email.booking.guests": { en: "Guests", mk: "Гости" },
  "email.booking.total": { en: "Total", mk: "Вкупно" },
  "email.booking.display_value_at_booking": {
    en: "Guest display value at booking",
    mk: "Прикажана вредност за гостинот при резервирањето",
  },
  "email.booking.approximate_amount": {
    en: "Approximately {amount}",
    mk: "Приближно {amount}",
  },
  "email.booking.reason": { en: "Reason: {reason}", mk: "Причина: {reason}" },
  "email.booking.view_request": { en: "View request", mk: "Погледнете го барањето" },
  "email.booking.view_listing": { en: "View listing", mk: "Погледнете го огласот" },
  "email.booking.view_booking": { en: "View booking", mk: "Погледнете ја резервацијата" },
  "email.booking.review_request": { en: "Review request", mk: "Разгледајте го барањето" },
  "email.booking.no_payment_collected": {
    en: "No payment has been collected for this request.",
    mk: "За ова барање не е наплатено ништо.",
  },
  "email.booking.no_payment_was_collected": {
    en: "No payment was collected for this request.",
    mk: "За ова барање не беше наплатено ништо.",
  },
  "email.booking.no_payment_dates_free": {
    en: "No payment was collected. Your dates are free to use for another booking.",
    mk: "Не беше наплатено ништо. Вашите датуми се слободни за друга резервација.",
  },
  // Macedonian splits on the final digit (1, 21, 31 → гостин), which is why the
  // category comes from Intl.PluralRules rather than a `=== 1` check.
  "email.booking.guest_count.one": { en: "{n} guest", mk: "{n} гостин" },
  "email.booking.guest_count.other": { en: "{n} guests", mk: "{n} гости" },

  // --------------------------------------------- booking: request received
  "email.booking.request_received.subject": {
    en: "Request received",
    mk: "Барањето е примено",
  },
  "email.booking.request_received.sent": {
    en: 'Your request for "{listing}" has been sent to {host}.',
    mk: 'Вашето барање за „{listing}“ е испратено до {host}.',
  },
  "email.booking.request_received.not_confirmed": {
    en: "This booking is not confirmed yet. The host has until {deadline} to respond.",
    mk: "Резервацијата сè уште не е потврдена. Домаќинот има рок до {deadline} да одговори.",
  },
  "email.booking.request_received.preheader": {
    en: "Your request is awaiting host approval until {deadline}.",
    mk: "Вашето барање чека одобрување од домаќинот до {deadline}.",
  },
  "email.booking.request_received.eyebrow": {
    en: "Request sent · Awaiting host approval",
    mk: "Барањето е испратено · Се чека одобрување од домаќинот",
  },
  "email.booking.request_received.headline": {
    en: "Your request has been sent to {host}",
    mk: "Вашето барање е испратено до {host}",
  },
  "email.booking.request_received.intro": {
    en: "This is a booking request, not a confirmed reservation yet.",
    mk: "Ова е барање за резервација, сè уште не е потврдена резервација.",
  },
  "email.booking.request_received.callout": {
    en: "The host has until {deadline} to accept or decline. No payment has been collected for this request.",
    mk: "Домаќинот има рок до {deadline} да прифати или одбие. За ова барање не е наплатено ништо.",
  },

  // ------------------------------------------------ booking: host request
  "email.booking.host_request.subject": { en: "Action required", mk: "Потребно е дејство" },
  "email.booking.host_request.requested": {
    en: '{guest} requested a booking for "{listing}".',
    mk: '{guest} побара резервација за „{listing}“.',
  },
  "email.booking.host_request.check_dashboard": {
    en: "Check your host dashboard to confirm or reject.",
    mk: "Отворете ја контролната табла за домаќини за да потврдите или одбиете.",
  },
  "email.booking.host_request.preheader": {
    en: "{guest} requested {dates}. Respond by {deadline}.",
    mk: "{guest} побара {dates}. Одговорете до {deadline}.",
  },
  "email.booking.host_request.eyebrow": {
    en: "New booking request · Action required",
    mk: "Ново барање за резервација · Потребно е дејство",
  },
  "email.booking.host_request.headline": {
    en: "{guest} wants to stay at your place",
    mk: "{guest} сака да отседне кај вас",
  },
  "email.booking.host_request.guest_note": {
    en: "Guest message: “{note}”",
    mk: "Порака од гостинот: „{note}“",
  },
  "email.booking.host_request.intro": {
    en: "Review the stay details and respond before the request expires.",
    mk: "Разгледајте ги деталите за престојот и одговорете пред да истече барањето.",
  },
  "email.booking.host_request.callout": {
    en: "Accept or decline by {deadline}. Opening the request does not change its status.",
    mk: "Прифатете или одбијте до {deadline}. Отворањето на барањето не го менува неговиот статус.",
  },

  // ----------------------------------------------- booking: host reminder
  "email.booking.host_reminder.subject": { en: "Reminder", mk: "Потсетник" },
  "email.booking.host_reminder.subject_detail": {
    en: "Booking request awaiting response",
    mk: "Барање за резервација чека одговор",
  },
  "email.booking.host_reminder.waiting": {
    en: "{guest}'s booking request is still waiting for your response.",
    mk: "Барањето за резервација од {guest} сè уште го чека вашиот одговор.",
  },
  "email.booking.host_reminder.respond_by": {
    en: "Respond by {deadline}.",
    mk: "Одговорете до {deadline}.",
  },
  "email.booking.host_reminder.preheader": {
    en: "{reference} is still waiting for your response.",
    mk: "{reference} сè уште го чека вашиот одговор.",
  },
  "email.booking.host_reminder.eyebrow": {
    en: "Reminder · Response required",
    mk: "Потсетник · Потребен е одговор",
  },
  "email.booking.host_reminder.headline": {
    en: "A booking request is waiting",
    mk: "Барање за резервација чека",
  },
  "email.booking.host_reminder.intro": {
    en: "{guest} is still waiting for your decision.",
    mk: "{guest} сè уште ја чека вашата одлука.",
  },
  "email.booking.host_reminder.callout": {
    en: "Respond by {deadline} or the request will expire automatically.",
    mk: "Одговорете до {deadline} или барањето автоматски ќе истече.",
  },

  // --------------------------------------------------- booking: confirmed
  "email.booking.confirmed.subject": { en: "Confirmed", mk: "Потврдено" },
  "email.booking.confirmed.good_news": {
    en: 'Good news — your booking for "{listing}" has been confirmed.',
    mk: 'Добра вест — вашата резервација за „{listing}“ е потврдена.',
  },
  "email.booking.confirmed.preheader": {
    en: "Your stay at {listing} is confirmed.",
    mk: "Вашиот престој во {listing} е потврден.",
  },
  "email.booking.confirmed.eyebrow": {
    en: "Booking confirmed",
    mk: "Резервацијата е потврдена",
  },
  "email.booking.confirmed.headline": { en: "You’re all set", mk: "Сè е подготвено" },
  "email.booking.confirmed.intro": {
    en: "{host} accepted your booking request.",
    mk: "{host} го прифати вашето барање за резервација.",
  },
  "email.booking.confirmed.callout": {
    en: "Keep your messages and any payment arrangements inside {brand} for support and security.",
    mk: "Задржете ја преписката и сите договори за плаќање во {brand} заради поддршка и безбедност.",
  },

  // ---------------------------------------------------- booking: declined
  "email.booking.declined.subject": { en: "Request update", mk: "Ажурирање на барањето" },
  "email.booking.declined.body": {
    en: 'Unfortunately your booking request for "{listing}" ({checkIn} – {checkOut}) was declined by the host.',
    mk: 'За жал, вашето барање за резервација за „{listing}“ ({checkIn} – {checkOut}) беше одбиено од домаќинот.',
  },
  "email.booking.declined.preheader": {
    en: "Your request for {listing} was not accepted.",
    mk: "Вашето барање за {listing} не беше прифатено.",
  },
  "email.booking.declined.eyebrow": {
    en: "Booking request declined",
    mk: "Барањето за резервација е одбиено",
  },
  "email.booking.declined.headline": {
    en: "This stay wasn’t confirmed",
    mk: "Овој престој не беше потврден",
  },
  "email.booking.declined.host_reason": {
    en: "Host’s reason: {reason}",
    mk: "Причина од домаќинот: {reason}",
  },
  "email.booking.declined.intro": {
    en: "The host was unable to accept this request.",
    mk: "Домаќинот не можеше да го прифати ова барање.",
  },

  // ----------------------------------------------------- booking: expired
  "email.booking.expired.subject": { en: "Request expired", mk: "Барањето истече" },
  "email.booking.expired.body": {
    en: 'The host did not respond in time to your request for "{listing}".',
    mk: 'Домаќинот не одговори навреме на вашето барање за „{listing}“.',
  },
  "email.booking.expired.preheader": {
    en: "The host did not respond to {reference} in time.",
    mk: "Домаќинот не одговори навреме на {reference}.",
  },
  "email.booking.expired.eyebrow": {
    en: "Booking request expired",
    mk: "Барањето за резервација истече",
  },
  "email.booking.expired.headline": {
    en: "The host didn’t respond in time",
    mk: "Домаќинот не одговори навреме",
  },
  "email.booking.expired.intro": {
    en: "This request expired and did not become a confirmed reservation.",
    mk: "Ова барање истече и не стана потврдена резервација.",
  },

  // --------------------------------------------------- booking: cancelled
  "email.booking.cancelled.subject": { en: "Cancelled", mk: "Откажано" },
  "email.booking.cancelled.body": {
    en: 'Your booking for "{listing}" ({checkIn} – {checkOut}) has been cancelled.',
    mk: 'Вашата резервација за „{listing}“ ({checkIn} – {checkOut}) е откажана.',
  },
  "email.booking.cancelled.preheader": {
    en: "Booking {reference} has been cancelled.",
    mk: "Резервацијата {reference} е откажана.",
  },
  "email.booking.cancelled.eyebrow": {
    en: "Booking cancelled",
    mk: "Резервацијата е откажана",
  },
  "email.booking.cancelled.headline": {
    en: "This booking is no longer active",
    mk: "Оваа резервација повеќе не е активна",
  },
  "email.booking.cancelled.intro": {
    en: "The booking has been cancelled.",
    mk: "Резервацијата е откажана.",
  },
  "email.booking.cancelled.callout": {
    en: "View the booking page for the current status and contact support if you need help.",
    mk: "Погледнете ја страницата на резервацијата за тековниот статус и контактирајте ја поддршката ако ви треба помош.",
  },

  // -------------------------------------------- booking: guest cancelled
  "email.booking.guest_cancelled.subject": {
    en: "Guest cancelled",
    mk: "Гостинот откажа",
  },
  "email.booking.guest_cancelled.body": {
    en: '{guest} cancelled their booking for "{listing}" ({checkIn} – {checkOut}). Those dates are available again.',
    mk: '{guest} ја откажа резервацијата за „{listing}“ ({checkIn} – {checkOut}). Тие датуми се повторно достапни.',
  },
  "email.booking.guest_cancelled.preheader": {
    en: "{guest} cancelled booking {reference}.",
    mk: "{guest} ја откажа резервацијата {reference}.",
  },
  "email.booking.guest_cancelled.eyebrow": {
    en: "Booking cancelled by guest",
    mk: "Резервацијата е откажана од гостинот",
  },
  "email.booking.guest_cancelled.headline": {
    en: "{guest} cancelled their booking",
    mk: "{guest} ја откажа својата резервација",
  },
  "email.booking.guest_cancelled.intro": {
    en: "The reserved dates have been released in your calendar.",
    mk: "Резервираните датуми се ослободени во вашиот календар.",
  },
  "email.booking.guest_cancelled.callout": {
    en: "No action is required from you.",
    mk: "Од вас не се бара никакво дејство.",
  },

  // ------------------------------------------------------------- messages
  "email.message.subject": {
    en: "New message about {listing}",
    mk: "Нова порака за {listing}",
  },
  "email.message.body": {
    en: '{sender} sent you a message about "{listing}".',
    mk: '{sender} ви испрати порака за „{listing}“.',
  },
  "email.message.reply_securely": {
    en: "Reply securely in {brand}",
    mk: "Одговорете безбедно во {brand}",
  },
  "email.message.privacy": {
    en: "For your privacy, keep the conversation inside {brand}.",
    mk: "Заради вашата приватност, задржете го разговорот во {brand}.",
  },

  // -------------------------------------------------------------- reviews
  "email.review.leave_rating": { en: "Leave your rating", mk: "Оставете оценка" },
  "email.review.deadline": { en: "Deadline", mk: "Краен рок" },
  "email.review.status": { en: "Review status", mk: "Статус на оценката" },
  "email.review.view_ratings": { en: "View ratings", mk: "Погледнете ги оценките" },
  "email.review.reminder.subject": {
    en: "How was {listing}?",
    mk: "Како беше {listing}?",
  },
  "email.review.reminder.waiting_subject": {
    en: "A private rating is waiting for you",
    mk: "Ве чека приватна оценка",
  },
  "email.review.reminder.body": {
    en: 'Your stay connected to "{listing}" has ended.',
    mk: 'Вашиот престој поврзан со „{listing}“ заврши.',
  },
  "email.review.reminder.waiting_body": {
    en: 'The other party has submitted a private rating for "{listing}".',
    mk: 'Другата страна остави приватна оценка за „{listing}“.',
  },
  "email.review.reminder.instructions": {
    en: "Share an honest rating before the 14-day review window closes.",
    mk: "Оставете искрена оценка пред да истече рокот од 14 дена.",
  },
  "email.review.reminder.waiting_instructions": {
    en: "Submit your own rating to unlock both after admin approval. We will not reveal their stars or comments beforehand.",
    mk: "Оставете ја вашата оценка за двете да се отклучат по одобрување од администратор. Нивните ѕвезди и коментари нема да ги откриеме однапред.",
  },
  "email.review.submitted.subject": { en: "Rating received", mk: "Оценката е примена" },
  "email.review.submitted.body": {
    en: 'We received your private rating for "{listing}".',
    mk: 'Ја примивме вашата приватна оценка за „{listing}“.',
  },
  "email.review.submitted.sealed": {
    en: "It will remain sealed until the other party submits or the review period closes, and an administrator approves the public content.",
    mk: "Таа ќе остане запечатена додека другата страна не остави своја оценка или не истече рокот, и додека администратор не ја одобри јавната содржина.",
  },
  "email.review.published.subject": {
    en: "Ratings are now available",
    mk: "Оценките се веќе достапни",
  },
  "email.review.published.body": {
    en: 'The approved ratings for "{listing}" are now available.',
    mk: 'Одобрените оценки за „{listing}“ се веќе достапни.',
  },
  "email.review.rejected.subject": {
    en: "Review moderation update",
    mk: "Ажурирање за модерација на рецензијата",
  },
  "email.review.rejected.body": {
    en: 'Your review for "{listing}" was not approved for publication.',
    mk: 'Вашата рецензија за „{listing}“ не беше одобрена за објавување.',
  },

  // -------------------------------------------------------- safety cases
  "email.case.claim_received": { en: "Claim received", mk: "Побарувањето е примено" },
  "email.case.report_received": { en: "Report received", mk: "Пријавата е примена" },
  "email.case.received_claim": {
    en: 'We received your claim "{subject}".',
    mk: 'Го примивме вашето побарување „{subject}“.',
  },
  "email.case.received_report": {
    en: 'We received your report "{subject}".',
    mk: 'Ја примивме вашата пријава „{subject}“.',
  },
  "email.case.status": { en: "Status", mk: "Статус" },
  "email.case.current_status": { en: "Current status", mk: "Тековен статус" },
  "email.case.follow": { en: "Follow the case", mk: "Следете го случајот" },
  "email.case.update_subject": {
    en: "Update for {reference}",
    mk: "Ажурирање за {reference}",
  },
  "email.case.view_and_respond": {
    en: "View and respond",
    mk: "Погледнете и одговорете",
  },
  "email.case.status.submitted": { en: "Submitted", mk: "Поднесено" },
  "email.case.status.under_review": { en: "Under review", mk: "Во разгледување" },
  "email.case.status.awaiting_information": {
    en: "Awaiting information",
    mk: "Се чекаат информации",
  },
  "email.case.status.resolved": { en: "Resolved", mk: "Решено" },
  "email.case.status.rejected": { en: "Rejected", mk: "Одбиено" },

  // -------------------------------------------------------------- claims
  "email.claim.amount": { en: "Amount", mk: "Износ" },
  "email.claim.counteroffer": { en: "Counteroffer", mk: "Контрапонуда" },
  "email.claim.note": { en: "Note", mk: "Белешка" },
  "email.claim.view_case": { en: "View the case", mk: "Погледнете го случајот" },
  "email.claim.respond_securely": {
    en: "Respond securely",
    mk: "Одговорете безбедно",
  },
  "email.claim.released.subject": {
    en: "Response required for {reference}",
    mk: "Потребен е одговор за {reference}",
  },
  "email.claim.released.body": {
    en: "{reporter} submitted a booking-related {kind} request.",
    mk: "{reporter} поднесе барање за {kind} поврзано со резервација.",
  },
  "email.claim.released.rights": {
    en: "You can accept, counter, or reject after reviewing the evidence. You will not be silently charged for failing to respond.",
    mk: "Откако ќе ги разгледате доказите, можете да прифатите, да дадете контрапонуда или да одбиете. Нема да ви биде наплатено ништо без ваше знаење ако не одговорите.",
  },
  "email.claim.kind.expense": { en: "expense", mk: "трошок" },
  "email.claim.kind.damage": { en: "damage", mk: "штета" },
  "email.claim.kind.refund": { en: "refund", mk: "поврат на средства" },
  "email.claim.kind.payment": { en: "payment", mk: "плаќање" },
  "email.claim.response.subject": {
    en: "Response to {reference}",
    mk: "Одговор на {reference}",
  },
  "email.claim.response.body": {
    en: "The other party responded to your request.",
    mk: "Другата страна одговори на вашето барање.",
  },
  "email.claim.response.label": { en: "Response", mk: "Одговор" },
  "email.claim.response.updated": { en: "Updated", mk: "Ажурирано" },
  "email.claim.response.awaiting_admin": {
    en: "Awaiting admin",
    mk: "Се чека администратор",
  },
  "email.claim.response.awaiting_recipient": {
    en: "Awaiting recipient",
    mk: "Се чека примачот",
  },
  "email.claim.response.accepted": { en: "Accepted", mk: "Прифатено" },
  "email.claim.response.countered": { en: "Countered", mk: "Дадена контрапонуда" },
  "email.claim.response.rejected": { en: "Rejected", mk: "Одбиено" },
  "email.claim.response.escalated": { en: "Escalated", mk: "Ескалирано" },

  // ---------------------------------------------------- account deletion
  "email.deletion.subject": {
    en: "Confirm deletion of your {product} account",
    mk: "Потврдете го бришењето на вашата {product} сметка",
  },
  "email.deletion.body": {
    en: "We received a request to permanently delete your {product} account.",
    mk: "Примивме барање за трајно бришење на вашата {product} сметка.",
  },
  "email.deletion.confirm_here": {
    en: "Confirm here (link expires in 1 hour):",
    mk: "Потврдете тука (врската истекува за 1 час):",
  },
  "email.deletion.confirm_link": {
    en: "Confirm account deletion",
    mk: "Потврдете го бришењето на сметката",
  },
  "email.deletion.expires": {
    en: "(link expires in 1 hour)",
    mk: "(врската истекува за 1 час)",
  },
  "email.deletion.warning": {
    en: "This cannot be undone. If you didn't request this, ignore this email — your account stays exactly as it is, and you may want to sign out of any devices you don't recognise.",
    mk: "Ова не може да се врати. Ако не сте го побарале ова, занемарете ја пораката — вашата сметка останува непроменета, а препорачуваме да се одјавите од сите уреди што не ги препознавате.",
  },
  "email.deletion.questions": { en: "Questions?", mk: "Прашања?" },
};
