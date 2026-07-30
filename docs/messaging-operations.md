# Messaging and host-attention workflow

## Product rules

- “Needs attention” counts tasks, not general news: pending booking decisions,
  unread conversation threads, and unresolved damage reports from the other party.
- The notification bell counts unread notification records. Reading a notification
  does not complete the underlying task.
- A booking conversation starts with a pinned booking card and then presents messages,
  booking lifecycle events, and damage reports in one chronological timeline.
- Damage photos and descriptions are structured records. They are rendered in chat but
  remain auditable and can be acknowledged, escalated, or resolved.

## Delivery rules

- Message creation, recipient unread increments, durable notifications, and email-outbox
  rows commit in one database transaction.
- Client-generated message IDs make retries safe and prevent duplicate messages.
- Push and email workers claim rows before delivery, retry with backoff, recover stale
  locks, and stop after a bounded number of attempts.
- The booking worker also repairs missing conversations and lifecycle events.
- Web conversations use server-sent events for immediate updates and retain periodic
  reconciliation so a dropped connection cannot lose visible state.
- Fetching messages is read-only. Clients explicitly acknowledge the newest message they
  displayed, so polling cannot accidentally clear unseen messages.

## Release checks

Every pull request must pass formatting/catalog checks, lint, web and mobile type checks,
database migrations on a clean PostgreSQL database, integration tests, and a production
build. Messaging changes should add tests for authorization, retry/idempotency, unread
state, pagination, durable delivery, and any new timeline event.

## Operations

Run `npm run bookings:process` every ten minutes. Alert when an email delivery exhausts
all retries, when push failures rise sharply, or when missing-conversation reconciliation
reports repeated failures. Keep periodic client reconciliation alongside realtime
delivery.
