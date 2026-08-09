# Listing wizard — availability, pricing & promotions

Working document. We go through these one at a time and agree before anything gets built.

> Agreed items get written up as buildable specs in **[listing-wizard-spec.md](./listing-wizard-spec.md)**. That file is what an implementing agent reads; this one holds the reasoning.

**Status key:** 🔵 not discussed yet · 💬 discussing · 🚧 being implemented · ✅ implemented/agreed · ✏️ revised · ❌ dropped

## Current position

- ✅ The pre-publish blocked-date and dated-offer end-date bug is fixed and covered by regression tests.
- ✅ Promotional prices now use normal rounding to the nearest whole currency unit, with the database field and all consumers renamed consistently.
- ✅ The Pricing step now opens the existing date-pricing calendar and returns to Pricing without creating a second pricing tool.
- 🚧 Required availability confirmation is built and its own typecheck, lint and tests pass. Three follow-up defects have been fixed: overlapping availability blocks aborting the publish, "today" being read in UTC, and invalid nested-label markup on the radio card. Still open before it can be called done: browser verification, and the shared reviewed-translation snapshot.
- 🚧 The guest minimum-stay calendar explanation has been improved, and the exact-fit checkout correction is now code-complete: the completed selection keeps its check-out boundary valid instead of striking it through, and that day still cannot become a check-in. Covered by tests; **not yet browser-tested.**
- ⏳ Reviewed translations and the final combined test run must be completed after the active agents finish adding strings.
- ❌ Pricing and Special Offer will remain two focused screens. We are not merging them.
- ❌ No new wizard price-breakdown preview is planned; the real guest booking widget already provides expandable price details.

---

## 1. Blocked dates did not fully work ✅

**What happens now**

When a host blocks dates during the wizard, the last day doesn't actually get blocked. Block August 3–7 and guests can still book August 7. Block a single day and nothing gets blocked at all.

The same thing happens to date-specific discounts. Set "20% off August 3–7" and a guest staying exactly those five nights doesn't get the discount.

**Question raised: isn't August 7 bookable because one guest leaves and another arrives?**

For *bookings*, yes — and that's correct, nothing about that changes. A guest booking Aug 3–7 sleeps 4 nights and leaves on the morning of the 7th, so the 7th is free for the next arrival.

But a host blocking their own dates isn't checking out. Three things show the current behaviour is wrong regardless:

1. **The wizard's own screen says "5 nights."** Select Aug 3–7 and the bar under the calendar reads *"Aug 3 – Aug 7 · 5 nights."* The saved row says 5 nights too. Then it saves 4. The screen and the database disagree.
2. **The published-listing calendar does the opposite.** The same two clicks there say 5 nights and block 5 nights. Same action, different result depending on which screen you're on.
3. **A single day blocks nothing.** Tap August 7 on its own in the wizard and nothing happens, silently. There's no reading of the checkout convention where that's correct.

**The two coherent options**

| | "Aug 3 → Aug 7" means | Blocks | Single day |
|---|---|---|---|
| **A. Days you're occupying** *(what both screens say today)* | 5 days | Aug 3,4,5,6,7 | works |
| **B. Check-in → check-out** *(like a guest booking)* | 4 nights | Aug 3,4,5,6 | impossible |

**Recommendation: A.** Hosts blocking their own holiday think in days they're there, not arrival and departure. The live calendar already works this way. And B can't express "block one night," which hosts do constantly.

Under A, the fix is contained to the wizard's save step. Nothing about how guest bookings work changes.

**Also worth doing at the same time:** the wizard stamps a fixed note on every block it creates — *"Blocked by the host before publishing"* — which the host never sees or chooses. Related to item 8.

**Decision and status: ✅ implemented.** A selection of N days blocks N nights. Guest booking behaviour is untouched. The inclusive wizard range is converted once at the database boundary, and regression tests cover single-day, multi-day, month/year boundary and dated-offer eligibility cases. See [listing-wizard-spec.md § Phase 1](./listing-wizard-spec.md).

---

## 2. The discount you type isn't the discount guests get ✅

**What happens now**

After applying a discount, the system rounds the nightly price **up to the nearest €5** — always up, never down.

A place at €31 a night with 10% off: the real price would be €27.90, rounded up to €30. The guest saves **€1, about 3%**. The host chose 10%. The guest is shown the words "10% off" on the booking page. The guest gets 3%.

On higher prices the gap is smaller (€82 at 15% off → 14.6%), but it never favours the guest, and on cheap nights it nearly erases the discount.

**Why the rounding exists:** to keep prices tidy — €70 instead of €69.70.

**Why that reasoning was weak:** the host's normal price is €31 or €82 already, and nothing rounds those. Only the *discounted* prices were being tidied — exactly where tidiness costs honesty.

**Decision: ✅ Round each discounted night to the nearest whole currency unit — normal rounding, up or down.**

Below .50 rounds down, .50 and above rounds up: €27.40 → €27, €27.50 → €28, €27.90 → €28. Prices stay tidy (whole units, no awkward cents) and the worst-case error drops from just under €5 a night to at most half a unit. The €31 example becomes €28 — a 9.7% discount against a promised 10%, which is close enough that "10% off" is an honest thing to tell a guest.

This also settles two things that were open: no need to default the rounding off for new listings, and no need to drop the percentage from the guest-facing label.

**Implemented.** Specced in [listing-wizard-spec.md § Phase 2](./listing-wizard-spec.md). The database field is now `roundToWholeUnit` and the toggle reads *"Round to the nearest whole number"*.

**Still open (small):** the price editor has a separate *"Round up to the nearest 5"* switch that rounds the host's **own** price as they type it. That's a different feature — the host sees it happen and can undo it — so it is being left alone unless you want it changed too.

---

## 3. Make date pricing easier to find without merging the focused screens ✅

**What happens now**

A host sets prices in three separate spots:

1. **Step 9 – Pricing** — nightly rate, cleaning fee, minimum stay
2. **Step 10 – Special offer** — a discount based on how long someone stays
3. **After the last step** — an optional checklist with *another* pricing screen (prices on specific dates) and *another* discounts screen (discounts on specific dates)

Two different ideas of "discount" — one about stay length, one about calendar dates — on screens that don't reference each other. The wording on screen has to explain the difference, which is the tell that the split is wrong.

There are also dependencies that run backwards: the offer step tells the host "add a cleaning fee on the Pricing step first," meaning they have to walk back two screens to unlock an option.

Publishing a listing takes 14 screens.

**Proposed fix (revised after discussion)**

Keep the pricing step as the home for money, and reach the date-based tools from it — but make sure every door opens the *same* tool:

- Under the nightly rate: *"Charge different prices on certain dates?"* → opens the date-pricing calendar → returns with a summary ("3 date ranges priced differently")
- Under the special offer: *"Discount specific dates instead?"* → opens the dated-offers calendar
- The end-of-wizard checklist stays as a safety net for hosts who skipped the CTAs, showing what's been set

**Availability is handled differently** — see item 4, currently being implemented as its own required screen.

**Decision:** Pricing and Special Offer remain two separate, focused screens. They will not be merged. The nightly-rate CTA is **implemented** — see [listing-wizard-spec.md § Phase 3A](./listing-wizard-spec.md). It opens the existing pre-publish date-pricing screen against the existing plan state and returns the host to the Pricing step, and the summary line reads *"Custom prices set for 3 date ranges"*.

**Decision and status: ✅ implemented.** A compact **Specific dates** link now sits in the existing helper row on Special Offer, opens the same dated-promotions calendar as the final checklist, and returns to Special Offer when closed. No additional row or calendar implementation was added.

---

## 4. Availability is optional, and it shouldn't be 🚧

**What happens now**

"When can guests book?" is hidden behind an optional checklist card at the very end. If the host skips it, the listing goes live as *bookable every day, forever, starting today* — and nobody ever asked them if that's what they wanted.

**Proposed fix**

Make it a real question in the flow rather than an optional extra. Something as simple as: *"Available from today, or from a specific date?"* plus the option to block dates. Hosts who genuinely are available every day answer in one tap; hosts who aren't don't get a surprise booking.

**Decision: ✅ required, on its own screen. Implementation: 🚧 in progress.** Specced in [listing-wizard-spec.md § Phase 4](./listing-wizard-spec.md). Do not call it implemented until typecheck, lint and the full tests pass after the agent finishes.

Two things the first implementation got wrong, now fixed and covered by tests: the generated "available from" block was written independently of the host's own blocked ranges, so an overlap hit `AvailabilityBlock`'s exclusion constraint and aborted the publish outright; and "today" was read in UTC, which rejected "available from tomorrow" as a past date for the first hour or two after local midnight. See the spec's *Blocks are merged before they are written* and *What "today" means*.

A screen titled *"When can guests book?"* sits between the Special Offer step and the pre-publish checklist. The host answers *"Available now"* or *"Available from a specific date"* before they can go on, and *"Block specific dates"* is a separate optional action beside it — the two are not alternatives, so a host can open on 1 September and still block a week later that month. Blocking reuses the existing pre-publish availability calendar; closing it returns to the question.

*"Available from 1 September"* means 1 September is the first night a guest can check in. Publishing is refused server-side without an answer, so the silent "bookable from today, forever" default is gone.

---

## 5. Add another price breakdown to the wizard preview ❌

**What happens now**

The wizard shows a live guest preview next to the form — its best feature. But that preview only ever shows the nightly rate. It never shows the cleaning fee, the minimum stay, any discount, the total for a stay, or which dates are blocked.

So on the pricing step, the offer step, and all three date screens — five screens out of fourteen — half of a desktop screen shows a card that doesn't react to anything the host is doing.

**Why it matters**

A host charging €82/night plus a €30 cleaning fee has no idea that a 2-night stay reads as €97/night to the guest. That number never appears anywhere in the wizard.

**Proposed fix**

Make the preview show what the guest actually sees: the total, the fee, the minimum stay, the discount with the old price struck through. Failing that, hide the preview on those screens and give the calendar the full width.

**Decision: ❌ dropped for now.** The real guest booking widget already shows the total, original and discounted totals, nightly accommodation, cleaning fee, promotion savings and free-cleaning savings through its existing desktop **Price details** expansion and mobile details sheet. The wizard preview has no real stay dates and is intentionally illustrative; turning it into a second booking simulator would duplicate working functionality. Revisit only if host testing shows that the existing offer previews are insufficient.

---

## 6. Mobile: the main button scrolls away 🔵

**What happens now**

On the date screens, the main action ("Block dates", "Set this price") sits inside the scrolling content. Scroll down to look at what you've already set and the button is gone. The published-listing calendar pins this button to the bottom of the screen; the wizard doesn't.

There are also three stacked bars competing for the bottom of a phone screen, which leaves the calendar about half the display.

Other mobile issues:
- The Edit/Remove buttons on each saved row are too small to tap reliably
- Each saved row breaks into four stacked lines plus two full-width buttons
- The price fields bring up the wrong keyboard (plain text instead of numbers) on the pricing step
- "Preview" takes a third of the bottom bar on every screen, including the ones where the preview shows nothing new

**Decision:** _verify before changing._ Code inspection shows that the action row is inside the scrolling content, but that alone does not prove a user-facing failure. The user will test at phone width after the active changes settle. Only reproduce and fix specific problems; do not implement this list wholesale.

---

## 7. Tools hosts expect that aren't there 🔵

**Price guidance.** Nothing tells a host what to charge. Even a rough "similar 2-bedroom places in Ohrid list at €55–€95," with their number shown against that range, would be the single most useful thing on the pricing step.

**Weekend pricing.** ⚠️ *Deliberately kept out of the main flow — see note.* "Friday and Saturday cost more" currently has to be set date by date, and there's no way to say "weekends are always +20%" as a standing rule; the system only stores prices for specific named dates.

> **Agreed direction:** don't complicate the default path with recurring dates. If this is ever built it lives behind an **"Add a recurring rule"** advanced option that a host has to go looking for — never in the main flow.

**Maximum stay.** The system already enforces a maximum stay length and defaults it to 365 nights — but no screen anywhere lets a host change it. A host who wants a 30-night cap can't set one.

**Guest-facing total.** Covered in item 5.

**Currency.** The data model stores a currency, but the current wizard and marketplace operate as an EUR product. A database field alone is not proof of complete multi-currency support. Do not expose a currency selector until search, guest totals, payments and reporting have a product-wide multi-currency design.

**Decision:** _pending_

---

## 8. Things the live calendar can do that the wizard can't 🔵

Hosts learn the wizard first, then find the real calendar can do more. The gaps:

| | Live calendar | Wizard |
|---|---|---|
| Say *why* dates are blocked (maintenance, private stay) | ✅ | ❌ — writes a fixed note |
| Set a minimum stay on a date-specific discount | ✅ | ❌ |
| Turn the promotion rounding on/off | ✅ | ❌ — always on |
| Keep your selected dates when switching between availability/prices/offers | ✅ | ❌ — back to a menu each time |
| Filter the list of what you've set | ✅ | ❌ |
| Quick discount buttons (10/15/20/30%) | ✅ (on one screen) | ❌ (missing on the other) |

**Also worth adding to both:** undo, and grouping the list of changes by month.

**Also:** the counts on the checklist cards say things like "3 blocked" — that's 3 *ranges*, not 3 nights. Ambiguous. Should say nights.

**Decision:** _pending_

---

## 9. Dead code to remove 🔵

Two full screens' worth of code — an old pricing form and an old promotions form — aren't used by anything anymore. Safe to delete.

**One thing to rescue first:** the old promotions form had a choice the current wizard lost — *"this discount applies to all stays"* vs *"only stays of N+ nights."* Today the wizard only offers the second, so a host who wants to discount every stay has to hunt for a custom field and type "1." Worth putting back before deleting the old file.

**Decision:** _pending_

---

## Published-listing management ownership - final decision

Creation and ongoing management are intentionally different parts of the listing
lifecycle. The new-listing wizard remains the accepted guided flow: it collects the
base price, cleaning fee, minimum stay, launch promotion, and initial availability
before publication. None of those creation steps are being collapsed or removed.

After publication, the listing workspace has three primary destinations:

- **Details** owns listing content such as title, description, location, photos,
  capacity, amenities, and stay rules.
- **Calendar** contains the three operational lenses **Availability**, **Pricing**,
  and **Promotions**.
- **Preview** shows the guest-facing result.

Standard pricing - base price, cleaning fee, and minimum stay - is editable only in
Calendar > Pricing. Details shows a read-only Booking settings summary and a direct
Manage pricing action. Date-specific prices stay in the Pricing calendar, and
promotions stay in their own lens. A free-cleaning benefit is a promotion, but the
cleaning fee it waives belongs to Pricing. Saving a cleaning fee of zero atomically
removes free-cleaning benefits from active promotions so the product never advertises
a fee waiver that has no value.

Desktop exposes Details, Calendar, and Preview as the top-level management model,
with the three Calendar lenses nested beneath Calendar. Mobile uses the same three
primary destinations in its bottom navigation and a sticky Availability / Pricing /
Promotions control inside Calendar. A selected date range carries between those
lenses, and Calendar actions remain above the bottom navigation.

---

## Dropped

- ~~**Bulk date selection**~~ — I was wrong. Clicking the first day then the last day already selects everything between, so "block all of August" is 2 clicks. The narrower real gap (recurring weekend patterns) moved into item 7.
- ~~**Merge Pricing and Special Offer**~~ — the product owner prefers two focused screens, and they remain separate.
- ~~**Duplicate the guest price breakdown inside the wizard preview**~~ — the public booking widget already provides the real breakdown once dates are selected.
- ~~**Guarantee a non-zero whole-unit discount for extremely low nightly prices**~~ — discussed and deliberately skipped as an unlikely edge case; standard nearest-whole-unit rounding remains the agreed rule.
