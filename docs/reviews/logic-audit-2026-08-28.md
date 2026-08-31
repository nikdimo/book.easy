# Logic audit — user flow & business rules

**Date:** 2026-08-28 · **Branch:** `main` @ `3cfcf46` · **Scope:** booking lifecycle, payments & deposits, availability, host onboarding, search, reviews, account deletion.

This is a read-only audit. Nothing was changed. Every finding below was traced to specific
lines; where a finding depends on deployment configuration (time zone, systemd timers) that is
called out explicitly rather than asserted.

**Summary:** 25 findings — 3 critical, 6 high, 9 medium, 7 low. The three critical ones are a
broken GDPR erasure path, an unreachable damage-deposit return leg, and a calendar that offers
stays the booking server refuses.

---

## Critical

### C1 — Account deletion fails for any user who has ever booked or hosted

`src/lib/services/gdpr.service.ts:310` (`deleteUserAccount`)

The transaction ends with `tx.user.delete({ where: { id: userId } })`. Four foreign keys onto
`User` are `ON DELETE RESTRICT` (verified in `prisma/migrations/20260710174949_init/migration.sql`):

| Table | Column | Action |
| --- | --- | --- |
| `Booking` | `guestId` | `ON DELETE RESTRICT` |
| `Listing` | `hostId` | `ON DELETE RESTRICT` |
| `Property` | `ownerId` | `ON DELETE RESTRICT` |
| `Suggestion` | `hostId` | `ON DELETE RESTRICT` |

Nothing in the transaction clears them:

- Step 6 sets listings to `ARCHIVED` and writes `hostId: userId` back with the comment
  `// Will be handled in user deletion`. It is not handled anywhere.
- Step 7 cancels **only** `PENDING` guest bookings. `CONFIRMED`, `COMPLETED`, `REJECTED`,
  `EXPIRED` and cancelled rows all survive and each one blocks the delete.
- `Property` is never touched at all.

So the delete raises a FK violation, the `catch` converts it into
`"Failed to delete user account. Contact support for assistance."`, and the whole transaction
rolls back. Self-service erasure works only for an account that has never booked and never
hosted — i.e. almost no real account.

Worse, the failure is not idempotent. `confirmAccountDeletion`
(`src/lib/services/account-deletion.service.ts:159`) marks the token `usedAt` **before** calling
`deleteUserAccount`, and that write is in a separate transaction. The failed attempt burns the
confirmation link; the user requests a new one and it fails identically.

**Failure scenario:** a guest with one completed stay opens Privacy → Delete account →
confirms the emailed link → sees a generic support message → requests a new link → same
result, forever.

### C2 — The damage-deposit return leg can never be recorded

`src/lib/services/booking-payment-status.service.ts:395` ·
`src/components/booking/booking-payment-progress.tsx:243`

`recordBookingPaymentEvent` guards with:

```ts
if (booking.status !== "CONFIRMED" || !booking.acceptedAt) {
  throw new Error("Payment progress can only be updated for an accepted booking");
}
```

`completePastBookings` flips `CONFIRMED → COMPLETED` as soon as `checkOut <= today`. Three of
the thirteen payment events are, by definition, post-checkout:

- `HOST_REPORT_DAMAGE_DEPOSIT_RETURNED`
- `GUEST_CONFIRM_DAMAGE_DEPOSIT_RETURNED`
- `HOST_MARK_DAMAGE_DEPOSIT_RETAINED`

They become unreachable exactly when they are needed. This contradicts the product's own
model: `DamageDepositPolicy.returnDaysAfterCheckout` exists so a host can state
*"returned within 7 days after checkout"*, and `deposit-policies-summary.tsx:137` prints that
promise to the guest.

The UI compounds it — `ProgressControls` opens with
`if (progress.status !== "CONFIRMED") return null;`, so the entire payment card disappears the
day after checkout rather than showing a disabled control with an explanation.

The same guard also locks out the ordinary cash flow: a guest paying `CASH_AT_PROPERTY` and a
host confirming receipt at checkout both lose their controls on the same schedule.

**Failure scenario:** host takes a €200 damage deposit, guest checks out Friday, host returns
the deposit Monday and opens the reservation to mark it returned. The card is gone. The booking
is frozen at `DEPOSIT_CONFIRMED` forever, and the guest has no way to confirm they got it back.

### C3 — The listing calendar offers stays the booking server refuses

`src/lib/services/availability.service.ts:118` vs `src/lib/services/booking.service.ts:337`

For a `CLOSED`-mode listing, the guest calendar builds blocked ranges by **complementing every
open window in sequence**:

```ts
let cursor = today;
for (const window of listing.availabilityWindows) { ... if (end > cursor) cursor = end; }
```

Two adjacent windows (Jun 1–15, Jun 15–30) therefore leave the whole of June selectable.

But `createBooking`, `checkAvailability` and `search.service` all require **one single window
that spans the entire stay**:

```ts
availabilityWindows: { where: { startDate: { lte: checkIn }, endDate: { gte: checkOut } } }
```

And `submitNewListing` creates one window per merged open range
(`listing.actions.ts:503`, `mergeInclusiveBlockRanges(...).flatMap(...)`) — so multiple windows
are the normal case, not an edge case.

**Failure scenario:** host opens 1–15 June and 15–30 June. Guest opens the listing, picks
10 → 20 June (calendar shows it free), fills in the party, accepts the house rules, presses
*Request to book*, and gets *"These dates are not open for booking. Please select
different dates."* — against a calendar still showing those dates as available.

Note the inconsistency is one-sided: **search agrees with the server** and hides the listing,
so the same stay is un-findable in search yet bookable-looking on the listing page.

---

## High

### H1 — `maxNights` is only enforced at the final submit

`src/lib/services/booking.service.ts:411` enforces it. It is absent from:

- `validateBookingSelection` (`src/lib/utils/booking-selection.ts:25`) — takes `minNights` only
- `BookingWidget` — the prop is never passed (`booking-widget.tsx:70` has `minNights` alone)
- `buildListingWhere` (`search.service.ts:119`) — filters `minNights: { lte: requestedNights }`
  but never `maxNights`

It *is* implemented in the host calendar (`calendar-model.ts:537`, `ABOVE_MAXIMUM`) and returned
by the mobile availability API (`route.ts:108`), so this is specifically a guest-web gap.

**Failure scenario:** listing caps stays at 14 nights. Guest searches a 30-night stay, the
listing appears in results, the widget prices all 30 nights, the guest accepts the house rules
and submits — then gets *"Maximum stay is 14 nights"* with no indication anywhere earlier.

### H2 — Admin cancellation is announced as a host cancellation, and the host is never told

`src/lib/services/booking.service.ts:718` · `src/lib/services/booking-timeline.service.ts:6`

`cancelBooking` writes the correct `CANCELLED_BY_ADMIN` status, then:

```ts
await notifyBookingEvent(updated.id,
  cancelledBy === "guest" ? "cancelled-by-guest" : "cancelled-by-host");
```

`eventTypeByNotificationEvent` has no `admin` key, so an admin cancellation:

1. writes a `CANCELLED_BY_HOST` timeline event that **contradicts the booking row**,
2. notifies the guest that "your booking was cancelled" with no mention of who,
3. enqueues `GUEST_CANCELLED` only — **the host gets no email and no notification at all**
   that their confirmed reservation was cancelled out from under them.

The host discovers the cancellation by noticing a gap in their calendar.

### H3 — Nothing prevents a host from booking their own listing

`createBooking` (`booking.service.ts:300`) never compares `guestId` against `listing.hostId`.
The only place the relationship is considered is `properties/[slug]/page.tsx:224`, and it is
used solely to hide the *Message host* button. The booking widget renders and submits normally.

A self-booking creates a real `BOOKING_HOLD` (blocking the host's own calendar), a conversation
with a single participant on both sides, review invitations in **both** directions on the same
person, and inflates `confirmedBookingCount` in `attention.service.ts:139`, which gates
first-time-host UI.

### H4 — Infants and pets are collected, displayed, and then discarded

The picker collects `{ adults, children, infants, pets }`; the counts ride the URL
(`?adults=&children=&infants=&pets=`), the resume draft, and the summary line
(`booking-widget.tsx:464-490`). At submit (`booking-widget.tsx:831`) only:

```ts
formData.set("guestCount", String(guests));   // guests = adults + children
```

`Booking` has no column for the rest, so the host's reservation shows "3 guests" for a party of
two adults, an infant and a dog.

`applyPetPolicy` correctly refuses pets at a pet-free listing — but at a **pets-allowed** listing
the host is never told a pet is coming, which is precisely when they need to know (cleaning,
access, other guests). Same for infants and cots.

### H5 — The deposit question is never asked during onboarding

`appendDraftToFormData` (`host-start.actions.ts:120`) forwards `acceptedPaymentMethods`,
`paymentMethodOther`, `paymentInstructionTemplates` and `paymentDetails` — and **no deposit
fields**. `submitNewListing` sets `paymentMethodsReviewedAt: new Date()` but never
`depositPoliciesReviewedAt`. Grepping confirms only `saveListingDepositPolicies` ever writes it.

Two consequences:

1. Every newly published listing freezes `depositPolicySnapshot.status = "UNANSWERED"` onto its
   bookings. `deposit-policies.ts:71` is explicit that this is *not* the same as "no deposit" —
   the guest is told the host never answered.
2. `attention.service.ts:70` raises an *"incomplete payment arrangements"* task the moment the
   wizard finishes, pointing at the screen the host just completed. The wizard's
   `PaymentArrangementsStep` is even documented as a *"Required listing-creation step"*.

### H6 — Deposit currency drifts from the listing's price currency

`listing-deposit-policies.service.ts:145` snapshots `depositPoliciesCurrency` from the pricing
rule at the moment the host reviews the screen. `getListingDepositPoliciesData:43` already
documents the drift: *"The stored policy currency can lag behind a listing whose pricing
currency changed."*

But `createDepositPoliciesSnapshot` reads the **stored** currency when freezing terms onto a
booking, and `calculateDepositAmounts(policies, String(totalPrice))` resolves a `PERCENTAGE`
against `totalPrice` — which is in the *pricing rule's* currency
(`booking.service.ts:466`).

Listing currency is genuinely variable: `saveHostStartDraftPatch` seeds it from the host's
display currency, and it is editable afterwards.

**Failure scenario:** host reviews deposits while priced in EUR (20% advance), later switches
the listing to MKD. New bookings compute 20% of an MKD total and label the result "EUR". A
`FIXED` policy is worse — a flat `100` frozen as EUR against an MKD booking.

Related, no cap: a `FIXED` advance payment may exceed `totalPrice` entirely. Only `PERCENTAGE`
is bounded (`PERCENTAGE_TOO_HIGH`, ≤ 100).

---

## Medium

### M1 — Three accept paths, three different resulting states

| Path | Payment decision | `paymentInstructionsStatus` |
| --- | --- | --- |
| `acceptBookingWithPaymentAction` (web) | forced: `SEND_NOW` / `SEND_LATER` / `NO_INSTRUCTIONS` | explicit |
| `PATCH /api/mobile/v1/bookings/[id]` `action: "confirm"` | none | derived from `selectedPaymentMethod` |
| `confirmBookingAction` (server action) | none | derived |

A host accepting on mobile skips the payment step entirely and lands on `PENDING` instructions
that nothing prompts them to send. `confirmBookingAction` is exported but referenced only by a
test mock (`reservation-detail.test.tsx:18`) — dead code preserving a third variant.

### M2 — `HOST_MARK_PAYMENT_NOT_REQUIRED` leaves the advance payment still due

`booking-payment-status.service.ts:200`. The advance payment is documented as *part of*
`totalPrice`. Marking the whole price `NOT_REQUIRED` touches only `paymentStatus`, leaving
`advancePaymentStatus: AWAITING_PAYMENT`. The guest is asked to send an advance toward a price
the host just waived.

### M3 — `confirmBooking` can reopen a settled deposit track

`booking.service.ts:1026`. At creation, a track whose computed amount is null or zero is set to
`NOT_REQUIRED` — a settled answer. At confirmation:

```ts
frozenDepositPolicies?.advancePayment
  ? (dueTiming === "AFTER_ACCEPTANCE" ? "AWAITING_PAYMENT" : "UNTRACKED")
  : ...
```

The amount is never re-checked. A policy object that resolved to zero flips `NOT_REQUIRED` →
`AWAITING_PAYMENT` on acceptance, contradicting what the guest was told at request time.

### M4 — Cancellation has no policy, no cutoff, and no symmetry

`cancelBooking` (`booking.service.ts:673`) permits cancelling any `PENDING` or `CONFIRMED`
booking with **no date check at all**:

- A stay already under way can be cancelled by either side.
- A stay whose checkout has passed but that has not yet been lazily completed is still
  `CONFIRMED`, so it can be "cancelled" retroactively — `cancelBooking` is one of the few
  booking paths that does *not* call `completePastBookings()` first.
- Guest cancel requires no reason (`cancelBookingAction:110`); host and admin cancel do, and so
  does `rejectBooking`.
- No fee, window, or penalty is recorded beyond `cancellationReason`.
- `cancelBookingAction` is not rate-limited, while `createBookingAction` is (20/hr), so
  create→cancel churn against a host's calendar is free.

### M5 — Price filtering and sorting ignore currency

`SearchFilters` (`src/lib/types/search.ts:11`) has `minPrice`/`maxPrice` as bare numbers.
`buildListingWhere:113` compares them directly to `pricingRule.baseNightlyRate` — whatever
currency each listing quotes in. `PRICE_RANGE_MIN/MAX` are hard-coded `10`/`800`, which is a
meaningful range in EUR and meaningless in MKD. `sort: price_asc|price_desc` orders by the same
mixed-currency column.

Separately, the filter reads `baseNightlyRate` while the card shows the override- and
promotion-adjusted range from `computeNightlyRateRange`. A listing with a €100 base and a €300
June override matches "under €150" and then displays €300.

### M6 — Four different definitions of "today" in the booking flow

`date-only.ts:88` defines the marketplace rule (`todayYmd()`, Europe/Skopje) and documents at
length why UTC is wrong. The booking path does not use it:

| Site | "Today" is |
| --- | --- |
| `createBookingSchema:31` | `format(new Date(), "yyyy-MM-dd")` — server local |
| `completePastBookings:68` | `new Date(); setHours(0,0,0,0)` — server-local midnight as an instant |
| `getBlockedDateRangesForListings:83` | same |
| `booking.actions.ts:267` (payment deadline) | `new Date().toISOString().slice(0,10)` — UTC |
| `date-only.ts` (unused here) | `Europe/Skopje` |

The `setHours(0,0,0,0)` variants are compared against `@db.Date` columns that Prisma reads as
UTC midnight, so on a UTC+2 server they are two hours off — which is why a stay completes the
day *after* checkout rather than on it.

Deployment-dependent, but worth naming: `computeStayQuote` → `eachStayNight` → date-fns
`eachDayOfInterval`/`format` all run in **server-local** time over `Date`s built as UTC midnight
by `new Date("2026-06-10")`. On a server whose zone is behind UTC, every `dateKey` shifts back a
day and date-price overrides and promotion windows apply to the wrong nights. Safe on
Europe/Skopje; silently wrong if the app is ever moved or a container defaults to UTC-5.

### M7 — The booking timeline rides on a fire-and-forget side effect

`recordBookingTimelineEvent` is reached from exactly one place — `notifyBookingEvent`
(`notification.service.ts:286`) — which is always invoked through `notifyBestEffort` (swallows
every error) or `Promise.allSettled`. By contrast, `COMPLETED` events are written *inside* the
transaction (`booking.service.ts:83`).

So the same audit surface has two durability levels, and the weaker one covers the events that
matter most (requested / confirmed / rejected / cancelled).
`reconcileBookingTimelineEvents` backfills, but only the newest 200 rows by `updatedAt` and only
the *current* status — an intermediate state lost to a failed notify is gone permanently.

### M8 — Host "Today" counts include already-expired requests

`getHostAttentionSummary` (`attention.service.ts:25`) counts `status: "PENDING"` without calling
`expirePendingBookings()` first — unlike every booking list and detail read, which all do. The
badge counts requests whose `responseDueAt` has passed until the next timer run.

### M9 — `unpublishListing` has no booking guard while `archiveListing` does

`archiveListing` (`listing.actions.ts:888`) is deliberately blocked on pending or confirmed
bookings — *"Blocked while money/dates are still in play"*. `unpublishListing:862` does the same
kind of thing with no such check, and neither does admin `suspendListing`
(`admin.actions.ts:45`).

`confirmBooking` never re-checks listing status, so a host can accept a request against a
listing that is no longer public. `createBooking` requires `status: "APPROVED"`, so the states
disagree about whether an unpublished listing is transacting.

---

## Low

### L1 — The onboarding wizard resumes on the wrong screen

`host-start-draft.ts:15` maps step ids → routes using the 11-step `LISTING_STEPS` vocabulary.
The wizard has 17 routes. The mapping collides:

| Route the host left from | `currentStepId` written | Resumes at |
| --- | --- | --- |
| `price` | `specialOffer` | `availability` |
| `payment-arrangements` | `specialOffer` | `availability` |
| `availability` | `specialOffer` | `availability` |
| `house-rules` | `specialOffer` | `availability` |
| `location` | `details` | `basics` |
| `address` | `details` | `basics` |

The actual order is `price → payment-arrangements → availability → house-rules → review`, so a
host who got as far as house rules is thrown backwards two screens, and one who only finished
pricing is thrown forwards past payment arrangements. Anything unmapped falls back to
`property-type` — step one.

### L2 — `nightlyRate` is an average that does not reconstruct the total

`booking.service.ts:463` stores `quote.effectiveAverageNightly =
round(discountedAccommodationCents / nights)`. Three nights at 100 / 100 / 101 store `100.33`
against a `301.00` total; `100.33 × 3 + fee ≠ totalPrice`.

`GET /api/mobile/v1/bookings/[id]` returns `nightlyRate`, `cleaningFee` and `totalPrice` side by
side with nothing marking the first as derived, so any client that recomputes will disagree with
the authoritative figure.

### L3 — `"SUPERADMIN"` is not a role

`UserRole` is `USER | ADMIN` (`schema.prisma:12`). Three sites compare against `"SUPERADMIN"` —
permanently false branches: `mobile-api.ts:125`, `mobile/v1/bookings/[id]/route.ts:28`,
`mobile/v1/session/route.ts:19`.

Related asymmetry: mobile `GET /bookings/[id]` grants an admin a cross-host read, but `PATCH`
does not, so an admin can open a booking they cannot act on
(`confirmBooking` will throw "You can only confirm bookings for your own listings").

### L4 — Enum states with no reachable transition

- `ListingStatus.PENDING_REVIEW` and `REJECTED`: both publish paths write `APPROVED` directly
  with `needsReview: true` (`listing.actions.ts:547`, `:850`). The enum implies a moderation
  queue the code does not run.
- `BookingStatus.CANCELLED_BY_ADMIN` is written but has no notification or timeline mapping
  (see H2).

### L5 — The payment state machine guards two ways

The advance track uses blacklists (`!== NOT_REQUIRED && !== PAYMENT_CONFIRMED`); the damage
track uses whitelists (`=== UNTRACKED || === AWAITING_DEPOSIT`). Same intent, opposite shape —
so a guest may re-report an advance payment from `PAYMENT_REPORTED` but may not re-report a
damage deposit from `DEPOSIT_REPORTED`. Nothing in the model justifies the difference.

### L6 — `cancelBooking`'s admin branch is unchecked at the service layer

`booking.service.ts:691` verifies `userId` for `guest` and `host` and verifies nothing for
`admin`. Today the only caller passing `"admin"` is `adminCancelBooking`, behind
`requireAdmin()` — so this is currently safe. But the other two branches defend themselves and
this one delegates, which is exactly the asymmetry that gets missed when a second caller is
added.

### L7 — The review window opens a day late

`getReviewDeadline` = checkout at 10:00 UTC + 14 days. But the window only *opens* when
`completePastBookings` runs, which needs local-midnight `today >= checkOut` — the day after
checkout on a UTC+2 server. The advertised 14-day window is effectively 13.

Also, `getEligibleBooking` (`review.service.ts:80`) does not call `completePastBookings()`,
unlike the booking list/detail reads. A direct link to `/account/bookings/[id]/after-stay` can
report *"Ratings open after the stay is completed"* for a stay that ended.

Completion itself is only driven by the review-reminders timer
(`scripts/send-review-reminders.ts`), not the booking timer — so disabling review reminders
silently stops booking completion, which in turn (see C2) leaves payment tracking open. That
coupling is invisible from either script.

---

## Recommended improvements

Ordered by value per unit of work.

### Fix first

1. **Repair GDPR deletion (C1).** Anonymize rather than delete: null the guest/host linkage the
   way `Review.author` and `Message.sender` already do (`onDelete: SetNull` + a nullable column),
   or reassign to a tombstone user. Move the `usedAt` write inside the same transaction as
   `deleteUserAccount` so a failure does not burn the token. Refuse deletion up-front — with a
   clear message — while the user has a `CONFIRMED` future stay, instead of failing at the FK.

2. **Let payment tracking outlive the stay (C2).** Replace the `status !== "CONFIRMED"` guard
   with `status ∈ {CONFIRMED, COMPLETED}`. Gate the *set of allowed events* on status rather
   than the whole machine, and drop the blanket `return null` in `ProgressControls`. The deposit
   return leg is the one part of the deposit lifecycle that is *only* valid after completion.

3. **Pick one availability rule (C3).** Either make the server accept a stay covered by a
   contiguous union of windows (matching the calendar), or make the calendar complement windows
   individually without bridging (matching the server). The first is what hosts mean; the
   second is a two-line change. Whichever wins, `checkAvailability`, `createBooking`,
   `buildListingWhere` and `getBlockedDateRangesForListings` should call one shared helper —
   today the rule is written out four times.

### Close the guest-facing gaps

4. **Push `maxNights` and the self-booking check to the front (H1, H3).** `maxNights` belongs in
   `validateBookingSelection` alongside `minNights`, in the `BookingWidget` props, and in
   `buildListingWhere`. Self-booking belongs in `createBooking` next to the guest-count check,
   with the widget replaced by a "this is your listing" panel.

5. **Carry the full party onto the booking (H4).** Add `infantCount` / `petCount` columns and
   post them. They are already validated, already in the URL, and already shown to the guest —
   only the last hop is missing. The host sees "3 guests" today for a party that includes a dog.

6. **Ask the deposit question in the wizard (H5).** The `payment-arrangements` step already
   renders `PaymentArrangementsEditor`; extend the draft and `appendDraftToFormData` to carry
   the deposit sections and set `depositPoliciesReviewedAt` in `submitNewListing`. This removes
   the phantom "incomplete" task and stops every new listing quoting `UNANSWERED` to guests.

### Structural

7. **Make the deposit currency a live read (H6).** Resolve the currency from the pricing rule at
   snapshot time rather than from the stored column, and reject or re-prompt when the two
   disagree. Add an upper bound on `FIXED` advance payments relative to `totalPrice`.

8. **Give the booking flow one clock (M6).** `date-only.ts` already contains the right answer
   and the reasoning. Route `createBookingSchema`, `completePastBookings`,
   `getBlockedDateRangesForListings` and the payment-deadline floor through `todayYmd()` /
   `ymdToDbDate`, and switch `computeStayQuote`'s day iteration to the UTC-safe helpers so the
   quote stops depending on the server's zone.

9. **Make timeline events transactional (M7).** Write them in the same transaction as the status
   change, the way `completePastBookings` already does. Notification delivery can stay
   best-effort; the record of what happened should not.

10. **Collapse the accept paths (M1).** Delete `confirmBookingAction`, and route the mobile
    `confirm` through the same payment decision the web requires — or have it explicitly record
    `SEND_LATER` so the host gets the follow-up task rather than a silent `PENDING`.

11. **State a cancellation policy (M4).** Even a minimal one: no cancellation after check-in, a
    reason required from both sides, and a rate limit on `cancelBookingAction`. The absence is
    currently load-bearing — hosts have no protection against churn.

12. **Make the search price filter currency-aware (M5).** Convert the filter bounds into each
    listing's currency (`lib/currency/convert` already exists), or store a normalized
    base-currency rate column to filter and sort on. Filter on the same figure the card
    displays, not the base rate.

### Cleanup

13. Re-key `ROUTE_BY_STEP` to the wizard's actual routes (L1) — the 11-step vocabulary no longer
    describes the flow, and four screens currently share one id.
14. Map `CANCELLED_BY_ADMIN` through `notifyBookingEvent`, and notify the host (H2).
15. Sweep expired requests before counting them in `attention.service` (M8).
16. Add the booking guard to `unpublishListing` and `suspendListing`, or document why archive is
    stricter (M9).
17. Delete the `"SUPERADMIN"` branches, or add the role (L3). Type `role` as `UserRole` at the
    mobile boundary so the compiler catches the next one.
18. Unify the two guard styles in `nextStatuses` (L5) and add the `admin` authorization check to
    `cancelBooking` (L6).

---

## What was checked and found sound

Worth recording, so a future pass does not re-audit it:

- **Concurrency on booking creation.** `pg_advisory_xact_lock` plus a DB-level exclusion
  constraint, with the constraint error translated back to the friendly message. Correct and
  belt-and-braces.
- **Snapshot discipline.** House rules, payment methods, deposit policies and display currency
  are all frozen server-side from the row read inside the transaction, never from client input,
  and never rewritten. The V1→V2 deposit projection is lossless and read-time only.
- **Payment-detail confidentiality.** `paymentInstructionTemplates` is explicitly `omit`ted from
  every guest-facing booking read, and the reasoning is written down at each site.
- **Decimal arithmetic.** `deposit-money.ts` uses integer coefficients with explicit scale
  throughout; no binary float touches a money amount.
- **Account-deletion token handling.** Hashed at rest, single-use, TTL-bounded, and requires
  both the link and a matching session — with a `timingSafeEqual` comparison.
- **Promotion selection.** `computeStayQuote`'s free-cleaning-vs-nightly-percentage optimization
  genuinely maximizes guest savings and keeps one offer per night.
- **Idempotency.** Review invitations, reminder stages, booking email outbox entries and
  timeline events are all deduplicated by unique key rather than by check-then-write.
