# Marketing communications

This system deliberately keeps cookie consent, service messages, and direct
marketing separate.

## Classification

| Message | Class | Consent requirement |
| --- | --- | --- |
| Login, verification, security, payment, refund | Essential service | No marketing consent |
| Active booking/listing status and check-in information | Essential service | No marketing consent |
| Guest/host messages and review reminders | Optional operational | Account preference |
| Offers, promoted listings, travel inspiration, engagement or “we miss you” reminders | Marketing | Active consent for the exact channel and audience |

A service email must not contain promoted properties, special offers, or a
cross-sell call to action. If promotional content is added, send the entire
message through the marketing path.

## Required entry points

- Transactional email: `sendTransactionalEmail` in `src/lib/email/index.ts`
- Marketing email: `sendMarketingEmail` in `src/lib/email/marketing.ts`
- Operational notification: `createUserNotification`
- Marketing push/in-app notification: `createMarketingNotification`

The marketing entry points perform an eligibility check at delivery time. Do
not call the SMTP transport or Expo endpoint directly for promotions.

## Consent lifecycle

1. Email consent starts as `PENDING`.
2. The user confirms using the 48-hour double-opt-in link.
3. Only `SUBSCRIBED` preferences with their versioned consent statement and no
   channel suppression are eligible.
4. Any email unsubscribe suppresses all email marketing for that contact,
   regardless of guest/host audience.
5. Complaint and hard-bounce handlers should upsert a suppression before any
   later campaign runs.

Provider webhook handlers must call `suppressMarketingContact` with
`COMPLAINT` or `HARD_BOUNCE`. The current SMTP transport has no provider-specific
webhook contract, so that thin adapter belongs with whichever production
delivery provider is configured.

The raw IP address is never stored in consent evidence. A keyed one-way request
fingerprint is recorded with the exact statement version, source, timestamp,
and user agent.

## Campaigns and reminders

Create a `MarketingCampaign`, then pass its ID to `sendMarketingEmail`.
Deliveries are recorded as `SENT`, `FAILED`, or `SKIPPED`. A scheduled worker
must query the intended audience but still call `sendMarketingEmail` for every
recipient; a list exported earlier is never proof that consent remains active.

Configure these production secrets and identities:

- `MARKETING_LEGAL_ENTITY`: the registered controller/company name shown in
  consent evidence
- `MARKETING_AUDIT_SALT`: a stable, private salt for request fingerprints
- `NEXT_PUBLIC_APP_URL`: canonical HTTPS origin used in confirmation and
  unsubscribe links
- `EMAIL_FROM`, `EMAIL_REPLY_TO`, and SMTP settings

Legal copy and retention periods should be approved by Danish/EU counsel before
production launch. Changing consent wording requires a new version in
`CONSENT_COPY`; never edit an existing version after collecting consent.
