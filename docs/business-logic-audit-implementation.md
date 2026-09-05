# Business-logic audit — implementation log

Companion to `business-logic-audit.md` (revision 5). One row per finding: what was
changed, where, and what now holds it.

**Final verification:** `npx tsc --noEmit` clean · `npm run lint` clean (5 pre-existing
warnings, none in the audit files) · `npm test` — **316 files, 3954 tests, all passing**
against the real local Postgres. See **Final QA hardening** below.

---

## Completed

### #7 — `maxNights = 0` in promotion validation

The promotion minimum was compared against the raw column, so a listing with no stay cap
(a state the Booking rules editor offers as "no maximum") could not create any promotion:
`5 > 0` produced *"The offer minimum cannot exceed 0 nights."*

- `src/lib/services/pricing-promotion-mutation.service.ts` — reads the cap through
  `stayLengthCap`, the reading booking, search and the host calendar already use.
- `src/lib/actions/fixed-stay.actions.ts` — the `.min(0)` message now describes the value
  it rejects (*"A maximum stay cannot be negative."*); it never fired for zero.
- `calendar-promotion-action.ts` — the ladder horizon also reads the cap through
  `stayLengthCap`; raw zero previously collapsed the ladder to zero rows even after offer
  creation itself had been repaired.

Tests: `pricing-promotion-mutation.service.test.ts` (+3), new
`src/lib/actions/__tests__/fixed-stay.actions.test.ts`. Both new promotion cases were
confirmed to fail against the pre-fix line.

### #16 — acceptance after check-in has passed

**Product decision: allow same-day booking, cut the answer off at check-in.**

`confirmBooking` guarded only on `PENDING` + `responseDueAt > now`, and `responseDueAt`
was an unconditional `createdAt + 24h`. A host could confirm a guest into a stay already
underway — and `cancelBooking` then refuses that guest's own cancellation.

- **New** `src/lib/services/booking-response-window.ts` — modelled on `review-window.ts`:
  `bookingAcceptanceCutoff` (the frozen arrival time, marketplace zone, 15:00 fallback),
  `bookingResponseDueAt` = `min(createdAt + 24h, cutoff)`, `bookingResponseWindowIsOpen`.
- `booking.service.ts` — the deadline and persisted `createdAt` are computed together only
  after all awaited validation and the listing-lock wait; creation is refused when the
  cutoff has already passed. `confirmBooking` captures its decision time after acquiring
  the same lock and re-reading the row; `rejectBooking` captures it after its read. Both
  expire (not accept/decline) past the cutoff, which also catches legacy rows carrying an
  unclamped deadline with no backfill.

Tests: new `booking-response-window.service.test.ts` (12, pure) and
`booking-acceptance-cutoff.service.test.ts` (7, DB-backed).

### #3 — `DAYS_BEFORE_CHECK_IN` deadlines created already overdue

- `src/lib/payments/booking-payment-request.ts` — new `clampDueDate` applied to every
  branch **and** to every returned obligation, so the guarantee is one sentence: nothing
  outside `[acceptedOn, checkIn]`. `acceptedOn` wins the tie when acceptance came later.

Tests: `payment-due-date-floors.test.ts` (+6), including a loop asserting no obligation is
`OVERDUE` on the day it is created — the auto-SENT cash/direct path the audit named.

### #4 — shared availability rule skipped past-date and stay limits for flexible listings

- **New** `src/lib/utils/stay-limits.ts` — the mode-neutral `StayLimits` contract,
  `stayLengthCap`, `exceedsMaxNights`, `stayLimitIssue`. `booking-selection` and
  `weekly-stay` now re-export from it, so the "zero means unlimited" rule has one
  definition instead of two hand-synchronised copies.
- `weekly-stay.ts` — `WeeklyStayLimits` is a deprecated alias; `weeklyStayCap` *is*
  `stayLengthCap`.
- `stay-availability.ts` — the flexible branch applies limits and `STAY_IN_PAST` before
  returning. Written **inside** the branch rather than hoisted, so weekly
  `WRONG_CHECK_IN_DAY`/`WRONG_CHECK_OUT_DAY` still outrank limit and past-date errors.
- `booking.service.ts` — `resolveBookingStay` calls `decideStayAvailability` for **both**
  modes; the duplicated flexible min/max block is gone. New `flexibleStayRefusal` keeps
  the existing guest-facing wording verbatim.
- `search.service.ts` — `staysInThePast` now gates `flexibleArm` too.

Tests: `stay-availability.test.ts` — the vacuous *"keeps minimum and maximum night rules in
force"* case (which asserted only `isFixedStayBookingMode("FLEXIBLE") === false`) is
replaced by 15 real ones, including a precedence block. `availability-agreement.service.
test.ts` gains the flexible-plus-limit and flexible-plus-past cells; the past-date case was
confirmed to fail without the search fix.

### #6 — promotion range check skipped the weekly rule

Landed **after** #4, as the audit requires.

- `listing-promotion.service.ts` — `bookingMode` and `changeoverWeekday` added to the
  `select`; the local windows/min/max block is replaced by `decideStayAvailability` plus
  the existing block query. New rejection reasons `WRONG_CHECK_IN_DAY`,
  `WRONG_CHECK_OUT_DAY`, `NO_CHANGEOVER_DAY`.
- `promotion-availability-picker.tsx` — host-facing copy for the three.

Tests: `listing-promotion.service.test.ts` (+12), including a block that pins flexible
min/max *after* centralising — the regression the audit warned about.

### #1 / #2 / #14 — the payment vocabulary, in one pass

**Product decision: a `*_REPORTED` claim opens a provisional obligation, not an
established one.**

*Vocabulary (#1).* `paymentStatus` is documented as the **accommodation balance**
(`total - advance`) in all three stale places: `schema.prisma`, the
`booking-payment-status.service.ts` header, and the event-group comment. The
`BookingPaymentStatus` enum gains the one written definition of reported-vs-confirmed the
audit asked for. The `HOST_MARK_PAYMENT_NOT_REQUIRED` cascade is re-justified in balance
terms. **No cascade was added to `HOST_CONFIRM_PAYMENT_RECEIVED`.**

*UI (#1).* `booking-payment-progress.tsx` — the bare "Payment: <status>" line is now a
priced track titled **Accommodation balance** showing `total − advance`, beside the other
two. Controls renamed ("Mark accommodation balance received"), and the balance track's
statuses now say who reported and who confirmed, like the other two tracks.

*Settlement (#2).* `cancellation-policy.ts` — `SettlementBasis`, `confirmedRefundAmount`,
`refundBasis`, `depositReturnBasis`; snapshot bumped to **version 2**, with version-1 rows
still read and reported as `UNKNOWN` rather than assumed confirmed. `cancelBooking` passes
both the received and the confirmed figures. The refund is still **opened** from a report —
a guest must not lose it to a silent host — but recorded and displayed as claimed. The
refund reminder says so too.

*Reminders (#14).* `booking-payment-reminder.service.ts` — the settled test is split: guest
reminders stop at `*_REPORTED`, the host's overdue notice continues to `*_CONFIRMED`.

Tests: new `settlement-provenance.test.ts` (11), new
`payment-report-obligations.service.test.ts` (6, DB-backed), `booking-payment-progress.
test.tsx` (+7).

### #10 — account deletion and open money

- `gdpr.service.ts` — a new `OPEN_OBLIGATION` refusal, with the four properties the audit
  required:
  - **Established money only.** An unreturned `DEPOSIT_CONFIRMED` deposit blocks the host;
    an `AWAITING_REFUND` blocks only when the settlement records `refundBasis: CONFIRMED`.
    `CLAIMED` and legacy `UNKNOWN` do **not** block — an unverified counterparty claim must
    not suspend erasure indefinitely.
  - **Symmetry.** `REFUND_REPORTED` and `RETURN_REPORTED` are treated alike; a report
    discharges the reporter's own obligation.
  - **Role sensitivity.** Host: money held or owed. Guest: money owed on a live booking
    (`AWAITING_PAYMENT` on either track).
  - **Bounded resolution.** Every refusal names the booking reference, the specific
    obligation and the support route.

Tests: new `account-deletion-obligations.service.test.ts` (13) — as much on what does *not*
block as on what does.

### #8 — zero-value promotion cleanup *(see "Audit inaccuracies" below)*

- `pricing-promotion-mutation.service.ts` — the cleaning-fee cascade now **disables**
  offers left with no benefit and clears the flag only on those that keep one, with
  success messages that say which happened.
- `stay-pricing.ts` — `promotionHasFreeCleaning` reads the `freeCleaning` column only; new
  `promotionGrantsBenefit` stops a valueless offer winning a night at all, so it can never
  be stamped onto a booking row or frozen into a price breakdown.

Tests: `pricing-promotion-mutation.service.test.ts` (+3), new DB-backed
`cleaning-fee-promotion-cascade.service.test.ts` (4), `stay-pricing-promotion.test.ts` (+1).

### #9 — host promotion ladder vs the real quote

- `stay-pricing.ts` — `selectApplicablePromotion` is marked `@deprecated` — whole-stay
  containment, display only. The rate-free `selectStayPromotionOutcome` approximation
  added in the first implementation pass was removed during QA because it could disagree
  with the quote when nightly overrides or free cleaning mattered.
- `calendar-promotion-action.ts` — bands call `computeStayQuote` itself with the listing's
  real base rate, cleaning fee and per-date prices. `selectionDraftCanWin` does the same,
  including the quote engine's booking-level free-cleaning optimisation. Bands carry
  `partial` when some nights receive no offer.
- `promotion-help.tsx` — a partial band renders as "N–M nights (covered nights only)"
  instead of vanishing.

Tests: `promotion-ladder-agreement.test.ts` compares ladder and quote directly at every
length from 1 to 15, and pins date-price and free-cleaning cases;
`calendar-promotion-action.test.ts` also pins the uncapped (`maxNights = 0`) horizon.

### #11 — cancellation email symmetry

- **Migration** `20260904120000_booking_email_host_cancelled_by_admin` — adds
  `HOST_CANCELLED_BY_ADMIN` to `BookingEmailKind` (additive `ALTER TYPE`).
- `booking.service.ts` — `GUEST_CANCELLED` always, plus the right host kind for guest and
  admin cancellations. A guest who cancels now gets their own written record; the host now
  hears about a support cancellation, worded as one.
- `email/index.ts`, `booking-email-outbox.service.ts`, `email/i18n/catalog.ts`,
  `email/i18n/email-translations.json` — the new template in all 15 email languages,
  generated with the same model, guidance and placeholder validation the other fourteen
  were.

Tests: new `cancellation-emails.service.test.ts` (5, DB-backed, asserting on the durable
outbox).

### #13 — participant access to an unpublished listing

- `property.service.ts` — new `getBookingParticipantListing(bookingId, userId)`, authorised
  on an **accepted** booking rather than mere membership, omitting the host's private
  payment templates. Confirmed stays retain the route while they are going ahead, and
  completed stays retain it as a record; cancelled, pending, rejected and expired stays
  cannot use it to expose current property details after a safety suspension.
  **`getListingBySlug` is untouched** — still public, still `APPROVED`-only, still
  `cache()`-memoised.
- **New** `src/app/(account)/account/bookings/[id]/listing/page.tsx` — renders house rules
  from the booking's own frozen snapshot where it has one, and says plainly that photos and
  description are the host's current ones.
- The booking page links there when the listing is not `APPROVED`.

Tests: `booking-participant-listing.service.test.ts` covers accepted access after
unpublishing/suspension, refusal after cancellation and for an unaccepted requester/stranger,
and pins that the public read still refuses a non-approved listing to everybody.

### #5 — `checkAvailability` removed

- `availability.service.ts` — the function is gone; the live blocked-range/calendar reads
  stay, with a note pointing a future guest endpoint at `decideStayAvailability` + a block
  query.
- The agreement suite now asks the **three live paths** (calendar selection, search,
  `createBooking`). `weekly-stay-booking.service.test.ts` asks the shared rule directly and
  proves the blocked-night case through `createBooking`, which is the path that enforces it.

### #15 — stale popularity scores

- `popularity.service.ts` — exported `NO_POPULARITY`; the sweep clears score and timestamp
  on every listing that has left `APPROVED` and still carries one. Both raw writes recheck
  status atomically: a concurrent unpublish cannot regain a score, and a concurrent
  republish cannot have its score erased. Reported update/clear counts now come from rows
  actually changed rather than the earlier snapshots.
- `listing-lifecycle.service.ts` — unpublish, archive and suspend clear it at the
  transition, so it is immediate rather than eventual.

Tests: new `popularity-staleness.service.test.ts` (6), covering both layers and republish.

---

## Completed during final QA

### #12 — `PricingRule.serviceFeePercent`

Confirmed dead: the only mentions anywhere are the `init` migration and the schema line,
and runtime pricing hardcodes `serviceFee = 0`. **Local database: 32 pricing rules, every
value `0.00`.**

The field has now been removed from `schema.prisma` and the architecture document.
Migration `20260905123000_drop_dead_pricing_rule_service_fee_percent` performs the cleanup
with a fail-closed data guard: if a deployed database contains any non-zero value, the
migration raises an exception **before** the `ALTER TABLE`, preserving the data instead of
silently guessing what it means. On the verified local zero-only database it applies and
drops the column. `Booking.serviceFee` remains the explicit zero-value booking snapshot;
wiring in a platform percentage would be a separate pricing feature.

---

## Audit statements that proved inaccurate

**#8's stated failure mode cannot occur.** The audit describes a promotion left as
`{type: FREE_CLEANING, discountPercent: 0, freeCleaning: false, disabledAt: null}` — "an
active offer worth nothing" — stamped onto bookings. The database forbids that row:
`ListingPromotion_benefit_check` (`20260730090000_promotion_scopes_and_benefits`) requires
`discountPercent > 0 OR freeCleaning = true`, and it is live.

What is really there is worse, and the audit's suggested fix repairs it: the cascade's
in-place `freeCleaning: false` raises a **check-constraint violation** on a
free-cleaning-only offer, which rolls back the entire pricing save. **A host with such an
offer could not set their cleaning fee to zero at all** — they got a raw Postgres error and
an unsaved price. Verified by probe before the fix, and pinned by
`cleaning-fee-promotion-cascade.service.test.ts`.

Consequently the `type` fallback in `promotionHasFreeCleaning` was dead rather than
dangerous (0 rows in the local database have `type = 'FREE_CLEANING'` with the column
false). It was still removed, as the audit suggests, plus a `promotionGrantsBenefit` guard —
both now defence in depth behind the constraint rather than the primary fix.

---

## Needs deployment planning

1. **Migrations.** `20260904120000_booking_email_host_cancelled_by_admin` and
   `20260905123000_drop_dead_pricing_rule_service_fee_percent` are applied locally and must
   run on production (`prisma migrate deploy`) before the new code. The fee-column
   migration deliberately aborts without dropping the column if it discovers a non-zero
   deployed value.
2. **`prisma generate`.** Completed locally after the migrations. CI/deployment should
   still generate from the deployed schema in its normal build sequence.
3. **Settlement snapshots.** New cancellations write `version: 2`. Version-1 rows are read
   unchanged and report `refundBasis: UNKNOWN`; **nothing backfills them**, and the deletion
   guard treats `UNKNOWN` as not-proven, so it will not block on a pre-existing refund.
4. **Popularity.** Existing non-`APPROVED` listings keep their stale score until the next
   `npm run popularity:recompute`. The sweep clears them; the transition writers only cover
   changes from here on.
5. **Legacy pending requests.** Rows created before #16 keep an unclamped `responseDueAt`.
   No backfill was written — `confirmBooking`/`rejectBooking` catch them from the cutoff, and
   they expire on the ordinary sweep at their stored deadline.

## Remaining risks

- **#13 shows current listing content, not what was sold.** The booking freezes house
  rules, payment methods and policies, but not the listing's photos and description. The
  page says so. A booking-time listing snapshot is the real fix and needs its own schema
  change.
- **#10's guest-side debt guard is new product behaviour.** A guest with an
  `AWAITING_PAYMENT` balance on a live booking is refused erasure until it is settled or
  support resolves it. That is the audit's "guest-side debts too" requirement, and it is
  worth a privacy/legal read before it ships — the refusal names the support route, but the
  policy for writing off a disputed obligation is not defined anywhere yet.

---

## Final QA hardening

The second-opinion pass found and fixed five gaps in the first implementation:

1. booking creation/acceptance timestamps could become stale while waiting for the
   listing advisory lock;
2. booking-scoped listing access was granted to any requester instead of accepted stays;
3. popularity scoring could race a publish-state transition between its read and write;
4. the promotion ladder still interpreted `maxNights = 0` as a zero-night horizon; and
5. the ladder's rate-free headline approximation could disagree with the real quote.

It also replaced a UTC-sensitive "today" test helper with `todayYmd()` so the availability
agreement suite remains correct across the Copenhagen/UTC midnight boundary.

Focused verification after those corrections: **10 files, 110 tests, all passing**
(`calendar-promotion-action`, promotion/quote agreement, participant listing access,
popularity staleness, response window, booking acceptance/cutoff/request flow and core
booking service, plus the availability agreement suite).

## Concurrent-worktree note

During the final full-suite run, a separate Arrival Guide/House rules implementation was
being added and removed in this same checkout. The run observed both its old and new
shapes: missing `db.booking.aggregate` mocks, an obsolete
`ARRIVAL_GUIDE_UNAVAILABLE_TOPICS` import, a newly added `checkInEndTime` absent from old
expectations, and finally generated Next validators pointing at an Arrival Guide page
that had just been removed. Those source changes were not overwritten. Once that work
settled, its additive migration was applied locally, Next route types were regenerated,
and its one remaining stale House-rules expectation was updated for `checkInEndTime`.
The clean TypeScript, lint and full-suite results at the top were taken after that point.
