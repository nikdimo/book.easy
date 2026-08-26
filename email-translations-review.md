# System email — Macedonian review

Every string below is sent to a real recipient. Please read the Macedonian
column and correct anything that sounds machine-translated, overly formal, or wrong.

Editorial guidance for this language: Use standard, idiomatic Macedonian. Prefer polite plural imperatives for guest actions. Use оглас/огласете for listing a property, never изложба/изложете. Avoid Serbian or Bulgarian calques.

This is transactional email, not interface copy. Booking status, payment and claim
wording is read as a statement of fact: a request must not read as a confirmed
reservation, and nothing may suggest that Linger Homes charges, holds, or refunds
booking money — it never does.

`{placeholders}` are substituted at send time and **must survive translation**
with the same names — a dropped `{deadline}` produces a fluent sentence that is
missing the only fact the recipient needed. A test enforces this.

154 strings.

## Sign-in link

| Key | English | Macedonian |
| --- | --- | --- |
| `email.signin.subject` | Sign in to {product} | Најавете се на {product} |
| `email.signin.heading` | Sign in to {product} | Најавете се на {product} |
| `email.signin.cta` | Click here to sign in | Кликнете тука за да се најавите |
| `email.signin.ignore` | If you didn't request this, you can ignore this email. | Ако не сте го побарале ова, слободно занемарете ја пораката. |

## Booking — request received (guest)

| Key | English | Macedonian |
| --- | --- | --- |
| `email.booking.request_received.subject` | Request received | Барањето е примено |
| `email.booking.request_received.sent` | Your request for "{listing}" has been sent to {host}. | Вашето барање за „{listing}“ е испратено до {host}. |
| `email.booking.request_received.not_confirmed` | This booking is not confirmed yet. The host has until {deadline} to respond. | Резервацијата сè уште не е потврдена. Домаќинот има рок до {deadline} да одговори. |
| `email.booking.request_received.preheader` | Your request is awaiting host approval until {deadline}. | Вашето барање чека одобрување од домаќинот до {deadline}. |
| `email.booking.request_received.eyebrow` | Request sent · Awaiting host approval | Барањето е испратено · Се чека одобрување од домаќинот |
| `email.booking.request_received.headline` | Your request has been sent to {host} | Вашето барање е испратено до {host} |
| `email.booking.request_received.intro` | This is a booking request, not a confirmed reservation yet. | Ова е барање за резервација, сè уште не е потврдена резервација. |
| `email.booking.request_received.callout_payment` | The host has until {deadline} to accept or decline. If they accept, they will share payment instructions with you directly. | Домаќинот има рок до {deadline} да прифати или одбие. Ако прифати, непосредно ќе ви ги достави упатствата за плаќање. |

## Booking — new request (host)

| Key | English | Macedonian |
| --- | --- | --- |
| `email.booking.host_request.subject` | Action required | Потребно е дејство |
| `email.booking.host_request.requested` | {guest} requested a booking for "{listing}". | {guest} побара резервација за „{listing}“. |
| `email.booking.host_request.check_dashboard` | Check your host dashboard to confirm or reject. | Отворете ја контролната табла за домаќини за да потврдите или одбиете. |
| `email.booking.host_request.preheader` | {guest} requested {dates}. Respond by {deadline}. | {guest} побара {dates}. Одговорете до {deadline}. |
| `email.booking.host_request.eyebrow` | New booking request · Action required | Ново барање за резервација · Потребно е дејство |
| `email.booking.host_request.headline` | {guest} wants to stay at your place | {guest} сака да отседне кај вас |
| `email.booking.host_request.guest_note` | Guest message: “{note}” | Порака од гостинот: „{note}“ |
| `email.booking.host_request.intro` | Review the stay details and respond before the request expires. | Разгледајте ги деталите за престојот и одговорете пред да истече барањето. |
| `email.booking.host_request.callout` | Accept or decline by {deadline}. Opening the request does not change its status. | Прифатете или одбијте до {deadline}. Отворањето на барањето не го менува неговиот статус. |

## Booking — reminder (host)

| Key | English | Macedonian |
| --- | --- | --- |
| `email.booking.host_reminder.subject` | Reminder | Потсетник |
| `email.booking.host_reminder.subject_detail` | Booking request awaiting response | Барање за резервација чека одговор |
| `email.booking.host_reminder.waiting` | {guest}'s booking request is still waiting for your response. | Барањето за резервација од {guest} сè уште го чека вашиот одговор. |
| `email.booking.host_reminder.respond_by` | Respond by {deadline}. | Одговорете до {deadline}. |
| `email.booking.host_reminder.preheader` | {reference} is still waiting for your response. | {reference} сè уште го чека вашиот одговор. |
| `email.booking.host_reminder.eyebrow` | Reminder · Response required | Потсетник · Потребен е одговор |
| `email.booking.host_reminder.headline` | A booking request is waiting | Барање за резервација чека |
| `email.booking.host_reminder.intro` | {guest} is still waiting for your decision. | {guest} сè уште ја чека вашата одлука. |
| `email.booking.host_reminder.callout` | Respond by {deadline} or the request will expire automatically. | Одговорете до {deadline} или барањето автоматски ќе истече. |

## Booking — confirmed (guest)

| Key | English | Macedonian |
| --- | --- | --- |
| `email.booking.confirmed.subject` | Confirmed | Потврдено |
| `email.booking.confirmed.accepted` | Good news — your booking for "{listing}" has been accepted. The host will share payment instructions with you. | Добра вест — вашата резервација за „{listing}“ е прифатена. Домаќинот ќе ви ги достави упатствата за плаќање. |
| `email.booking.confirmed.preheader` | Your stay at {listing} is confirmed. | Вашиот престој во {listing} е потврден. |
| `email.booking.confirmed.eyebrow` | Booking confirmed | Резервацијата е потврдена |
| `email.booking.confirmed.headline_accepted` | Your booking has been accepted | Вашата резервација е прифатена |
| `email.booking.confirmed.intro` | {host} accepted your booking request. | {host} го прифати вашето барање за резервација. |
| `email.booking.confirmed.callout_payment` | Linger Homes does not collect or hold booking payments — the host will share payment instructions with you directly. Keep your messages inside {brand} for support and security. | Linger Homes не наплаќа ниту чува плаќања за резервации — домаќинот непосредно ќе ви ги достави упатствата за плаќање. Задржете ја преписката во {brand} заради поддршка и безбедност. |

## Booking — declined (guest)

| Key | English | Macedonian |
| --- | --- | --- |
| `email.booking.declined.subject` | Request update | Ажурирање на барањето |
| `email.booking.declined.body` | Unfortunately your booking request for "{listing}" ({checkIn} – {checkOut}) was declined by the host. | За жал, вашето барање за резервација за „{listing}“ ({checkIn} – {checkOut}) беше одбиено од домаќинот. |
| `email.booking.declined.preheader` | Your request for {listing} was not accepted. | Вашето барање за {listing} не беше прифатено. |
| `email.booking.declined.eyebrow` | Booking request declined | Барањето за резервација е одбиено |
| `email.booking.declined.headline` | This stay wasn’t confirmed | Овој престој не беше потврден |
| `email.booking.declined.host_reason` | Host’s reason: {reason} | Причина од домаќинот: {reason} |
| `email.booking.declined.intro` | The host was unable to accept this request. | Домаќинот не можеше да го прифати ова барање. |

## Booking — expired (guest)

| Key | English | Macedonian |
| --- | --- | --- |
| `email.booking.expired.subject` | Request expired | Барањето истече |
| `email.booking.expired.body` | The host did not respond in time to your request for "{listing}". | Домаќинот не одговори навреме на вашето барање за „{listing}“. |
| `email.booking.expired.preheader` | The host did not respond to {reference} in time. | Домаќинот не одговори навреме на {reference}. |
| `email.booking.expired.eyebrow` | Booking request expired | Барањето за резервација истече |
| `email.booking.expired.headline` | The host didn’t respond in time | Домаќинот не одговори навреме |
| `email.booking.expired.intro` | This request expired and did not become a confirmed reservation. | Ова барање истече и не стана потврдена резервација. |

## Booking — cancelled (guest)

| Key | English | Macedonian |
| --- | --- | --- |
| `email.booking.cancelled.subject` | Cancelled | Откажано |
| `email.booking.cancelled.body` | Your booking for "{listing}" ({checkIn} – {checkOut}) has been cancelled. | Вашата резервација за „{listing}“ ({checkIn} – {checkOut}) е откажана. |
| `email.booking.cancelled.preheader` | Booking {reference} has been cancelled. | Резервацијата {reference} е откажана. |
| `email.booking.cancelled.eyebrow` | Booking cancelled | Резервацијата е откажана |
| `email.booking.cancelled.headline` | This booking is no longer active | Оваа резервација повеќе не е активна |
| `email.booking.cancelled.intro` | The booking has been cancelled. | Резервацијата е откажана. |
| `email.booking.cancelled.payment_note` | Linger Homes does not collect or hold booking payments, so there is nothing for us to refund. Settle anything you arranged directly with the host. | Linger Homes не наплаќа ниту чува плаќања за резервации, па нема што да ви вратиме. Сè што сте договориле расчистете го непосредно со домаќинот. |
| `email.booking.cancelled.callout_payment` | Linger Homes does not collect or hold booking payments, so there is nothing for us to refund — settle anything you arranged directly with the host. View the booking page for the current status and contact support if you need help. | Linger Homes не наплаќа ниту чува плаќања за резервации, па нема што да ви вратиме — сè што сте договориле расчистете го непосредно со домаќинот. Погледнете ја страницата на резервацијата за тековниот статус и контактирајте ја поддршката ако ви треба помош. |

## Booking — cancelled by guest (host)

| Key | English | Macedonian |
| --- | --- | --- |
| `email.booking.guest_cancelled.subject` | Guest cancelled | Гостинот откажа |
| `email.booking.guest_cancelled.body` | {guest} cancelled their booking for "{listing}" ({checkIn} – {checkOut}). Those dates are available again. | {guest} ја откажа резервацијата за „{listing}“ ({checkIn} – {checkOut}). Тие датуми се повторно достапни. |
| `email.booking.guest_cancelled.preheader` | {guest} cancelled booking {reference}. | {guest} ја откажа резервацијата {reference}. |
| `email.booking.guest_cancelled.eyebrow` | Booking cancelled by guest | Резервацијата е откажана од гостинот |
| `email.booking.guest_cancelled.headline` | {guest} cancelled their booking | {guest} ја откажа својата резервација |
| `email.booking.guest_cancelled.intro` | The reserved dates have been released in your calendar. | Резервираните датуми се ослободени во вашиот календар. |
| `email.booking.guest_cancelled.callout` | No action is required from you. | Од вас не се бара никакво дејство. |

## Booking — shared labels

| Key | English | Macedonian |
| --- | --- | --- |
| `email.booking.reference` | Reference | Референца |
| `email.booking.check_in` | Check-in | Пристигнување |
| `email.booking.check_out` | Check-out | Заминување |
| `email.booking.guests` | Guests | Гости |
| `email.booking.total` | Total | Вкупно |
| `email.booking.display_value_at_booking` | Guest display value at booking | Прикажана вредност за гостинот при резервирањето |
| `email.booking.approximate_amount` | Approximately {amount} | Приближно {amount} |
| `email.booking.reason` | Reason: {reason} | Причина: {reason} |
| `email.booking.view_request` | View request | Погледнете го барањето |
| `email.booking.view_listing` | View listing | Погледнете го огласот |
| `email.booking.view_booking` | View booking | Погледнете ја резервацијата |
| `email.booking.review_request` | Review request | Разгледајте го барањето |
| `email.booking.payment_after_acceptance` | Linger Homes does not collect or hold booking payments. If the host accepts, they will share payment instructions with you directly. | Linger Homes не наплаќа ниту чува плаќања за резервации. Ако домаќинот го прифати барањето, непосредно ќе ви ги достави упатствата за плаќање. |
| `email.booking.request_not_accepted` | This booking request was not accepted. Linger Homes does not collect or hold booking payments. | Ова барање за резервација не беше прифатено. Linger Homes не наплаќа ниту чува плаќања за резервации. |
| `email.booking.dates_free` | Your dates are free to use for another booking. This request was not accepted, and Linger Homes does not collect or hold booking payments. | Вашите датуми се слободни за друга резервација. Ова барање не беше прифатено, а Linger Homes не наплаќа ниту чува плаќања за резервации. |
| `email.booking.guest_count.one` | {n} guest | {n} гостин |
| `email.booking.guest_count.few` | {n} guests | {n} гости |
| `email.booking.guest_count.many` | {n} guests | {n} гости |
| `email.booking.guest_count.other` | {n} guests | {n} гости |

## New message

| Key | English | Macedonian |
| --- | --- | --- |
| `email.message.subject` | New message about {listing} | Нова порака за {listing} |
| `email.message.body` | {sender} sent you a message about "{listing}". | {sender} ви испрати порака за „{listing}“. |
| `email.message.reply_securely` | Reply securely in {brand} | Одговорете безбедно во {brand} |
| `email.message.payment_instructions` | Payment instructions are available in {brand} | Упатствата за плаќање се достапни во {brand} |
| `email.message.privacy` | For your privacy, keep the conversation inside {brand}. | Заради вашата приватност, задржете го разговорот во {brand}. |

## Ratings and reviews

| Key | English | Macedonian |
| --- | --- | --- |
| `email.review.leave_rating` | Leave your rating | Оставете оценка |
| `email.review.deadline` | Deadline | Краен рок |
| `email.review.status` | Review status | Статус на оценката |
| `email.review.view_ratings` | View ratings | Погледнете ги оценките |
| `email.review.reminder.subject` | How was {listing}? | Како беше {listing}? |
| `email.review.reminder.waiting_subject` | A private rating is waiting for you | Ве чека приватна оценка |
| `email.review.reminder.body` | Your stay connected to "{listing}" has ended. | Вашиот престој поврзан со „{listing}“ заврши. |
| `email.review.reminder.waiting_body` | The other party has submitted a private rating for "{listing}". | Другата страна остави приватна оценка за „{listing}“. |
| `email.review.reminder.instructions` | Share an honest rating before the 14-day review window closes. | Оставете искрена оценка пред да истече рокот од 14 дена. |
| `email.review.reminder.waiting_instructions` | Submit your own rating to unlock both after admin approval. We will not reveal their stars or comments beforehand. | Оставете ја вашата оценка за двете да се отклучат по одобрување од администратор. Нивните ѕвезди и коментари нема да ги откриеме однапред. |
| `email.review.submitted.subject` | Rating received | Оценката е примена |
| `email.review.submitted.body` | We received your private rating for "{listing}". | Ја примивме вашата приватна оценка за „{listing}“. |
| `email.review.submitted.sealed` | It will remain sealed until the other party submits or the review period closes, and an administrator approves the public content. | Таа ќе остане запечатена додека другата страна не остави своја оценка или не истече рокот, и додека администратор не ја одобри јавната содржина. |
| `email.review.published.subject` | Ratings are now available | Оценките се веќе достапни |
| `email.review.published.body` | The approved ratings for "{listing}" are now available. | Одобрените оценки за „{listing}“ се веќе достапни. |
| `email.review.rejected.subject` | Review moderation update | Ажурирање за модерација на рецензијата |
| `email.review.rejected.body` | Your review for "{listing}" was not approved for publication. | Вашата рецензија за „{listing}“ не беше одобрена за објавување. |

## Safety cases

| Key | English | Macedonian |
| --- | --- | --- |
| `email.case.claim_received` | Claim received | Побарувањето е примено |
| `email.case.report_received` | Report received | Пријавата е примена |
| `email.case.received_claim` | We received your claim "{subject}". | Го примивме вашето побарување „{subject}“. |
| `email.case.received_report` | We received your report "{subject}". | Ја примивме вашата пријава „{subject}“. |
| `email.case.status` | Status | Статус |
| `email.case.current_status` | Current status | Тековен статус |
| `email.case.follow` | Follow the case | Следете го случајот |
| `email.case.update_subject` | Update for {reference} | Ажурирање за {reference} |
| `email.case.view_and_respond` | View and respond | Погледнете и одговорете |
| `email.case.status.submitted` | Submitted | Поднесено |
| `email.case.status.under_review` | Under review | Во разгледување |
| `email.case.status.awaiting_information` | Awaiting information | Се чекаат информации |
| `email.case.status.resolved` | Resolved | Решено |
| `email.case.status.rejected` | Rejected | Одбиено |

## Claims

| Key | English | Macedonian |
| --- | --- | --- |
| `email.claim.amount` | Amount | Износ |
| `email.claim.counteroffer` | Counteroffer | Контрапонуда |
| `email.claim.note` | Note | Белешка |
| `email.claim.view_case` | View the case | Погледнете го случајот |
| `email.claim.respond_securely` | Respond securely | Одговорете безбедно |
| `email.claim.released.subject` | Response required for {reference} | Потребен е одговор за {reference} |
| `email.claim.released.body` | {reporter} submitted a booking-related {kind} request. | {reporter} поднесе барање за {kind} поврзано со резервација. |
| `email.claim.released.rights_direct` | You can accept, counter, or reject after reviewing the evidence. Linger Homes does not collect or hold payments, so nothing is taken from you either way. | Откако ќе ги разгледате доказите, можете да прифатите, да дадете контрапонуда или да одбиете. Linger Homes не наплаќа ниту чува плаќања, па во ниту еден случај нема да ви биде земено ништо. |
| `email.claim.kind.expense` | expense | трошок |
| `email.claim.kind.damage` | damage | штета |
| `email.claim.kind.refund` | refund | поврат на средства |
| `email.claim.kind.payment` | payment | плаќање |
| `email.claim.response.subject` | Response to {reference} | Одговор на {reference} |
| `email.claim.response.body` | The other party responded to your request. | Другата страна одговори на вашето барање. |
| `email.claim.response.label` | Response | Одговор |
| `email.claim.response.updated` | Updated | Ажурирано |
| `email.claim.response.awaiting_admin` | Awaiting admin | Се чека администратор |
| `email.claim.response.awaiting_recipient` | Awaiting recipient | Се чека примачот |
| `email.claim.response.accepted` | Accepted | Прифатено |
| `email.claim.response.countered` | Countered | Дадена контрапонуда |
| `email.claim.response.rejected` | Rejected | Одбиено |
| `email.claim.response.escalated` | Escalated | Ескалирано |

## Account deletion

| Key | English | Macedonian |
| --- | --- | --- |
| `email.deletion.subject` | Confirm deletion of your {product} account | Потврдете го бришењето на вашата {product} сметка |
| `email.deletion.body` | We received a request to permanently delete your {product} account. | Примивме барање за трајно бришење на вашата {product} сметка. |
| `email.deletion.confirm_here` | Confirm here (link expires in 1 hour): | Потврдете тука (врската истекува за 1 час): |
| `email.deletion.confirm_link` | Confirm account deletion | Потврдете го бришењето на сметката |
| `email.deletion.expires` | (link expires in 1 hour) | (врската истекува за 1 час) |
| `email.deletion.warning` | This cannot be undone. If you didn't request this, ignore this email — your account stays exactly as it is, and you may want to sign out of any devices you don't recognise. | Ова не може да се врати. Ако не сте го побарале ова, занемарете ја пораката — вашата сметка останува непроменета, а препорачуваме да се одјавите од сите уреди што не ги препознавате. |
| `email.deletion.questions` | Questions? | Прашања? |

## Shared

| Key | English | Macedonian |
| --- | --- | --- |
| `email.greeting.hi` | Hi {name}, | Здраво {name}, |
| `email.greeting.hello` | Hello {name}, | Почитувани {name}, |
| `email.view_status` | View status | Погледнете го статусот |
| `email.user_content.machine_translated` | Automatically translated by Google. | Автоматски преведено од Google. |
| `email.user_content.original` | Original as written: | Оригинал, како што е напишан: |

