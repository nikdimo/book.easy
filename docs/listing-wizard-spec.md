# Listing wizard — implementation spec

Companion to [listing-wizard-improvements.md](./listing-wizard-improvements.md), which holds the reasoning and the open discussion. **This file records agreed behaviour, implemented phases and work currently being validated.**

> **Agent: read this whole file before writing code.** Phases are ordered. Do not start a phase marked ⛔.

---

## 0. Ground rules — apply to every phase

### 0.1 Reuse before you build

The wizard and the published-listing calendar do the same three jobs (block dates, price dates, discount dates). They already drifted into two different-looking designs once, and closing that gap is a goal of this work. **Assume the component you need already exists and go find it.** Only build new when you can show nothing fits.

**Inventory — use these, don't reinvent:**

| Need | Use | Where |
|---|---|---|
| Any date grid, single or range | `DateRangeCalendarStep` | `src/components/marketplace/marketplace-stay-date-picker.tsx` |
| On/off switch | `OptionToggle` | `src/components/host/calendar-editor-ui.tsx` |
| Bottom action bar inside a sheet | `STICKY_FOOTER` (class constant) | `src/components/host/calendar-editor-ui.tsx` |
| Modal / bottom sheet | `Dialog` with `variant="sheet"` | `src/components/ui/dialog.tsx` |
| Buttons, inputs, labels, badges, tabs, tooltips, selects | `src/components/ui/*` | 22 primitives already there |
| Date maths on `YYYY-MM-DD` strings | `addDaysToYmd`, `ymdToDbDate`, `dbDateToYmd`, `eachYmdInclusive`, `eachYmdExclusive`, `compareYmd` | `src/lib/utils/date-only.ts` |
| Plan maths (wizard-side) | `eachPlanDate`, `rangeNights`, `parsePlanDate`, `planDateFromLocal`, `flattenPlanDatePrices` | `src/lib/types/listing-prepublish-plan.ts` |

`DateRangeCalendarStep` already supports everything the host screens need — per-day sublabels (`dayMeta`), custom day styling (`dateModifiers` / `dateModifiersClassNames`), colour tones, paged desktop months, viewport fitting, and drag-select. If a date screen needs a new visual state, **add a modifier — do not fork the calendar.**

### 0.2 Match the published-listing calendar

Where the wizard and the live calendar do the same job, the wizard copies the live calendar's layout, wording and behaviour — not the other way round. The reference implementation is `src/components/host/calendar-workspace.tsx`. That means: one date grid, a legend beneath it, an action bar for the current selection, then the list of what's been set.

If you find yourself writing a third variant of something that exists in both places, stop and lift the shared piece into `calendar-editor-ui.tsx` instead — that file exists for exactly this.

### 0.3 Every user-facing string goes through i18n

`npm run lint` runs `i18n:check` and will fail the build on untranslated strings.

- JSX: `<Tx k="host.some.key" source="English text" />`
- Values: `resolve("host.some.key", "English text").text`
- With variables: `interpolate(resolve(...), { count })`
- All from `@/lib/i18n/client`

Keys must be literals, never variables — the extractor reads the source, not the runtime. Reuse an existing key when the text already exists (`host.calendar.*`, `host.prepublish.*`, `host.promotion.*`).

### 0.4 Mobile and desktop are both first-class

Every screen is checked at 375px and at 1280px+. On phones the primary action must stay reachable without scrolling. Tap targets ≥44px. Number fields set `inputMode="decimal"` (money) or `inputMode="numeric"` (counts).

### 0.5 Definition of done

- `npm run lint` passes (includes the i18n check)
- `npm test` passes, including new tests required by the phase
- The user performs browser verification at 375px and 1280px. Implementation agents do not test in the browser.
- Implementation agents do not stage, commit or push; the user reviews and commits later.

---

## Phase 1 — Fix blocked dates and dated offers ✅ implemented

The inclusive-to-exclusive boundary helper, publish integration and regression tests are present in the working tree. This section retains the original problem and acceptance criteria as the implementation record.

### The problem

The wizard treats the last selected day as **included**. The rest of the system treats a stored end date as **the morning the guest leaves** (exclusive). Nothing converts between the two when a draft is published.

Consequences today:

- Host blocks Aug 3–7 → only Aug 3,4,5,6 are blocked. **Aug 7 stays bookable.**
- Host blocks a single day → a zero-length row is written. **Nothing is blocked at all.**
- Host sets "20% off Aug 3–7" → a guest staying exactly those 5 nights **doesn't get the discount**.

The wizard's own UI says "5 nights" for a 5-day selection, and the published-listing calendar blocks 5 nights for the same two clicks. So the wizard's screen, the wizard's database write, and the live calendar currently disagree with each other.

### Agreed behaviour (option A)

**A selection of N days blocks N nights.** Selecting Aug 3 through Aug 7 blocks the nights of Aug 3, 4, 5, 6 and 7. Selecting a single day blocks that one night. This matches what the wizard already tells the host and what the live calendar already does.

Nothing about guest bookings changes. Bookings keep their check-in → check-out semantics; a guest departing Aug 7 still frees Aug 7 for the next arrival. This is only about a host blocking their own dates.

### What was changed

**File:** `src/lib/actions/listing.actions.ts`, in the create/publish action, around lines 308–335.

Two conversions currently pass the plan's inclusive end date straight to the database:

1. **`availabilityBlockCreates`** — `endDate: parsePlanDate(block.endDate)`
2. **Dated offers loop** — `endDate: parsePlanDate(offer.endDate)`

Both must write **the day after** the last selected day.

Use the existing helpers rather than new date maths:

```
ymdToDbDate(addDaysToYmd(block.endDate, 1))
```

`ymdToDbDate` and `parsePlanDate` produce identical values (UTC midnight from parsed parts), so this is a safe substitution. Both helpers are already in `src/lib/utils/date-only.ts`.

### What must NOT change

- **`datePriceCreates`** — date prices are stored one row per day, so inclusive is already correct. Leave alone.
- **The plan format itself** (`PrePublishPlan`, `parsePrePublishPlan`, `eachPlanDate`) stays inclusive. Drafts already saved by hosts stay valid, and no migration is needed. The conversion happens only at publish.
- **The wizard's UI labels.** They already say "5 nights" for 5 days, which is now correct.
- **Any booking logic.**

### Guard against a silent regression

The two date conventions meeting in one function is what caused this. Make the boundary explicit — a small named helper (e.g. `planRangeToDbRange`) used by both call sites, with a comment stating that the plan is inclusive and the database is exclusive, is preferred over adding `+1` twice inline.

### Tests required

Add to `src/lib/actions/` or the nearest existing test folder — `src/lib/services/__tests__/` has the pattern to follow.

Cover, for both blocks and dated offers:

1. **Multi-day range** — plan Aug 3→Aug 7 produces a row with start Aug 3, end Aug 8; `eachYmdExclusive` over it returns exactly 5 days.
2. **Single day** — plan Aug 3→Aug 3 produces start Aug 3, end Aug 4; covers exactly 1 night. *(This is the case that silently does nothing today — it is the most important test here.)*
3. **Month boundary** — plan Aug 30→Sep 2 produces end Sep 3.
4. **Year boundary** — plan Dec 30→Jan 2 produces end Jan 3.
5. **Date prices unchanged** — a plan price range Aug 3→Aug 7 still produces exactly 5 rows, dated Aug 3–7.
6. **Offer eligibility end-to-end** — a dated offer built from plan Aug 3→Aug 7, run through `selectApplicablePromotion` with checkIn Aug 3 / checkOut Aug 8, is returned as applicable. This is the test that proves the guest actually gets the discount.

### Also fix while you are in here

The wizard stamps a fixed reason on every block it creates — `"Blocked by the host before publishing"` — which the host never sees or chooses, and which is an untranslated English string written to the database. The live calendar lets hosts type a reason.

For this phase: leave the behaviour but **do not treat that string as user-facing copy**; the full "let the host give a reason" change is item 8 in the improvements doc and is not yet agreed.

---

## Phase 2 — Round discounted prices to the nearest whole unit ✅ implemented

### The problem

When a promotion applies, each discounted night is rounded **up to the nearest €5**. Always up. The rounding exists to keep guest-facing prices tidy, but it can eat most of the discount:

| Nightly rate | Host chose | Real price | Rounded to €5 | Guest actually gets |
|---|---|---|---|---|
| €31 | 10% off | €27.90 | €30 | **3.2%** |
| €52 | 20% off | €41.60 | €45 | **13.5%** |
| €47 | 30% off | €32.90 | €35 | **25.5%** |

The guest is shown the literal words "10% off" on the booking page (`promotion.percent_off`), so the label and the money disagree.

### Agreed change

**Standard rounding to the nearest whole currency unit**, per night. Below .50 rounds down, .50 and above rounds up: €27.40 → €27, €27.50 → €28, €27.90 → €28. Prices stay tidy — whole units, no stray cents — and the worst-case error drops from just under €5 a night to at most half a unit. The €31 case becomes €28, a 9.7% discount against a promised 10%.

### What was changed

**1. The maths** — `src/lib/utils/stay-pricing.ts`, in `computeStayQuote`:

```
Math.ceil(discountedNightCents / 500) * 500   →   Math.round(discountedNightCents / 100) * 100
```

Applied per night, as before. The `Math.min(originalNightCents, …)` cap is kept — a discount can never make a night more expensive. `calendar-workspace.tsx` and the ui-lab promotion preview mirror the same rule.

**2. The database field was renamed.** `ListingPromotion.roundUpToNearestFive` → **`roundToWholeUnit`**, currency-neutral and no longer implying "always up". Migration `prisma/migrations/20260804090000_promotion_round_to_whole_unit` does a plain `ALTER TABLE "ListingPromotion" RENAME COLUMN`, which preserves every value, the `NOT NULL` constraint and the `DEFAULT true`. Every reader, writer, API payload, serializer, fixture and test was renamed with it; no occurrence of the old name remains outside the historical migrations.

**3. The user-facing labels** now read *"Round to the nearest whole number"* (no currency symbol, since `PricingRule.currency` is per listing), via i18n keys `host.calendar.promotion_round_label` / `host.calendar.promotion_round_hint`. The offer preview note says *"rounded from"* rather than *"rounded up from"*. The mobile promotions panel label and badge were updated to match.

Note: `host.prepublish.round_label` (*"Round up to the nearest 5"*) belongs to the **host's own** price toggle in the wizard price editor, not to promotions, so it was left alone per "What must NOT change" below.

### What must NOT change

- **The separate "round the price I'm typing" toggles** in the price editors (the `roundPrice` state and the quick-adjust chips that do `Math.ceil(value / 5) * 5`). Those round the **host's own** price, the host sees it happen immediately, and they are a different feature. Leave them on €5.
- **The default.** `listing.actions.ts` sets `roundToWholeUnit: true` on publish. With whole-unit rounding that is now harmless — keep it on.
- **The guest-facing percentage label.** With sub-€1 error, "10% off" is honest. No change needed.

### Tests

`src/lib/utils/__tests__/stay-pricing-promotion.test.ts` — the pre-existing rounding test was updated (not deleted), plus new cases: below .50 rounds down (€27.40 → €27), exactly .50 rounds up (€27.50 → €28), above .50 rounds up (€27.90 → €28), an already-whole price is untouched, rounding disabled keeps the exact cents (€27.90), and the cap holds so a rounded night never exceeds the original rate. The existing promotion-selection and free-cleaning tests are unchanged and still pass.

---

## Phase 3 — Reach date pricing and dated offers from their wizard steps ✅ implemented

### Phase 3A — date-pricing CTA ✅ implemented

The Pricing step now carries the date-pricing door. Below the nightly-rate field, inside the same pricing card, a secondary call to action reads *"Charge different prices on certain dates?"* with the example *"For example, charge more during holidays or less in quieter periods."* and a **Set date prices** button. Once the plan holds date prices the same row becomes the summary — *"Custom prices set for 3 date ranges"*, counting **ranges, not nights** — and the button becomes **Edit date prices**.

**How the reuse works — nothing was copied:**

- The button only calls `setPrePublishScreen("pricing")`. The screen it opens is the existing `PrePublishTaskScreen` with `task="pricing"`, rendered by the same branch in `listing-form.tsx` that the end-of-wizard checklist uses. There is one calendar and one price editor.
- The state is the same `prePublishPlan` (`PrePublishPlan`), edited through the same `updatePrePublishPlan`, which still autosaves the draft on the next frame through the existing hidden `prePublishPlan` field. Prices set from either door appear at the other, and survive draft save and resume.
- The summary count is `plan.datePrices.length` — the ranges the plan already groups, so it matches the rows the task screen and the checklist list.

**Return navigation:** a new `prePublishOrigin` (`"menu"` | `"pricing-step"`) records which door was used, and `prePublishBackTarget` in `src/lib/types/listing-prepublish-navigation.ts` turns it into a destination. Opened from the checklist, Back and Done return to the checklist as before; opened from Pricing, they leave the pre-publish screens entirely and land back on the Pricing step, with the base price and every other form value untouched. Unit-tested in `src/lib/types/__tests__/listing-prepublish-navigation.test.ts`.

**Layout:** the task screen already renders inside the wizard's editor pane, so it is a full-screen editing experience on the phone and the existing wide task layout on desktop, and it keeps using the wizard's single bottom action row — no second mobile footer was introduced. The CTA row stacks to full width below `sm` and its button is `size="lg"` (48px tall on touch).

### Phase 3B — dated-offer CTA ✅ implemented

The Special Offer step now has a compact **Specific dates** CTA in its existing helper row. It opens the existing `PrePublishTaskScreen` with `task="offers"` against the same `prePublishPlan` used by the final checklist. Its `"offer-step"` navigation origin makes Back and Done return to Special Offer. Pricing and Special Offer remain separate wizard steps.

**Agreed shape (original):**

- On the Pricing step, under the nightly rate, an inline call-to-action: *"Charge different prices on certain dates?"* with an example, opening the date-pricing calendar.
- Under the special offer, the equivalent: *"Discount specific dates instead?"*
- **Critical constraint: both doors open the same tool.** The wizard already has two separate pricing surfaces that don't know about each other; adding a third is a regression, not a fix. The CTA and the end-of-wizard checklist must render the identical component against the identical plan state.
- After the tool closes, the pricing step shows a summary line ("3 date ranges priced differently") and the host stays where they were.
- The end-of-wizard checklist stays, as the safety net for hosts who skipped the CTA.

**Settled by 3A:** the tool takes over the editor pane rather than opening as a sheet or a side panel — that is what the existing task screen already does, and reusing it was worth more than a new container.

**Still not decided:** whether steps 9 and 10 merge into one Pricing step. They remain separate.

---

## Phase 4 — Require an availability answer before publishing 🚧 implementation in progress

The behaviour below is agreed and is currently being implemented. **Do not mark this phase complete until the active agent finishes and typecheck, lint and the full test suite pass against the combined working tree.**

### The problem

Availability was an optional card on the end-of-wizard checklist. A host who skipped it published a listing that was bookable on every date from that moment on, and nobody had asked them whether that was what they wanted. Silence was read as "available now".

### Agreed behaviour

A focused screen, **"When can guests book?"**, between the Special Offer step and the pre-publish checklist. It is a screen, not a numbered step — the host passes through it, and it is not merged into Pricing or Special Offer.

The host must pick one of:

1. **"Available now"** — *"Guests can request stays starting today."*
2. **"Available from a specific date"** — *"Choose the first date guests can check in."* Selecting it reveals a date field.

Separately, and optionally, **"Block specific dates"** — *"Block dates when you will use the property yourself, perform maintenance, or cannot host."* This opens the **existing** pre-publish availability calendar against the **existing** plan state.

**The two are not mutually exclusive.** A host may open on 1 September and still block dates later in September. Blocking never substitutes for the choice, and choosing never clears the blocks.

### Date semantics

**"Available from 1 September" means 1 September is the first night — the first check-in date — a guest may select.**

At publication:

- **"Available now"** creates **no** availability block at all. An empty row would mean nothing.
- **"Available from 1 September"** blocks every night from today up to and including 31 August. It is produced as an *inclusive* plan range (`{ startDate: today, endDate: 31 Aug }`) and goes through `planRangeToDbRange` with the manual blocks, picking up the database's exclusive end date there — so the stored row ends on 1 September and that night stays bookable. Phase 1's inclusive-to-exclusive fix is applied once, not twice.
- Nothing is created when the start date is today, or already past — nights before today are not bookable regardless.
- Manually blocked ranges continue to be written exactly as before.

All of it runs on the civil-date helpers (`addDaysToYmd`, `compareYmd`, `todayYmd`). No local-timestamp arithmetic, which would shift the boundary a day for hosts either side of UTC.

### Blocks are merged before they are written

`AvailabilityBlock` carries a Postgres exclusion constraint (`EXCLUDE USING gist (listingId WITH =, daterange(startDate, endDate, '[)') WITH &&)` — the 20260710175030 migration). The wizard now writes blocks from two independent sources, and nothing stopped them covering the same nights: opening on 1 September while also blocking a week in August produced two overlapping rows and **aborted the entire publish**.

`mergeInclusiveBlockRanges` collapses them first:

- Malformed ranges are dropped, matching the rest of the plan module.
- Ranges are sorted by start date and merged when they overlap **or are directly adjacent** (1–5 August + 6–8 August → 1–8). As `[)` ranges, adjacency would not actually violate the constraint — merging it is tidiness, one row for one closure.
- Merging happens on **inclusive** ranges, so `planRangeToDbRange` runs exactly once per surviving range afterwards. Merging after conversion would move the boundary twice.
- **Reason rule: the earliest-starting contributing range wins**, ties going to caller order. The publish action passes the availability-start block first, and it always begins today, so it keeps its wording for any span it is merged into — a merged block reaching back to today is there because the listing had not opened yet.

The invariant that survives all of it: **the chosen start date stays bookable** unless the host blocked it themselves.

### What "today" means

`todayYmd()` resolves the civil date in the **marketplace's time zone** — `NEXT_PUBLIC_BOOKING_TIME_ZONE`, defaulting to `Europe/Skopje` — not in UTC and not in the browser's zone.

It was UTC, which put every host east of UTC on *yesterday's* date between local midnight and 01:00/02:00: "available from tomorrow" was rejected as a past date, and the date field's `min` was a day early. Copenhagen and Skopje share CET/CEST, so the marketplace rule gives Danish owners the correct local date year-round.

The variable is `NEXT_PUBLIC_` so it is inlined into both bundles — **the date the wizard shows and the date the publish action validates are resolved by the same rule**, which is the property that matters. Keep it equal to `BOOKING_TIME_ZONE` (used by booking emails).

**Known limitation, deliberately not solved here:** this is one zone for the whole marketplace, not the property's own. No property or owner time zone is stored anywhere in the schema. A listing in a genuinely different zone rolls over at the marketplace's midnight rather than its own. Fixing that means storing a zone per property *and* deciding whose day governs booking cut-offs — a product decision, not a helper change. One documented rule both sides follow beats two rules that disagree.

### Where the answer lives

On `PrePublishPlan.availabilityStart`, so it rides the existing draft autosave and the existing publish form field — no second save path.

```ts
type AvailabilityStartChoice = { mode: "now" } | { mode: "from"; startDate: "YYYY-MM-DD" } | null;
```

`null` is a real state meaning **"not answered yet"**, and is never read as "available now". A draft written before this field existed parses to `null` and is simply asked the question — old drafts stay loadable with their blocks and prices intact.

### Server-side validation

`submitNewListing` re-validates and **fails the publish** — unlike the optional ranges around it, which are dropped when malformed. A disabled button is a courtesy, not the enforcement.

| Reason | Message |
|---|---|
| `unconfirmed` | "Confirm when guests can start booking before publishing." |
| `invalid-date` | "Choose a valid date for when guests can start booking." |
| `past-date` | "That availability start date has already passed. Choose today or a later date." |

An unusable answer is **never** downgraded to `{ mode: "now" }`.

### Navigation

- Last numbered step → **availability screen** → checklist. Back from the question returns to the Special Offer step.
- The blocking calendar opened from the question returns *to the question* (`prePublishOrigin: "availability-start"`), not to the checklist.
- The checklist's availability row reports the confirmed state and its **Edit** action reopens the question.
- Existing blocked ranges stay visible and editable throughout.

### What must NOT change

- Editing an existing published listing. Its availability lives on its own calendar; `availabilityBlocksPublish` returns false outright when editing.
- Pricing and Special Offer stay separate screens.
- There is still exactly one blocking calendar. No second one was built.

### Required tests

`src/lib/types/__tests__/listing-availability-start.test.ts` — publish refused without an answer; "available now" creates no block; "from 1 September" blocks August but not 1 September; manual blocks keep the corrected conversion; a start date composes with later manual blocks; malformed and past dates rejected; draft save/resume; pre-feature drafts load and are asked again; the blocking calendar returns to the question; the checklist counts **nights, not ranges**.

Block merging, in the same file: a manual range entirely inside the pre-start block; one crossing its boundary; one directly adjacent to it; two overlapping manual ranges; non-overlapping ranges left separate; "available now" with manual ranges; "available from" with none; the deterministic reason rule. Each asserts the exclusion-constraint condition (`start < otherEnd && end > otherStart`) does not hold across the produced rows, and that the chosen start date stays bookable.

`src/lib/utils/__tests__/date-only-today.test.ts` — civil-date boundaries with the instant pinned explicitly: Copenhagen 00:30 local (summer **and** winter offsets), 23:30 local not rolling over early, month and year boundaries, a zone behind UTC, and `todayYmd` agreeing with the marketplace rule rather than with UTC.

---

## ⛔ Paused or not approved — do not implement

These are still under discussion in [listing-wizard-improvements.md](./listing-wizard-improvements.md). Do not build them, and do not "improve" them in passing while working on Phase 1.

| # | Item |
|---|---|
| 5 | Additional wizard price breakdown — dropped for now because the real booking widget already provides it |
| 6 | Mobile action/tap-target changes — verify a real problem before changing |
| 7 | Price guidance, weekend pricing, maximum stay, currency |
| 8 | Parity gaps with the live calendar (block reasons, offer minimums, rounding toggle, carried selection, filters) |
| 9 | Delete the two dead form components — rescuing the "all stays" option first |

**Explicitly out of scope, by decision:** recurring date rules ("every Friday", "all weekends"). If ever built, they live behind an *"Add a recurring rule"* advanced option, never in the default path.

---

## Guest calendar — exact-fit check-out ✅ code-complete, ⛔ not browser-tested

Stay nights are `[checkIn, checkOut)`, so the first day of a blocked range is a legal **check-out** — the next guest's arrival day, not a night this guest sleeps. It must never be a legal **check-in**.

### The defect

The picker carved the boundary out of `effectiveDisabledRanges` only while a check-in was *pending*. Selecting that boundary as the check-out completed the range, which cleared the pending check-in, which restored the original blocked range — under the guest's own selection. The day they had just validly chosen was immediately re-disabled and struck through, even though `validateBookingSelection` considered the stay perfectly valid.

The exception was scoped to the wrong part of the lifecycle: it ended exactly when the guest used it.

### The fix

`selectionCheckoutBoundary` in `src/lib/utils/booking-calendar.ts` answers for the whole lifecycle rather than for a pending check-in only:

| Selection | Boundary |
|---|---|
| nothing selected | none — the blocked start is not a check-in |
| `from` only | the first blocked day reachable from `from` |
| `from` + `to` | that same day, **only while `to` equals it** |
| `from` + `to` elsewhere | none — the block is whole again |

Only the *first* reachable block ever qualifies; a later one would mean sleeping through the earlier block's nights.

Because the boundary now stays enabled while a completed exact fit is selected, the picker's `commitRange` carries an explicit guard: a fresh check-in (`from` set, no `to`) landing on a genuinely blocked day — tested with `isBlockedDay` against the **unmodified** ranges — clears the selection rather than starting a stay there. Only the exception can produce that case; every other blocked day is refused by the disabled matcher first.

`checkoutBoundary` keeps its original pending-only contract and is still exercised by its own tests; the picker simply no longer calls it directly.

### Interval convention

Unchanged and consistent across the disabled matcher, the `unavailable` modifier (both built from `disabledRangesForSelection`), the selection handlers, and `validateBookingSelection` — which already accepted the exact fit (`checkOut > blockedFrom` is false when they are equal) and needed no change.

### Tests

`src/lib/utils/__tests__/booking-calendar.test.ts` — no selection, pending check-in, completed exact fit, cleared range, a new selection refused on the boundary, check-out past the boundary, one-night minimum, multi-night minimum, and multiple blocked ranges where only the first reachable one qualifies. Each drives `selectionCheckoutBoundary` as the picker does and then asks what the calendar would disable and strike through.

**Still to verify in a browser:** that the completed check-out renders as a normal selected endpoint (no strike-through, no dimming), and that clicking it afterwards does not start a stay on a blocked day.

---

## Published-listing lifecycle and ownership

This section is normative for editing an existing published listing. It does not
change the creation wizard described above.

### Creation remains guided

The new-listing wizard remains the source of the initial base price, cleaning fee,
minimum stay, launch promotion, and availability answer. Its Pricing and Special
Offer steps remain separate, and its pre-publish date tools continue to write the
same saved plan used at publication.

### Published management is destination-based

Published listings have three primary destinations:

| Destination | Ownership |
| --- | --- |
| Details | Listing content: title, description, location, photos, capacity, amenities, and stay rules |
| Calendar | Operational management through Availability, Pricing, and Promotions lenses |
| Preview | Guest-facing listing preview |

Availability, Pricing, and Promotions are sibling lenses inside Calendar, not later
steps in another wizard. Desktop presents the three primary destinations and nests
the lens tabs under Calendar. Mobile uses Details / Calendar / Preview in the bottom
navigation and a sticky Availability / Pricing / Promotions control inside Calendar.
The current date selection is preserved when switching lenses. Fixed Calendar
actions render above the mobile bottom navigation and respect the safe-area inset.

### One editable home for standard pricing

For a published listing, base price, cleaning fee, and minimum stay are editable only
in Calendar > Pricing. The Details editor renders those values as a read-only Booking
settings summary with a Manage pricing deep link. Publishing unrelated Details edits
must not post or overwrite standard-pricing values; server writes use the persisted
pricing record so a newer Calendar save cannot be reverted by stale form state.

Date-specific prices remain calendar-based custom date prices. Promotions remain a
separate lens. The cleaning fee itself belongs to Pricing; free cleaning is only a
promotion benefit that waives that fee. Saving the cleaning fee as zero performs one
atomic transaction that updates standard pricing and removes free-cleaning benefits
from active promotions. Both web and native clients disable free cleaning at zero and
link back to Pricing to set a fee.

---

## Integration checkpoint before any commit

Several phases were developed concurrently in one uncommitted working tree. Before the user commits:

1. Finish Phase 4. The guest-calendar exact-fit checkout correction is code-complete and tested, but still needs browser verification.
2. Regenerate/extract the final UI catalogue only after all agents stop adding strings.
3. Update the reviewed translation snapshot for every new key.
4. Run `npm run typecheck`, `npm run lint`, `npm test` and `npx prisma validate` against the final combined tree.
5. Confirm the guest calendar permits an exact-fit stay ending on the first blocked day while still refusing that day as check-in.
6. Leave all files unstaged and uncommitted for user review.
