# Room inventory — execution brief

**Status: ready to execute. Design authority is
[property-details-editor.md](./property-details-editor.md); this file is the handover
that makes it executable against the code as it actually stands today.**

Verified against the working tree on 2026-08-21.

---

## 0. How to use this file

You are implementing the merge of the two "rooms" concepts in the host editor into one
inventory. Read this file end to end, then read
[docs/planning/property-details-editor.md](./property-details-editor.md) end to end. That
document holds the schema, the invariants, the migration strategy and the test list — it
is not repeated here. **This file overrides it wherever the two disagree**, because it
was written after the Property details section shipped and the design document was not.

Work phase by phase (§7). Do not start a phase whose predecessor is not green. Stop and
ask before Phase 4 and Phase 5 — see §6.

---

## 1. The problem, in one screen

The Property details section of the host editor (`/host/v2/listings/[id]/rooms`) renders
two adjacent blocks:

| Block | Heading | What it edits |
|---|---|---|
| 3rd | "Rooms and beds" | `Listing.bedrooms`, `Listing.beds`, `Listing.bathrooms` — three integer steppers |
| 4th | "Room configuration" | The `ListingRoom` rows — a list of photo-tour groups, with add / rename / delete |

They are different data with near-identical names, stacked on one screen, and they
silently disagree. A real listing in the product today reads **"Bedrooms 3, Bathrooms 2"**
in the first block while the second block lists exactly **one** "Bedroom" and **one**
"Bathroom". Nothing reconciles them, because nothing can: the integers are host-typed
free numbers, and the rooms are whatever the host happened to create while sorting photos.

Guests see only the integers — a search for "4 bedrooms" filters on `Listing.bedrooms` and
nothing else. So the numbers must keep working exactly as they do now. The fix is not to
delete either block; it is to make the room list the thing the host edits, make the
integers a derived cache of it, and add the bed detail that makes the room list worth
editing.

---

## 2. What exists today (verified, with line numbers)

### 2.1 The scalars

`Listing.bedrooms`, `Listing.beds`, `Listing.bathrooms` are `Int`
([prisma/schema.prisma:531](../../prisma/schema.prisma)). `maxGuests` is `Int` on the same
model.

Written by:

- [listing-property-details.actions.ts:34](../../src/lib/actions/listing-property-details.actions.ts) — the editor's steppers
- [listing.actions.ts:453](../../src/lib/actions/listing.actions.ts) (create) and [:602](../../src/lib/actions/listing.actions.ts) (update), validated at [listing.schema.ts:47](../../src/lib/validations/listing.schema.ts)
- the mobile pipeline — [mobile-listing-draft.ts:32](../../src/lib/mobile-listing-draft.ts), [mobile-listing-editor.ts:27](../../src/lib/mobile-listing-editor.ts), [publish/route.ts:39](../../src/app/api/mobile/v1/listings/publish/route.ts)
- the URL importer — [importer.ts:555](../../src/lib/listing-import/importer.ts)
- [prisma/seed.ts](../../prisma/seed.ts) and [prisma/create-mobile-qa-accounts.ts](../../prisma/create-mobile-qa-accounts.ts)

Read by:

- **search** — `where.bedrooms = { gte: n }` at [search.service.ts:90](../../src/lib/services/search.service.ts), and the `_max.bedrooms` facet at [:429](../../src/lib/services/search.service.ts) that sets the ceiling of the guest filter sheet
- **cards** — [listing-card.ts:133](../../src/lib/serializers/listing-card.ts)
- **the public listing page** — the "N guests · N bedrooms · N beds · N baths" line at `src/app/(public)/properties/[slug]/page.tsx:145`
- admin listing detail, the admin mobile API, the host form serializer

### 2.2 The rooms

`ListingRoom` is `(listingId, roomTypeId, ordinal)` unique, plus `displayName`,
`sortOrder`, and `ListingImage[]` ([schema.prisma:782](../../prisma/schema.prisma)).
`ListingImage.roomId` is nullable with `onDelete: SetNull` — deleting a room releases its
photos, it never deletes them.

`RoomType` is admin-owned taxonomy with `key`, `isRepeatable`, `isStandard`, `isActive`
and per-locale translations, managed from
[rooms-tab.tsx](../../src/app/admin/settings/_components/rooms-tab.tsx) and shipped as
[prisma/data/room-type-catalog.json](../../prisma/data/room-type-catalog.json) — 30 types;
`bedroom`, `bathroom`, `kitchen`, `living_room`, `dining_area`, `terrace`, `exterior` are
standard; `toilet` exists, is repeatable, and is **not** standard; `exterior`, `view`,
`other` are the only non-repeatable types.

The only writers are `addListingRoom` / `renameListingRoom` / `reorderListingRooms` /
`deleteListingRoom` at
[listing-photos.actions.ts:338-455](../../src/lib/actions/listing-photos.actions.ts). Every
one of them calls `ownedListing()` first, re-scopes its own `where` to `listingId`, calls
`flagRoomChangeForReview` (sets `needsReview` on APPROVED listings) and `refresh()`
(revalidates the editor paths, and the public paths only when APPROVED). **Any new room
mutation must follow that exact pattern.**

Naming lives in [room-name.ts](../../src/lib/rooms/room-name.ts) — `roomDisplayName`
numbers a room only when the listing has more than one of that type; `nextOrdinal` is
max + 1, never count + 1. Neither has a test today.

### 2.3 The three facts that shape the work

1. **`ListingRoom` is a photo-organising device, not an inventory.** A row exists only
   once a host creates it or drops a photo onto a suggested type in the Photos rail. A
   listing with `bedrooms: 3` routinely has zero or one bedroom rows. Nothing seeds them —
   `seedStandardRooms()` no longer exists in the codebase.
2. **Nothing public reads `ListingRoom`.** The guest page renders one flat gallery; search
   and cards read only the scalars. The inventory can be reshaped without touching a guest
   surface until we choose to.
3. **There is no bed data anywhere.** No `BedType`, no `RoomBed`, no bed-type string —
   `Listing.beds` is a bare integer. That gap is what makes this merge worth doing rather
   than merely tidy.

---

## 3. The agreed model

> **Rooms are the truth. The scalars are the index.**

| Value | Source of truth |
|---|---|
| Individual spaces | `ListingRoom` rows |
| Beds, by type, per room | new `RoomBed` rows |
| `Listing.bedrooms` | derived: count of `bedroom`-typed rooms |
| `Listing.beds` | derived: `SUM(RoomBed.quantity)` across the listing |
| `Listing.bathrooms` (+ new `halfBathrooms`, `sharedBathrooms`) | derived from bathroom-typed rooms and their attributes |
| `Listing.maxGuests` | **host-authored, never derived** |
| `Listing.spaceType`, `Property.propertyType` | host-authored |

The scalar columns are **kept and maintained, never dropped** — search filters on them,
mobile clients already in the field type them as numbers, and the importer, mobile and
seed paths keep writing them. One in-transaction
`recomputeListingRoomAggregates(tx, listingId)` keeps them honest, backed by a repair
script. The full rationale, the `RoomBed` / `BedType` schema, the bathroom kind/privacy
axes, the `roomInventoryConfirmedAt` legacy gate and the backfill rules are in §2 of
[property-details-editor.md](./property-details-editor.md). Follow it.

---

## 4. Corrections to the design document

It was written before the Property details section shipped. These points are stale, and
this brief overrides them:

1. **The section is built.** `EDITOR_SECTIONS` has `{ slug: "rooms", source: "Property
   details", built: true, completion: true }`
   ([editor-sections.ts](../../src/lib/host/v2/editor-sections.ts)). The doc's §5 step 5
   ("flip `built: true`") is already done. The UI is
   [property-details-workspace.tsx](../../src/components/host/v2/editor/rooms/property-details-workspace.tsx),
   fed by
   [listing-property-details.service.ts](../../src/lib/services/listing-property-details.service.ts)
   and validated by
   [listing-property-details.ts](../../src/lib/host/v2/listing-property-details.ts).
2. **`seedStandardRooms()` is already deleted.** The doc calls it dead code to remove; it
   is gone. Nothing manufactures rooms. Keep it that way.
3. **The doc's §3 block 3, "Maximum guests", must NOT be added here.** `maxGuests` is
   edited in the House rules section
   ([listing-house-rules.ts](../../src/lib/host/v2/listing-house-rules.ts)), and
   [property-details.test.tsx](../../src/components/host/v2/editor/__tests__/property-details.test.tsx)
   asserts `expect(html).not.toContain("Maximum guests")` on purpose. Leave that boundary
   alone. The "your beds sleep about N" hint belongs next to the beds as a read-only line;
   it must never move or write `maxGuests`.
4. **The doc does not know about the "Room configuration" block.** Property details today
   already renders a raw `ListingRoom` list that imports `addListingRoom` /
   `renameListingRoom` / `deleteListingRoom` straight from `listing-photos.actions.ts`,
   drives rename with `window.prompt` and delete with `window.confirm`. That block is what
   §3.4–3.6 of the design replaces. It is not preserved: no browser dialogs survive this
   work.
5. **Line numbers in the doc have drifted** by a few lines. Trust §2 of this file.

Everything else in the design document stands as written.

---

## 5. Decisions

**Agreed with Nikola in the conversation that produced this file:**

- The two blocks are the same subject and must be merged; the drift between them is a real
  defect, not a cosmetic one.
- The counts matter and stay — a guest searching for 4 bedrooms and 2 toilets needs them.
  Nothing in this work is allowed to weaken search.
- We are doing the proper job (rooms as the inventory, with beds), not the cheap fix
  (moving the room list into Photos).

**Recommended, and assumed unless Nikola says otherwise:**

- The three steppers stop being the input once a listing's inventory is confirmed. They
  become a computed summary line — "3 bedrooms · 4 beds · 2 baths" — above the room list,
  and the room list becomes the only editor. While `roomInventoryConfirmedAt` is null the
  steppers stay editable exactly as today, and the room list carries the backfilled draft
  plus a "these came from your old listing — confirm" affordance. This is the design doc's
  §2.5 dual-read state applied to a section that already shipped.
- The section keeps the name "Property details"; the merged block is called "Rooms and
  spaces", matching the Photos rail's existing heading
  (`host.editor.photos.rooms_heading`).
- Photos keeps its rail and its own add / rename / delete. Both surfaces mutate the same
  rows through the same actions; neither becomes read-only.

---

## 6. Ask before you build

Bring these to Nikola. Phases 1–3 do not depend on the answers; Phase 4 (backfill) and
Phase 5 (UI) do.

1. **Confirmation strength** — is "check your rooms" a dismissible banner, a publish
   blocker, or an email campaign? It decides how long the dual-read state must live.
2. **Half-bath vocabulary for MK / AL / SR.** "Half bath" is an American idiom. The
   `toilet` room type already exists in the catalog and may be the better framing for this
   market. Do not write those labels before asking.
3. **En-suite as a third privacy value, or a boolean on private** — the doc proposes a
   third value; a boolean is cheaper to render.
4. **Property type on a shared `Property`** — two listings on one property share
   `propertyType`, so editing it from one changes the other. Warn, or accept?
5. **Do beds reach the public listing page in this cycle?** The plan assumes not. If yes,
   host confirmation rate becomes a launch gate rather than a metric.

---

## 7. Execution plan

Expand → migrate → confirm → contract. Each phase ships independently and leaves the
product working.

### Phase 1 — Schema, additive only

`BedType`, `BedTypeTranslation`, `RoomBed`; `ListingRoom.bathroomKind`,
`.bathroomPrivacy`, `.origin`; `Listing.halfBathrooms`, `.sharedBathrooms`,
`.roomInventoryConfirmedAt`. All nullable or defaulted. Nothing reads them yet. Migration
named `room_inventory`, matching the `<timestamp>_snake_case` convention in
[prisma/migrations](../../prisma/migrations).

**Done when:** the migration applies, `npm run typecheck` and `npm test` are green, and no
existing behaviour changed.

### Phase 2 — Bed catalog

`prisma/data/bed-type-catalog.json` plus `scripts/import-bed-type-catalog.ts` and
`scripts/export-bed-type-catalog.ts`, copied from the room-type pair (`npm run
rooms:import` / `rooms:export` in [package.json](../../package.json)); add `beds:import` /
`beds:export` and extend `db:setup`. Admin Settings gains a Bed types tab mirroring
[rooms-tab.tsx](../../src/app/admin/settings/_components/rooms-tab.tsx). Initial keys:
`single, double, queen, king, sofa_bed, bunk_bed, floor_mattress, air_mattress, crib,
toddler_bed, hammock, water_bed`.

**Done when:** the catalog imports idempotently, and the admin tab can add, rename,
reorder, translate and deactivate a bed type.

### Phase 3 — Service layer, no UI

- New `src/lib/services/listing-rooms.service.ts` with
  `recomputeListingRoomAggregates(tx, listingId)`, a no-op while
  `roomInventoryConfirmedAt` is null.
- **Pure move** of `addListingRoom` / `renameListingRoom` / `reorderListingRooms` /
  `deleteListingRoom` out of `listing-photos.actions.ts` into a new
  `src/lib/actions/listing-rooms.actions.ts` — behaviour unchanged, each now calling the
  recompute inside its transaction. Update both importers
  ([photos-workspace.tsx](../../src/components/host/v2/editor/photos/photos-workspace.tsx),
  [property-details-workspace.tsx](../../src/components/host/v2/editor/rooms/property-details-workspace.tsx))
  and the mocks in
  [property-details.test.tsx](../../src/components/host/v2/editor/__tests__/property-details.test.tsx).
- New room-bed and bathroom-attribute actions in the same file, same ownership pattern.
- Extend `ListingRoomSummary` ([room-catalog.ts](../../src/lib/types/room-catalog.ts)) and
  `getListingEditorData`
  ([listing-editor.service.ts](../../src/lib/services/listing-editor.service.ts)) with beds
  and bathroom attributes, so Photos and Property details render from one shape.
- `scripts/repair-listing-room-aggregates.ts --dry-run`.
- Write the tests from §7 of the design doc, including the missing `roomDisplayName` /
  `nextOrdinal` coverage.

**Done when:** `npm test` is green with the new unit and action tests, and Photos behaves
exactly as before.

### Phase 4 — Backfill *(ask §6 first)*

`scripts/backfill-listing-room-inventory.ts` — idempotent, additive only, never sets
`roomInventoryConfirmedAt`. Extract the planner as a pure function and test it. Run
`--dry-run` against production data and have Nikola review a sample by hand before any
real run. Rules are in §2.5 of the design doc.

### Phase 5 — UI *(ask §6 first)*

Rebuild the lower half of
[property-details-workspace.tsx](../../src/components/host/v2/editor/rooms/property-details-workspace.tsx):
"Rooms and beds" and "Room configuration" become one **Rooms and spaces** block — a room
list grouped by `RoomTypeCategory`, bedrooms and bathrooms first, each row expandable to
its beds (`BedType` × quantity) and, for bathroom-typed rows, its kind and privacy. Above
it, the derived summary line; on each row, its photo count linking into Photos filtered to
that room. No `window.prompt`, no `window.confirm` — use the editor's existing dialog
primitives. Deletion states both consequences: photos released **and** the count that
drops. Legacy listings keep the steppers plus the confirm affordance until confirmed.

**Done when:** the section reads correctly at 375px and 1280px+, every tap target is
≥44px, and `npm run lint` and `npm test` pass.

### Phase 6 — Confirm loop, then contract

Hosts confirm; each confirmation flips that listing to rooms-as-truth. Per-room beds on the
public page and a room-grouped gallery are separate, later work.

---

## 8. Ground rules

- **Every user-facing string goes through i18n.** `<Tx k="..." source="..." />` in JSX,
  `resolve("...", "...").text` for values, keys always literal — the extractor reads the
  source, not the runtime. `npm run lint` runs `i18n:check` and fails on untranslated
  strings. Reuse existing `host.editor.rooms.*` and `host.editor.photos.*` keys where the
  text already exists.
- **The reviewed-translation test will fail on new strings. That is expected. Do not run
  the paid translation generation** (`i18n:generate-reviewed*`) — Nikola runs it himself.
  Report the gap in your handover instead.
- **Do not test in the browser and do not start the dev server.** Nikola verifies every
  change himself at 375px and 1280px.
- **Do not stage, commit, push or deploy.** He reviews and commits.
- `npm run typecheck`, `npm test` and `npm run lint` must pass at the end of every phase.
- Match the house style: dense comments that explain *why*, invariants in the service
  layer, no database triggers.

---

## 9. What breaks if you are careless

- `_max.bedrooms` at [search.service.ts:429](../../src/lib/services/search.service.ts) sets
  the ceiling of the guest filter sheet. A wrong high value from the recompute grows a
  phantom filter option.
- Dropping a photo onto the suggested "Bedroom" row in Photos calls `addListingRoom`, which
  after Phase 3 also moves the listing's headline bedroom count. That is correct — but it
  means Photos can change a published listing's numbers, which is exactly why the
  `roomInventoryConfirmedAt` gate exists. Do not skip it.
- `revalidatePublicListingCaches()` must fire on room mutations once rooms are truth, or a
  bedroom added in Photos will not reach the cached card.
- The importer parses decimal bathrooms and truncates to `Int`
  ([importer.ts:411](../../src/lib/listing-import/importer.ts)) — "2.5 baths" imports as 2
  today. `halfBathrooms` makes that recoverable; wiring it is a follow-up, not a blocker.
- `bathrooms` stays `Int`. Prisma serialises `Decimal` as a string over JSON, which would
  silently break the mobile clients and the admin API. "2.5 baths" is a formatting concern
  — `formatBathrooms(full, half)` next to the existing formatter at
  [format.ts:39](../../src/lib/utils/format.ts).
