# Host v2 control panel — wiring audit

> Implementation update (2026-08-21): G1 and G2 are complete. The Host V2 creation
> flow now persists an owned `ListingDraft` after each substantive step, resumes by
> draft id, uploads ordered photos, imports provider listings, validates through the
> shared draft contract, and publishes through the canonical `submitNewListing`
> transaction. Listing overview mutations now revalidate and refresh the V2 route.
> Historical findings below describe the pre-wiring baseline and are retained as the
> audit record.

Audit date: 2026-08-21. Scope: `src/app/(host-v2)/host/v2/**`, `src/app/(host-editor)/host/v2/listings/[id]/**`,
`src/app/(host-start)/host/start/**`, and every component under `src/components/host/v2/**`. No production
code was changed to produce this document. All uncommitted working-tree changes present at the start of the
audit were left untouched.

## 0. Baseline

Run before any investigation, against the working tree exactly as found (`git status` — see §5 for the full
list of modified/untracked files already in flight):

- `npm run typecheck` — **clean, 0 errors.**
- `npx vitest run` — **1329 / 1330 tests pass.** The one failure,
  `src/lib/i18n/__tests__/reviewed-ai-translations.test.ts`, fails because new UI strings were added without
  running the paid Gemini reviewed-translation pass. This is expected and not something an agent should fix —
  Nikola runs `i18n:generate-reviewed*` himself. Every other suite, including 15 host-v2-specific action/service
  test files, is green.

Both checks confirm the codebase compiles and its existing test suite is healthy; the findings below are about
**wiring gaps and coverage gaps**, not regressions.

## 1. Top-line finding

**The entire "create a new listing" wizard at `/host/start/*` is a non-functional UI prototype, and it is
reachable from live production navigation.** Every one of its ~16 screens is client-only React state; nothing
is persisted anywhere, and the flow's own code comments and tests say so explicitly (e.g.
`review-step.test.tsx:99-100`: `it("publishes nothing: no form, no submit, no action")`). This is not a
guess — it is by design, documented in-repo. The problem is that it is linked from two real, live entry points
on the production `/host/v2/listings` page:

- The "+" toolbar button — [listing-overview.tsx:170-177](../../src/components/host/v2/listings/listing-overview.tsx)
  (`href="/host/start"`)
- The empty-state "Add listing" CTA — [listing-overview.tsx:526-532](../../src/components/host/v2/listings/listing-overview.tsx)
  (shown to every host with zero listings — i.e. every new host's first action)

A new host who clicks "Add listing," fills in property type, space type, address, basics, amenities, photos,
description, price, availability, and house rules, then clicks "Publish listing" on the review screen, gets a
confirmation UI (`onNext={() => setPublished(true)}`,
[review-step.tsx:156](../../src/components/host/v2/listings/review-step.tsx)) — and nothing is created. No
`ListingDraft`, no `Listing`. The confirmation screen's body copy does say "nothing you entered was saved" (
[review-step.tsx:194-196](../../src/components/host/v2/listings/review-step.tsx)), so it is not a silent lie to
a host who reads carefully, but the entry points that lead there (the primary "+ New listing" and "Add listing"
buttons) carry no such warning.

This is a scope/sequencing gap, not a security or data-integrity bug: the backend it needs already exists and is
proven in production. `ListingDraft` is a real Prisma model, actively read/written by the **v1** host flow
(`saveListingDraft` — [listing.actions.ts:102](../../src/lib/actions/listing.actions.ts)), by the mobile app's
draft API (`src/app/api/mobile/v1/drafts/**`), and by the URL importer. Wiring `/host/start` is a matter of
connecting its steps to that existing action surface (or a v2-specific equivalent following the same ownership
pattern used everywhere else in this codebase), not inventing new schema.

Two smaller, independently real gaps sit alongside this one — see §3.

## 2. Route-by-route integration matrix

Legend: ✅ wired to real DB data/actions with auth+ownership checks · ⚠️ wired but with a gap noted · ❌ not wired
(prototype/placeholder).

### A. Shell, navigation, dashboard

| Surface | Data source | Mutations | Auth | Ownership | States | Revalidation | Tests | Verdict |
|---|---|---|---|---|---|---|---|---|
| `host/v2/layout.tsx` shell | `requireHostPage("/host/v2")` → session via NextAuth `auth()` | — | ✅ [auth-helpers.ts:75-81](../../src/lib/auth-helpers.ts) | n/a (no resource) | n/a | n/a | n/a | ✅ |
| `host/panel/route.ts` (panel-version switch) | query param | sets `HOST_PANEL_COOKIE`, redirects | ❌ none — no `auth()` call at all | n/a | validates `version` param, 400 on bad input | n/a | none | ⚠️ unauthenticated route; low risk (only sets a UI-preference cookie, touches no user data) but flagged per the Next.js data-security audit checklist, which calls out `route.ts` files for extra scrutiny |
| `host-v2-account-menu.tsx` (logout, links) | `useSession()` (next-auth/react) | `signOut()` | ✅ real NextAuth | n/a | n/a | n/a | none | ✅ |
| `entity-rail.tsx` | props only (fed by real data from parent) | — | inherited | inherited | n/a | n/a | none | ✅ presentational, correctly fed |
| `host/v2/page.tsx` (Today) | `getHostAttentionSummary(user.id)` — 6 parallel `hostId`-scoped Prisma queries — [attention.service.ts:5-81](../../src/lib/services/attention.service.ts) | — (read-only) | ✅ `requireHostPage()` | ✅ every query scoped by `hostId` | no loading (SSR), no empty-state variant checked | n/a (read-only) | none for `attention.service.ts` | ✅ real data, no test |

### B. Reservations

| Surface | Data source | Mutations | Auth | Ownership | States | Revalidation | Tests | Verdict |
|---|---|---|---|---|---|---|---|---|
| `reservations/page.tsx` list | `getHostReservations(user.id)` — `hostId`-scoped `listing`/`booking` queries — [host-reservations.service.ts:34-172](../../src/lib/services/host-reservations.service.ts) | — | ✅ `requireHostPage()` | ✅ `hostId` filter, documented at file top | ✅ empty state ([reservation-stream.tsx:698-717](../../src/components/host/v2/reservations/reservation-stream.tsx)), `useTransition` pending | n/a (read-only) | `reservation-model.test.ts` (pure logic only) | ✅ |
| Accept/decline booking | — | `confirmBookingAction`/`rejectBookingAction` — [booking.actions.ts:90-143](../../src/lib/actions/booking.actions.ts) | ✅ inline `auth()` + `isHost` check | ✅ re-verified in `booking.service.ts:612,703` (`hostId` match) | ✅ toast error, `isPending` spinner | `revalidatePath` (4 paths) + client `router.refresh()` | `booking.service.test.ts` covers the service layer; **no test for `booking.actions.ts` itself** | ✅ wired, ⚠️ action-layer test gap |
| Cancel booking (host) | — | `hostCancelBookingAction` — [booking.actions.ts:145-170](../../src/lib/actions/booking.actions.ts) | ✅ same pattern | ✅ `booking.service.ts:539` | ✅ same pattern | `revalidatePath` + `router.refresh()` | as above | ✅ wired, ⚠️ action-layer test gap |

### C. Calendar (availability, pricing, promotions, external sync)

All calendar data flows through one real, `hostId`-scoped read —
`getHostCalendarWorkspace(user.id)` ([host-calendar-workspace.service.ts:45-119](../../src/lib/services/host-calendar-workspace.service.ts))
— passed once into `HostCalendarWorkspace`. Every mutation below independently re-derives auth + ownership
inside its Server Action (never trusts the page-level check), matches the Next.js data-security guidance almost
verbatim.

| Feature | Mutation action | Auth | Ownership | Validation | States | Revalidation | Tests |
|---|---|---|---|---|---|---|---|
| Block/open dates | `blockCalendarDatesForV2`/`openCalendarDatesForV2` — [calendar-v2.actions.ts:44-95](../../src/lib/actions/calendar-v2.actions.ts) | ✅ inline `auth()` | ✅ `verifyAvailabilityManager` — [availability-mutation.service.ts:63-74](../../src/lib/services/availability-mutation.service.ts) | n/a (date range) | ✅ `useTransition`, toast, undo | server `revalidatePath` (multiple) + client `router.refresh()` | pure-logic test only (`calendar-availability-action.test.ts`); **no test for the action or `availability-mutation.service.ts`** |
| Per-date price | `setCalendarDatePrice`/`clearCalendarDatePrice` — [calendar.actions.ts:55-73](../../src/lib/actions/calendar.actions.ts) | ✅ `requireManagedListing` | ✅ same helper, `hostId`/`ADMIN` check | n/a | ✅ | same pattern | pure-logic test only |
| Default/base pricing | `saveCalendarDefaultPricing` → `saveListingPricing` — [pricing.actions.ts:12-31](../../src/lib/actions/pricing.actions.ts) | ✅ inline `auth()` + `isHost` | ✅ `hostId` filter | ✅ zod `pricingSchema` — [pricing-promotion-mutation.service.ts:22-26](../../src/lib/services/pricing-promotion-mutation.service.ts) | ✅ review-dialog gated, toast, spinner | `revalidatePricingPaths()` + `revalidatePublicListingCaches()` + `router.refresh()` | pure-logic test only; **no test for `pricing-promotion-mutation.service.ts` or `pricing.actions.ts`** |
| Promotions (date-scoped & evergreen) | `saveCalendarPromotion`/`removeCalendarPromotion` → `promotion.actions.ts:32-52` | ✅ `requireWebPromotionListing` | ✅ `hostId` filter | ✅ zod `promotionInputSchema`, cross-field rules — [pricing-promotion-mutation.service.ts:28-64](../../src/lib/services/pricing-promotion-mutation.service.ts) | ✅ shadow/clash warnings, review dialog for listing-wide changes | same as pricing | pure-logic tests (`calendar-promotion-action.test.ts`, `calendar-quote.test.ts`); **no test for the mutation service** |
| Publish/hide listing (from calendar) | `submitForReview`/`unpublishListing` — [listing.actions.ts:658-730](../../src/lib/actions/listing.actions.ts) | ✅ | ✅ `hostId` filter | ✅ business rules (photo count, pricing set, availability configured) | ✅ | as above | none found for these two actions specifically |
| External calendar sync | `addCalendarFeed`/`refreshCalendarFeed`/`removeCalendarFeed`/`regenerateCalendarExportToken` — [calendar-sync.actions.ts](../../src/lib/actions/calendar-sync.actions.ts) | ✅ inline `auth()` | ✅ `hostId`/`ADMIN` check, re-verified per feed id | ✅ URL scheme check, max-feeds cap, duplicate-URL rejection | ✅ per-row spinners, toast | `revalidateCalendar()` (`revalidatePath`) | **none found anywhere in this file** |

Everything under `src/lib/host/v2/` that the calendar UI imports (`calendar-format.ts`, `calendar-price-action.ts`,
`calendar-promotion-action.ts`, `calendar-schedule.ts`, `calendar-quote.ts`, etc.) is pure client-safe derivation
logic with no direct Prisma access — `server-only` doesn't apply there, and it is exactly what the existing
`__tests__` in that directory cover. The gap is one level down: the Server Actions and `*-mutation.service.ts`
files that actually write to the database have no test coverage at all (see §3, Medium).

### D. Messages

| Surface | Data source | Mutation | Auth | Ownership | States | Revalidation | Tests |
|---|---|---|---|---|---|---|---|
| Conversation list | `listHostInboxConversations` — `hostId` + participant-membership scoped — [host-inbox.service.ts:34-108](../../src/lib/services/host-inbox.service.ts) | — | ✅ `requireHostPage()` | ✅ double-scoped | n/a | n/a | none |
| Thread view | `getHostInboxReservation` + `getConversationMessages`, deliberately independent checks — [messages/[id]/page.tsx:15-26](../../src/app/(host-v2)/host/v2/messages/[id]/page.tsx) | — | ✅ | ✅ both queries independently verify membership | `notFound()` if either check fails | n/a | none for these two functions specifically (chat.service tests cover related paths) |
| Send message | — | `POST /api/conversations/[id]/messages` (**REST route, not a Server Action**) → `sendConversationMessage` — [chat.service.ts:451+](../../src/lib/services/chat.service.ts) | ✅ `auth()` in route handler | ✅ `ConversationParticipant` lookup before send | ✅ optimistic UI, retry-on-fail | no `revalidatePath` — relies on 5s polling + SSE (`/api/conversations/[id]/events`) + `router.refresh()` | `chat.service.test.ts` covers the service; **no test for the route handlers or `InboxThread`** |

The send-message path is architecturally an outlier relative to the rest of this codebase — every other mutation
audited here is a Next.js Server Action per the docs in `node_modules/next/dist/docs/01-app/01-getting-started/07-mutating-data.md`;
this one is a hand-rolled REST endpoint with client-side polling. It is not broken — auth, ownership, and rate
limiting are all present — but it's worth naming as a deliberate (or historical) divergence rather than
rediscovering it mid-refactor.

### E. Listings overview

| Surface | Data source | Mutation | Auth | Ownership | States | Revalidation | Tests |
|---|---|---|---|---|---|---|---|
| List/drafts | `getHostListingsOverview` + `getHostListingDrafts` — `hostId`-scoped | — | ✅ | ✅ | ✅ empty state, no-results-for-filter state | n/a | none for the overview service specifically |
| Archive/Unarchive | `archiveListing`/`unarchiveListing` — [listing.actions.ts:737-789](../../src/lib/actions/listing.actions.ts) | ✅ inline `auth()` | ✅ `hostId` re-query | n/a | toast only, **no `router.refresh()`** | `revalidatePath("/host/listings")` — **the v1 path, not `/host/v2/listings`** | `listing.actions.test.ts` covers other functions in this file, not these two |
| Delete | `deleteListing` — [listing.actions.ts:791-805](../../src/lib/actions/listing.actions.ts) | ✅ | ✅ | n/a | same as above | same as above | none |
| Publish/unpublish (switch) | `submitForReview`/`unpublishListing` (same actions calendar uses) | ✅ | ✅ | n/a | same as above | same as above | none for this call site |
| Delete draft | `deleteListingDraft` — [listing.actions.ts:137-148](../../src/lib/actions/listing.actions.ts) | ✅ | ✅ `deleteMany({where:{id,hostId}})`, 0-count → error | n/a | ✅ **does** call `router.refresh()` ([delete-draft-control.tsx:42](../../src/components/host/v2/listings/delete-draft-control.tsx)) | `revalidatePath("/host/listings")` | none |
| "New listing" entry points | — | `<Link href="/host/start">` | n/a | n/a | n/a | n/a | n/a | see §1 |

### F. Listing editor (existing listing, 9 sections)

Every section follows one consistent, strong pattern: page-level `requireHostPage()` + an independent
`hostId`-scoped Prisma read in its service function, and every Server Action independently re-derives both
auth and ownership rather than trusting the page (explicitly documented in repeated comments, e.g.
[listing-photos.actions.ts:17-23](../../src/lib/actions/listing-photos.actions.ts),
[listing-location.actions.ts:34-36](../../src/lib/actions/listing-location.actions.ts)). This is the strongest
area of the panel.

| Section | Save action | Ownership re-check | Revalidation | Test coverage |
|---|---|---|---|---|
| Basics | `updateListingBasics` — [listing-basics.actions.ts:43-83](../../src/lib/actions/listing-basics.actions.ts) | ✅ | ✅ `revalidatePath` ×5 + conditional public cache | ✅ 8 action tests + 3 service tests |
| Amenities | `setListingAmenities` — [listing-amenities.actions.ts:45-111](../../src/lib/actions/listing-amenities.actions.ts) | ✅ | ✅ | ✅ 14 action tests + 5 service tests |
| Photos & rooms | 11 actions in `listing-photos.actions.ts` (add/reorder/delete photos, cover photo, room CRUD) | ✅ `ownedListing()` shared gate, every id re-scoped | ✅ | ❌ **zero tests for this file** |
| Pricing | none — read-only by design, hands off to Calendar | n/a | n/a | ✅ 5 component tests + 4 service tests, including an explicit "no inputs, no form, no submit" assertion |
| Availability | none — read-only by design, hands off to Calendar | n/a | n/a | ✅ 7 component tests + 4 service tests |
| House rules | `updateListingHouseRules` — [listing-house-rules.actions.ts:46-95](../../src/lib/actions/listing-house-rules.actions.ts) | ✅ | ✅ | ✅ 14 action tests + 5 service tests + 8 component tests |
| Arrival guide | none of its own — delegates its one editable field to House rules | n/a | n/a | ✅ 3 service tests + 4 component tests |
| Location | `updateListingLocation` — [listing-location.actions.ts:28-139](../../src/lib/actions/listing-location.actions.ts) | ✅ **extra explicit check** beyond the query filter (`listing.property.ownerId !== user.id`) | ✅ iterates every listing sharing the property | ✅ 14 action tests + 5 service tests; no `LocationWorkspace` component test |
| Rooms / property details | `updateListingPropertyDetails` — [listing-property-details.actions.ts:18-40](../../src/lib/actions/listing-property-details.actions.ts) | ✅ | ✅ | ⚠️ only 3 action tests (thinnest suite in the editor), 2 service tests, 1 component test |

### G. Listing creation wizard (`/host/start/*`) — see §1

Every one of the ~16 steps (property-type, space-type, address, location, basics, phase-one-complete, amenities,
photos, description, phase-two-complete, price, availability, house-rules, review, import, and the
welcome/dashboard screens) is `useState` + URL-query-param plumbing only. No zod validation exists anywhere in
this route tree (grep for `zod` under `src/app/(host-start)` and `src/lib/host/v2` used by these steps returns
zero matches — because there is no server action to validate for). Every step's own code comment says its data
is not persisted, and matching tests assert exactly that (e.g. `photos-step.test.tsx:65`: "stays UI only —
nothing is submitted, uploaded or persisted"). This is not an oversight to "discover" — it's a declared,
tested, in-progress scaffold. The audit's job is to flag that it is nonetheless live-linked (§1).

## 3. Confirmed wiring gaps, ordered by severity

### Critical

**G1 — `/host/start` listing-creation wizard is entirely unwired and is the primary/only "create a listing"
entry point on the live `/host/v2/listings` page.** See §1 for full detail. Affects every new host's first
action in the panel.

### High

**G2 — Listings-overview row actions don't refresh the UI after a successful mutation.**
`ListingActionsMenu.handleArchive`/`handleDelete` ([listing-actions-menu.tsx:61-99](../../src/components/host/v2/listings/listing-actions-menu.tsx))
and the publish/unpublish switch call their Server Actions, get a success result, and only show a toast — no
`router.refresh()`. Compounding this, the actions' own `revalidatePath()` calls target `/host/listings` (the v1
route) rather than `/host/v2/listings`
([listing.actions.ts:764-765,786-787,802-803](../../src/lib/actions/listing.actions.ts)). A host who archives,
deletes, or publishes a listing from the v2 overview sees a success toast but the row keeps its stale
status/badge until a manual full reload. The fix pattern already exists in the same directory —
`DeleteDraftControl` calls `router.refresh()` on success
([delete-draft-control.tsx:42](../../src/components/host/v2/listings/delete-draft-control.tsx)) — so this is a
one-line-per-call-site fix once someone decides whether the long-term intent is "add `/host/v2/listings` to the
`revalidatePath` calls" or "rely on client-side `router.refresh()`" (both work; doing only one is the current
inconsistency).

### Medium (test-coverage gaps — nothing here is a functional bug; every code path in this tier is exercised
manually and behaves correctly per the fact-finding, but has no regression net)

**G3.** `src/lib/actions/listing-photos.actions.ts` — 11 exported Server Actions (all photo CRUD, all room
CRUD) — has no `__tests__` counterpart at all. Every other editor-section action file has 8–14 tests.

**G4.** The calendar Server Actions and their backing mutation services have no tests:
`calendar.actions.ts`, `calendar-v2.actions.ts`, `availability.actions.ts`, `pricing.actions.ts`,
`promotion.actions.ts`, `calendar-sync.actions.ts`, `availability-mutation.service.ts`,
`pricing-promotion-mutation.service.ts`. Only the pure client-side derivation logic under `src/lib/host/v2/`
(the `calendar-*-action.ts` files) is tested — real, correct, but it's the half of the system that never
touches the database.

**G5.** No tests for `booking.actions.ts` (the Server Action wrapper — `booking.service.ts` itself is well
tested), `host-reservations.service.ts`, `HostReservationsWorkspace`, `ReservationPanel`, `ReservationStream`,
`host-inbox.service.ts`, `InboxThread`, `InboxConversationList`, or the two message REST route handlers.

**G6.** `listing-property-details.actions.test.ts` has only 3 cases versus 8–14 in sibling editor-action test
files — thin relative to the rest of the editor.

### Low

**G7 — Auth-helper inconsistency.** `booking.actions.ts`, `listing.actions.ts`, and the two
`/api/conversations/[id]/*` route handlers hand-roll `const session = await auth(); if (!session?.user?.id) ...`
+ inline `isHost`/ownership checks, while 17+ other action files (including every editor-section action audited
in §2.F) use the shared `requireUser()`/`requireHost()`/`assertOwnerOrAdmin()` helpers in
[auth-helpers.ts](../../src/lib/auth-helpers.ts). Both patterns are currently correct — this is not a live
vulnerability — but the hand-rolled version is the one more likely to have a check silently dropped in a future
copy-paste edit, since it isn't backed by a single shared, tested function.

**G8.** `host/panel/route.ts` has no auth check. Low risk in isolation — it only reads a `version` query param
and sets a UI-preference cookie, touching no user or listing data — but per the Next.js data-security guide's
own audit checklist ("`route.ts` and `proxy.ts` ... have a lot of power, spend extra time auditing"), it's worth
a conscious sign-off rather than silence.

**G9.** The messages send/read path is a REST route + polling/SSE rather than a Server Action, unlike every other
mutation surface in the panel. Functionally sound (auth, ownership, and rate-limiting are all present) but an
architectural outlier worth naming.

## 4. What is *not* a gap (confirmed, so it isn't re-litigated later)

- Every editor section, the entire calendar suite, reservations, messages, and the listings-overview *read*
  paths use real `hostId`-scoped Prisma queries — no mock or hardcoded data was found anywhere in scope except
  inside the declared `/host/start` prototype and one intentionally-dummy demo card on
  `ListingStartDashboard` (`listing-start-dashboard.tsx:39`, whose own test asserts it's a dummy).
- Ownership checks are independently re-derived inside every Server Action across the calendar and editor
  areas — not just inherited from a page-level or layout-level check. This matches the Next.js
  authentication/data-security guidance almost exactly (see `node_modules/next/dist/docs/01-app/02-guides/data-security.md`,
  "Authentication and authorization").
- `layout.tsx` files in this codebase are not relied upon as the sole gate for nested pages — every nested
  page independently re-runs its own `requireHostPage()` + host-scoped query, which correctly sidesteps the
  Next.js caveat that layouts don't re-execute on client-side navigation between sibling routes.

## 5. Preserving in-flight work

At audit start, `git status` showed a large amount of legitimate uncommitted work already in progress — most of
`src/app/(host-start)/**`, most of `src/components/host/v2/listings/*.tsx`, and several `src/lib/host/v2/*.ts` /
`src/lib/actions/listing-*.actions.ts` / `src/lib/services/listing-*.service.ts` files as **untracked**, plus
the entire host-v2 calendar and editor trees as **modified**. `docs/planning/room-inventory-execution-brief.md`
and `docs/planning/property-details-editor.md` document an active, in-progress plan for the Rooms/Property
details section specifically — nothing in this audit's findings (G6, the property-details test count) should be
read as blocking or contradicting that plan; it's a factual count, not a request to add tests mid-migration.

No file was modified, staged, or reverted to produce this audit. `git clean`/`reset`/`checkout`/`restore` were
never run.

## 6. Recommended ownership boundaries for follow-up work

These are chosen so parallel agents/engineers can work without touching the same files:

| Workstream | Files | Depends on |
|---|---|---|
| **A — Wire the creation wizard** (G1) | `src/app/(host-start)/**`, `src/components/host/v2/listings/*-step.tsx`, `*-step.test.tsx`, `src/lib/listing-flow-context.ts`; new action file(s) alongside the existing `saveListingDraft` pattern in `listing.actions.ts` | Product decision on whether v2 reuses `ListingDraft`/`saveListingDraft` as-is or gets a v2-specific draft action — flag to Nikola before starting, this is a scope decision, not a wiring bug to silently fix |
| **B — Fix overview refresh** (G2) | `listing-actions-menu.tsx`, `listing-visibility-switch.tsx`, `listing.actions.ts` (only the `revalidatePath` argument lists for `archiveListing`/`unarchiveListing`/`deleteListing`/`submitForReview`/`unpublishListing`) | None — isolated, low-risk, one sitting |
| **C — Calendar action/service tests** (G4) | new `__tests__` files under `src/lib/actions/` and `src/lib/services/` for the 6 calendar action files + 2 mutation services listed in G4 | None |
| **D — Photos/rooms action tests** (G3) | new `src/lib/actions/__tests__/listing-photos.actions.test.ts`, modeled on the sibling files (`listing-amenities.actions.test.ts` is the closest analog in size) | None |
| **E — Reservations/messages test coverage** (G5) | new tests for `booking.actions.ts`, `host-reservations.service.ts`, `host-inbox.service.ts`, the two conversation route handlers | None |
| **F — Auth-helper consistency pass** (G7) | `booking.actions.ts`, `listing.actions.ts`, `/api/conversations/[id]/messages/route.ts`, `/api/conversations/[id]/read/route.ts` — swap hand-rolled checks for `requireUser`/`requireHost`/`assertOwnerOrAdmin` | Should land *after* E, so the new tests in E lock in current behavior before the refactor touches these files |

Workstreams A and B touch `src/lib/actions/listing.actions.ts` — B only touches five `revalidatePath` call sites
inside functions A does not touch, so they can run in parallel, but whoever lands second should re-diff that
file before merging.

## 7. Acceptance criteria for the top findings

**G1 (wizard):**
- [ ] Either the "+" and "Add listing" links point to a working entry point (the v1 `/host/listings/new` flow, or
      a newly wired `/host/start`), or the prototype is visibly labeled as such at its entry points until it's
      ready — Nikola should decide which, this is a product call, not an engineering default.
- [ ] If wiring `/host/start` forward: each step persists via a Server Action that checks auth (`requireUser`/
      `requireHost`) and, once a draft exists, ownership of that draft; the final "Publish" screen creates or
      finalizes a real `Listing` row and clears the draft.
- [ ] `review-step.test.tsx`'s current "publishes nothing" test is either updated to assert real persistence or
      explicitly superseded by a new test — don't leave a passing test asserting the old, no-op behavior next to
      new code that persists.

**G2 (overview refresh):**
- [ ] After Archive, Unarchive, Delete, Publish, or Unpublish from `/host/v2/listings`, the row's status updates
      in the UI without a manual reload, in both the list and grid view.
- [ ] A test (component or integration) asserts the post-mutation UI state, not just that the action resolves
      without error — the current gap wouldn't have been caught by an action-level unit test alone, since the
      action itself works correctly.

**G3/G4/G5 (test coverage):** each new test file should follow the existing house pattern visible in
`listing-basics.actions.test.ts` / `listing-amenities.actions.test.ts`: ownership scoping, rejection of a
non-owned resource, rejection of an unauthenticated caller, validation-boundary cases, a no-op-when-unchanged
case, and the revalidation scope (which paths get called, and which are conditionally skipped for non-live
listings).
