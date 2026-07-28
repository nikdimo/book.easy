# Linger Homes communication and safety system

## What is implemented

### Private messages

- A guest can contact a host from an approved listing before booking.
- A booking automatically uses a private booking conversation.
- If the guest previously asked about the same listing, that inquiry becomes the
  booking conversation so history is not lost.
- Guests and hosts can use the same conversation on web and in the mobile app.
- Each participant has an unread counter.
- New messages create an in-app notification and an email notification.
- Pre-booking inquiries reject phone numbers, email addresses, and external links.
- A user can report an individual message.

### Reports and claims

- Reports can point to a user, host, listing, booking, or message.
- Claims must point to a booking.
- A user chooses a category, writes a summary and description, and can attach up
  to five JPG, PNG, WebP, or PDF evidence files.
- Each case receives a permanent reference such as `LH-2026-12AB34CD`.
- The reporter receives confirmation by email and in the app.
- The reporter can see the timeline and add more information while the case is open.

### Administrator oversight

- Administrators have one overview for all conversations and another for all
  reports and claims.
- Reading a conversation or case creates an audit-log entry.
- An administrator may join a conversation visibly as **Linger Homes Support**.
- Administrators can assign a case to themselves, change priority and status,
  send public updates, keep internal notes, and record a final resolution.
- Public updates notify the reporter in the app and by email.

## Rules

- Email and in-app notifications are mandatory in the first release; users cannot
  disable them yet.
- Conversation membership and booking ownership are checked on every read and send.
- Support evidence is authenticated, size-limited, and checked by file signature.
- Deleted messages remain represented in the conversation and case history.
- SMS, WhatsApp, and Telegram must only carry short alerts and secure links. They
  should not contain private conversation text or evidence.

## Next phases

1. Add user-selectable notification preferences after enough real usage data exists.
2. Add SMS for urgent booking and safety updates, with verified phone numbers.
3. Add WhatsApp notification templates through an approved business account.
4. Add Telegram alerts only for users who explicitly connect their account.
5. Add case filters, service-level timers, saved admin replies, escalation rules,
   and operational reporting.

## Required deployment settings

- `NEXT_PUBLIC_APP_URL` must be the canonical HTTPS web address.
- `SUPPORT_EMAIL` must reach the support team.
- SMTP settings must be configured; without them, email is logged locally.
- Expo push credentials must be configured for production iOS and Android builds.

## Linger Homes rebrand coordination

- Communication copy uses the approved spelling **Linger Homes**.
- Customer email sender name is **Linger Homes**.
- Support participation inside the product is displayed as **Linger Homes Support**.
- Communication identity is centralized in `src/lib/communication-brand.ts`
  without modifying the global branding files during the parallel rollout.
- Email links use `NEXT_PUBLIC_APP_URL` while both domains operate in parallel and
  fall back to `https://lingerhomes.com`.
- The sender mailbox uses the address configured in `EMAIL_FROM`; the official
  sender identity is `Linger Homes <hello@lingerhomes.com>`.
- Replies use `EMAIL_REPLY_TO` and fall back to `hello@lingerhomes.com`.
- Case escalation mail uses `SUPPORT_EMAIL` and falls back to
  `hello@lingerhomes.com`.
