# Web chat and notifications implementation specification

## Goal

Add the same booking-linked inbox and durable notification center to the web app. The
mobile implementation is the reference client; both clients must use the same database
records and API semantics so unread counts stay consistent across devices.

## Shared product rules

- A booking owns at most one conversation in the first release.
- Only the booking guest, listing host, and an explicitly authorized support workflow
  may read or send messages.
- Opening a conversation sets that user's `ConversationParticipant.unreadCount` to zero
  and marks unread `CHAT_MESSAGE` notifications for that conversation as read.
- The notification bell count is the number of unread `Notification` rows, not the sum
  of chat-thread counters. Thread counters are shown separately in the inbox.
- Booking request, confirmation, rejection, cancellation, and chat-message events create
  durable notification rows. Email and push are delivery transports, not sources of truth.
- The first release supports plain text up to 2,000 characters. Attachments, message
  editing, reactions, typing indicators, and pre-booking inquiries are later phases.

## Existing shared backend

The Prisma models are `Notification`, `PushToken`, `Conversation`,
`ConversationParticipant`, and `Message`. Booking state transitions already produce
notifications. These mobile routes are reusable by the web UI or can be promoted to
client-neutral `/api/v1` paths without changing their response shapes:

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/api/mobile/v1/notifications` | Return the latest 100 notifications and unread count |
| `PATCH` | `/api/mobile/v1/notifications` | Mark all notifications read |
| `PATCH` | `/api/mobile/v1/notifications/:id` | Mark one owned notification read |
| `GET` | `/api/mobile/v1/conversations` | Return booking conversations and per-thread unread counts |
| `POST` | `/api/mobile/v1/conversations` | Resolve/create the current user's conversation for a booking |
| `GET` | `/api/mobile/v1/conversations/:id/messages` | Return thread metadata and messages; mark the thread read |
| `POST` | `/api/mobile/v1/conversations/:id/messages` | Send a message; currently limited to 40 messages/minute/user |

Every handler must continue to derive the user from the server session. Never accept a
user ID, host ID, or sender ID from the browser.

## Web routes and components

### Global notification bell

Place `<NotificationBell />` in the authenticated account and host headers. It should:

1. Fetch notifications when the authenticated shell mounts.
2. Poll every 15–30 seconds initially and refetch on window focus.
3. Render an accessible button labelled “Notifications, N unread”.
4. Show a red `99+` capped badge.
5. Open a popover containing the newest 10 records, with “Mark all read” and “View all”.
6. Navigate booking notifications to the relevant host/guest booking page and chat
   notifications to `/messages/:conversationId`.

Create `/notifications` for the complete paginated list. Mobile currently returns 100
records; before launching high-volume accounts, add cursor pagination using
`createdAt + id`.

### Inbox

Create:

- `/host/inbox` for hosts;
- `/account/messages` for guests;
- `/messages/:conversationId` as the canonical thread URL, shared by both roles.

Recommended component split:

- `ConversationList` — property image, other participant, booking status, preview,
  timestamp, and thread unread badge.
- `ConversationHeader` — guest/host name, property, stay dates, booking status, and link
  to the booking.
- `MessageTimeline` — grouped bubbles, sender labels, timestamps, loading/history state.
- `MessageComposer` — multiline input, remaining-limit feedback, send/error/retry state.

Desktop should use a two-column inbox/thread layout. At narrow widths, use separate list
and thread pages. Keep the canonical URL updated so refresh and notification deep links
restore the same conversation.

## Client behavior

- Use optimistic message bubbles with a client-generated temporary ID and a
  `sending/failed/sent` state. Replace the temporary item with the server message.
- Disable duplicate submits while one request is pending, but keep failed text available.
- Poll the open thread every 5 seconds and the inbox every 10–15 seconds for the first
  release. Stop polling in hidden tabs and refresh immediately on focus.
- Phase two can replace polling with Server-Sent Events or WebSockets. Publish
  `message.created`, `conversation.read`, and `notification.created` events, then retain
  periodic reconciliation because realtime delivery is not guaranteed.
- Do not use browser-only unread state. The API write is authoritative; local state is an
  immediate visual optimization.

## Security and abuse controls

- Check conversation membership on every read and write, including admin tooling.
- Keep message bodies as text and render with normal React escaping. Do not render HTML.
- Retain the current per-user send rate limit and add per-conversation burst protection
  if abuse appears.
- Add report, block, and support-escalation workflows before enabling pre-booking messages.
- When attachments are introduced, use short-lived signed upload URLs, validate MIME type
  and file signature, scan uploads, and store metadata in a separate `MessageAttachment`
  table.
- Log support/admin access to a conversation. Do not silently make all admins participants.

## Notification delivery

- The `Notification` row is created in response to the domain event.
- Web shows the row through polling/realtime.
- Mobile push is sent through Expo after the durable row exists.
- Email remains a separate best-effort channel for important booking events.
- Production push requires an EAS project ID, platform credentials, and receipt
  processing. A scheduled worker should query Expo receipts and remove tokens that return
  `DeviceNotRegistered`.

## Accessibility and localization

- Bell, unread dots, composer, and send controls need explicit accessible labels.
- Message status cannot be represented by color alone.
- New messages should not steal keyboard focus; expose a polite live-region announcement.
- Preserve logical reading order, 44px minimum touch targets, and keyboard navigation.
- Store event facts, not translated sentences, if notifications must later change
  language after creation. The current stored title/body is acceptable for the MVP but
  should be migrated to template keys before adding multiple notification languages.

## Privacy, retention, and deletion

- Include notification and sent-message data in GDPR exports.
- Delete push tokens and notifications on account deletion.
- Preserve historical messages needed for booking records but set the deleted user's
  sender reference to null and display “Deleted user”.
- Delete read notification records after one year. Review chat retention with legal and
  customer-support requirements before public launch.

## Acceptance criteria

- Booking create/confirm/reject/cancel updates the correct user's bell without a reload
  after the next poll.
- A guest message increments the host's bell and inbox-thread count; opening the thread
  clears both for that conversation on mobile and web.
- An unrelated signed-in user receives `404` for conversation reads and writes.
- Message submission rejects empty bodies and bodies longer than 2,000 characters.
- Bell, popover, inbox, and thread are usable with keyboard and screen reader.
- Mobile deep links and web links reach the same underlying conversation and read state.
