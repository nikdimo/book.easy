# Business-logic consistency audit

**Date:** 2026-09-04
**Revision:** 5 — consolidated implementation audit
**Tree:** HEAD `1de1895` (`main`) **plus roughly 60 uncommitted working-tree changes** — chiefly under
`src/components/host/v2/calendar`, `src/lib/actions/pricing.actions.ts` and
`src/lib/services/pricing-promotion-mutation.service.ts`. Line numbers below are against that dirty tree,
not against the commit alone.
**Method:** direct read of the core business domains. No code was changed by this audit.

---

## Scope

**Covered:** `booking.service`, `booking-payment-status.service`, `booking-payment-reminder.service`,
`stay-pricing`, `booking-pricing`, `stay-availability`, `weekly-stay`, `availability.service`,
`availability-mutation.service`, `calendar-sync`, `search.service`, `listing-promotion.service`,
`pricing-promotion-mutation.service`, `cancellation-policy`, `deposit-*`, `review.service`,
`listing-lifecycle`, `gdpr.service`, plus `prisma/schema.prisma` and the actions/validation layer.

**Not covered:** i18n pipeline, marketing/consent, media/upload, chat, safety cases, admin surfaces,
and the Expo app under `mobile/`.

**General note.** This is an unusually disciplined codebase. The shared-rule pattern
(`decideStayAvailability`, `computeStayQuote`, `resolveBookingPricing`, the `TRANSITIONS` table) does
most of the work of keeping surfaces in agreement. Nearly every finding below is a place where a rule
*claims* to be shared but one caller took a different path.

---

## Findings at a glance

| # | Severity | Finding | Primary file |
|---|----------|---------|--------------|
| 1 | Medium | `paymentStatus` is documented and labelled as the whole price, implemented as the balance | `schema.prisma:1695` |
| 2 | High | An unverified guest payment report creates a real host refund obligation | `booking.service.ts:1175` |
| 3 | Medium | `DAYS_BEFORE_CHECK_IN` deadlines can be created already overdue | `booking-payment-request.ts:36` |
| 4 | Medium | Shared availability rule omits past-date **and** stay-limit checks for flexible listings | `stay-availability.ts:133` |
| 5 | Low | `checkAvailability` has no production callers | `availability.service.ts:32` |
| 6 | Medium | Promotion range check skips the weekly changeover rule | `listing-promotion.service.ts:204` |
| 7 | Medium | Promotion min-stay validation ignores the "0 means no cap" convention | `pricing-promotion-mutation.service.ts:273` |
| 8 | Low | Clearing a cleaning fee leaves a zero-value promotion active and stamped on bookings | `pricing-promotion-mutation.service.ts:200` |
| 9 | Medium | Host promotion ladder and the real quote use different window semantics | `calendar-promotion-action.ts:211` |
| 10 | Medium | Account deletion blocks confirmed stays but not open refund/deposit obligations | `gdpr.service.ts:488` |
| 11 | Low | Admin cancellation emails only the guest | `booking.service.ts:1308` |
| 12 | Low | `PricingRule.serviceFeePercent` is a live money column nothing reads | `schema.prisma:1428` |
| 13 | Low | Unpublishing or suspension breaks listing access for guests with confirmed stays | `listing-lifecycle.service.ts:46` |
| 14 | Low | Reminders keep nudging a guest who already reported paying | `booking-payment-reminder.service.ts:88` |
| 15 | Low | A listing that leaves `APPROVED` keeps its last popularity score forever | `popularity.service.ts` |
| 16 | Medium | A pending booking can be accepted after its check-in has passed | `booking.service.ts:1693` |

---

## Findings in detail

Ordered by finding number, not by severity — severity is in the table above.

### 1. `paymentStatus` is documented and labelled as the whole price, but implemented as the balance

The runtime amount handling is consistent: `paymentStatus` is the remaining accommodation balance
everywhere it is read. Confirming it means "I received the balance", and refunding only the balance when
the advance is unconfirmed is correct. The defect is a documentation and UI-labelling contradiction, not
an arithmetic error. Do not cascade `HOST_CONFIRM_PAYMENT_RECEIVED` into advance confirmation; that would
assert receipt of money the host never confirmed.

`prisma/schema.prisma:1695` documents `paymentStatus` as *"Progress on the booking price as a whole.
The advance payment below is a part of this sum."* The implementation says the opposite, consistently:

- `src/lib/services/booking.service.ts:1180` — *"In the split request model paymentStatus tracks the
  accommodation balance"*, and the settlement computes `balanceAmount = totalPrice - advanceAmount`.
- `bookingPaymentObligations` creates `ACCOMMODATION_BALANCE = total - advance` and the reminder loop
  gates that request on `paymentStatus`.
- `src/lib/services/booking-payment-status.service.ts:60` maps `GUEST_REPORT_PAYMENT_SENT` to the
  private-record track `"ACCOMMODATION_BALANCE"`.

Three independent call sites agree on the balance reading.

The schema comment is not the only stale description. The state machine's header calls track 1 *"the
booking price as a whole (`paymentStatus`)"* (`booking-payment-status.service.ts:16`), and the event list
groups the four `*_PAYMENT_*` events under *"The booking price as a whole"* (`:29`). Every path that
touches an **amount** uses the balance interpretation; several comments and one cascade still use the
whole-price vocabulary.

**Why it still matters.** `src/components/booking/booking-payment-progress.tsx:395` labels the control
"Mark payment received" and renders the Payment track **without an amount**, while the advance and damage
tracks each show their frozen figure. A host looking at a booking with a 200 EUR advance has no way to
tell that "payment" means the other 800 EUR. The mislabelling does not corrupt the arithmetic, but it
invites the host to click it meaning "everything is settled".

**One genuine residue.** `HOST_MARK_PAYMENT_NOT_REQUIRED` carries the only cascade in the transition
table, and its justification reads the whole-price meaning: *"the advance payment is documented as part
of `totalPrice`. Waiving the price while leaving the advance `AWAITING_PAYMENT` asked the guest to send
money toward a price the host had just given up on."* Under the balance reading that the rest of the code
uses, waiving the balance says nothing about the advance. The cascade is defensible as product intent
(the host waived everything), but it is the one place the stale reading is encoded in behaviour rather
than in a comment, and it should be re-justified in the balance vocabulary rather than the whole-price one.

**Suggestions**

- Rewrite the doc in all three places — `schema.prisma:1695`, `booking-payment-status.service.ts:16` and
  the event-group comment at `:29` — to say what the code does: `paymentStatus` is the *accommodation
  balance* track, equal to the whole price only when there is no advance.
- Rename the track in the UI to "Accommodation balance" and render `total - advance` beside it, the same
  way the other two tracks show their amount. This is the fix that actually removes the hazard.
- Re-word the `HOST_MARK_PAYMENT_NOT_REQUIRED` cascade comment in balance terms, or make the waive action
  explicitly a "waive everything outstanding" control so the cascade matches its label.
- Do **not** add a cascade to `HOST_CONFIRM_PAYMENT_RECEIVED`.

### 2. A guest's unverified payment report creates a real refund obligation for the host

`src/lib/services/booking.service.ts:1175-1205`. Settlement treats `PAYMENT_REPORTED` /
`DEPOSIT_REPORTED` as money received:

```js
const advanceReceived = ["PAYMENT_REPORTED", "PAYMENT_CONFIRMED"].includes(...)
```

`PAYMENT_REPORTED` is, by the state machine's own definition, *"one side's own claim"* — the guest's,
unilaterally, with no host confirmation. On cancellation that claim opens `AWAITING_REFUND` with a
positive amount, writes a `CANCELLATION_OPENED_ACCOMMODATION_REFUND` event, and starts sending the host
escalating "Accommodation refund due" / overdue notifications.

The same status is distrusted in a different service:
`src/lib/services/booking-payment-reminder.service.ts:88` counts a request as `settled` only on
`PAYMENT_CONFIRMED` / `NOT_REQUIRED`, so a guest who reported paying keeps getting "Payment reminder"
nudges. One module trusts the report enough to bill the host; the other does not trust it enough to stop
nagging the guest.

**Suggestion.** This needs a product decision, not just a code fix — the two readings protect different
people. Settling only on `*_CONFIRMED` protects a host from being billed for money they never received;
treating a report as received protects a guest whose host simply refuses to confirm. A third option, and
probably the right one, is a distinct *claimed / disputed* refund state: the obligation is visible to both
sides and to support, but it is not presented as an established debt until confirmed.

What must be shared is the *meaning* of each status, not necessarily the threshold every consumer applies.
For example: stop reminding a guest once they report, keep notifying the host until they confirm, and
represent a cancellation refund built on an unconfirmed report as provisional rather than settled. Those
are three legitimate decisions only if they use one explicit status vocabulary.

### 3. Automatic payment deadlines can be created already overdue

`src/lib/payments/booking-payment-request.ts:36`:

```js
if (policy.dueTiming === "DAYS_BEFORE_CHECK_IN") {
  return addDaysToYmd(checkIn, -(policy.dueDaysBeforeCheckIn ?? 0));
}
```

No floor at `acceptedOn`. A host with a "due 14 days before check-in" advance policy who accepts a request
3 days before check-in creates a `BookingPaymentRequest` with `dueAt` 11 days in the past.
`derivePaymentReminderState` returns `OVERDUE` immediately, so the guest gets an overdue notice for a
deadline they were never told about — and so does the host.

The manual path already has the floor: `sendBookingPaymentRequestAction` in
`src/lib/actions/booking.actions.ts` refuses `dueDate < today || dueDate > checkIn`. And the
`AFTER_ACCEPTANCE` branch was specifically hardened against "already overdue the moment it is created"
(there is a test named that in `src/lib/payments/payment-due-date-floors.test.ts`) — the fix just was not
applied to the sibling branch.

**Narrower than it first appears.** Requests created at acceptance are normally `DRAFT`, and the reminder
job only reads `status: "SENT"`, so a host who later sends the request manually gets a freshly validated
deadline and the stale one never fires. The exposed path is cash-at-property and arrange-directly: those
are auto-marked `SENT` at acceptance (`src/lib/services/booking.service.ts:1837`) precisely because there
are no private details to review, so they go straight into the reminder loop with the unclamped date.

**Suggestion.** Clamp both branches to `[acceptedOn, checkIn]` inside `policyDueDate`, and extend the
floors test to cover `DAYS_BEFORE_CHECK_IN` with a late acceptance.

### 4. The shared availability rule skips *two* listing-wide rules for flexible listings

Finding 4 is inside `decideStayAvailability`: its flexible early return sits above the past-date check and
the call that applies `limits`. Finding 6 is a separate live caller that does not use this helper at all;
it reimplements part of the rule and omits the weekly shape. They share an architectural failure mode —
availability policy has drifted between implementations — but they are not the same code defect.

`decideStayAvailability` accepts `limits: { minNights, maxNights }` but returns from its flexible branch
before using them. This is not entirely silent: the `StayAvailabilityInput` documentation at
`stay-availability.ts:55` explicitly says limits are consulted only in the weekly branch. That documented
contract is itself inconsistent with the current system rule: search and `createBooking` both apply stay
limits to flexible and weekly listings.

**The trap this sets.** `checkAvailability` selects `pricingRule: { minNights, maxNights }` and passes them
at `availability.service.ts:72`, but they have no effect for flexible listings. The caller therefore
disagrees with search and booking despite supplying the data needed to agree. A future caller may make the
same mistake unless the helper's contract and implementation are brought back in line with the
listing-wide policy.

The test that should have caught it does not. `src/lib/utils/__tests__/stay-availability.test.ts` contains:

```js
it("keeps minimum and maximum night rules in force", () => {
  expect(isFixedStayBookingMode("FLEXIBLE")).toBe(false);
});
```

The name asserts limits are enforced; the body asserts only that `"FLEXIBLE"` is not fixed mode. It tests
nothing about limits, and its name is actively misleading to anyone auditing this area.

`src/lib/utils/stay-availability.ts:133-151` — the flexible branch returns *before* the past-date check:

```js
if (!isFixedStayBookingMode(input.bookingMode)) {
  return { offered: true, fixedStayPeriodId: null };   // <- returns here
}
// ... weekly shape checks ...
// "A stay that has already begun is nobody's to take, whatever its shape."
if (compareYmd(input.checkIn, input.today) < 0) return { offered: false, reason: "STAY_IN_PAST" };
```

The comment states the rule as universal; the placement makes it weekly-only. This propagates:

- `createBooking` only calls `decideStayAvailability` for weekly listings
  (`src/lib/services/booking.service.ts:559`), so **the booking transaction has no past-date check for
  flexible listings at all**.
- Search applies `staysInThePast` to the weekly arm only — `src/lib/services/search.service.ts:325`
  builds `flexibleArm` without it, under a comment claiming it is "the same rule `decideStayAvailability`
  and `createBooking` apply".
- `checkAvailability` returns `available: true` for a flexible listing with a past check-in.

`createBooking` compensates for the limits half — it applies `minNights`/`maxNights` itself at
`booking.service.ts:799` for the flexible branch — and the Zod refinement at
`src/lib/validations/booking.schema.ts:102` compensates for the past-date half, reached through the sole
production caller (`src/lib/actions/booking.actions.ts:80`). **So this is not an exploitable booking path
today.** It is a missing defence-in-depth layer, a real search-consistency defect (past-dated searches
list flexible listings as bookable), and an inconsistency in the unused `checkAvailability` read.
Finding 6 is a separate live defect caused by bypassing this helper, not by trusting it.

The service boundary is under-protected, but a future second caller would only expose the booking path if
it also failed to run equivalent input validation.

**Suggestion.** Complete the shared rule without changing weekly error precedence:

1. Rename or extract `WeeklyStayLimits` as a mode-neutral `StayLimits` contract, and update the
   `StayAvailabilityInput` documentation. These are listing-wide limits even though weekly validation is
   one consumer.
2. Add the limit check inside the **flexible** branch before its `offered: true` return. Keep weekly limits
   inside `weeklyStayIssue`, where `WRONG_CHECK_IN_DAY` / `WRONG_CHECK_OUT_DAY` deliberately take priority
   over `BELOW_MINIMUM` / `ABOVE_MAXIMUM`. Do not hoist a common limit check ahead of the weekly shape.
3. Add `STAY_IN_PAST` to the flexible branch before it returns. Leaving the existing weekly past check
   after `weeklyStayIssue` preserves current weekly messages. If the product instead wants past dates to
   outrank weekly shape errors, hoist the past check deliberately and pin that changed precedence in tests.
4. Then call `decideStayAvailability` unconditionally from `resolveBookingStay` and delete the duplicated
   flexible min/max block at `booking.service.ts:799`.
5. Add `staysInThePast` to `flexibleArm` in `search.service.ts`.
6. Replace the vacuous test with cases that exercise flexible min/max limits and past check-ins, plus a
   weekly case that asserts shape errors still outrank limit errors.

### 5. `checkAvailability` has no production callers

Grep turns up only tests. `src/lib/services/availability.service.ts:32` is documented as *"the shared read
behind every 'is it free?' question"*, but nothing in `src/app`, `src/components` or the mobile API calls
that function.

The DB-backed agreement suite (`src/lib/services/__tests__/availability-agreement.service.test.ts:18`)
actually asks **four** paths: the guest calendar, search, `checkAvailability` and `createBooking`. One is
unused, while the calendar, search and booking paths are live. The suite's existing cases do not cover the
flexible-plus-past or flexible-plus-limit cells, which is how finding 4 stayed invisible.

The similarly named mobile route is not a caller:
`src/app/api/mobile/v1/listings/[id]/availability/route.ts` is a **host-authenticated calendar-management**
route (`requireMobileHost`) returning blocks, windows, date prices and promotions. It is not a guest "can
I book these dates?" endpoint. Because `checkAvailability` has no production effect, this is architectural
debt and a misleading doc comment rather than a user-facing defect.

**Suggestion.** Delete the unused `checkAvailability` function (not the blocked-range reads in the same
service) unless a concrete guest API is about to use it. Keep the agreement suite and re-point it at all
**three** live paths: the public calendar/booking selection, search and `createBooking`. If a guest-facing
availability endpoint is built later, add that endpoint to the same agreement test.

### 6. Facebook/promotion range check skips the weekly rule

`src/lib/services/listing-promotion.service.ts:204`. The doc above `checkPromotionRange` says:

> The rule is deliberately the booking rule... A separate "close enough" check here would eventually
> disagree with the booking service, and the failure mode is a host publishing dates to a Facebook group
> that nobody can actually book.

The `select` reads `availabilityMode`, `pricingRule.minNights/maxNights` and `availabilityWindows` — but
**not** `bookingMode` or `changeoverWeekday`. A weekly-stay host can therefore validate and publish a
Tue-to-Fri range that `createBooking` refuses with "Check-in must be on a Saturday". That is exactly the
described failure mode.

**Regression risk.** Routing this check through `decideStayAvailability` as it stands today would remove
minimum- and maximum-stay enforcement from promotion validation for flexible listings, because the helper
does not apply `limits` in that branch (finding 4). A flexible listing could then advertise a 2-night stay
under a 5-night minimum.

**Suggestion.** Fix finding 4 first, then this one becomes safe and trivial:

1. Land the finding-4 change that adds limits and the past-date rule to the flexible branch without
   disturbing weekly error precedence.
2. Add `bookingMode` and `changeoverWeekday` to the `select` here.
3. Only then replace the local windows/min/max block with a `decideStayAvailability` call plus the
   existing block query.

If finding 4 is not being taken yet, do **not** do step 3 — add the weekly rule alongside the existing
local checks instead, keeping the min/max code exactly where it is.

### 7. Promotion minimum-stay validation ignores the "0 means no cap" convention

`src/lib/services/pricing-promotion-mutation.service.ts:273`:

```js
if (data.minimumNights > pricingRule.maxNights) {
  return { error: `The offer minimum cannot exceed ${pricingRule.maxNights} nights.` };
}
```

Everywhere else a stored `maxNights` of `0` means *no maximum* — `exceedsMaxNights`, `stayLengthCap`,
`weeklyStayCap`, `statedStayCap`, and the SQL in `buildListingWhere`
(`OR: [{ maxNights: { lt: 1 } }, ...]`) all agree, and each has a comment saying so. This line reads it as
a literal ceiling.

This state is reachable through the supported host UI. `setListingStayLimits` accepts zero at
`src/lib/actions/fixed-stay.actions.ts:55`, and the Booking rules editor exposes zero as "no maximum"
(`src/components/host/v2/editor/booking-rules-editor.tsx:458`). No import or manual database write is
needed to create an affected listing. The schema's `.min(0)` error text — "A maximum stay must be at least
1 night" — is also contradictory: it is shown only for negative input while zero is intentionally valid.

**Result:** a host whose listing has no stay cap cannot create *any* promotion, and gets the message
"The offer minimum cannot exceed 0 nights."

**Suggestion.**

```js
const cap = stayLengthCap(pricingRule.maxNights);
if (cap !== null && data.minimumNights > cap) { /* ... */ }
```

Also change the `.min(0)` validation message to something accurate, such as "A maximum stay cannot be
negative." Do not reject a promotion minimum merely because it is shorter than the weekly stay shape: a
3-night promotion minimum on a listing selling 7-night stays validly means the promotion applies to every
offered stay.

### 8. Clearing a cleaning fee leaves a zero-value promotion active and stamped on bookings

The guest does not currently see a "Free cleaning" badge in this state:
`src/app/(account)/account/bookings/[id]/page.tsx:194` gates the whole promotion row on
`pricing.discountAmount > 0`, which is zero here. This is therefore a data-quality problem rather than a
current display defect.

`src/lib/services/pricing-promotion-mutation.service.ts:200-212`. Setting `cleaningFee` to 0 flips
`freeCleaning: false` on active promotions but leaves `type` and `discountPercent` alone. A promotion
created as free-cleaning-only ends up as
`{ type: FREE_CLEANING, discountPercent: 0, freeCleaning: false, disabledAt: null }` — an active offer
worth nothing.

It then still wins nights, because the reader ORs the type back in — `src/lib/utils/stay-pricing.ts:245`:

```js
return Boolean(promotion.freeCleaning || promotion.type === "FREE_CLEANING");
```

So `computeStayQuote` sets `promotionEligible: true` and `createBooking` stamps `promotionId` and
`promotionType: FREE_CLEANING` onto the booking row and its frozen `priceBreakdown.appliedPromotion`,
against a discount of zero. Nothing renders it today, but it is a permanent, un-rewritable snapshot
claiming an offer that never applied — and any future reporting, host analytics, or "offers used" surface
that reads `promotionId` will count it.

Note the mutation is careful to guard the *creation* path (`freeCleaning && cleaningFee <= 0` gives an
error); it is only the cascade that leaves the inconsistent row behind.

**Suggestions**

- `promotionHasFreeCleaning` should read the `freeCleaning` column only; the `type` fallback defeats the
  very write that clears it. (Keep the type for display and legacy reads.)
- In the cascade, disable (`disabledAt`) any promotion left with `discountPercent === 0 && !freeCleaning`
  instead of leaving it active, and say so in the success message.

### 9. Host promotion ladder and the actual quote use different promotion-window semantics

Two window rules coexist in `src/lib/utils/stay-pricing.ts`:

- `promotionCoversNightKey` — per-night, `start <= night < end`. This is what `computeStayQuote`, and
  therefore `createBooking`, actually price with.
- `selectApplicablePromotion` — whole-stay containment, `checkIn >= start && checkOut <= end`. Used by
  `src/lib/host/v2/calendar-promotion-action.ts:211` to build the host's promotion ladder, under a comment
  saying it asks *"the same function the booking transaction prices with."* It is not.

**Divergence.** A stay that overruns the promotion window gets a *partial* discount from the quote
(covered nights only) but shows as **no offer at all** on the host's ladder. The host is told their offer
stops applying at N nights when it actually keeps discounting the nights inside the window.

**Suggestion.** Derive the ladder from `computeStayQuote(...).appliedPromotions` per stay length, or mark
`selectApplicablePromotion` `@deprecated` and document it as "whole-stay containment, display only —
never the pricing rule".

### 10. Account deletion blocks on confirmed stays but not on open money

Pending requests are handled deliberately. `src/lib/services/gdpr.service.ts:772` withdraws a deleting
guest's pending requests, releases their holds and writes timeline entries. Pending requests at a deleting
host's listings are left to expire through the normal sweep so the guest receives the expiry mail; the
host's listings are archived at `gdpr.service.ts:743`, so they cannot subsequently be accepted. No change
is needed for pending requests. The financial gap below remains.

`src/lib/services/gdpr.service.ts:488` refuses deletion only for `status: 'CONFIRMED'` with
`checkOut >= today`. Open financial obligations are not covered: a host with
`accommodationRefundStatus: AWAITING_REFUND` on a cancelled booking, or an unreturned `DEPOSIT_CONFIRMED`
damage deposit, can erase themselves. The refund/return reminder job then keeps targeting a deleted user,
and the guest loses the counterparty to an obligation the platform itself opened and recorded.

Do not implement this as a simple list of every non-terminal money status. `DEPOSIT_REPORTED` is a
unilateral guest claim, so treating it as a deletion blocker would answer finding 2 before that product
decision is made. The two outbound tracks must also remain symmetric: `RETURN_REPORTED` (host reports a
deposit return) and `REFUND_REPORTED` (host reports an accommodation refund) represent the same kind of
unconfirmed counterparty claim.

**Suggestion.** This guard cannot be finalised before finding 2 decides what a reported status means.
When it is written, the guard needs four properties:

- **Symmetry.** `REFUND_REPORTED` and `RETURN_REPORTED` are the same situation on two tracks and must be
  treated alike.
- **Role sensitivity.** What blocks a *host* (money they owe) is not what blocks a *guest* (money they
  owe, or money owed to them that they would lose the ability to confirm).
- **Guest-side debts too.** The draft only considered money the host might owe. A guest with an
  outstanding accommodation balance is also mid-obligation.
- **A bounded resolution path.** An unverified counterparty report must not become an indefinite
  product-level blocker. Define with privacy/legal review how a disputed obligation is settled, written
  off, retained or anonymised so erasure can proceed when appropriate. The refusal message should name
  the specific obligation and the support route — not just block.

Only `DEPOSIT_CONFIRMED` is unambiguous enough for a narrow first increment. `AWAITING_REFUND` can be
opened from a settlement that counted `PAYMENT_REPORTED` or `DEPOSIT_REPORTED` as received, so the status
alone does not prove confirmed money moved. Blocking on `AWAITING_REFUND` must wait for finding 2, or
inspect provenance and block only where the refundable amount came from confirmed receipt.

### 11. Admin cancellation notifies only the guest by email

`src/lib/services/booking.service.ts:1308`:

```js
cancelledBy === "guest" ? HOST_CANCELLED_BY_GUEST : GUEST_CANCELLED
```

`"admin"` falls into the else-branch, so support-initiated cancellation emails the guest and sends the
host nothing. In-app notifications handle the admin case correctly for both parties
(`src/lib/services/notification.service.ts:350`), so it is only the durable email outbox that is
asymmetric — and email is the channel that reaches someone who is not logged in.

Related: guest-initiated cancellation sends no email to the guest, so a guest who cancels late (and owes a
retention, or is owed a refund) gets no written record of the settlement terms.

**Suggestion.** Add `HOST_CANCELLED_BY_ADMIN` (and optionally `GUEST_CANCELLED_BY_SELF` carrying the
settlement summary) to `BookingEmailKind` and the dispatch switch.

### 12. `PricingRule.serviceFeePercent` is a live column nothing reads

`prisma/schema.prisma:1428` defines it; nothing in `src/`, `prisma/` or `scripts/` ever reads or writes
it. Meanwhile `src/lib/services/booking.service.ts:873` hardcodes `const serviceFee = 0`. If that column
is ever populated — by an import, a seed, or a future admin screen — every quote will silently keep
charging zero, while the `booking-pricing` reconciliation
(`accommodation + cleaning + service === total`) continues to hold and hides it.

**Suggestion.** There is no supported writer, seed or importer for this column, while runtime pricing
explicitly charges zero. Treat removal as the cleanup default, after checking deployed databases for any
non-zero values. Wiring it into `computeStayQuote` would introduce a pricing feature and should be a
separate product project with its own rollout, display, snapshot and reconciliation work.

### 13. Unpublishing or suspension breaks listing access for guests with confirmed stays

`src/lib/services/listing-lifecycle.service.ts:46` blocks only on `PENDING`. `archiveOwnedListing` blocks
on `PENDING` and `CONFIRMED`. A host can therefore unpublish with a guest arriving next week. Honouring
the existing booking is the right call; the broken part is what the guest sees.

**Concrete consequence.** The guest's own booking page links to the public listing —
`src/app/(account)/account/bookings/[id]/page.tsx:111` renders
`<Link href={`/properties/${booking.listing.slug}`}>` around the hero image — while
`getListingBySlug` requires `status: APPROVED` (`src/lib/services/property.service.ts:13`). So a guest
with a confirmed, paid-for stay clicks the photo of the place they are staying in and gets a 404. The same
holds after `suspendListingForAdmin`, which performs no booking writes at all.

**Suggestion.** Do not forbid unpublishing, and do not make `getListingBySlug` return non-`APPROVED`
listings to signed-in participants. It is the public, `cache()`-memoised read behind the public property
route; making it auth-dependent risks leaking a suspended listing into a public render — especially when
the listing was suspended for a safety reason and public invisibility is the point.

Keep the public read public. Instead, give the guest a participant-scoped surface: either a separate
booking-scoped query behind a `/account/bookings/[id]/listing` style URL that authorises on booking
membership, or — better — render from a booking-time listing snapshot, which also fixes the related
problem that a guest currently sees the host's *current* photos and description rather than what they
booked. Failing either, make the link on `page.tsx:111` non-navigable when the listing is not `APPROVED`,
which is a one-line stopgap. Separately, after an admin suspension, surface the confirmed stays that now
need a decision rather than leaving them silently in place.

### 14. Reminders keep nudging a guest who already reported paying

`src/lib/services/booking-payment-reminder.service.ts:88` — see #2. Even if reports stay untrusted for
settlement, the *guest-facing* reminder ("A booking payment needs your attention") should not fire once
that guest has reported sending. The host-facing overdue notice legitimately should.

**Suggestion.** Split the settled test — guest reminders stop at `*_REPORTED`, host reminders continue to
`*_CONFIRMED`.

### 15. Popularity: a listing that leaves `APPROVED` keeps its last score forever

`src/lib/services/popularity.service.ts` scores only `status: APPROVED` listings, so an unpublished or
suspended listing retains a stale `popularityScore` and `popularityUpdatedAt` indefinitely. Harmless while
it is filtered out of search, but it will resurface with a months-old score the moment it is republished.

Also minor: the view endpoint checks the listing is `APPROVED` (so a host cannot seed a score for their
own draft — there is an explicit comment saying so) but performs no authenticated-user or ownership check,
so a host refreshing their own *live* listing does count toward its popularity. Daily deduplication by
visitor key keeps the ceiling low.

### 16. A pending booking can be accepted after its check-in has passed

`createBooking` permits `checkIn === today` (the Zod refinement is `checkIn >= today`) and unconditionally
grants the host a 24-hour response window — `responseDueAt = createdAt + 24h`
(`src/lib/services/booking.service.ts:637`). The window is never clamped to the stay.

`confirmBooking` then guards on exactly two things (`booking.service.ts:1689-1693`): the booking is still
`PENDING`, and `responseDueAt > now`. **It never compares `checkIn` to today.**

**Failure case.** A guest books at 23:00 on the 10th for a stay beginning the 10th. `responseDueAt` is
23:00 on the 11th. The host accepts at 10:00 on the 11th — inside the window, so it is allowed. The
booking is confirmed while the stay is already underway, a night into it.

**The sting is in the next line.** `cancelBooking` refuses guest cancellation of a `CONFIRMED` booking
once `checkIn <= today` (`booking.service.ts:1159`), directing them to support. So the guest is confirmed
into a stay that has already started and is *immediately* unable to cancel it through the ordinary flow —
they never had a single moment in which self-service cancellation was available to them.

**Sharper variant.** For a one-night stay the same sequence can produce `PENDING → CONFIRMED → COMPLETED`
within minutes: acceptance at 22:00 on the 11th for a stay of 10th→11th passes both guards, and the very
next `completePastBookings` sweep finds `checkOut <= today` with the frozen checkout time already past,
completes it, and fires review invitations for a stay the guest may never have taken.

**Suggestion.** Add a calendar guard to `confirmBooking` beside the expiry guard, expiring the request
rather than merely erroring — the request genuinely is dead, and the existing expiry branch already
writes the `EXPIRED` transition, releases the hold and mails the guest. Then choose one internally
consistent product policy:

- **No same-day bookings:** reject creation when `checkIn <= today`, expire any legacy pending request on
  that boundary, and clamp `responseDueAt` to the start of the check-in day. This removes same-day booking
  end to end, not merely same-day host acceptance; it is a product and revenue decision, not just deadline
  arithmetic.
- **Allow same-day acceptance:** define a real same-day cutoff, preferably from the frozen check-in time
  in the booking's house-rules snapshot (with a documented fallback and marketplace timezone). Clamp
  `responseDueAt` to `min(createdAt + 24h, cutoff)`, expire at that cutoff, and reject creation if the
  calculated deadline is not in the future.

Do not combine same-day booking with a start-of-day deadline: that would create same-day requests already
expired.

---

## Cross-cutting suggestions

### The "shared rule" pattern needs executable agreement, not just a comment

Findings #4, #5, #6 and #9 show two related failure modes: a shared helper can have an incomplete or stale
contract, and a caller can bypass the helper by re-deriving only part of the rule. The comments are
excellent and were *not* enough. Two concrete moves:

1. **Make the shared rules the only exported surface — but only once they are complete.** Refactoring
   finding 6 onto `decideStayAvailability` *today* would spread its flexible-branch gap to promotion
   validation. Complete the helper first, then centralise. Where SQL genuinely cannot call in (the search
   filter), keep the narrow-then-decide pattern already used by `closedListingIdsOpenForStay`.
2. **Add a property-style agreement test** that generates controlled `(listing config, date pair)` cases
   and compares all live answers: public calendar/booking selection, search and `createBooking` — plus
   `checkAvailability` only if that function is retained. Cover both booking modes, past dates and stay
   limits while holding unrelated requirements such as approval, capacity and overlapping blocks valid.

### Money-status vocabulary needs one written definition

Findings #1, #2 and #14 all trace to `PAYMENT_REPORTED` and `paymentStatus` meaning different things in
the schema doc, the settlement calculator, the reminder job and the UI label. One short doc block on
`BookingPaymentStatus` in the schema — stating which track covers which amount, and whether a `REPORTED`
claim creates an obligation — would resolve all three, and the code changes follow from it.

### "Zero means no cap" deserves a named type

`maxNights === 0` meaning "unlimited" is correctly handled in five places and wrong in a sixth (#7).
A `type StayCap = number | null` with `stayLengthCap()` as the only way to construct one would make the
raw column unusable by accident.

---

## Suggested order of work

Two dependencies matter:

- **#4 must land before refactoring #6 onto the shared helper.** The minimal #6 fix — adding the weekly
  rule beside its current local checks — is safe independently. What is unsafe is replacing those local
  checks with the helper before the helper enforces listing-wide limits.
- **#2 must be decided before the final #10 predicate.** A narrow guard for an unreturned
  `DEPOSIT_CONFIRMED` can land first, but `AWAITING_REFUND` is not independently safe because it may have
  been derived from an unconfirmed report.

1. **#7** — the `maxNights = 0` promotion validation and contradictory negative-value message. The
   affected state is writable through the supported Booking rules editor, and the functional fix is small.
2. **#16** — choose the same-day policy, refuse or expire acceptance after its resulting cutoff, and
   clamp `responseDueAt` to that cutoff. Contained, and it closes a state a guest cannot get out of.
3. **#3** — clamp automatic deadlines to `[acceptedOn, checkIn]`.
4. **#4** — introduce a mode-neutral stay-limit contract, apply limits and the past-date rule inside the
   flexible branch, preserve weekly shape-before-limit precedence, call the corrected helper from both
   booking modes, add `staysInThePast` to `flexibleArm`, and replace the vacuous test.
5. **#6** — after #4, centralise promotion validation on the corrected shared rule; or land the smaller
   independent fix earlier by adding the weekly rule beside its existing local checks.
6. **Settle the payment vocabulary in one pass — #1, #2, #14.** Decide what `paymentStatus` covers and
   whether an unconfirmed report creates an obligation, then fix the three stale comments, the UI label,
   the displayed balance amount, the reminder thresholds and the settlement together. Doing these
   separately is how they drifted apart in the first place.
7. **#10** — then write the deletion guard, symmetric across refund and deposit-return, role-sensitive,
   with a support escape hatch.
8. **#8** and **#9** — promotion cleanup and the host ladder.
9. **#11** and **#13** — cancellation emails, and participant access to unpublished listings.
10. **#5**, **#12**, **#15** — delete the unused `checkAvailability` function while retaining the live
    blocked-range/calendar reads, remove the unread fee column after checking deployed data, and clear or
    recompute stale scores.

### Verification note

A second reviewer ran six unit suites relevant to the payment and availability findings: 80 tests pass.

**Read that narrowly.** Those six suites do not cover account deletion (#10), cancellation settlement
(#2), the email asymmetry (#11), promotion range validation (#6), acceptance timing (#16), or the
DB-backed availability agreement suite. "80 passing" means these findings are not regressions the chosen
suites catch — it is not evidence that the untested areas are sound. Finding 4 makes the point directly:
the one test whose *name* covers that behaviour asserts nothing about it.
