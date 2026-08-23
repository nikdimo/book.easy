# Host V1 → Host V2 Feature-Parity and Quality Audit

Audit date: 2026-08-21. Read-only: no production file was created, modified, reformatted,
staged, reverted or deleted to produce this document. The only file written is this one.

Companion to [host-v2-wiring-audit.md](host-v2-wiring-audit.md), which audited *wiring*
(is anything connected?) on the same day. That audit's two top findings (G1 — the
`/host/start` wizard unwired; G2 — overview mutations not refreshing) are **confirmed
fixed** by this audit; its test-coverage findings (G3–G6) are **confirmed still open**.
This audit is broader: parity against the old panel, plus an independent quality pass.

---

## 1. Executive summary

**Overall parity assessment: Host V2 covers the majority of the old panel's day-to-day
surfaces, and in several areas (calendar, listings overview state, photos/rooms, location)
exceeds them. The create-a-listing flow is now genuinely wired end to end. Parity is
nevertheless *not* complete: eight old-panel capabilities are missing or only partly
present, and the V2 panel still routes hosts back into `/host/**` from six places.**

**Is Host V2 safe to call "fully operational"?** — **No, not yet, and not without one
correction.** It is operational in the sense that every headline workflow (browse
listings, create a listing, publish, edit, price, schedule, take reservations, message
guests) completes against real data with real ownership checks. It is *not* fully
operational in the sense that:

- one confirmed defect can publish a listing whose street address and map pin disagree
  (F-01), and
- one can silently re-denominate an imported listing's price from its source currency to
  EUR (F-02), and
- V1 cannot be retired, because six V2 controls are hard-linked into `/host/**` and two
  old features (currency choice at creation, the pre-publish date plan) have no V2 home.

### Counts

By classification (see §4 for the full matrix; 58 old-panel features assessed):

| Classification | Count |
|---|---|
| FULL PARITY | 21 |
| IMPROVED | 9 |
| MOVED/SHARED | 6 |
| PARTIAL | 13 |
| UI ONLY | 0 |
| MISSING | 7 |
| INTENTIONALLY REMOVED | 2 |
| NOT APPLICABLE | 0 |

By severity (confirmed defects only — §5):

| Severity | Count |
|---|---|
| CRITICAL | 0 |
| HIGH | 3 |
| MEDIUM | 12 |
| LOW | 11 |

Plus 5 items in "Needs manual verification" (§12).

### The five most important conclusions

1. **Address and map pin can be published out of sync.** The V2 create flow's Address
   screen writes street/city/postcode/country without touching the coordinates or
   clearing `locationConfirmed`, which the V1 wizard explicitly did. A host who confirms
   a pin, presses Back and corrects the address publishes a live listing whose pin points
   somewhere else. (F-01, HIGH.)
2. **The Price step hard-codes EUR.** It reads the draft's imported nightly *amount* but
   ignores the draft's imported *currency* and overwrites it with `DEFAULT_CURRENCY`.
   An Airbnb listing imported at 120 USD publishes as 120 EUR. (F-02, HIGH.)
3. **Photo upload failures in the create flow are silent.** `savePhotos()` throws on a
   failed `/api/upload` call; the footer awaits it without a `catch`, so the spinner stops
   and nothing else happens — no toast, no navigation, and the photos already uploaded in
   that batch are orphaned on disk. (F-03, HIGH.)
4. **V2 is not self-contained.** Six live controls inside `/host/v2` navigate to `/host/**`
   (Edit in the listings row menu, "Open the classic editor" in the editor header, damage
   reports on Today, the promotion suggestion on Today, "Open full reservation" in the
   reservation panel, and the inbox rail's `detailsUrl`). V1 cannot be turned off while
   these exist. (F-04 … F-06.)
5. **The prototype scaffolding is still in the tree and now actively lies.** Ten source
   comments and three tests still assert that the create flow persists nothing, while the
   runtime code four lines below persists to `ListingDraft` and publishes a real `Listing`
   — including one page-level comment on the Review route. The `[section]` placeholder
   route is now unreachable, and two placeholder components and one Server Action
   (`abandonHostStartDraft`) have no callers. (§10.)

---

## 2. Scope and terminology

| Term | What it means in this document | Routes |
|---|---|---|
| **Old Host panel** ("V1") | The original host control panel: sidebar shell, dashboard, listings list, the 11-step create/edit wizard, bookings, inbox, mobile preview. | `src/app/(host)/host/**` (excluding `/host/v2`) |
| **Host V2 panel** | The new five-section panel: Today, Calendar, Listings, Reservations, Messages. | `src/app/(host-v2)/host/v2/**` |
| **Host V2 listing editor** | The per-listing editor, in its own route group so it does not inherit the panel chrome. Nine sections. | `src/app/(host-editor)/host/v2/listings/[id]/**` |
| **`/host/start`** | The V2 create-a-listing flow (16 screens) plus its draft dashboard and URL importer. Its own route group so it can own the full viewport. | `src/app/(host-start)/host/start/**`, `src/app/api/host-start/draft` |
| **Platform `/admin`** | **A separate product surface, out of scope.** | `src/app/admin/**` |
| **Shared backend** | Server Actions, services and route handlers used by V1, V2 *and* the Expo mobile app. | `src/lib/actions/**`, `src/lib/services/**`, `src/app/api/**` |

### On `/admin` — explicit statement

**The platform administrator panel under `/admin/**` was deliberately NOT compared, and
nothing in this repository suggests Host V2 is intended to replace it.** The evidence:

- `src/proxy.ts:186-190` gates `/admin` on `userRole !== "ADMIN"`, a different gate from
  the `/host` gate at `:200-214` (logged-in + `isHost || ADMIN`).
- `docs/architecture/system-architecture.md:577` describes the admin panel as the surface
  that "sees all listings in any status" — a moderation role, not a hosting role.
- `docs/planning/arrival-guide-data-contract.md:112,153` treats "the admin panel" as a
  third reader alongside the host panel and the mobile API.
- The V2 account menu links to `/admin` as an *external* destination
  ([host-v2-account-menu.tsx:166-171](../../src/components/host/v2/host-v2-account-menu.tsx)),
  exactly as the V1 sidebar does ([host-sidebar.tsx:244-249](../../src/components/host/host-sidebar.tsx)).
- Admin-only mutations live in their own action file (`src/lib/actions/admin.actions.ts`)
  and revalidate only `/admin/*` paths.

Admin surfaces are therefore referenced in this audit **only** where a host-facing code
path branches on `role === "ADMIN"` (§7, admin-bypass consistency).

---

## 3. Verification baseline

### Git status (captured before investigating)

`git status --short` on branch `main` at `c8d6e22 feat: V112 - New admin panel`:

- **188 entries**: 84 modified, 1 deleted, 103 untracked.
- The deleted file is `src/app/(host-new-listing)/host/new-listing/page.tsx`.
- The untracked set includes the **entire** `/host/start` route group, `src/app/api/host-start/`,
  the four newest editor sections (`arrival-guide`, `house-rules`, `location`, `rooms`),
  `src/lib/actions/host-start.actions.ts`, `src/lib/host-start-draft.ts`, and ~30 V2 step
  components and their tests.
- **Every untracked file above was treated as live production code and audited.** None was
  assumed unused. The audit covers the working tree, not `HEAD`.

No `git clean`, `reset`, `checkout`, `restore`, `stash`, `add`, `commit`, `branch` or
`worktree` command was run at any point.

### Commands run

| Command | Result |
|---|---|
| `npx tsc --noEmit` (`npm run typecheck`) | **PASS** — exit 0, zero diagnostics. |
| `npx vitest run` (`npm test`) | **1343 / 1344 pass, 1 fail** in 132 files. |
| `npx eslint .` (the `eslint` half of `npm run lint`; **no `--fix`**) | **0 errors, 14 warnings.** |
| `npm run i18n:check` | **PASS** — "UI translation catalog is current (3442 strings)." Verified read-only first: `scripts/extract-ui-strings.ts:278` branches on `--check` *before* the `fs.writeFileSync` at `:288`. |

`npm run build` was **not** run: `prebuild` invokes `i18n:extract` *without* `--check`,
which writes `src/lib/i18n/generated-ui-strings.json` — a file already modified in the
working tree. Running it would have violated the read-only constraint. `npm run lint` was
likewise decomposed into its two halves rather than run whole, for the same reason.
`npx vitest run --reporter=basic` fails at startup on vitest 4 ("Failed to load custom
Reporter from basic"); the default reporter works.

### Known pre-existing failure (NOT introduced by this implementation)

```
FAIL  src/lib/i18n/__tests__/reviewed-ai-translations.test.ts > catalog matches snapshot
```

The reviewed-translation snapshot is missing ~34 keys the extractor now finds
(`rooms.categories.*`, `rooms.types.*` and others). This is the **expected** state
whenever new UI strings ship: the snapshot is regenerated by the paid Gemini pass
(`npm run i18n:generate-reviewed`), which is a human-run, billable step and was
deliberately **not** run. Same failure was recorded in
[host-v2-wiring-audit.md §0](host-v2-wiring-audit.md) earlier the same day.

**Failure attribution:**

| Category | Count | Notes |
|---|---|---|
| Introduced by the current implementation | **0** | |
| Pre-existing / documented | **1** | the reviewed-translation snapshot, above |
| Environment-related | **0** | local Postgres was up; all integration suites ran |
| Paid-translation snapshot | **1** | (the same one) |

### ESLint warnings in scope (all 14, verbatim categories)

| File:line | Rule | Relevance |
|---|---|---|
| `src/components/host/v2/listings/address-step.tsx:94` | `@next/next/no-location-assign-relative-destination` | F-13 |
| `…/amenities-step.tsx:301` | same | F-13 |
| `…/availability-step.tsx:319` | same | F-13 |
| `…/basics-step.tsx:58` | same | F-13 |
| `…/house-rules-step.tsx:170` | same | F-13 |
| `…/location-step.tsx:126` | same | F-13 |
| `…/photos-step.tsx:223` | same | F-13 |
| `…/price-step.tsx:85` | same | F-13 |
| `src/components/host/v2/host-v2-shell.tsx:14` | `no-unused-vars` (`t`) | F-24 |
| `src/components/host/host-listing-card.tsx:42` | `no-unused-vars` (`statusConfig`) | V1, pre-existing |
| `src/components/communication/conversation-list.tsx:6` | `no-unused-vars` | shared, pre-existing |
| `src/components/communication/damage-report-dialog.tsx:100` | `no-unused-vars` | shared, pre-existing |
| 2 further warnings | `no-location-assign…`, `no-unused-vars` | outside host scope |

---

## 4. Complete feature-parity matrix

Evidence is `path:line`. "Old evidence" is the V1 implementation; "V2 evidence" is the V2
one. Classification was assigned only after tracing UI → action/route → service → Prisma.

### 4.1 Shell, navigation, account

| Area | Old feature | Old evidence | V2 equivalent | V2 evidence | Classification | Notes |
|---|---|---|---|---|---|---|
| Shell | Sidebar shell + page auth | `(host)/layout.tsx:8` `requireHostPage()` | Header/bottom-nav shell + page auth | `(host-v2)/host/v2/layout.tsx:7` `requireHostPage("/host/v2")` | FULL PARITY | Both also gated by `src/proxy.ts:194-207` |
| Navigation | 6 sidebar destinations | `host-sidebar.tsx:47-54` | 5 nav destinations | `host-v2-nav.tsx:20-26` | PARTIAL | Notifications and Mobile preview dropped — see rows below |
| Nav badges | Unread counts on Dashboard/Bookings/Inbox/Notifications | `host-sidebar.tsx:95-104` (`useAttentionSummary`) | none | `host-v2-nav.tsx` has no badge | PARTIAL | Counts exist only on the Today page's rows |
| Account switching | Guest links (Stays/Home), Trips, Account, Admin, Log out | `host-sidebar.tsx:168-262` | Same set + Favorites, Messages, Support, Language, Currency | `host-v2-account-menu.tsx:90-192` | IMPROVED | |
| Panel switching | "New host panel" → `/host/panel?version=v2` | `host-sidebar.tsx:221` | "Current host panel" → `/host/panel?version=current` **and** a bare `/host/listings` link | `host-v2-account-menu.tsx:151,157` | FULL PARITY | Two escape hatches; the second bypasses the cookie |
| Language widget | Google Translate widget in sidebar | `host-sidebar.tsx:191-198` | Regional settings dialog (language + currency) | `host-v2-shell.tsx:122`, `host-v2-account-menu.tsx:128-141` | IMPROVED | |
| Mobile preview | `/host/mobile` React-Native preview page | `(host)/host/mobile/page.tsx:9-30` | none | — | MISSING | Developer tool; low value, but no V2 route and not linked |

### 4.2 Dashboard / Today

| Area | Old feature | Old evidence | V2 equivalent | V2 evidence | Classification | Notes |
|---|---|---|---|---|---|---|
| Stat cards | Listings / Pending / Confirmed / Total bookings | `(host)/host/page.tsx:34-63` + `getHostDashboardStats` (`listing.service.ts:176-189`) | none | `(host-v2)/host/v2/page.tsx` renders no counters | MISSING | Deliberate redesign, but no repo doc states it — classified MISSING, not INTENTIONALLY REMOVED |
| Attention items | Booking requests / Unread conversations / Damage reports | `(host)/host/page.tsx:65-102` | Same three, filtered to non-zero | `(host-v2)/host/v2/page.tsx:34-53` | FULL PARITY | Same `getHostAttentionSummary` |
| Attention → damage | → `/host/inbox` | `(host)/host/page.tsx:95` | → `/host/inbox` (**still V1**) | `(host-v2)/host/v2/page.tsx:50` | PARTIAL | F-05 |
| Latest notifications | 6 most recent unread, with deep links | `(host)/host/page.tsx:210-238`, data at `attention.service.ts:36-48` | none — `recentNotifications` is fetched and discarded | `(host-v2)/host/v2/page.tsx:26` destructures `attention` but never reads `recentNotifications` | MISSING | F-19 |
| "View all notifications" | Button → `/account/notifications` | `(host)/host/page.tsx:203-208` | none anywhere in V2 | grep: no `/account/notifications` under `src/components/host/v2` | MISSING | |
| Create-listing CTA | Header button → `/host/listings/new` | `(host)/host/page.tsx:110-114` | none on Today | — | MOVED/SHARED | Lives on the Listings page instead |
| Next-guest / promo nudge | — | — | Contextual suggestion card | `(host-v2)/host/v2/page.tsx:55-84` | IMPROVED | but its promo href is a V1 route (F-06) |

### 4.3 Listings overview

| Area | Old feature | Old evidence | V2 equivalent | V2 evidence | Classification | Notes |
|---|---|---|---|---|---|---|
| List of listings | Cards with photo, title, city, price, booking count, status | `(host)/host/listings/page.tsx:210-229`, `host-listing-card.tsx:63-97` | Rows with photo, title, and one resolved "state" sentence | `listing-overview.tsx:338-398`, `listing-state.ts:38-120` | IMPROVED | V2 surfaces failing calendar feeds, out-of-dates, too-few-photos, needs-review — none of which V1 showed |
| Grid view | — | — | Photo-first grid | `listing-overview.tsx:214-226` | IMPROVED | |
| Drafts in grid view | n/a (V1 has one view) | — | **Drafts are not rendered in grid view** | `listing-overview.tsx:215-225` maps `visible` only | PARTIAL | F-16 |
| Search | Search box over title/city/status/price/bookings | `(host)/host/listings/page.tsx:201,212` (`ListControls`) | Search over title + city, only when >8 items | `listing-overview.tsx:118-128` | PARTIAL | F-20 |
| Status filter | Filter by any of 7 statuses | `(host)/host/listings/page.tsx:202` | none | — | MISSING | F-20 |
| Sorting | 5 sorts (updated / created / title / price / bookings) | `(host)/host/listings/page.tsx:203-209` | none (fixed `updatedAt desc`) | `host-listing-overview.service.ts:55` | MISSING | F-20 |
| Archived tab | Active/Archived toggle with counts | `(host)/host/listings/page.tsx:71-98` | "Show N archived listings" disclosure | `listing-overview.tsx:228-246` | FULL PARITY | |
| Open editor | "Edit" button → `/host/listings/[id]/edit` | `host-listing-card.tsx:104-108` | Row click → `/host/v2/listings/[id]`; menu "Edit" → **`/host/listings/[id]/edit`** | `listing-overview.tsx:357`, `listing-actions-menu.tsx:137` | PARTIAL | F-04 — two different editors from one row |
| Open calendar | Calendar icon → `/host/listings/[id]/availability` | `host-listing-card.tsx:117-132` | Calendar icon → `/host/v2/calendar?listing=…` | `listing-overview.tsx:311` | FULL PARITY | |
| Preview public page | Only when APPROVED | `host-listing-card.tsx:142-167` | "View as a guest", only when APPROVED | `listing-actions-menu.tsx:142-149` | FULL PARITY | |
| Publish / hide | Toggle button | `listing-visibility-toggle.tsx` → `submitForReview` / `unpublishListing` | Switch → same two actions | `listing-visibility-switch.tsx:43,56` | FULL PARITY (desktop) / PARTIAL (mobile) | Switch is `hidden sm:block` and absent from grid + menu — F-17 |
| Archive / Unarchive | Button + confirm | `listing-archive-button.tsx` → `archiveListing`/`unarchiveListing` | Menu item + `ConfirmDialog` | `listing-actions-menu.tsx:63-82,153-162,170-187` | FULL PARITY | `router.refresh()` at `:79`, `:100` — G2 fixed |
| Delete | Button + confirm | `delete-listing-button.tsx` → `deleteListing` | Menu item + destructive `ConfirmDialog` | `listing-actions-menu.tsx:84-103,189-207` | FULL PARITY | |
| Post-mutation refresh | `revalidatePath("/host/listings")` | `listing.actions.ts` (pre-fix) | `revalidatePath` on both V1 and V2 paths + `router.refresh()` | `listing.actions.ts:707-708,728-729,766-767,789-790,806-807` | IMPROVED | wiring-audit G2 **confirmed fixed** |
| Empty state | Title + copy + CTA | `(host)/host/listings/page.tsx:183-198` | Title + copy + CTA | `listing-overview.tsx:514-535` | FULL PARITY | |

### 4.4 Drafts

| Area | Old feature | Old evidence | V2 equivalent | V2 evidence | Classification | Notes |
|---|---|---|---|---|---|---|
| Draft list | "In-progress drafts" section with step + last-edited date | `(host)/host/listings/page.tsx:100-163` | Draft rows inline with listings, "Stopped at step N of M" | `listing-overview.tsx:401-438`, `(host-v2)/…/listings/page.tsx:28-40` | PARTIAL | "Last edited {date}" dropped; drafts absent from grid view (F-16) |
| Resume draft | `/host/listings/new?draft=<id>` | `(host)/host/listings/page.tsx:150` | `/host/start/resume?draft=<id>` → cookie + step route | `listing-overview.tsx:417`, `(host-start)/host/start/resume/route.ts:11-27` | PARTIAL | Resume lands on the wrong screen for three of the eleven step ids — F-08 |
| Delete draft | Button + confirm | `delete-draft-button.tsx:18` | Trash button + destructive confirm + `router.refresh()` | `delete-draft-control.tsx:34-44` | FULL PARITY | but revalidates only the V1 path (`listing.actions.ts:146`) and leaves the `host_start_draft` cookie pointing at a deleted row — F-18 |
| Empty-draft hiding | `isEmptyListingDraft` filter | `(host)/host/listings/page.tsx:51-55` | Same filter | `(host-v2)/…/listings/page.tsx:28-29` | FULL PARITY | Not applied on `/host/start` itself — F-22 |
| Draft autosave | Debounced 900 ms + on every field blur, serialized queue, visible save status | `listing-form.tsx:998-1054,1176` | Save on "Next" only | every `*-step.tsx` `onNext` | PARTIAL | F-14 — closing the tab mid-step loses that step |
| Draft id in URL | `history.replaceState` puts `?draft=` in the URL after the first save | `listing-form.tsx:1022-1026` | HTTP-only cookie `host_start_draft` | `host-start-draft.ts:3-13`, `host-start.actions.ts:54` | MOVED/SHARED | Cookie is `path:"/"`, 30 days, `httpOnly`; ownership re-checked on every read |
| Abandon draft | n/a (V1 has no in-wizard discard) | — | `abandonHostStartDraft` exists but **has no caller** | `host-start.actions.ts:107-117`; grep finds zero imports | MISSING | F-25 (dead code) |

### 4.5 Creating a listing

| Area | Old feature | Old evidence | V2 equivalent | V2 evidence | Classification | Notes |
|---|---|---|---|---|---|---|
| Entry point | "Create Listing" / "New Listing" → `/host/listings/new` | `(host)/host/listings/page.tsx:64` | "+" and "Add listing" → `/host/start/new` (clears cookie, redirects to step 1) | `listing-overview.tsx:171,527`; `(host-start)/host/start/new/route.ts:8-18` | FULL PARITY | |
| Property type | Step 1, tile grid from `getActivePropertyTypes` | `listing-form.tsx:656` + `LISTING_STEP.propertyType` | Step 1, same catalog | `property-type-step.tsx:146-151`, `(host-start)/…/property-type/page.tsx:20-25` | FULL PARITY | Persists via `save({propertyType})` |
| Suggest missing property type | `SuggestMissingOption` on the property-type step | `listing-form.tsx:2243` | none | grep: only `amenities-workspace.tsx:24` imports it | MISSING | |
| Guest-space type | Step 2, filtered by `allowedListingSpaceTypes` | `listing-form.tsx:657`, `listing-space-type.ts:38-46` | Step 2, same filter | `space-type-step.tsx:175-183`, `(host-start)/…/space-type/page.tsx:45-49` | FULL PARITY | |
| Map pin / location | Step "location": Leaflet picker, drag pin, paste Google Maps link (`resolveMapsLink`) | `listing-location-field.tsx:501`, `listing-location-picker-inner.tsx` | Address modal: Places autocomplete **or** browser geolocation | `location-step.tsx:106-128`, `address-modal.tsx:102-177` | PARTIAL | No draggable map, no Google-Maps-link paste at creation. The pin is whatever the geocoder returned. Full map editing exists post-publish (`location-workspace.tsx`) |
| Address fields | Step "address": street/unit/postcode/city/country, editing any of them clears `locationConfirmed` | `listing-form.tsx:1104-1110`, `listing-address-field.tsx` | `/host/start/address` — reachable only by pressing Back from Basics; **does not clear `locationConfirmed` or move the pin** | `address-step.tsx:85-95`; `basics-step.tsx:49` is the only inbound link | PARTIAL | **F-01 (HIGH)** |
| Country list | Full geocoder-driven country handling | `listing-address-field.tsx` | Hardcoded `MK / DK / GR / ES` on `/host/start/address`; hardcoded `MK / DK` in the modal | `address-step.tsx:48-51` vs `address-modal.tsx:210` | PARTIAL | F-21 — the two lists disagree with each other |
| Street View angle | Step "streetView": pick the pano, heading and pitch | `listing-street-view-field.tsx`, `street-view-picker.tsx` | not collected at creation | no `/host/start` step writes `streetView*` | PARTIAL | Editable post-publish: `location-workspace.tsx:341-350` |
| Capacity / details | Step "details": guests, bedrooms, beds, bathrooms | `listing-form.tsx:480` | Basics step, same four counters | `basics-step.tsx:40-58` | FULL PARITY | Counter labels are untranslated literals — F-23 |
| Amenities | Step "amenities", grouped catalog + suggest-missing | `listing-form.tsx:2988` | Amenities step, grouped catalog, search + filters | `amenities-step.tsx:296-307` | PARTIAL | No suggest-missing at creation |
| Photos | Step "photos": images **and video**, drag reorder, cover = first, upload queue with retry | `listing-images-field.tsx:79-128,396,537` | Photos step: images only, drag reorder, cover = first | `photos-step.tsx:126-225`; `PHOTO_INPUT_ACCEPT` excludes video (`photo-draft.ts:14-15`) | PARTIAL | No video at creation (available post-publish, `photos-workspace.tsx:655`); upload errors are silent — **F-03 (HIGH)** |
| Photo minimum | 3 to leave the step; 3 to publish | `listing-form.tsx:518`, `listing.actions.ts:317` | 5 to leave the step; 3 to publish | `photo-draft.ts:11`, `listing.actions.ts:317` | PARTIAL | Three different constants for one rule — §10 |
| Title & description | Step "description", min 5 / min 20 chars | `listing-form.tsx:481` + `listing.schema.ts:12-13` | Description step, same bounds | `description-step.tsx:159-161` | FULL PARITY | Uses `router.push`, unlike the other 8 steps — F-13 |
| Currency | Host picks from `quotableCurrencies(rates)` | `listing-currency-picker.tsx`, `listing-form.tsx:2505`, `(host)/host/listings/new/page.tsx:26,37` | Hardcoded `DEFAULT_CURRENCY` | `(host-start)/host/start/price/page.tsx:28`, `constants.ts:22` | MISSING | **F-02 (HIGH)** — and it silently overwrites an imported currency |
| Nightly price | Step "pricing" | `listing-form.tsx:482` | Price step | `price-step.tsx:84` | FULL PARITY | |
| Cleaning fee | Step "pricing" | `listing-form.tsx:482` (`cleaningFee` in `fieldsByStep`) | not collected — publish defaults to `"0"` | `listing.actions.ts:264` | MISSING | Editable post-publish via Calendar default pricing |
| Minimum stay | Step "pricing" | `listing-form.tsx:482` | Availability step stepper | `availability-step.tsx:318` | FULL PARITY | |
| Special offer / launch promotion | Step "specialOffer": percent discount, free cleaning, minimum nights, with cross-field rules | `listing-form.tsx:527-529`, `listing-wizard-validation.ts`, `listing.actions.ts:284-314` | not collected — publish defaults to `promotionType "NONE"` | `listing.actions.ts:268` | MISSING | Available post-publish in Calendar promotions |
| Availability start | Pre-publish screen: now / from a date / only dates I open | `listing-prepublish-plan.tsx`, `listing-availability-start.ts` | Availability step, **same three answers, same catalog keys, same validator** | `availability-step.tsx:81-123,316-318`, `listing-availability-step.ts` | FULL PARITY | Best-executed parity in the flow |
| Pre-publish date plan | Block ranges, open ranges, per-date prices, dated offers — all applied atomically at publish | `listing-prepublish-plan.tsx` (2 411 lines); consumed at `listing.actions.ts:349-412` | not collected — only `availabilityStart` is written into the plan | `availability-step.tsx:317` spreads `EMPTY_PRE_PUBLISH_PLAN` | MISSING | The publish transaction still supports all four; nothing in V2 fills them |
| House rules | Stay times + max guests inside the wizard | `listing-stay-times.tsx`, `listing-form.tsx` | House rules step | `house-rules-step.tsx:169` | FULL PARITY | `maxGuests` is asked twice (Basics and House rules) but pre-filled from the draft (`house-rules-step.tsx:54`), so it is a duplicate question rather than a silent overwrite |
| Review / pre-publish checklist | Per-field blockers, each linking to the step that owns it and focusing the offending control | `listing-form.tsx:423-532` (`stepForField`, `focusStepIssue`, `listingStepIssues`) | Summary list with per-row Edit links; **no pre-flight validation** — the server's English error string is toasted on failure | `review-step.tsx:84-137,151-156` | PARTIAL | F-09 |
| Publish | `submitNewListing` (property + listing + pricing + promotions + blocks + windows + date prices + amenities + images, one nested create) | `listing.actions.ts:227-508` | Same action, via `publishHostStartDraft` → `/api/host-start/draft` POST | `host-start.actions.ts:87-105`, `api/host-start/draft/route.ts:19-28` | FULL PARITY | wiring-audit G1 **confirmed fixed** |
| Published screen | Celebration + links to the live listing, its editor, and all listings | `listing-published-screen.tsx:18-110` | Celebration + "Back to listings" only; the returned `listingId`/`slug` are parsed and discarded | `review-step.tsx:152-155,174-224` | PARTIAL | F-10 |
| Live preview pane | Split view with a live guest-facing preview of the listing being built | `listing-form.tsx` (`host-split-view`, `initialPane`), `(host)/host/listings/[id]/edit/page.tsx:65` | none | — | MISSING | |

### 4.6 Importing a listing

| Area | Old feature | Old evidence | V2 equivalent | V2 evidence | Classification | Notes |
|---|---|---|---|---|---|---|
| Import entry point | Panel on step 1 of the wizard, for new drafts only | `listing-form.tsx:2098` | `/host/start/import` — **not linked from anywhere in `/host/v2`** | grep for `"/host/start"`: only `property-type-step.tsx:147` (Back) and `new-listing-import.tsx:16` (Exit) | PARTIAL | F-07 |
| Import mechanics | POST `/api/listing-import`, creates an owned `ListingDraft` | `listing-import-panel.tsx` | Same route, same draft | `import-listing-form.tsx:34-43`, `api/listing-import/route.ts:92-263` | FULL PARITY | auth + rate limit + rights checkbox all present |
| Post-import resume | Reopens the wizard at the imported draft | `?draft=<id>` | `/host/start/resume?draft=<id>` | `import-listing-form.tsx:43` | FULL PARITY | |
| Imported price quote | Shown as a comparison proposal beside the host's own rate | `listing-form.tsx:2523`, `4161-4222` (`ImportedPriceProposal`) | never rendered | grep: no `importedPriceQuote` under `src/components/host/v2` | MISSING | The field is still written (`api/listing-import/route.ts:231`) and still survives the merge |
| Imported currency | Preserved (host picks/confirms) | `listing-currency-picker.tsx` | **Overwritten with EUR** | `price-step.tsx:84` | PARTIAL | **F-02 (HIGH)** |
| Imported provenance | `importProvider`, `importSourceUrl`, `importedAt`, `importLocationApproximate` kept on the draft | `listing-draft.ts:54-60` | Survives: the patch schema is `.strict()` so these are never sent, and `mergeMobileListingDraft` spreads over existing JSON | `mobile-listing-draft.ts:20-89,126-140` | FULL PARITY | Verified: no V2 step sends these keys, so none is dropped |

### 4.7 Editing an existing listing

| Area | Old feature | Old evidence | V2 equivalent | V2 evidence | Classification | Notes |
|---|---|---|---|---|---|---|
| Editor entry | `/host/listings/[id]/edit`, one long form | `(host)/host/listings/[id]/edit/page.tsx` | `/host/v2/listings/[id]` → redirect to `/photos`; 9 sections | `(host-editor)/…/[id]/page.tsx:11`, `editor-sections.ts:19-31` | IMPROVED | |
| Listing switcher | none | — | Header dropdown across all non-archived listings, keeping the section | `editor-header.tsx:92-187`, `listing-editor.service.ts:198-222` | IMPROVED | |
| Completion ticks | none | — | 4 of 9 sections report a stored completion state | `editor-sections.ts:33-59`, `listing-editor.service.ts:266-281` | IMPROVED | Deliberately excludes sections with no persisted "reviewed" flag — documented at `(host-editor)/…/amenities/page.tsx:10-22` |
| Title & description | Part of the big form, saved by `updateListing` | `listing.actions.ts:595-611` | Own section + `updateListingBasics` | `listing-basics.actions.ts:43-83` | FULL PARITY | 8 action + 3 service tests |
| Property type & space type | Part of the big form | `listing.actions.ts:574-593` | Property details section + `updateListingPropertyDetails` | `listing-property-details.actions.ts:18-40` | FULL PARITY | Server does not re-apply `allowedListingSpaceTypes` — F-27 |
| Capacity | maxGuests/bedrooms/beds/bathrooms in one place | `listing.actions.ts:601-604` | **Split**: bedrooms/beds/bathrooms in Property details, maxGuests in House rules | `listing-property-details.actions.ts:34`, `listing-house-rules.actions.ts` | MOVED/SHARED | Documented in `docs/product/house-rules-data-contract.md` |
| Amenities | Grouped picker + suggest-missing | `listing-form.tsx:2988` | Own section, debounced autosave, rollback on server rejection, suggest-missing kept | `amenities-workspace.tsx:24,30,40-48`, `listing-amenities.actions.ts:45-111` | IMPROVED | 14 action + 5 service tests |
| Photos | Reorder, cover, delete, video | `listing-images-field.tsx` | Reorder, cover, delete, video, **rooms and room assignment**, bulk selection | `photos-workspace.tsx`, `listing-photos.actions.ts` (11 actions) | IMPROVED | but deleting no longer removes the file from storage — F-11 |
| Orphan-file cleanup | Removed local uploads are deleted from storage | `listing.actions.ts:647-651` | none | `listing-photos.actions.ts:310-312` deletes rows only | PARTIAL | F-11 |
| Rooms / room types | none | — | Room CRUD, per-room covers, per-room ordering | `listing-photos.actions.ts:338-462`, `room-type.service.ts` | IMPROVED | |
| Location | Map, address, Street View, Google-Maps-link paste | `listing-location-field.tsx` | Search, pin, address, Street View, privacy note, explicit save | `location-workspace.tsx`, `listing-location.actions.ts:28-139` | FULL PARITY | Strongest ownership check in the codebase: `:67` re-checks `property.ownerId` on top of the query filter |
| House rules | Stay times + max guests | `listing-stay-times.tsx` | Own section + explicit "kept elsewhere" explanations | `house-rules-workspace.tsx`, `house-rules-elsewhere.tsx`, `listing-house-rules.actions.ts:46-95` | IMPROVED | 14 action + 5 service + 8 component tests |
| Arrival guide | none | — | Read-only summary, edits delegated to House rules | `(host-editor)/…/arrival-guide/page.tsx:10-14` | IMPROVED | Scope documented in `docs/planning/arrival-guide-data-contract.md` |
| Pricing | Editable in the wizard + `/host/listings/[id]/pricing` lens | `(host)/host/listings/[id]/pricing/page.tsx` | Read-only report + handoff to Calendar | `(host-editor)/…/pricing/page.tsx:9-13`, `pricing-overview.tsx:363-373` | MOVED/SHARED | Deliberate: Calendar owns price |
| Availability | `/host/listings/[id]/availability` lens | `(host)/host/listings/[id]/availability/page.tsx` | Read-only report + handoff to Calendar | `(host-editor)/…/availability/page.tsx:9-18` | MOVED/SHARED | |
| Publish/hide from editor | Publish bar in the wizard | `listing-publish-bar.tsx`, `submit-for-review-button.tsx` | none in the editor header | `editor-header.tsx:202-227` has Preview / Calendar / Classic only | PARTIAL | Available from Listings (desktop) and Calendar |
| Preview public page | Only rendered when APPROVED | `host-listing-card.tsx:142` | Always rendered, for any status | `editor-header.tsx:191-200`, `editor-section-footer.tsx:68-78` | PARTIAL | F-12 — 404 for every non-APPROVED listing |
| Moderation note | Rejection reason shown in the editor | `(host)/host/listings/[id]/edit/page.tsx:64` (`moderationNote`) | not shown | `getListingEditorHeader` (`listing-editor.service.ts:226-257`) does not select it | MISSING | A REJECTED listing shows the status dot but never the reason |

### 4.8 Calendar, pricing, promotions, sync

| Area | Old feature | Old evidence | V2 equivalent | V2 evidence | Classification | Notes |
|---|---|---|---|---|---|---|
| Calendar surface | Three per-listing lenses (availability / pricing / promotion) | `(host)/host/listings/[id]/_calendar/lens-page.tsx`, `calendar-workspace.tsx` (2 636 lines) | One multi-property workspace | `(host-v2)/host/v2/calendar/page.tsx`, `host-calendar-workspace.service.ts` | IMPROVED | |
| Date selection | Range select | `calendar-workspace.tsx` | Drag select + keyboard | `use-drag-select.ts`, `calendar-month-grid.tsx` | IMPROVED | |
| Block / open dates | `blockCalendarRange`/`openCalendarRange` (mode-dependent semantics) | `calendar.actions.ts:75+`, `availability-mutation.service.ts:42-61` | `blockCalendarDatesForV2`/`openCalendarDatesForV2` — always writes a `MANUAL_BLOCK` | `calendar-v2.actions.ts:55-95` | IMPROVED | Deliberate divergence, documented at `calendar-v2.actions.ts:11-32`; two implementations now coexist — §10 |
| Private block note | — | — | 200-char note on the block row | `availability-mutation.service.ts:102-106` | IMPROVED | |
| Per-date price | `upsertListingDatePriceRange` | `availability.actions.ts` | Same action via `setCalendarDatePrice` | `calendar.actions.ts:55-73` | FULL PARITY | |
| Default pricing | `saveListingPricing` | `pricing.actions.ts:12-31` | Same action | `calendar-actions.ts:79-89` | FULL PARITY | |
| Promotions | `saveListingPromotion` form | `promotion.actions.ts:55-77`, `listing-promotion-form.tsx` | Date-scoped and evergreen offers, shadow/clash warnings | `calendar-actions.ts:62-71,90-100`, `promotion-help.tsx` | IMPROVED | |
| Review-before-save | — | — | Explicit consequence review for listing-wide changes | `review-dialog.tsx`, `calendar-review.ts` | IMPROVED | |
| Undo | — | — | Inverse steps computed before the write | `host-calendar-workspace.tsx:771-798,859-885` | IMPROVED | |
| Publish / hide from calendar | — | — | `ListingVisibilityEditor` with publish blockers | `listing-editors.tsx:225-371`, `listing-status.ts:163-193` | IMPROVED | Blockers mirror `submitForReview` exactly |
| External calendar import | `addCalendarFeed`/`refreshCalendarFeed`/`removeCalendarFeed` | `calendar-sync.actions.ts:138-254`, `calendar-connections.tsx` | Same actions | `connected-calendars.tsx` | FULL PARITY | SSRF-guarded (`calendar-sync/service.ts:189-240`) |
| Calendar export | Token URL + rotate | `calendar-sync.actions.ts:123-136`, `api/calendar/[token]/route.ts` | Same | `connected-calendars.tsx` | FULL PARITY | |
| Cache invalidation | `revalidatePath` on V1 routes | `availability-mutation.service.ts:76-81`, `pricing-promotion-mutation.service.ts:67-81`, `calendar-sync.actions.ts:103-106` | **unchanged — still V1-only** | same lines | PARTIAL | F-15 |

### 4.9 Reservations / bookings

| Area | Old feature | Old evidence | V2 equivalent | V2 evidence | Classification | Notes |
|---|---|---|---|---|---|---|
| Booking list | List + action queue by deadline | `(host)/host/bookings/page.tsx:93-125`, `booking-action-queue.ts` | Stream + attention rail, same queue concepts | `host-reservations-workspace.tsx`, `reservation-stream.tsx` | IMPROVED | |
| Expire/complete sweeps | Run before the list renders | `listing.service.ts:58-59` | Same two sweeps | `host-reservations.service.ts:39-40` | FULL PARITY | |
| Accept / decline | `confirmBookingAction` / `rejectBookingAction` | `booking.actions.ts:90-143` | Same actions | `reservation-stream.tsx` | FULL PARITY | Both revalidate `/host/v2/reservations` (`:106,135`) |
| Host cancel | `hostCancelBookingAction` + reason | `host-cancel-booking-button.tsx` | Same component reused | `reservation-panel.tsx:365` | FULL PARITY | |
| Booking detail page | `/host/bookings/[id]` with hero, guest, price breakdown | `(host)/host/bookings/[id]/page.tsx` | Side panel; "Open full reservation" → **`/host/bookings/[id]`** | `reservation-panel.tsx:371` | PARTIAL | F-04 family |
| Message guest | `StartConversationButton` | `(host)/host/bookings/[id]/page.tsx:10` | Same component + link to the V2 thread | `reservation-panel.tsx:268-289` | FULL PARITY | |
| Rate guest | Review invitation surfaced in the queue | `(host)/host/bookings/page.tsx:48-51` | "Rate guest" → `/account/bookings/[id]/after-stay` | `reservation-panel.tsx:383-390` | MOVED/SHARED | The after-stay page is shared with the guest surface |
| Price breakdown | Full breakdown | `(host)/host/bookings/[id]/page.tsx:31-36` | Full breakdown | `reservation-panel.tsx:300-347` | FULL PARITY | |
| Filters / search | `ListControls` over bookings | `(host)/host/bookings/page.tsx:15` | Property rail + status grouping | `host-reservations-workspace.tsx` | PARTIAL | No free-text search over guest name or reference |

### 4.10 Messages

| Area | Old feature | Old evidence | V2 equivalent | V2 evidence | Classification | Notes |
|---|---|---|---|---|---|---|
| Conversation list | **All** of the user's conversations (`listUserConversations`) | `(host)/host/inbox/page.tsx:10` | Only conversations on the host's own listings | `host-inbox.service.ts:37-41` | PARTIAL | F-26 — support/admin threads and any listing-less thread are invisible in V2 |
| Thread view | Shared `ConversationThread` | `components/communication/conversation-thread.tsx` | Purpose-built `InboxThread` with a reservation rail | `inbox-thread.tsx` (919 lines), `reservation-rail.tsx` | IMPROVED | |
| Send message | `POST /api/conversations/[id]/messages` | route handler | Same route | `inbox-thread.tsx:248,373` | FULL PARITY | auth `:33-36`, rate limit `:38-51` |
| Read receipts | `POST …/read` | route handler | Same | `inbox-thread.tsx:237` | FULL PARITY | |
| Live updates | polling | — | 5 s poll **plus** SSE `…/events` | `inbox-thread.tsx:274-284` | IMPROVED | |
| Damage reports | Report + acknowledge / escalate / resolve | `damage-report-dialog.tsx`, `api/conversations/[id]/damage-reports` | Same actions inside the thread | `inbox-thread.tsx:408-422,632-665` | FULL PARITY | but Today still routes the damage count to `/host/inbox` (F-05) |
| Booking context | Link to the booking | `conversation-thread.tsx` | Reservation rail with `detailsUrl` → **`/host/bookings/[id]`** | `host-inbox.service.ts:220` | PARTIAL | F-04 family |

### 4.11 Other

| Area | Old feature | Old evidence | V2 equivalent | V2 evidence | Classification | Notes |
|---|---|---|---|---|---|---|
| Support cases | Reachable only via `/account/support` | not in the V1 host nav | Account menu → `/account/support` | `host-v2-account-menu.tsx:114-119` | IMPROVED | |
| Reviews/ratings received | Not surfaced in the V1 host panel | — | Not surfaced | — | INTENTIONALLY REMOVED | Neither panel has it; parity holds |
| Notifications | Sidebar item + dashboard list | `host-sidebar.tsx:52`, `(host)/host/page.tsx:185-239` | none | — | MISSING | F-19 |
| Responsive behaviour | Sidebar collapses to a `Sheet` | `host-sidebar.tsx:279-290` | Bottom nav below `md`, header above; editor is a document below `lg` | `host-v2-shell.tsx:41-118`, `(host-editor)/…/layout.tsx:49` | IMPROVED | Three controls are desktop-only — F-17 |
| Mobile app parity | Draft API shared with Expo | `api/mobile/v1/drafts/**` | Same `ListingDraft` contract, same `parseMobileListingDraftPatch` | `host-start.actions.ts:33`, `mobile-listing-draft.ts` | IMPROVED | V2 web now uses the mobile draft contract — one schema, not two |
| First-time welcome | none | — | `/host/start?firstTime=1` welcome screen | `(host-start)/host/start/page.tsx:29` | IMPROVED | but exposed to hosts via a "Preview first-time welcome" link — F-28 |
| Dev/QA surfaces | — | — | `(dev)/ui-lab/calendar`, empty `src/app/qa-listing-editor/` directory | `find src/app/qa-listing-editor -type f` returns nothing | INTENTIONALLY REMOVED | The empty directory produces no route |

---

## 5. Confirmed defects

Ordered by severity. Every finding below was traced from the UI control to the database
write or external effect. Speculative concerns are in §12 instead.

---

### [F-01] The create flow can publish a listing whose address and map pin disagree

- **Severity: HIGH**
- **Status: Confirmed**

**Old behavior.** In the V1 wizard, typing over *any* address field immediately reset
`locationConfirmed` to `"false"`, forcing the host back through the map/address confirmation
before publish would be allowed:

```
src/components/host/listing-form.tsx:1104-1110
  // Typing over any part of the address un-confirms it: the host has to look at
  // the edited version and confirm that, not ride on a confirmation they gave for
  // different text.
  if ((LOCATION_TEXT_FIELDS as readonly string[]).includes(field)) {
    next.locationConfirmed = "false";
  }
```

Re-confirmation was gated on the pin still being present
([listing-form.tsx:1183-1189](../../src/components/host/listing-form.tsx)), and the Address
step refused to advance without a pin ([listing-form.tsx:504-509](../../src/components/host/listing-form.tsx)).

**V2 behavior.** `/host/start/address` writes five address fields and nothing else:

```
src/components/host/v2/listings/address-step.tsx:85-95
  onNext={async () => {
    const saved = await save({
      address: street, area: unit, postalCode: postcode,
      city, country, currentStepId: "details",
    });
```

`latitude`, `longitude`, `locationSource`, `geocodingPlaceId` and `locationConfirmed` are
untouched. The only writer of `locationConfirmed: "true"` is the map modal
([location-step.tsx:112-125](../../src/components/host/v2/listings/location-step.tsx)).

**User impact.** A host confirms the pin for "Partizanska 12, Skopje", continues to Basics,
presses **Back** ([basics-step.tsx:49](../../src/components/host/v2/listings/basics-step.tsx)
links to `/host/start/address`), and corrects the address to a different street — or a
different city, or a different **country**, since the country `<select>` is right there
([address-step.tsx:47-52](../../src/components/host/v2/listings/address-step.tsx)). Publish
succeeds: `listingFormSchema` sees a valid address, valid coordinates and
`locationConfirmed === "true"`. The listing goes live with an address the guest reads and a
pin the guest navigates to — in different places. Guests arrive at the wrong address; the
3-day exact-location unlock (`street-view-access.ts`) reveals the wrong pin.

**Technical cause.** V2 split the single stateful wizard into independent screens, and the
invariant "editing address text invalidates the confirmation" lived in the wizard's
`setField`, which no longer exists. Nothing on the server re-derives it either:
`listingFormSchema` only checks that `locationConfirmed === "true"`
([listing.schema.ts:35-39](../../src/lib/validations/listing.schema.ts)) — it cannot know the
text changed after the confirmation was given.

**Evidence.**
- `src/components/host/v2/listings/address-step.tsx:85-95` — the save
- `src/components/host/v2/listings/basics-step.tsx:49` — the inbound Back link
- `src/components/host/v2/listings/location-step.tsx:112-125` — the only writer of `locationConfirmed`
- `src/components/host/listing-form.tsx:1104-1110` — the V1 rule that was lost
- `src/lib/validations/listing.schema.ts:23-39` — the server accepts the mismatch
- `src/lib/actions/listing.actions.ts:416-436` — the mismatched pair is written to `Property`

**Recommended remediation direction.** Have `AddressStep` clear the pin fields it
invalidates (send `locationConfirmed: ""` alongside the address patch) and route the host
back through the map, exactly as V1 did; or move address editing inside the map modal so
the two can never be edited independently. A server-side belt-and-braces option is to store
a hash of the confirmed address alongside `geocodingPlaceId` and reject a publish whose
address text no longer matches.

**Suggested tests.**
- Unit: a draft with `locationConfirmed:"true"` plus an address patch produces a draft with
  `locationConfirmed` cleared.
- Action: `submitNewListing` rejects a form whose address differs from the one the stored
  `geocodingPlaceId` resolves to.
- Component: `AddressStep` renders and its `onNext` patch includes the pin-invalidating keys.

---

### [F-02] The Price step silently re-denominates an imported listing into EUR

- **Severity: HIGH**
- **Status: Confirmed**

**Old behavior.** The V1 wizard let the host pick the listing currency from the live
quotable set, and pre-selected the imported one:

```
src/app/(host)/host/listings/new/page.tsx:26,37
  getExchangeRates(),
  … <ListingForm currencies={quotableCurrencies(rates)} … />
src/components/host/listing-form.tsx:2505  <ListingCurrencyPicker … />
```

**V2 behavior.** The page hard-codes the constant and the step saves it verbatim:

```
src/app/(host-start)/host/start/price/page.tsx:28
  <PriceStep … currency={DEFAULT_CURRENCY} />          // "EUR", constants.ts:22

src/components/host/v2/listings/price-step.tsx:61,84
  const [price, setPrice] = useState(() => sanitizeNightlyPriceInput(data.baseNightlyRate ?? initialPrice));
  …
  if (await save({ baseNightlyRate: price, currency, currentStepId: "specialOffer" })) {
```

Note line 61 **does** read the draft's imported amount, and line 84 **does not** read the
draft's imported currency.

**User impact.** The importer stores the source listing's real currency:

```
src/app/api/listing-import/route.ts:203-205,227-230
  const currency = imported.currency && isSupportedCurrency(imported.currency)
    ? imported.currency : "EUR";
  …
  currency,
  baseNightlyRate: imported.nightlyRate && imported.nightlyRate > 0 ? String(imported.nightlyRate) : "",
```

A host imports an Airbnb listing priced at **120 USD**. The Price step shows **"€120"**
(the symbol comes from the prop, `price-step.tsx:68`), and pressing Next writes
`currency: "EUR"` over the stored `"USD"`. `submitNewListing` then creates the `PricingRule`
at `120 EUR` ([listing.actions.ts:460-467](../../src/lib/actions/listing.actions.ts)) —
roughly a 8-10 % unannounced price change, in the direction the host loses money if the
rates move the other way. Currency is the unit for every subsequent price on the listing
(date overrides, promotions, booking totals), and the codebase elsewhere is explicit that
it must never be changed in isolation
([listing.actions.ts:549-553](../../src/lib/actions/listing.actions.ts)).

**Technical cause.** `PriceStep` was written as a UI-only screen whose currency was
decoration (its own comment at `price-step.tsx:14-18` of the page file says "there is no
listing yet to change it on"), and the persistence wiring reused the prop instead of the
draft field.

**Evidence.**
- `src/app/(host-start)/host/start/price/page.tsx:28` and `src/lib/constants.ts:22`
- `src/components/host/v2/listings/price-step.tsx:61,68,84`
- `src/app/api/listing-import/route.ts:203-205,227-230`
- `src/lib/actions/listing.actions.ts:281-283` — publish only checks the currency is
  *quotable*, not that it is the one the host was shown
- `src/lib/actions/listing.actions.ts:549-553` — the codebase's own statement of the rule

**Recommended remediation direction.** Seed the step from `data.currency ?? DEFAULT_CURRENCY`
and either (a) omit `currency` from the patch entirely, so an imported value is never
overwritten, or (b) restore a currency picker fed by `quotableCurrencies(await getExchangeRates())`,
matching V1.

**Suggested tests.**
- Unit: a draft carrying `currency:"USD"` survives a `PriceStep` save unchanged.
- Component: `PriceStep` renders "$" when the draft currency is USD.
- Integration: import → walk the flow → published `PricingRule.currency` equals the imported one.

---

### [F-03] Photo-upload failures in the create flow are silent, and leak orphaned files

- **Severity: HIGH**
- **Status: Confirmed**

**Old behavior.** The V1 wizard ran an upload queue with per-file progress, an explicit
error state, retry, and a hard step gate while uploads were in flight
([listing-images-field.tsx:97-128,537](../../src/components/host/listing-images-field.tsx);
[listing-form.tsx:511-517](../../src/components/host/listing-form.tsx): *"Still a hard stop:
leaving mid-upload loses the files"*).

**V2 behavior.** `savePhotos()` uploads sequentially and **throws** on the first failure:

```
src/components/host/v2/listings/photos-step.tsx:217-220
  const response = await fetch("/api/upload", { method: "POST", body });
  const uploaded = (await response.json()) as { url?: string; … };
  if (!response.ok || !uploaded.url) throw new Error(uploaded.error ?? `Could not upload ${photo.name}.`);
```

The only caller is the footer's `onNext`, which awaits it without a `catch`:

```
src/components/host/v2/listings/listing-flow-footer.tsx:50-58
  async function handleNext() {
    if (!onNext || pending) return;
    setPending(true);
    try { await onNext(); } finally { setPending(false); }
  }
…:101  onClick={() => void handleNext()}
```

**User impact.** A host with 8 photos hits a 10 MB limit, a 429 rate limit
([api/upload/route.ts:103-109](../../src/app/api/upload/route.ts)), or a storage error on the
fifth file. The spinner stops. **No toast, no error text, no navigation.** The Next button
simply appears not to work; the host presses it again, and files 1-4 upload a second time.
Every successfully uploaded file in every failed attempt is written to storage and
referenced by nothing — the draft is only patched *after* the whole loop succeeds
(`photos-step.tsx:222`). Nothing ever reclaims them: the only orphan cleanup in the codebase
is the importer's ([api/listing-import/route.ts:265](../../src/app/api/listing-import/route.ts)).

**Technical cause.** Two components written against different error contracts: `savePhotos`
throws, `ListingFlowFooter` assumes `onNext` resolves. Every other step's `onNext` returns a
boolean and the footer's contract happens to fit.

**Evidence.**
- `src/components/host/v2/listings/photos-step.tsx:204-225`
- `src/components/host/v2/listings/listing-flow-footer.tsx:50-58,101,108`
- `src/app/api/upload/route.ts:103-109,141-146,188-194` — the three failure modes
- `src/components/host/listing-form.tsx:511-517` — the V1 gate that was lost
- `src/app/api/listing-import/route.ts:265` — the only orphan cleanup that exists

**Recommended remediation direction.** Wrap the loop in `try/catch` and toast the message;
track per-photo upload state so successes are not re-uploaded on retry; record uploaded URLs
into the draft incrementally (or delete them on failure) so nothing is orphaned. Adding a
`catch` inside `ListingFlowFooter.handleNext` would also make every future step fail loudly
rather than silently.

**Suggested tests.**
- Component: a mocked 429 from `/api/upload` produces a visible error and leaves the host
  on the Photos step.
- Component: a retry after a partial failure does not re-POST the already-uploaded files.

---

### [F-04] The V2 listings row and editor header send the host into the V1 editor

- **Severity: MEDIUM**
- **Status: Confirmed**

**Old behavior.** `/host/listings` → Edit → `/host/listings/[id]/edit`. One editor.

**V2 behavior.** Two editors, from the same row:

```
src/components/host/v2/listings/listing-overview.tsx:357
  <Link href={`/host/v2/listings/${listing.id}`} …>          // row click → V2 editor

src/components/host/v2/listings/listing-actions-menu.tsx:136-141
  <DropdownMenuItem asChild>
    <Link href={`/host/listings/${listingId}/edit`}>          // "Edit" → V1 editor
      … {resolve("host.workspace.edit", "Edit").text}
```

And in the V2 editor's own header:

```
src/components/host/v2/editor/editor-header.tsx:221-225
  <Link href={`/host/listings/${listingId}/edit`}>
    <Tx k="host.editor.open_classic" source="Open the classic editor" />
```

**User impact.** A host who opens the row's `…` menu and picks the item literally labelled
"Edit" lands in the old panel — different chrome, different sidebar, different save
semantics (`updateListing` rewrites amenities and images wholesale,
[listing.actions.ts:618-645](../../src/lib/actions/listing.actions.ts), where the V2 editor
patches them individually). Two hosts describing "the editor" mean different screens.
More consequentially, **V1 cannot be retired** while these links exist.

**Technical cause.** The classic-editor handoff was correct while V2 sections were
placeholders; every section is now `built: true`
([editor-sections.ts:19-31](../../src/lib/host/v2/editor-sections.ts)) and the handoff was
never removed.

**Evidence.** The three call sites above, plus `editor-sections.ts:19-31` proving no section
still needs the handoff.

**Recommended remediation direction.** Point the menu's "Edit" at `/host/v2/listings/[id]`.
Keep or drop "Open the classic editor" as a deliberate product decision — but if it stays,
label it as a fallback, not as the primary Edit action.

**Suggested tests.** Component: `ListingActionsMenu` renders an `href` under `/host/v2/`.

---

### [F-05] Today's "Damage reports" row links into the V1 inbox

- **Severity: MEDIUM**
- **Status: Confirmed**

**Old behavior.** `/host/page.tsx:95` → `/host/inbox`, which is where V1 damage reports live.

**V2 behavior.**

```
src/app/(host-v2)/host/v2/page.tsx:47-52
  { label: t.resolve("host.v2.attention.damage_reports", "Damage reports"),
    value: attention.damageReports,
    href: "/host/inbox",                                    // ← V1
```

while the two rows above it correctly target `/host/v2/reservations` and `/host/v2/messages`.

**User impact.** The one attention row that is about money and liability drops the host out
of the V2 panel into the old one — even though V2's own thread view handles damage reports
in full ([inbox-thread.tsx:408-422,632-665](../../src/components/host/v2/messages/inbox-thread.tsx)).

**Technical cause.** `getHostAttentionSummary` returns a count, not a conversation id, so
there is no single V2 thread to link to; `/host/v2/messages` is the closest correct target
and was not used.

**Evidence.** `src/app/(host-v2)/host/v2/page.tsx:38-52`;
`src/components/host/v2/messages/inbox-thread.tsx:408-422`;
`src/lib/services/attention.service.ts:29-35`.

**Recommended remediation direction.** Point the row at `/host/v2/messages`, or extend
`getHostAttentionSummary` to return the conversation id of the newest open report and deep-link
to `/host/v2/messages/[id]`.

**Suggested tests.** Server-component render: every `href` on the Today page starts with
`/host/v2` or `/account`.

---

### [F-06] Today's promotion suggestion links into the V1 promotion lens

- **Severity: MEDIUM**
- **Status: Confirmed**

```
src/app/(host-v2)/host/v2/page.tsx:57-59
  ? { icon: Sparkles,
      href: `/host/listings/${attention.firstActiveListing.id}/promotion`,   // ← V1
```

**User impact.** The card shown to a host with zero confirmed bookings — i.e. a brand-new
host, the audience least able to tell the two panels apart — is the one that ejects them
into the old panel. V2 has a richer promotions surface
(`promotion-help.tsx`, `listing-editors.tsx` — evergreen and date-scoped offers, shadow and
clash warnings) reachable at `/host/v2/calendar?listing=…`; the very next branch of the same
ternary already uses that URL (`page.tsx:73`).

**Evidence.** `src/app/(host-v2)/host/v2/page.tsx:55-84` (compare `:59` with `:73`).

**Recommended remediation direction.** Use `/host/v2/calendar?listing=${id}` for both branches.

**Suggested tests.** As F-05.

---

### [F-07] The URL importer is unreachable from the V2 panel

- **Severity: MEDIUM**
- **Status: Confirmed**

**Old behavior.** The importer sat on step 1 of the wizard, so every host starting a listing
saw it: `listing-form.tsx:2098` — `{!isEditing && !initialDraftId && <ListingImportPanel />}`.

**V2 behavior.** The importer lives on `/host/start/import`, reachable only from
`/host/start` ([listing-start-dashboard.tsx:77-94](../../src/components/host/v2/listings/listing-start-dashboard.tsx)).
Both V2 entry points skip that dashboard:

```
src/components/host/v2/listings/listing-overview.tsx:171,527
  href="/host/start/new"          // "+" toolbar button
  href="/host/start/new"          // empty-state "Add listing"
```

and `/host/start/new` redirects straight to `/host/start/property-type`
([new/route.ts:13](../../src/app/(host-start)/host/start/new/route.ts)). A repository-wide
grep for a link to `"/host/start"` finds exactly two, both *inside* the flow: the
property-type step's **Back** link
([property-type-step.tsx:147](../../src/components/host/v2/listings/property-type-step.tsx))
and the import screen's own Exit
([new-listing-import.tsx:16](../../src/components/host/v2/listings/new-listing-import.tsx)).

**User impact.** "Create from an existing listing — paste a link from Airbnb, Booking.com,
Facebook and more" is a headline acquisition feature, fully implemented and rate-limited,
that a host can only find by starting a new listing and immediately pressing Back. The same
navigation gap hides the draft dashboard and its "Finish your listing" card.

**Evidence.** The four locations above, plus `src/app/api/listing-import/route.ts` (the
working backend) and `src/components/host/listing-form.tsx:2098` (the V1 placement).

**Recommended remediation direction.** Point the "+" and empty-state CTAs at `/host/start`
(which already offers "Create a new listing" as its first action), or add an "Import" item
next to the "+" on `/host/v2/listings`.

**Suggested tests.** Component: `ListingOverview` exposes a link to the import route.

---

### [F-08] Resuming a draft lands on the wrong screen for the last three steps

- **Severity: MEDIUM**
- **Status: Confirmed**

**Old behavior.** V1 stored a step **id** and resumed exactly there:
`resumeListingStep(data.currentStepId, data.currentStep)`
([listing-steps.ts:80-89](../../src/lib/constants/listing-steps.ts)), used by both the drafts
list and the wizard.

**V2 behavior.** V2 maps that id onto one of eleven `/host/start` routes:

```
src/lib/host-start-draft.ts:15-27
  const ROUTE_BY_STEP: Record<string, string> = {
    …
    pricing: "price",
    specialOffer: "availability",
  };
```

but three different steps all write `currentStepId: "specialOffer"`:

| Step the host finished | What it stores | Where resume sends them |
|---|---|---|
| Price (`price-step.tsx:84`) | `"specialOffer"` | `/host/start/availability` ✔ |
| Availability (`availability-step.tsx:318`) | `"specialOffer"` | `/host/start/availability` ✘ (repeat) |
| House rules (`house-rules-step.tsx:169`) | `"specialOffer"` | `/host/start/availability` ✘ (two screens back) |

**User impact.** A host who completes House rules and closes the tab — the last thing before
Review — resumes two screens earlier and must re-walk Availability and House rules. Their
answers are pre-filled, so nothing is lost, but the "Stopped at step N of M" line on
`/host/v2/listings` ([listing-overview.tsx:403-409](../../src/components/host/v2/listings/listing-overview.tsx))
is also wrong, and there is no route mapping that can ever land a host on `/host/start/review`.
`ROUTE_BY_STEP` additionally maps both `streetView` and `details` to `"basics"`, and the V2
flow has no Street View screen at all.

**Technical cause.** The V2 flow has 16 screens; `LISTING_STEPS` has 11 entries built for
V1's screen list, and `mobileListingDraftPatchSchema` rejects any id outside it
([mobile-listing-draft.ts:16-18](../../src/lib/mobile-listing-draft.ts)), so the three
trailing screens have to share one id.

**Evidence.** `src/lib/host-start-draft.ts:15-39`; `price-step.tsx:84`;
`availability-step.tsx:318`; `house-rules-step.tsx:169`; `mobile-listing-draft.ts:16-18`;
`listing-overview.tsx:403-409`.

**Recommended remediation direction.** Either extend `LISTING_STEPS` with the ids the V2
flow actually has (`availability`, `houseRules`, `review`) — the mobile contract and the V1
"stopped at step N" line both read the same list, so this is a coordinated change — or store
the V2 route separately from the V1 step id.

**Suggested tests.** Unit: `hostStartResumeHref` returns a distinct route for each of the
flow's screens; `host-start-draft.test.ts` currently covers only three cases.

---

### [F-09] The Review screen has no pre-flight validation; publish failures surface as raw English server strings

- **Severity: MEDIUM**
- **Status: Confirmed**

**Old behavior.** V1 computed publish blockers per step, named the offending field, and
scrolled it into view and focused it:

```
src/components/host/listing-form.tsx:423-468   stepForField(), focusStepIssue()
src/components/host/listing-form.tsx:470-532   listingStepIssues()
```

**V2 behavior.** The Review screen renders a summary and calls the publish endpoint; the
first server rejection is toasted verbatim:

```
src/components/host/v2/listings/review-step.tsx:151-156
  const response = await fetch("/api/host-start/draft", { method: "POST" });
  const result = (await response.json()) as …;
  if ("error" in result) { toast.error(result.error); return; }
```

**User impact.** A host who left the address blank — which the Address screen actively
invites: *"You can leave this blank while testing and complete it before your listing goes
live"* ([address-step.tsx:36-40](../../src/components/host/v2/listings/address-step.tsx)) —
reaches Review, presses Publish, and gets the toast **"Address is required"**. Untranslated
(these strings come from `listingFormSchema`, which is not part of the UI catalog), with no
indication of which of nine rows to fix, and no link. The same applies to "Confirm the exact
location on the map", "Title must be at least 5 characters", "Add at least 3 photos before
publishing", and the four availability messages. The Review rows do show "Not provided"
(`review-step.tsx:63`), but nothing marks *which* of those are blocking.

**Technical cause.** The Review screen was built as a display-only summary and gained a real
publish call without gaining the checklist that used to sit beside it.

**Evidence.** `review-step.tsx:63,84-137,151-156`; `address-step.tsx:36-40`;
`src/lib/validations/listing.schema.ts:12,18,22,24,33,38`;
`src/lib/actions/listing.actions.ts:277,282,302,310,313,318,336-343`;
`src/components/host/listing-form.tsx:423-532`.

**Recommended remediation direction.** Run the shared validator client-side on the Review
screen, mark the failing rows, and disable Publish until they pass; or map the server's error
codes to catalog keys and to the row that owns them. The "while testing" copy should go
regardless — see F-29.

**Suggested tests.** Component: a draft missing an address renders a blocking marker on the
Location row and a disabled Publish control.

---

### [F-10] The publish confirmation discards the new listing's id and slug, and can be re-entered in a broken state

- **Severity: MEDIUM**
- **Status: Confirmed**

**Old behavior.** V1's published screen linked to the live listing, its editor, and all
listings, and replaced the history entry so Back could not return to the consumed draft
([listing-published-screen.tsx:8-17,60-110](../../src/components/host/listing-published-screen.tsx)).

**V2 behavior.**

```
src/components/host/v2/listings/review-step.tsx:152-155
  const result = (await response.json()) as { success: true; listingId: string; slug: string } | { error: string };
  if ("error" in result) { toast.error(result.error); return; }
  setPublished(true);                       // listingId and slug are never used
```

The confirmation offers a single "Back to listings" link (`:216`), plus a **Back** control
that returns to the summary in place (`:214-215`).

**User impact.**
1. The host has just published and cannot open what they published — no "View your listing",
   no "Edit", despite the server having returned both identifiers.
2. Pressing Back on the confirmation re-renders the summary. The URL never changed, so a
   reload at that point re-runs `HostStartLayout`, which reads a cookie that
   `publishHostStartDraft` deleted ([host-start.actions.ts:101-102](../../src/lib/actions/host-start.actions.ts)) —
   producing a Review screen with "Not provided" in every row and a Publish button that can
   only ever toast *"Your listing draft could not be found."* (`host-start.actions.ts:93`).

Double-publishing is correctly prevented (the cookie is gone), so this is a dead end rather
than a data risk.

**Evidence.** `review-step.tsx:67,152-155,174-224`; `host-start.actions.ts:87-105`;
`(host-start)/host/start/layout.tsx:9-11`; `listing-published-screen.tsx:60-110`.

**Recommended remediation direction.** Keep `listingId`/`slug` in state and offer "View your
listing" (`/properties/{slug}`) and "Edit" (`/host/v2/listings/{listingId}`); replace the
Back-to-summary control with the same links, or `router.replace` to the editor so the
consumed draft is out of history.

**Suggested tests.** Component: the confirmation state renders links containing the returned
`listingId` and `slug`.

---

### [F-11] Deleting photos in the V2 editor leaves the files on disk forever

- **Severity: MEDIUM**
- **Status: Confirmed**

**Old behavior.** V1's `updateListing` diffed the media list and deleted every removed local
upload from storage:

```
src/lib/actions/listing.actions.ts:629-651
  const removedUrls = existingImages.map((img) => img.url).filter((url) => !keptUrls.has(url));
  …
  const removedLocalUrls = removedUrls.filter(isLocalUploadUrl);
  if (removedLocalUrls.length > 0) {
    const storage = getStorageAdapter();
    await Promise.all(removedLocalUrls.map((url) => storage.delete(url)));
  }
```

**V2 behavior.** `deleteListingPhotos` deletes rows only:

```
src/lib/actions/listing-photos.actions.ts:310-312
  await db.listingImage.deleteMany({
    where: { id: { in: doomed.map((photo) => photo.id) }, listingId },
  });
```

`getStorageAdapter` is not imported anywhere in `listing-photos.actions.ts`. The same is true
of `deleteListingRoom` (`:458`), which detaches photos rather than deleting them, and of
`deleteListing`/`archiveOrDeleteListing`.

**User impact.** Every photo a host removes in the V2 editor stays in `/uploads` (or the
configured storage backend) indefinitely, still served by
`src/app/uploads/[filename]/route.ts` to anyone holding the URL. For a marketplace this is
both an unbounded storage cost and a soft privacy issue — a host who deletes a photo
containing something they did not mean to publish has not actually removed it.

**Evidence.** `src/lib/actions/listing-photos.actions.ts:1-8,294-330` (no storage import);
`src/lib/actions/listing.actions.ts:8,629-651` (the V1 behaviour);
`src/app/api/listing-import/route.ts:265` (the only cleanup in the codebase).

**Recommended remediation direction.** Add the same `isLocalUploadUrl` + `storage.delete`
step to `deleteListingPhotos`, and to `archiveOrDeleteListing` for the hard-delete branch.
A background sweep for unreferenced files would also retire the backlog this has already
created.

**Suggested tests.** Action test with a mocked storage adapter: deleting a photo calls
`storage.delete` once with the row's URL, and does not call it for a remote URL.

---

### [F-12] The editor's Preview link 404s for every listing that is not APPROVED

- **Severity: MEDIUM**
- **Status: Confirmed**

**Old behavior.** V1 rendered the Preview control only for live listings:

```
src/components/host/host-listing-card.tsx:142
  {listing.status === "APPROVED" && ( … <Link href={`/properties/${listing.slug}`}> … )}
```

and the V2 listings menu keeps that rule (`listing-actions-menu.tsx:142` gates on
`isPublished`).

**V2 behavior.** The editor renders it unconditionally, in two places:

```
src/components/host/v2/editor/editor-header.tsx:191-200      (desktop)
src/components/host/v2/editor/editor-header.tsx:210-215      (mobile, in the "…" menu)
src/components/host/v2/editor/editor-section-footer.tsx:68-78 (bottom of every section)
```

`EditorSectionFooter` receives only `previewSlug`; the status is never passed down
(`editor-frame.tsx:16-25`).

**User impact.** The public route filters on status:

```
src/lib/services/property.service.ts:13-14
  return db.listing.findFirst({ where: { slug, status: ListingStatus.APPROVED }, …
```

so `(public)/properties/[slug]/page.tsx:78` calls `notFound()`. A host editing a DRAFT,
UNPUBLISHED, PENDING_REVIEW, REJECTED or ARCHIVED listing — which is precisely the host most
likely to want a preview — opens a new tab onto a 404. Three separate controls on every one
of the nine editor sections do this.

**Evidence.** The four component locations above; `property.service.ts:13-14`;
`(public)/properties/[slug]/page.tsx:78`; `host-listing-card.tsx:142`.

**Recommended remediation direction.** Thread `status` through `EditorFrame` and render the
control only when APPROVED (matching V1 and the V2 actions menu); or build a host-only
preview route that renders the guest view from the host-scoped read.

**Suggested tests.** Component: `EditorSectionFooter` renders no preview link for a
non-APPROVED listing.

---

### [F-13] Eight of nine create-flow steps navigate with `window.location.assign`, and the ninth does not

- **Severity: MEDIUM**
- **Status: Confirmed**

**V2 behavior.** ESLint flags all eight (`@next/next/no-location-assign-relative-destination`):

`address-step.tsx:94`, `amenities-step.tsx:301`, `availability-step.tsx:319`,
`basics-step.tsx:58`, `house-rules-step.tsx:170`, `location-step.tsx:126`,
`photos-step.tsx:223`, `price-step.tsx:85`.

`description-step.tsx:160` uses `router.push` instead.

**User impact.** Each step transition is a **full document reload**: the whole React tree,
the i18n catalog and the layout are re-fetched and re-executed. On a mobile connection this
turns a nine-screen flow into nine cold page loads, and the shared `HostStartDraftProvider`
state (`host-start-draft-provider.tsx:30-31`) is discarded and rebuilt on each one. The one
step that uses `router.push` behaves visibly differently from the other eight.

**Technical cause.** Reasonable in origin: `HostStartLayout` reads the draft cookie
(`layout.tsx:9-11`) and Next.js layouts do not re-execute on client-side navigation between
siblings, so a soft navigation would not refresh `initialData`. But `save()` already updates
the provider's state directly (`host-start-draft-provider.tsx:47-48`), so the client copy is
current either way — which is exactly why `description-step` works with `router.push`.

**Evidence.** The nine call sites above; `host-start-draft-provider.tsx:33-54`;
`(host-start)/host/start/layout.tsx:9-19`; the eight ESLint warnings in §3.

**Recommended remediation direction.** Standardise on `router.push` across all nine steps
now that the provider is the source of truth, which also clears eight lint warnings.

**Suggested tests.** Not unit-testable; covered by the lint rule once the code changes.

---

### [F-14] The create flow only saves on "Next", and skips the save entirely before hydration

- **Severity: MEDIUM**
- **Status: Confirmed**

**Old behavior.** V1 autosaved on every field blur and on a 900 ms debounce, serialised the
writes so a late upload could not overwrite a newer step, and showed a save status:

```
src/components/host/listing-form.tsx:998-1046   autosaveDraft(), saveQueueRef
src/components/host/listing-form.tsx:1050-1054  900 ms debounce on every value change
src/components/host/listing-form.tsx:1174-1177  handleBlur → autosaveDraft()
```

**V2 behavior.** Each step writes once, in `onNext`. Nothing is written while the host types.

Worse, on the happy path the footer renders the CTA as a real `<Link>` with the save attached
as an `onClick`:

```
src/components/host/v2/listings/listing-flow-footer.tsx:104-113
  <Link href={nextHref}
        onClick={onNext ? (event) => { event.preventDefault(); void handleNext(); } : undefined} …>
```

Before React hydrates, that handler is not attached, so a click navigates natively — and the
step's answers are never sent. The design intent is stated at `price-step.tsx:79-80`
(*"A real link on the happy path, so Next works before hydration"*), but "works" here means
"navigates", not "saves".

**User impact.** (a) Closing the tab, losing connectivity, or a crash mid-step loses that
step's answers — V1 lost at most 900 ms of typing. (b) A fast click on a slow connection
advances past a step without persisting it; the host then finds the field empty when they
come back, or discovers it missing at publish (F-09).

**Evidence.** `listing-flow-footer.tsx:98-113`; `price-step.tsx:79-87`; every step's `onNext`;
`listing-form.tsx:998-1054,1174-1177`.

**Recommended remediation direction.** Add a debounced background save per step (the
endpoint already merges patches — `mergeMobileListingDraft`), and render the CTA as a
`<button>` when a save is required so a pre-hydration click cannot bypass it.

**Suggested tests.** Component: the CTA is a `button`, not an `a`, on steps that persist.
Integration: a step's values are readable from the draft after a blur, without pressing Next.

---

### [F-15] Calendar and sync mutations revalidate only V1 routes

- **Severity: MEDIUM**
- **Status: Confirmed**

Every availability, pricing, promotion and calendar-sync write targets `/host/listings/**`
and never `/host/v2/**`:

```
src/lib/services/availability-mutation.service.ts:76-81
  revalidatePath(`/host/listings/${listing.id}/availability`);
  revalidatePath(`/host/listings/${listing.id}/pricing`);
  revalidatePath(`/admin/listings/${listing.id}`);
  if (listing.slug) revalidatePath(`/properties/${listing.slug}`);

src/lib/services/pricing-promotion-mutation.service.ts:67-81   (same shape, ×2)
src/lib/actions/calendar-sync.actions.ts:103-106
src/lib/actions/availability.actions.ts:33-36
```

Compare the editor actions, which were updated:
`listing-photos.actions.ts:34-39`, `listing-basics.actions.ts:15-20`,
`listing-location.actions.ts:146-156` all list both panels.

**User impact.** Mostly masked today: these pages are dynamically rendered (they call
`auth()`), and the V2 calendar explicitly calls `router.refresh()` after every successful
write (`host-calendar-workspace.tsx:725,883,921`). But `/host/v2/listings`,
`/host/v2/listings/[id]/pricing` and `/host/v2/listings/[id]/availability` — which read
exactly the data these mutations change — get no server-side invalidation at all, and the
read-only summaries there have no client refresh of their own. The inconsistency also means
the next person to add a V2 surface inherits a stale-by-default cache contract.

**Evidence.** The four locations above; the three counter-examples;
`host-calendar-workspace.tsx:725,883,921`.

**Recommended remediation direction.** Add the `/host/v2/**` equivalents to all four, or
(better, per `node_modules/next/dist/docs/01-app/01-getting-started/09-revalidating.md`,
"Prefer tag-based revalidation") move listing reads behind `cacheTag`/`revalidateTag` so both
panels invalidate from one call.

**Suggested tests.** Action tests asserting the exact `revalidatePath` argument list, in the
style the editor-action suites already use.

---

### [F-16] Drafts disappear entirely in grid view

- **Severity: MEDIUM**
- **Status: Confirmed**

```
src/components/host/v2/listings/listing-overview.tsx:199-211   (list view: drafts + listings)
src/components/host/v2/listings/listing-overview.tsx:215-225   (grid view: listings only)
```

`visibleDrafts` is computed at `:126-128` and referenced only inside the list branch. The
view choice is sticky in `localStorage` (`:32,62-77`).

**User impact.** A host who once switched to grid view sees the grid on every later visit.
Their in-progress drafts are then invisible — no row, no count, no "Finish your listing"
anywhere in the panel (the only other surface is `/host/start`, itself unreachable — F-07).
A half-finished listing simply vanishes until the host thinks to switch views.

**Evidence.** The two ranges above; `:126-128`; `:62-77` for the persistence.

**Recommended remediation direction.** Render draft tiles in the grid, or show a persistent
"N unfinished listings" affordance above both views.

**Suggested tests.** Component: with `view="grid"` and one draft, the markup contains the
draft's resume link.

---

### [F-17] Publish/hide is unavailable below the `sm` breakpoint and in grid view

- **Severity: MEDIUM**
- **Status: Confirmed**

```
src/components/host/v2/listings/listing-overview.tsx:376-386
  <div className="hidden sm:block">
    {isVisibilitySwitchable(listing.status) ? <ListingVisibilitySwitch … /> : <StatusMark … />}
  </div>
```

`ListingTile` (grid) renders a status pill and the actions menu, never the switch
(`:469-493`), and `ListingActionsMenu` offers Edit / View as guest / Archive / Delete only
(`listing-actions-menu.tsx:136-166`).

**User impact.** On a phone — the viewport the V2 shell is explicitly designed around
(`host-v2-shell.tsx:95-106`) — a host cannot publish or unpublish a listing from the
Listings page at all. The status is not even shown: the whole block, dot included, is
hidden. The fallback is Calendar → the listing's visibility editor
(`listing-editors.tsx:225-371`), which is three taps away and not signposted. V1's toggle was
in the card at every width (`host-listing-card.tsx:169-175`).

**Evidence.** The three locations above; `listing-editors.tsx:225-371` for the fallback.

**Recommended remediation direction.** Add Publish/Unpublish to `ListingActionsMenu` (which
renders at every width and in both views), reusing the same two actions and the same
confirmation copy.

**Suggested tests.** Component: `ListingActionsMenu` for an UNPUBLISHED listing renders a
publish affordance.

---

### [F-18] Deleting a draft leaves the `host_start_draft` cookie pointing at a deleted row

- **Severity: LOW**
- **Status: Confirmed**

`deleteListingDraft` removes the row and revalidates one V1 path:

```
src/lib/actions/listing.actions.ts:137-148
  const result = await db.listingDraft.deleteMany({ where: { id: draftId, hostId: session.user.id } });
  if (result.count === 0) return { error: "Draft not found" };
  revalidatePath("/host/listings");
```

It never touches `HOST_START_DRAFT_COOKIE`, and it is the action the V2 control calls
(`delete-draft-control.tsx:36`).

**User impact.** A host mid-flow who opens `/host/v2/listings` in another tab and deletes the
draft they are working on keeps a cookie naming a row that no longer exists. `HostStartLayout`
then hydrates the provider with `{}` (`layout.tsx:11,16`), the next save silently creates a
**new** draft (`host-start.actions.ts:38-52`), and a Publish attempt in the meantime returns
*"Your listing draft could not be found."* No data is lost or leaked — every path is
host-scoped — but the flow resets without saying so. This is also the last action in the
codebase whose `revalidatePath` still names only the V1 route.

**Evidence.** `listing.actions.ts:137-148`; `delete-draft-control.tsx:34-44`;
`(host-start)/host/start/layout.tsx:9-19`; `host-start.actions.ts:38-52,92-93`.

**Recommended remediation direction.** Clear the cookie when the deleted id matches it, and
add `/host/v2/listings` to the revalidation list.

**Suggested tests.** Action test: deleting the draft named by the cookie clears the cookie.

---

### [F-19] The V2 panel has no notifications surface, and fetches notification data it never renders

- **Severity: LOW**
- **Status: Confirmed**

V1 had a sidebar item with an unread badge (`host-sidebar.tsx:52,102-103`) and a "Latest
notifications" card listing the six newest unread with deep links
(`(host)/host/page.tsx:185-239`).

V2 has neither. `getHostAttentionSummary` still runs the query —

```
src/lib/services/attention.service.ts:36-48
  db.notification.findMany({ where: { userId: hostId, readAt: null }, …, take: 6 }),
```

— and the Today page awaits the whole summary (`page.tsx:26`) but reads only
`pendingBookings`, `unreadThreads`, `damageReports`, `firstActiveListing`,
`confirmedBookingCount` and `upcomingStay`. `recentNotifications` and `total` are computed
and discarded on every render. No V2 component links to `/account/notifications`.

**User impact.** Booking-status changes, review invitations and system notices reach the host
by email only; there is no in-panel record. Minor per-request waste on the panel's landing
page.

**Evidence.** `attention.service.ts:36-48,71-80`; `(host-v2)/host/v2/page.tsx:26,34-53`;
`host-sidebar.tsx:52`; `(host)/host/page.tsx:185-239`.

**Recommended remediation direction.** Either render the notifications block on Today (the
data is already loaded) or add `/account/notifications` to the account menu; if neither, drop
the unused query from the summary.

---

### [F-20] The listings overview lost search-by-status, sorting, and most search fields

- **Severity: LOW**
- **Status: Confirmed**

V1 fed listings through `ListControls` with a status filter and five sorts, searching over
title, city, status, price and booking count:

```
src/app/(host)/host/listings/page.tsx:200-214
  filters={[{ key: "status", … options: LISTING_STATUSES.map(…) }]}
  sorts={[updated, created, title, price, bookings]}
  searchText: [title, city, status, statusLabel, baseNightlyRate, _count.bookings].join(" ")
```

V2 offers a text box over title + city only, hidden until there are more than eight items,
with a fixed `updatedAt desc` order:

```
src/components/host/v2/listings/listing-overview.tsx:35,118-128
src/lib/services/host-listing-overview.service.ts:55   orderBy: { updatedAt: "desc" }
```

**User impact.** A host with 30 listings cannot answer "show me everything unpublished" or
"sort by price" without reading every row. Partly offset by V2's state sentence, which
surfaces problems V1 never did (`listing-state.ts:38-120`) — hence LOW rather than MEDIUM.

**Evidence.** The three locations above.

---

### [F-21] Two hardcoded and mutually inconsistent country lists in the create flow

- **Severity: LOW**
- **Status: Confirmed**

```
src/components/host/v2/listings/address-step.tsx:47-52
  <option value="MK">…  <option value="DK">…  <option value="GR">…  <option value="ES">…

src/components/host/v2/listings/address-modal.tsx:210
  <option value="MK">…  <option value="DK">…  {country !== "MK" && country !== "DK" ? <option value={country}>{country}</option> : null}
```

Both default to `"MK"` (`address-step.tsx:25`, `address-modal.tsx:34`).

**User impact.** The two screens that edit the same field offer different choices. A host who
geocodes an address in Greece via the modal gets a raw ISO code rendered as the option label
(`{country}`), and a listing outside these four countries cannot be corrected on the Address
screen at all — the `<select>` has no matching option, so it displays the first one and a
save silently rewrites the country to `MK`. The V1 flow derived the country from the geocoder
(`listing-address-field.tsx`).

**Recommended remediation direction.** One shared country source, driven by the geocoder
result with a full ISO list as the manual fallback.

---

### [F-22] `/host/start` shows unfiltered, unlabelled drafts and ships a QA link to hosts

- **Severity: LOW**
- **Status: Confirmed**

```
src/app/(host-start)/host/start/page.tsx:31-38
  const latestDraft = (await getHostListingDrafts(user.id))[0];
  … draft={latestDraft ? { id: latestDraft.id, title: draftData?.title || "Untitled listing" } : null}
```

`getHostListingDrafts` returns every draft, unfiltered (`listing.service.ts:46-51`), whereas
both `/host/v2/listings` (`page.tsx:28-29`) and V1 (`(host)/host/listings/page.tsx:51-55`)
strip empty ones with `isEmptyListingDraft`. Only `[0]` is shown, so a host with three drafts
sees one.

The same screen renders a developer affordance to every host:

```
src/components/host/v2/listings/listing-start-dashboard.tsx:98-107
  <Link href="/host/start?firstTime=1"> … "Preview first-time welcome" …
```

**Recommended remediation direction.** Apply `isEmptyListingDraft`, list all drafts, and
remove the preview link (or gate it on `NODE_ENV !== "production"`).

---

### [F-23] Untranslated user-facing strings across the create flow

- **Severity: LOW**
- **Status: Confirmed**

Every V2 create-flow screen resolves its copy through the catalog, and then interpolates raw
English into the values:

| Location | String |
|---|---|
| `review-step.tsx:65` | `"Available now"` / `` `Available from ${…}` `` / `"Only on dates you open"` |
| `review-step.tsx:99` | `` `${…} guests · ${…} bedrooms · ${…} beds` `` |
| `review-step.tsx:105,111` | `` `${…} amenities` ``, `` `${…} photos` `` |
| `review-step.tsx:123` | `` `${money} per night` `` |
| `review-step.tsx:135` | `` `Check-in ${…} · Check-out ${…}` ``, `"flexible"` |
| `basics-step.tsx:40-43,70` | `"Guests"`, `"Bedrooms"`, `"Beds"`, `"Bathrooms"` (labels **and** the rendered text) |
| `basics-step.tsx:72,75,76` | `` aria-label={`Decrease ${label}`} ``, `` `${label}: ${value}` ``, `` `Increase ${label}` `` |
| `photos-step.tsx:206` | `` toast.error(`Add at least ${MIN_LISTING_PHOTOS} photos before continuing.`) `` |
| `import-listing-form.tsx:29,41,42,45` | four hardcoded toasts |
| `host-start-draft-provider.tsx:51` | `"Your changes could not be saved. Please try again."` |
| `property-details-workspace.tsx:67,88` | two hardcoded toasts |
| plus every server error string reachable via F-09 | |

`npm run i18n:check` passes because these are not `Tx`/`resolve` calls at all — the extractor
cannot see them. This is a real regression against V1, where the same screens went through
the catalog (e.g. `listing-form.tsx:656-666`).

---

### [F-24] `HostV2Shell` takes a `t` prop it never uses

- **Severity: LOW**
- **Status: Confirmed**

`src/components/host/v2/host-v2-shell.tsx:14,23` declares `t: Awaited<ReturnType<typeof getT>>`
and never reads it; `(host-v2)/host/v2/layout.tsx:7,14` resolves the whole translator on every
panel render to pass it. Flagged by ESLint (`no-unused-vars`, §3).

---

### [F-25] `abandonHostStartDraft` has no caller

- **Severity: LOW**
- **Status: Confirmed**

`src/lib/actions/host-start.actions.ts:107-117` is a complete, correct Server Action
(auth, ownership, cookie clear, revalidate) that nothing imports — a repository-wide grep for
`abandonHostStartDraft` returns only its own definition. The create flow's only way out is
the header's plain `Exit` link (`new-listing-header.tsx:35-40`), which abandons nothing.

Consequence: there is no "discard this listing" inside the flow. A host who changes their mind
must exit and then delete the draft from `/host/v2/listings`.

---

### [F-26] The V2 inbox cannot show support or listing-less conversations

- **Severity: LOW**
- **Status: Confirmed**

V1: `listUserConversations(user.id)` — every conversation the user participates in
(`(host)/host/inbox/page.tsx:10`).
V2: scoped to the host's own listings —

```
src/lib/services/host-inbox.service.ts:37-41
  where: { listing: { hostId }, participants: { some: { userId: hostId } } },
```

**User impact.** Any conversation without a `listing` relation — a support thread with the
platform, a general inquiry — is invisible in the V2 inbox. The narrowing is deliberate and
documented (`host-inbox.service.ts:5-14`), and the account menu offers `/account/messages` and
`/account/support` as the other half; but a host who lived in `/host/inbox` will find threads
missing with no explanation on screen.

---

### [F-27] The Property-details action does not re-apply the space-type rule the client enforces

- **Severity: LOW**
- **Status: Confirmed**

The workspace filters the options (`property-details-workspace.tsx:82` — `allowedListingSpaceTypes`),
but the action validates only membership of the four-value enum:

```
src/lib/host/v2/listing-property-details.ts:22
  if (!["ENTIRE_PLACE","PRIVATE_ROOM","SHARED_ROOM","HOTEL_ROOM"].includes(input.spaceType)) issues.spaceType = "INVALID";
```

`updateListingPropertyDetails` (`listing-property-details.actions.ts:25-29`) checks the
property type exists but never re-checks the pair. A direct POST — which the Next.js data-security
guide treats as always reachable — can store `HOTEL_ROOM` on a `HOUSE`, a combination the create
flow refuses (`(host-start)/…/space-type/page.tsx:45-49`). Low impact (a nonsensical label, not
an access or money bug), but it is a client-only rule.

---

### [F-28] `/api/host-start/draft` has no rate limit and reports every failure as 401

- **Severity: LOW**
- **Status: Confirmed**

```
src/app/api/host-start/draft/route.ts:7-28
  export async function PATCH(request: Request) {
    try { const result = await saveHostStartDraftPatch(await request.json()); … }
    catch (error) { return NextResponse.json({ error: … }, { status: 401 }); }
  }
```

Every sibling write endpoint rate-limits: `/api/upload` (`route.ts:103`), `/api/listing-import`
(`route.ts:99`), `/api/conversations/[id]/messages` (`route.ts:38-39`),
`/api/conversations/[id]/damage-reports` (`route.ts:20`). This one does not, and it writes a
JSONB column up to 50 media entries and 250 amenity ids wide
(`mobile-listing-draft.ts:41,74`) on every call.

Separately, the `catch` maps *all* thrown errors to **401** — including a Prisma failure or a
malformed body — so a client cannot distinguish "log in again" from "the database is down".

---

## 6. Missing or partial parity

### MISSING (7)

| Feature | Old evidence | Why it matters |
|---|---|---|
| **Currency choice at creation** | `listing-currency-picker.tsx`, `listing-form.tsx:2505`, `(host)/host/listings/new/page.tsx:26,37` | Every V2-created listing is EUR. Currency cannot be changed afterwards — `updateListing:549-553` refuses on purpose. **Blocks V1 retirement for any non-EUR host.** |
| **Pre-publish date plan** (blocked ranges, open ranges, per-date prices, dated offers) | `listing-prepublish-plan.tsx` (2 411 lines); consumed at `listing.actions.ts:349-412` | The publish transaction still accepts all four (`availabilityBlocks`, `availabilityWindows`, `datePrices`, `promotions`); V2 fills only `availabilityStart`. |
| **Launch promotion at creation** | `listing-form.tsx:527-529`, `listing.actions.ts:284-314` | Recoverable post-publish in Calendar. |
| **Cleaning fee at creation** | `listing-form.tsx:482` | Defaults to 0; recoverable in Calendar. |
| **Notifications** (nav item + dashboard list) | `host-sidebar.tsx:52`, `(host)/host/page.tsx:185-239` | F-19. |
| **Dashboard stat cards** | `(host)/host/page.tsx:34-63` | No listing/booking counters anywhere in V2. |
| **Suggest a missing property type** | `listing-form.tsx:2243` | Amenity suggestions survive; property-type suggestions do not. |

Also missing, lower value: **live preview pane** (`listing-form.tsx` split view), **moderation
note / rejection reason** (`(host)/host/listings/[id]/edit/page.tsx:64`), **imported price
quote display** (`listing-form.tsx:4161-4222`), **`/host/mobile` preview page**, **listings
status filter and sorting** (F-20), **booking search/filters**.

### UI ONLY (0)

No V2 control was found that presents itself as functional while being disconnected. The
`/host/start` flow — the previous audit's entire top finding — is now fully wired: every step
persists through `/api/host-start/draft` → `saveHostStartDraftPatch` → `ListingDraft`, and
Review publishes through the canonical `submitNewListing`. The one demo card the earlier audit
flagged on `ListingStartDashboard` is gone; what remains there is a QA link (F-22).

### PARTIAL (13)

F-01 (Address), F-02 (Currency on import), F-03 (Photo uploads), F-04 (Edit → V1),
F-07 (Importer unreachable), F-08 (Resume mapping), F-09 (Publish validation),
F-11 (Orphan files), F-12 (Preview), F-16 (Drafts in grid), F-17 (Mobile publish),
F-26 (Inbox scope), plus: **Street View not collected at creation**, **video not accepted at
creation**, **draft autosave** (F-14), **map pin editing at creation** (no draggable map, no
Maps-link paste), **amenity suggestions at creation**.

---

## 7. Security and ownership audit

Overall: **strong, and materially stronger than the pattern the Next.js data-security guide
warns about.** Every Server Action audited re-derives authentication and ownership rather than
inheriting the page's check — the exact requirement at
`node_modules/next/dist/docs/01-app/02-guides/data-security.md` ("Authentication and
authorization"). No unauthorized-read or unauthorized-write path was found.

### Page authentication

| Surface | Gate |
|---|---|
| `/host/**` (both panels) | `src/proxy.ts:200-214` — logged-in **and** (`isHost` or ADMIN) |
| `(host-v2)/host/v2/layout.tsx:7` | `requireHostPage("/host/v2")` |
| `(host-editor)/…/[id]/layout.tsx:28` | `requireHostPage()` + host-scoped read, `notFound()` at `:33` |
| `(host-start)/host/start/layout.tsx:9` | `requireHostPage()` |
| every V2 page | its own `requireHostPage()` — verified on all 9 panel pages and all 9 editor sections |

Layouts are correctly **not** relied on as the only gate: each nested page re-runs its own
check, which sidesteps the Next.js caveat that layouts do not re-execute on client-side
navigation between siblings.

### Action / route authentication

| Surface | Check |
|---|---|
| `host-start.actions.ts:32,91,108` | `requireHost()` |
| `listing-photos.actions.ts:25`, `-basics:44`, `-amenities:46`, `-house-rules:47`, `-location:32`, `-property-details:19` | `requireHost()` |
| `listing.actions.ts:106,138,159,233,511,659,714,741,775,798` | inline `auth()` (+ `isHost` where it creates or edits) |
| `booking.actions.ts:90,116,145` | inline `auth()` + `isHost` |
| `calendar*.actions.ts`, `pricing`, `promotion`, `availability` | inline `auth()` |
| `/api/upload:98`, `/api/listing-import:95`, `/api/conversations/**` | `auth()` / `requireHost()` |
| `/api/host-start/draft` | none of its own — delegates to `saveHostStartDraftPatch`/`publishHostStartDraft`, both `requireHost()`. Not proxy-gated (`src/proxy.ts:224-225` excludes `api`), so the action-level check is the only gate. It is present and correct. |
| `/host/panel/route.ts` | no `auth()` of its own, but **is** proxy-gated (under `/host`). Sets a UI-preference cookie only. This closes the earlier audit's G8. |
| `/host/start/new`, `/host/start/resume` | proxy-gated **and** their own `auth()` + host check (`new/route.ts:9-12`, `resume/route.ts:12-15`) |

### Ownership checks

Every resource read and write is scoped in the `where` clause rather than checked afterwards,
so a foreign id returns "not found" instead of leaking existence:

- `listing-photos.actions.ts:24-31` (`ownedListing`) **and** every one of the 11 actions
  re-scopes its own ids to `listingId` (e.g. `:132-136`, `:303-306`) — a photo id from another
  listing matches nothing.
- `listing-location.actions.ts:37-69` — host-scoped query **plus** an explicit
  `listing.property.ownerId !== user.id` re-check.
- `availability-mutation.service.ts:63-74`, `calendar-sync.actions.ts:41-55` — `hostId` unless ADMIN.
- `pricing.actions.ts:21-25`, `promotion.actions.ts:24-28` — `hostId`, no admin path.
- `host-start.actions.ts:21-26,39` — draft reads are `{ id, hostId }`; a stale or foreign
  cookie grants nothing and instead starts a new owned draft (`:42-52`).
- `host-inbox.service.ts:37-41,141-146` — double-scoped (`listing.hostId` **and** participant
  membership); the thread page runs two independent checks (`messages/[id]/page.tsx:22-26`).
- `host-reservations.service.ts:42-61`, `host-calendar-workspace.service.ts`,
  `host-listing-overview.service.ts:34` — all `hostId`-scoped.

### Admin handling — **inconsistent** (the one real finding in this section)

| Action | Admin may act on another host's listing? |
|---|---|
| `verifyAvailabilityManager` — block/open dates, per-date price, availability mode (`availability-mutation.service.ts:70`) | **Yes** |
| `requireManagedListing` — calendar feeds, export token (`calendar-sync.actions.ts:51`) | **Yes** |
| `saveListingPricing` — base rate, cleaning fee, minimum nights (`pricing.actions.ts:21-25`) | **No** |
| `requireWebPromotionListing` — promotions (`promotion.actions.ts:24-28`) | **No** |
| every editor-section action (`listing-*.actions.ts`) | **No** |
| `submitForReview` / `unpublishListing` / `archiveListing` / `deleteListing` (`listing.actions.ts`) | **No** |

An admin can therefore block another host's dates but not change their price, and can rotate
their calendar-export token but not their promotions. Not a privilege escalation — admins are
trusted, and the V2 calendar's own read is `hostId`-scoped
(`host-calendar-workspace.service.ts`), so this is only reachable by direct POST. It is a
correctness and auditability inconsistency: a half-working admin path is worse than a
consistently absent one. **MEDIUM, listed here rather than in §5 because no user-visible
defect follows from it today.**

### Input validation

| Surface | Validation |
|---|---|
| Publish | `listingFormSchema` (zod) + explicit promotion, photo-count, currency-quotable and availability rules — `listing.actions.ts:275-344` |
| Draft patch | `mobileListingDraftPatchSchema`, **`.strict()`**, with per-field caps (5 000 chars, 50 media, 250 amenities) — `mobile-listing-draft.ts:20-89` |
| Pricing / promotions | zod in `pricing-promotion-mutation.service.ts:22-64`, incl. cross-field rules |
| Location | `planListingLocationSave` — rejects partial addresses rather than storing a plausible-and-wrong geocode (`listing-location.actions.ts:87-92`) |
| Editor sections | per-section `listing*Issues()` modules, all pure and unit-tested |
| `[param]` folders | `[id]`/`[section]`/`[slug]` are always used inside a host-scoped `where` or looked up in a fixed list (`findEditorSection`) — never trusted as-is |
| `searchParams` | `?listing=` on Calendar is honoured only if present in the already-scoped payload (`calendar/page.tsx:9-16`); `?propertyType`/`?spaceType` are validated against the live catalog (`listing-flow-context.ts:12-23`) |
| **Gap** | space type vs property type is client-only — F-27 |

### Upload / import security

- `/api/upload`: auth, rate limit (100 / 10 min / user), MIME allowlist, **magic-byte sniffing**,
  size caps, HEIC→JPEG conversion, and a `randomUUID()` filename so a client-supplied `../`
  cannot escape the directory (`route.ts:97-196`).
- `/api/listing-import`: `requireHost()`, rate limit (8 / 10 min), explicit rights confirmation
  (`z.literal(true)`), URL length cap, and orphan cleanup on failure (`route.ts:265`).
- Calendar feeds: HTTPS-only, `assertPublicHttpsUrl` re-validated **on every redirect hop**,
  redirect cap, body-size cap, `BEGIN:VCALENDAR` sniff (`calendar-sync/service.ts:189-240`).
- `resolveMapsLink`: only `goo.gl` hosts, 5 s abort — explicitly written not to become an open
  SSRF proxy (`listing.actions.ts:150-180`).

No unsafe upload or import path was found.

### Rate limiting

Present on `/api/upload`, `/api/listing-import`, `/api/conversations/[id]/messages` (per-user
**and** per-thread), `/api/conversations/[id]/damage-reports`, `createBookingAction`.
**Absent** on `/api/host-start/draft` (F-28) and on every Server Action in the editor and
calendar. The editor/calendar actions are ownership-scoped writes to rows the host already
owns, so abuse potential is low; the draft endpoint is the one worth a limit.

### Unauthorized read/write risk — **none found**

Client props were checked for over-broad shapes per the guide's audit checklist: the services
build explicit DTOs (`HostInboxConversation`, `HostReservation`, `HostListingOverviewItem`,
`EditorPhoto`) rather than passing Prisma rows through. `Decimal` is converted to `number` at
the boundary. No `process.env` access outside server modules. `server-only` is imported by
every service (`attention.service.ts:1`, `host-inbox.service.ts:1`, `listing-editor.service.ts:1`,
`availability-mutation.service.ts:1`, …). No client component imports a service or `@/lib/db`.

---

## 8. Data consistency and business-logic audit

**Draft lifecycle.** Create → `saveHostStartDraftPatch` (`host-start.actions.ts:28-61`) creates
on first substantive save; the id lives in an `httpOnly`, `sameSite:lax`, 30-day cookie. Resume
→ `/host/start/resume` re-scopes by `hostId` before setting the cookie
(`resume/route.ts:16-26`). Restart → `/host/start/new` clears the cookie (`new/route.ts:14-17`).
Publish → the draft row is deleted inside `submitNewListing` (`listing.actions.ts:501-503`) and
the cookie cleared (`host-start.actions.ts:101-102`). Delete → row removed, **cookie left
behind** (F-18). Patches merge rather than replace (`mergeMobileListingDraft:126-140`), so
importer-only fields survive a full walk of the flow. **Correct apart from F-18 and the
resume-route mapping (F-08).**

**Publish lifecycle.** One transaction creates `Property` + `Listing` + `PricingRule` +
promotions + availability blocks + windows + date prices + amenities + images
(`listing.actions.ts:416-499`). Blocked ranges are nested in the same create *specifically* so
a listing is never briefly live on dates the host blocked (`:471-473`). Status is `APPROVED`
with `needsReview: true` — publish-then-moderate, deliberate (`:222-224`). `availabilityMode`
is `CLOSED` when the host chose "only dates I open", `OPEN` otherwise (`:447-448`). Availability
is the one part of the plan that fails the publish rather than being dropped (`:327-344`), and
is re-checked server-side because the action is reachable by direct POST. **Sound.**

**Listing statuses.** `submitForReview` accepts only DRAFT / REJECTED / UNPUBLISHED
(`:675-681`); `unpublishListing` only APPROVED (`:718`); `unarchiveListing` returns to
UNPUBLISHED, never straight to live (`:786`); `archiveListing` refuses while PENDING or
CONFIRMED bookings exist (`:751-759`); `deleteListing` archives instead of deleting when
bookings exist and reports which happened (`listing-actions-menu.tsx:90-99`). The V2 switch
exposes exactly the host-owned transitions and falls back to a status dot for admin-owned
states (`listing-visibility-switch.tsx:11-24`). The calendar's `publishBlockers`
(`listing-status.ts:163-193`) mirrors `submitForReview`'s four rules and shares the same
`validateStoredListingAvailabilityForPublish`. **No illogical transition found.**

**Pricing and currency.** One currency per listing, immutable after creation by design
(`listing.actions.ts:549-553`); detail edits re-read the persisted rate rather than trusting a
possibly stale client (`:555-559`). **The one break is F-02**, where the create flow overwrites
an imported currency before the listing exists — the only moment at which the immutability rule
does not protect it.

**Availability.** V2 deliberately redefines "blocked" so that on a closed-by-default listing a
block is a real row with a note rather than the deletion of a window
(`calendar-v2.actions.ts:11-32`). Opening undoes both causes, window first, so a partial failure
fails **closed** (`:69-94`) — the safe direction. Ranges are merged before insert so the
exclusion constraint cannot reject overlapping rows (`listing.actions.ts:377-400`). Dates are
handled as civil `ymd` strings via `date-only.ts`, and the availability step reads "today" from
the server so the field's floor matches the publish gate
(`(host-start)/…/availability/page.tsx:27`). **No accidental-bookable or permanently-closed
path found.**

**Promotions.** Free cleaning is dropped rather than fatal when the cleaning fee is zero, at
publish (`listing.actions.ts:346-355`) and in the launch offer (`:312-314`). Percent bounds
5-50, minimum nights 1-365 (`:296-311`). Date-scoped and evergreen offers are the same row
type, and the quote engine prefers date-specific then highest qualifying threshold (`:358-360`).
The V2 calendar deliberately omits dates for evergreen offers so the canonical action does not
reinterpret them (`calendar-actions.ts:97-100`). **No fee/minimum-night conflict found.**

**Reservations.** Both sweeps run before the list renders (`host-reservations.service.ts:39-40`).
Every action re-verifies ownership in `booking.service`. Cancel requires a reason. Audit logs
are written for confirm / reject / cancel (`booking.actions.ts:98-104,127-133,156-162`).

**Messages.** Membership is checked in the service for every read and write; the SSE stream
asserts membership before subscribing (`api/conversations/[id]/events/route.ts:18`). Optimistic
sends reconcile against the server copy.

**Cache and revalidation.** `cacheComponents` is **not** enabled (`next.config.ts` has no such
flag), so the previous model applies. Editor actions revalidate both panels plus the public
page conditionally on `status === "APPROVED"`. **Calendar, sync and availability mutations
still revalidate V1 only (F-15).** One partial-failure case leaves the UI stale: `runMutationSteps`
stops at the first error and returns how many steps already landed
(`calendar-actions.ts:106-117`), but the error branch returns without `router.refresh()`
(`host-calendar-workspace.tsx:718-721,876-879,904-907`) — so on a 3-step plan that fails at
step 3, the two writes that succeeded are invisible until a manual reload. **MEDIUM; listed
here because it needs a runtime partial failure to observe, which §12 records as unverified.**

---

## 9. UX and interaction inconsistencies

**Dead or misleading controls.**
- `LocationStep`'s address input opens the modal on focus (`location-step.tsx:63`) and the modal
  seeds its own query from the value captured at mount (`address-modal.tsx:29-30`), so the
  visible field is effectively a decoy that cannot be typed into.
- "Preview" in the editor is a 404 for any unpublished listing (F-12).
- "Edit" in the listings menu opens a different editor from clicking the row (F-04).
- `/host/start/address` is forward-unreachable — the flow goes Location → **Basics**
  (`location-step.tsx:126`), skipping it; only Basics' Back link reaches it
  (`basics-step.tsx:49`).
- `abandonHostStartDraft` — a complete action with no control (F-25).

**Misleading confirmations.**
- The publish confirmation reads "Listing published / Your place is live" while the file's own
  header comment (`review-step.tsx:166-172`) still says "the line under it says in as many
  words that nothing was published", and the catalog key is `host.v2.review.prototype_note`
  (`:142`). The copy is now correct and the comment is not.
- `"You can leave this blank while testing and complete it before your listing goes live"`
  (`address-step.tsx:36-40`) is developer copy shipped to hosts, and it is wrong: a blank
  address fails publish.
- "Preview first-time welcome" (`listing-start-dashboard.tsx:98-107`) is a QA link in
  production UI.

**Missing loading / error states.**
- Photo upload failure: no state at all (F-03).
- The create flow has no per-step saving indicator; V1 had one
  (`listing-form.tsx:1003,1027,1034`). The V2 *editor* does (`editor-header.tsx:233-257`) — so
  the two halves of V2 differ from each other.

**Navigation problems.** F-04 through F-08, plus `reservation-panel.tsx:371` and
`host-inbox.service.ts:220` both routing to `/host/bookings/[id]`.

**Responsive differences.** Publish/hide and the status dot vanish below `sm`
(`listing-overview.tsx:376`); "Listed/Unlisted" text hides below `sm`
(`listing-visibility-switch.tsx:89`); the status label hides below `sm` in the editor header
(`editor-header.tsx:120`, though an `sr-only` copy is kept — correct). Drafts vanish in grid
view at every width (F-16).

**Accessibility.** Generally careful: the address modal implements the full dialog contract —
Escape, focus trap, scroll lock, focus restore (`address-modal.tsx:40-98`); `aria-live` for the
guest-limit announcement (`house-rules-step.tsx:115-124`); `aria-describedby` wiring on the
description fields (`description-step.tsx:172-179`); `sr-only` headings where the visible one
was dropped (`listing-overview.tsx:137-139`); `aria-current` on nav (`host-v2-nav.tsx:79`).
Two gaps: **untranslated `aria-label`s** in `basics-step.tsx:72,75,76` (a screen reader in
Macedonian hears English), and photo reordering exposes only "Drag to reorder photo"
(`photos-step.tsx:76`) with keyboard sensor support but no announced position.

**V1/V2 terminology.** "Bookings" → "Reservations"; "Inbox" → "Messages"; "My Listings" →
"Listings"; "Dashboard" → "Today"; "Property details" now means bedrooms/beds/bathrooms plus
property type, where V1's "Property details" step also owned `maxGuests`. Cross-panel links
(F-04…F-06) land the host on the old vocabulary without warning.

---

## 10. Dead, duplicated, contradictory, or non-logical code

**Unreachable routes and functions.**

1. **`(host-editor)/host/v2/listings/[id]/[section]/page.tsx` is entirely unreachable.** Its
   first statement is `if (!section || section.built) notFound();` (`:25`), and every entry in
   `EDITOR_SECTIONS` is now `built: true` (`editor-sections.ts:20-30`). A known slug is caught
   by its own static segment (static wins over dynamic), and an unknown slug makes
   `findEditorSection` return `undefined` — so both branches `notFound()`. The 40-line
   placeholder body, its "Open the classic editor" link and the `host.editor.section_pending`
   string can never render.
2. **`src/components/host/v2/editor/section-placeholder.tsx`** — exported `SectionPlaceholder`,
   zero importers.
3. **`src/components/host/v2/host-v2-placeholder.tsx`** — exported `HostV2Placeholder`, zero
   importers.
4. **`abandonHostStartDraft`** (`host-start.actions.ts:107-117`) — zero importers (F-25).
5. **`src/app/qa-listing-editor/`** — an empty directory; `find … -type f` returns nothing, so
   it produces no route.
6. **`HostV2Shell`'s `t` prop** — declared, passed, never read (F-24).
7. **`attention.recentNotifications` / `attention.total`** — computed on every Today render,
   never read (F-19).

**Duplicate rule implementations that can drift.**

| Rule | Implementations |
|---|---|
| Minimum photos | `MIN_LISTING_PHOTOS = 5` (`photo-draft.ts:11`), `PUBLISH_MINIMUM_PHOTOS = 3` (`listing-status.ts:161`), and a bare `3` inline in `listing.actions.ts:317` and `:685` |
| "Block a date" | `resolveAvailabilityCoreOperation` (`availability-mutation.service.ts:42-61`, used by V1) vs `blockCalendarDatesForV2` (`calendar-v2.actions.ts:55-67`, used by V2). Deliberate and documented, but the two now mean different things on a CLOSED listing, and V1 is still live |
| Photo/media persistence | `updateListing` replaces all rows wholesale (`listing.actions.ts:618-645`) vs `listing-photos.actions.ts`' 11 incremental actions. Both reachable from the V2 panel today (F-04) |
| Space type × property type | enforced in `allowedListingSpaceTypes` for creation, not re-applied by `updateListingPropertyDetails` (F-27) |
| Country list | `address-step.tsx:48-51` vs `address-modal.tsx:210` (F-21) |
| Auth style | `requireHost()`/`requireUser()` in 20+ files vs hand-rolled `auth()` + inline checks in `listing.actions.ts`, `booking.actions.ts`, `calendar*.actions.ts`, `pricing`, `promotion` and the conversation routes. Both correct today; the hand-rolled one is the one a copy-paste can silently drop a line from |

**Obsolete prototype comments that the runtime code contradicts.** Ten locations state the
create flow persists nothing, four lines above or below code that persists:

| Location | Claim | Contradicted by |
|---|---|---|
| `property-type-step.tsx:16-21` | "No draft, cookie, local-storage entry, or server mutation is created here." | `:149` `save({propertyType, …})` |
| `amenities-step.tsx:32` | "Nothing is written and no draft exists yet" | `:300` |
| `photos-step.tsx:107-115` | "nothing is uploaded, no draft exists and the selection is dropped when the host leaves" | `:217` uploads, `:222` saves |
| `price-step.tsx:27-39` | "nothing is written, no draft is created, and there is no form to submit" | `:84` |
| `availability-step.tsx:42-43` | "nothing is saved, no draft is created" | `:318` |
| `house-rules-step.tsx:19-33` | "nothing is written, no draft is created" | `:169` |
| `review-step.tsx:27-42,166-172` | "No action, no draft, no write. The confirmation says so in the copy" | `:152` publishes; `:187-197` says "Your place is live" |
| `import-listing-form.tsx:11-17` | "UI only: nothing here posts." | `:34` POSTs to `/api/listing-import` |
| `photo-draft.ts:1-8` | "the step is UI only … Nothing is uploaded and no draft exists yet" | `photos-step.tsx:217` |
| `(host-start)/…/{amenities,availability,price,review}/page.tsx` | "nothing is written: the flow still carries its whole state in the URL" | every step's `save()` |

Plus `host.v2.review.prototype_note` — a live catalog key named after the removed prototype
(`review-step.tsx:142`).

**Obsolete tests** (all currently **passing**, which is the problem — they lock in the old
intent):

- `review-step.test.tsx:97-104` — `describe("ReviewStep — no persistence")` /
  `it("publishes nothing: no form, no submit, no action")`. It passes only because publishing
  now goes through `fetch` rather than a `<form>`; it would not catch the publish call being
  removed.
- `photos-step.test.tsx:65-70` — `it("stays UI only — nothing is submitted, uploaded or persisted")`.
- `phase-two-complete.test.tsx:49-55` — `it("stays UI only — nothing is submitted or persisted")`.

The earlier wiring audit's own acceptance criterion asked for exactly this
([host-v2-wiring-audit.md §7](host-v2-wiring-audit.md), G1 third bullet: *"don't leave a passing
test asserting the old, no-op behavior next to new code that persists"*). It has not been done.

**Conflicting data contracts.**
- `ListingDraftData` has 11 fields (`importedPriceQuote`, `importProvider`, `importSpaceType`,
  `importLocationApproximate`, `importSourceUrl`, `importedAt`, plus `currentStep`) that
  `mobileListingDraftPatchSchema` (`.strict()`) refuses. This is *load-bearing* — the merge
  preserves them precisely because no client can send them — but it means the write contract and
  the read type have deliberately diverged, and nothing documents that at the type.
- `LISTING_STEPS` (11 V1 screens) is the vocabulary for a V2 flow with 16 screens (F-08).

**Code paths that cannot produce their claimed state.** The `[section]` placeholder (above) is
the clean example: it claims to render "This section is moving into the new editor" and cannot.

---

## 11. Test coverage gaps

The suite is 1 344 tests over 132 files and is genuinely strong on **pure logic**: every
`src/lib/host/v2/*.ts` derivation module, every `listing-*.service.ts`, and six of the nine
editor-section action files have real suites. The gap is one layer down — the code that touches
the database, and the code that renders interactively.

| Critical mutation surface | Existing coverage | Missing | Most valuable test to add |
|---|---|---|---|
| `host-start.actions.ts` (draft save, publish, abandon) — **the entire V2 create flow** | **none** | ownership scoping of the cookie id; a foreign cookie starting a fresh draft; merge preserving importer fields; publish deleting the draft and clearing the cookie; publish error passthrough | "a cookie naming another host's draft creates a new owned draft and never reads the foreign one" |
| `/api/host-start/draft` route | **none** | 400 vs 401 discrimination; strict-schema rejection | schema rejection returns 400, not 401 |
| `listing-photos.actions.ts` (11 actions) | **none** | every action; cross-listing id scoping; cover reassignment on delete; storage cleanup (F-11) | "deleting a photo from listing A using an id from listing B changes nothing" |
| `calendar.actions.ts`, `calendar-v2.actions.ts`, `availability.actions.ts`, `pricing.actions.ts`, `promotion.actions.ts`, `calendar-sync.actions.ts` | pure-logic only (`calendar-price-action.test.ts`, `calendar-promotion-action.test.ts`, `calendar-availability-action.test.ts`) | every DB-touching path | "block on a CLOSED listing writes a MANUAL_BLOCK and keeps the note" — the exact behaviour `calendar-v2.actions.ts` exists to guarantee |
| `availability-mutation.service.ts`, `pricing-promotion-mutation.service.ts` | none | overlap merging; advisory lock; revalidation scope | overlapping block ranges do not violate the exclusion constraint |
| `booking.actions.ts` | `booking.service.test.ts` covers the service | the action wrapper: auth, `isHost`, audit log, revalidation list | non-host caller is rejected before the service runs |
| `submitNewListing` | `listing.actions.test.ts` covers `updateListing` only (3 cases, `:113-137`) | the create path end to end: promotion rules, photo floor, availability gate, draft deletion, `availabilityMode` derivation | "availabilityStart `selected` publishes with `availabilityMode: CLOSED` and no windows" |
| `/api/listing-import` | none | provider matching, amenity aliasing, orphan cleanup on failure | a failed transaction deletes every copied image |
| `host-reservations.service.ts`, `host-inbox.service.ts`, `host-listing-overview.service.ts` | none | host scoping | a booking on another host's listing never enters the payload |
| Conversation route handlers | `chat.service.test.ts` | the handlers: auth, rate limit, 404 mapping | rate-limit response carries `Retry-After` |
| `listing-property-details.actions.ts` | 3 cases (thinnest editor suite) | space-type × property-type rule (F-27) | `HOTEL_ROOM` on a `HOUSE` is rejected server-side |
| **Interactive behaviour, all of V2** | static `renderToStaticMarkup` only | **every** click, save, failure and navigation path | see below |

**The structural gap.** Every V2 component test uses `renderToStaticMarkup`
(`review-step.test.tsx:8`, `photos-step.test.tsx`, `listing-actions-menu.test.tsx`,
`listing-visibility-switch.test.tsx`, …) — no DOM, no events, no async. That is why F-03
(silent upload failure), F-14 (pre-hydration skip), F-01 (Back-then-edit) and F-10 (post-publish
dead end) are all invisible to a green suite: **each is a behaviour, and nothing in the suite
exercises behaviour.** The three obsolete "nothing is persisted" tests (§10) are the same
limitation showing through as a false assertion.

The single highest-value change to this suite is adding a DOM environment (`jsdom` +
`@testing-library/react`, already compatible with the vitest 4 setup) for the create flow and
the listings overview. Without it, no amount of new unit tests will catch this class of defect.

---

## 12. Needs manual verification

These could not be settled from code or from a non-mutating check.

1. **Partial calendar-plan failure.** `runMutationSteps` returns `{ error, completed }`
   (`calendar-actions.ts:106-117`) and the caller returns without `router.refresh()`
   (`host-calendar-workspace.tsx:904-907`). The code says some steps landed and the screen was
   not refreshed; **observing** it needs a mid-plan server failure. Reproduce by forcing an
   error on step 2 of a 3-step plan and checking whether step 1's write is visible without a
   reload.
2. **Pre-hydration click (F-14).** The `<Link href>` + `onClick` construction
   (`listing-flow-footer.tsx:104-113`) means a click before hydration navigates without saving.
   Proving the window is wide enough to hit in practice needs throttled-network testing on a
   real device.
3. **`AddressModal` seeded query.** `useState(initialAddress)` (`:29-30`) captures the value at
   mount, while `LocationStep`'s input opens the modal on focus (`location-step.tsx:63`). Whether
   a host can ever get text into the underlying field before the modal opens (keyboard-only,
   autofill, mobile) is a runtime question.
4. **Router Cache staleness from F-15.** Whether a host actually sees a stale
   `/host/v2/listings/[id]/pricing` after a calendar price change depends on Next 16's client
   Router Cache `staleTimes` for dynamic segments, which this repo does not configure. The
   missing `revalidatePath` is certain; the visible symptom is not.
5. **Existing orphaned uploads.** F-11 proves new deletions orphan files. How many already
   exist requires comparing the storage directory against `ListingImage.url` — a read-only
   script, but one that needs production data.

---

## 13. Recommended execution order

Sequenced so nothing later invalidates something earlier. **No code was changed to produce this
audit; this is a plan, not a changelog.**

**Tier 1 — correctness, before any further V2 rollout**

1. **F-01** — address/pin desynchronisation. Data integrity, affects live listings.
2. **F-02** — currency overwrite on import. Money, and irreversible once the listing exists.
3. **F-03** — silent photo-upload failure (add the `catch` in `ListingFlowFooter` at the same
   time, so every future step fails loudly).

**Tier 2 — cheap, isolated, high visibility**

4. **F-04 / F-05 / F-06** — repoint six links at `/host/v2`. One sitting; three files.
5. **F-07** — point the "+" and empty-state CTAs at `/host/start`, restoring the importer.
6. **F-12** — thread `status` through `EditorFrame` and gate the three preview controls.
7. **F-17** — add publish/unpublish to `ListingActionsMenu`.
8. **F-16** — render drafts in grid view.
9. **F-10** — keep `listingId`/`slug` and link to the new listing.

**Tier 3 — flow correctness**

10. **F-08** — extend `LISTING_STEPS` (coordinated with the mobile contract) or store the V2
    route separately.
11. **F-09** — client-side pre-flight validation on Review; delete the "while testing" copy.
12. **F-14** — per-step background save; make the CTA a `<button>` where a save is required.
13. **F-13** — standardise on `router.push` (clears eight lint warnings).

**Tier 4 — hygiene and consistency**

14. **F-11** — storage cleanup on photo and listing deletion; then a one-off sweep (item 5, §12).
15. **F-15** — add the `/host/v2/**` paths, or move to `cacheTag`/`revalidateTag`.
16. **§7 admin bypass** — decide once whether admins may act on another host's listing, and apply
    it to all six action families.
17. **F-18, F-21, F-24, F-27, F-28** — small, independent.
18. **F-23** — put the create-flow strings through the catalog. **Note: this adds UI strings, so
    the reviewed-translation test will fail until Nikola runs the paid Gemini pass. Do not run it.**

**Tier 5 — remove the scaffolding (do this last, after the tests below exist)**

19. Delete the unreachable `[section]` route, `section-placeholder.tsx`,
    `host-v2-placeholder.tsx`, the empty `qa-listing-editor/` directory, and either wire or
    delete `abandonHostStartDraft`.
20. Rewrite the ten obsolete comments and the three obsolete tests (§10). Rename
    `host.v2.review.prototype_note`.
21. Remove the "Preview first-time welcome" link (F-22).

**Tier 6 — the coverage that would have caught tiers 1-3**

22. Add a DOM test environment and interactive tests for the create flow and the listings
    overview (§11).
23. Action-level suites for `host-start.actions.ts`, `listing-photos.actions.ts`, the six
    calendar action files and their two mutation services, and `submitNewListing`.
24. Only then attempt V1 retirement — and not before **currency at creation** and the
    **pre-publish date plan** have V2 homes (§6).

---

## 14. Final verdict

**1. Does Host V2 contain every old Host-panel feature?**

**No.** Of 58 old-panel features assessed, 21 are at full parity, 9 are improved, 6 are
deliberately moved to a shared surface, 13 are partial, and **7 are missing**: currency choice
at creation, the pre-publish date plan, the launch promotion at creation, the cleaning fee at
creation, notifications, dashboard stat cards, and property-type suggestions. Four further
old features are absent at lower value: the live preview pane, the moderation/rejection note,
the imported price-quote proposal, and `/host/mobile`. In the other direction V2 adds a
substantial amount V1 never had — rooms and room assignment, per-listing state resolution,
calendar-feed failure surfacing, undo, review-before-save, the listing switcher, completion
ticks, and an inbox with a live reservation rail.

**2. Which missing features block retirement of V1?**

Four hard blockers:

- **Currency choice at creation** (F-02 / §6). Every V2-created listing is EUR, and the currency
  cannot be changed afterwards by design. A host who prices in MKD, USD or DKK cannot create a
  listing in V2 at all.
- **The six hard-coded links into `/host/**`** (F-04, F-05, F-06, plus `reservation-panel.tsx:371`
  and `host-inbox.service.ts:220`). Turning V1 off breaks the V2 panel's own controls.
- **The pre-publish date plan.** A host who needs to block their own dates, price specific
  nights, or run a dated offer *before* going live can do none of it in V2; the publish
  transaction still supports all four.
- **Mobile publish/unpublish** (F-17). Below `sm`, the Listings page offers no way to put a
  listing on or off the site, and no status either.

Two soft blockers: the importer being unreachable (F-07) removes a headline acquisition path,
and the missing rejection note leaves a REJECTED listing with no visible reason.

**3. Is Host V2 operational for production use?**

**Yes, with three defects to fix first, and V1 still running behind it.**

Every headline workflow completes against real data with correct authentication, correct
ownership scoping, and real database writes: browse and manage listings, create and publish a
listing, edit all nine sections, run the calendar (availability, prices, promotions, external
sync), accept and decline reservations, and message guests. Typecheck is clean, ESLint has zero
errors, and 1 343 of 1 344 tests pass with the single failure being the known, user-run paid
translation snapshot. The previous audit's CRITICAL finding — an entirely unwired create flow
linked from production — is confirmed **fixed**.

It is **not** operational unattended, because F-01 can publish a listing whose address and pin
disagree, F-02 can silently re-denominate an imported price, and F-03 loses photos with no error
message. None is a data-loss or unauthorized-access defect; all three are wrong-data-published
defects, which for a booking marketplace is the class that reaches a guest.

**4. What must be completed before calling parity finished?**

1. Fix F-01, F-02 and F-03.
2. Repoint the six cross-panel links, so V2 is self-contained (F-04 … F-06, and the two
   reservation/inbox URLs).
3. Restore currency choice at creation and give the pre-publish date plan a V2 home.
4. Make publish/unpublish reachable on mobile and in grid view, and make drafts visible in
   grid view (F-16, F-17).
5. Make the importer reachable from the panel (F-07).
6. Fix the draft resume mapping so the last three screens resume where the host left (F-08).
7. Add pre-flight validation to Review, and delete the "you can leave this blank while testing"
   copy (F-09, F-22).
8. Restore per-field draft autosave, and stop the pre-hydration click from skipping the save
   (F-14).
9. Delete the unreachable `[section]` route, the two orphan placeholder components, the unused
   Server Action and the empty QA directory; rewrite the ten comments and three tests that still
   describe the flow as a prototype (§10).
10. Add a DOM test environment and interactive coverage for the create flow, plus action-level
    suites for `host-start.actions.ts`, `listing-photos.actions.ts` and the calendar actions
    (§11) — without which this same class of defect will recur.

Until items 1-3 land, **run both panels**. After items 1-9, V2 is a complete replacement for
every workflow a host performs weekly; item 10 is what makes it one that stays complete.
