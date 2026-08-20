# Property details editor — data design

Status: proposal, not implemented. Covers the `rooms` editor section (`EDITOR_SECTIONS`
slug `rooms`, label "Property details", currently `built: false`).

Scope: what the section owns, where the numbers live, and how it shares one room
inventory with the Photos workspace. No schema or UI is written by this document.

---

## 1. What exists today

### Scalars on `Listing`

`prisma/schema.prisma:519` — `maxGuests Int`, `bedrooms Int`, `bathrooms Int`,
`beds Int`, `spaceType ListingSpaceType` (`ENTIRE_PLACE | PRIVATE_ROOM | SHARED_ROOM |
HOTEL_ROOM`). `Property.propertyType` is a string FK to the admin-owned `PropertyType`
catalog.

These four integers are host-typed free numbers. They are written by:

- [listing.actions.ts:452](src/lib/actions/listing.actions.ts:452) (create) and
  [:601](src/lib/actions/listing.actions.ts:601) (update), validated by
  [listing.schema.ts:46](src/lib/validations/listing.schema.ts:46) —
  `maxGuests 1–20`, `bedrooms 0–20`, `bathrooms 0–20`, `beds 0–40`, all `int()`.
- the mobile draft/publish pipeline —
  [mobile-listing-draft.ts:31](src/lib/mobile-listing-draft.ts:31),
  [mobile-listing-editor.ts:26](src/lib/mobile-listing-editor.ts:26),
  [publish/route.ts:38](src/app/api/mobile/v1/listings/publish/route.ts:38).
- the URL importer —
  [importer.ts:554](src/lib/listing-import/importer.ts:554) and
  [listing-import/route.ts:223](src/app/api/listing-import/route.ts:223).
- [prisma/seed.ts](prisma/seed.ts) (7 listings) and
  [prisma/create-mobile-qa-accounts.ts](prisma/create-mobile-qa-accounts.ts).

They are read by:

- **Search filtering**: `where.maxGuests = { gte }` and `where.bedrooms = { gte }`
  ([search.service.ts:86](src/lib/services/search.service.ts:86)), plus the
  `_max.bedrooms` facet that drives the filter sheet's ceiling
  ([:429](src/lib/services/search.service.ts:429)).
- **Cards**: [listing-card.ts:132](src/lib/serializers/listing-card.ts:132) →
  [property-card.tsx:146](src/components/public/property-card.tsx:146).
- **Public listing page**: the "6 guests · 3 bedrooms · 4 beds · 2 bathrooms" line at
  [properties/[slug]/page.tsx:142](src/app/(public)/properties/[slug]/page.tsx:142),
  and the space-type badge at [:292](src/app/(public)/properties/[slug]/page.tsx:292).
- Admin listing detail, the admin mobile API, and the host form serializer.

### `ListingRoom` and `RoomType`

`RoomType` (`prisma/schema.prisma`) is admin-owned taxonomy in the same shape as
`Amenity`: `key`, unique `name`, `categoryId`, `icon`, `sortOrder`, `isRepeatable`,
`isStandard`, `isActive`, plus `RoomTypeTranslation` per locale. The shipped catalog
([prisma/data/room-type-catalog.json](prisma/data/room-type-catalog.json)) has 29 types
across `interior / outdoor / additional`; `bedroom`, `bathroom`, `kitchen`,
`living_room`, `dining_area`, `terrace`, `exterior` are `isStandard`. `toilet` exists
and is repeatable but is **not** standard. `exterior`, `view`, `other` are the only
non-repeatable types.

`ListingRoom` is `(listingId, roomTypeId, ordinal)` unique, with `displayName` and
`sortOrder`, and owns `ListingImage[]`. `ListingImage.roomId` is nullable with
`onDelete: SetNull` — deleting a room releases its photos to Unassigned rather than
deleting them.

### The Photos workspace

[listing-photos.actions.ts](src/lib/actions/listing-photos.actions.ts) (449 lines) is
the only writer of `ListingRoom` and `ListingImage`:

| Action | Behaviour |
| --- | --- |
| `addListingPhotos` | appends at end of `displayOrder`, `roomId` null, first image on an empty listing becomes cover |
| `assignPhotosToRoom` | sets `roomId` + appends `roomOrder`; `null` clears |
| `reorderListingPhotos` / `reorderRoomPhotos` | full-order rewrite, gallery order and room order kept independent |
| `setListingCoverPhoto` | single `isPrimary`, cleared transactionally |
| `setRoomCoverPhoto` | reorder to `roomOrder 0` — no second flag |
| `deleteListingPhotos` | hard delete, promotes a replacement cover |
| `addListingRoom` | `nextOrdinal` = max + 1, rejects a second instance of a non-repeatable type |
| `renameListingRoom` / `reorderListingRooms` / `deleteListingRoom` | display name (≤60), `sortOrder`, delete-and-release |

Every action re-scopes its `where` to `listingId` after `ownedListing()`, caps bulk at
500, and calls `refresh()` which revalidates the editor paths and — only for `APPROVED`
listings — the public listing page and card caches. **This pattern is the contract any
new room mutation must follow.**

[listing-editor.service.ts](src/lib/services/listing-editor.service.ts) assembles
`ListingEditorData` and resolves each room's display name through
[`roomDisplayName`](src/lib/rooms/room-name.ts), which numbers a room only when the
listing has more than one of that type.

### Three facts that shape everything below

1. **`ListingRoom` is currently a photo-organising device, not an inventory.** A room row
   exists only once a host creates it or drops a photo on a suggested type. A listing
   with `bedrooms: 3` routinely has zero `ListingRoom` rows.
2. **`seedStandardRooms()` at
   [listing-editor.service.ts:42](src/lib/services/listing-editor.service.ts:42) is dead
   code** — defined, documented, never called. Standard types appear in the rail as
   greyed suggestion rows instead. Nothing today silently manufactures bedrooms.
3. **Nothing public reads `ListingRoom`.** The guest listing page renders one flat
   `ImageGallery`; search and cards read only the scalars. So the room inventory can be
   reshaped without touching a guest surface until we choose to.

---

## 2. Decisions

### 2.1 Source of truth

| Value | Source of truth | Rationale |
| --- | --- | --- |
| Individual spaces | `ListingRoom` | Already the identity photos hang off; one row per real room |
| Beds | `RoomBed` rows under a `ListingRoom` | "4 beds" is not a fact, it's a sum |
| Bedrooms count | derived: count of `ListingRoom` where `roomType.key = 'bedroom'` | |
| Bathrooms count | derived from bathroom-typed `ListingRoom` rows + their attributes | |
| Beds count | derived: `SUM(RoomBed.quantity)` over the listing | |
| **`maxGuests`** | **host-authored on `Listing`** | Occupancy is a house-rule decision, not arithmetic. A 2-bedroom with 4 beds may sleep 4 or be capped at 3. Airbnb, Booking and every importer treat it as an independent field. Do not derive it. |
| `spaceType` | host-authored on `Listing` | |
| `propertyType` | host-authored on `Property` | |

**`Listing.bedrooms` / `beds` / `bathrooms` stay as columns, demoted to maintained
caches.** They are not deleted, for three reasons that are each individually sufficient:

- `search.service.ts` filters `bedrooms >= n` and computes a `_max.bedrooms` facet.
  Replacing that with a relation-count subquery on every search request is a
  significant regression on the hottest query in the product.
- Mobile clients already in the field type them as numbers.
- The importer, mobile draft, and seeds all supply them directly.

So: **rooms are the truth, scalars are the index.**

### 2.2 Keeping the cache honest

One function, one call site pattern:

```
recomputeListingRoomAggregates(tx, listingId)
```

- Lives in a new `src/lib/services/listing-rooms.service.ts`.
- Runs **inside the same `$transaction`** as every mutation that adds, deletes, or
  retypes a `ListingRoom`, or that changes a `RoomBed`.
- Recomputes `bedrooms`, `beds`, `bathrooms`, `halfBathrooms`, `sharedBathrooms` from
  the rows, and writes them in one `listing.update`.
- Is a no-op when `Listing.roomInventoryConfirmedAt IS NULL` (see §2.5) — a legacy
  listing whose rooms have not been confirmed must not have its published numbers
  rewritten by a backfill guess.

Plus two safety nets:

- `scripts/repair-listing-room-aggregates.ts --dry-run` — reports and optionally fixes
  every listing whose cache disagrees with its rows. Run after each migration phase.
- A unit test asserting the recompute is a pure function of the row set (§7).

Deliberately **not** a database trigger: this codebase keeps all invariants in
application services, and a trigger would be invisible to the Prisma-mocked tests that
cover every other mutation path.

### 2.3 `RoomBed` — yes, normalized

A `beds Int` on `ListingRoom` cannot answer "which room has the king?", which is the
single most-requested fact on a guest listing page and the reason this section exists.

```
model RoomBed {
  id            String   @id @default(cuid())
  listingRoomId String
  bedTypeId     String
  quantity      Int      @default(1)   // 1..10
  sortOrder     Int      @default(0)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  room    ListingRoom @relation(fields: [listingRoomId], references: [id], onDelete: Cascade)
  bedType BedType     @relation(fields: [bedTypeId], references: [id])

  @@unique([listingRoomId, bedTypeId])   // one row per bed kind per room; quantity carries the rest
  @@index([listingRoomId])
  @@index([bedTypeId])
}
```

`onDelete: Cascade` — unlike photos, a bed has no meaning outside its room, so deleting a
bedroom takes its beds with it. There is nowhere for an orphan bed to go.

**`BedType` is a catalog table, not a Prisma enum.** It mirrors `RoomType` exactly:
`key`, unique `name`, `icon`, `sortOrder`, `isActive`, `sleepsDefault Int`, plus
`BedTypeTranslation(bedTypeId, locale, label, isManuallyEdited)`. This costs one more
table but buys the three things the enum cannot: admins can add "sofa bed (double)"
from Settings without a deploy, the label flows through the existing
`resolveRoomTypeLabel`-style reviewed-translation pipeline instead of being hardcoded
English in a `.ts` union, and the release-snapshot / `import-*-catalog.ts` machinery
already exists and can be copied verbatim. Initial catalog:
`single, double, queen, king, sofa_bed, bunk_bed, floor_mattress, air_mattress,
crib, toddler_bed, hammock, water_bed`.

`sleepsDefault` is informational only — it powers a "sleeps about N" hint next to the
host's `maxGuests` field. It never overwrites `maxGuests`.

Beds are allowed on **any** room type, not only bedrooms — a sofa bed in the living room
is exactly the case guests need told. `Listing.beds` sums all of them;
`Listing.bedrooms` counts only `bedroom`-typed rooms.

### 2.4 Bathrooms

Full / half / private / shared are two independent axes, so they need two fields, not
one four-valued enum:

```
// on ListingRoom, meaningful only when roomType.key ∈ {bathroom, toilet}
bathroomKind    BathroomKind?     // FULL | HALF
bathroomPrivacy BathroomPrivacy?  // PRIVATE | SHARED | EN_SUITE
```

- `FULL` = has a shower and/or a bathtub. `HALF` = toilet and sink only (this is what
  the existing `toilet` room type already means; a `toilet` room defaults to `HALF`).
- `EN_SUITE` is a form of private, and is offered only when the listing has at least one
  bedroom. It is a separate value rather than a boolean because "private, down the hall"
  and "private, attached to your bedroom" are different guest promises.
- These are `ListingRoom` columns rather than a `BathroomDetail` side-table: they are
  two small scalars on a row we already load, and a 1:1 table would only add a join.

Aggregates on `Listing`:

| Column | Meaning |
| --- | --- |
| `bathrooms` *(existing)* | count of `FULL` bathrooms — the closest reading to today's value |
| `halfBathrooms` *(new, default 0)* | count of `HALF` |
| `sharedBathrooms` *(new, default 0)* | count of `SHARED`, across both kinds |

**`bathrooms` stays `Int`; it does not become `Decimal`.** Prisma serialises `Decimal`
as a string over JSON, which would silently break the mobile clients and the admin API
that read it as a number today. The "2.5 baths" string guests expect is a *formatting*
concern — `formatBathrooms(full, half)` in `src/lib/utils/format.ts`, next to the
existing `bedrooms` formatter at
[format.ts:39](src/lib/utils/format.ts:39). Search keeps filtering on the integer
`bathrooms`, unchanged.

### 2.5 Legacy migration

Every existing listing has trustworthy scalars and an arbitrary (often empty) room set.
The migration must never make a live listing say something the host did not.

The gate is one nullable column:

```
Listing.roomInventoryConfirmedAt DateTime?
```

- **NULL** — legacy shape. Public surfaces, search and the mobile API read the scalars
  exactly as today. `recomputeListingRoomAggregates` refuses to write. Property details
  shows the backfilled rooms as a *draft* the host is asked to confirm.
- **Set** — rooms are the truth. Aggregates are recomputed on every room mutation.

Set by the host pressing "Confirm" once in Property details, or by an admin backfill for
listings whose rows already agree with their scalars.

The backfill script (`scripts/backfill-listing-room-inventory.ts`, idempotent,
`--dry-run` first) for each listing:

1. Counts existing `bedroom` rooms. If fewer than `Listing.bedrooms`, creates the
   difference using `nextOrdinal`, marked `origin = MIGRATED`.
2. Same for `bathroom` rooms against `Listing.bathrooms`, defaulting
   `bathroomKind = FULL` and `bathroomPrivacy = PRIVATE` for `ENTIRE_PLACE` listings,
   `SHARED` for `SHARED_ROOM`, and leaving privacy **null** for `PRIVATE_ROOM` and
   `HOTEL_ROOM`, where we genuinely cannot guess.
3. Distributes `Listing.beds` across the bedrooms: one `double` per bedroom, then any
   remainder as additional `single` beds spread round-robin. If `beds < bedrooms`, some
   bedrooms get no bed rather than inventing one.
4. **Never deletes or retypes an existing room, and never touches an existing photo
   assignment.** Only additive.
5. Does **not** set `roomInventoryConfirmedAt`.

`ListingRoom.origin` (`HOST | MIGRATED`, default `HOST`) is what lets the UI say "we
filled these in from your old listing — check them" and lets a later cleanup find
untouched guesses. It is cleared to `HOST` the moment the host edits the row.

Listings with `bedrooms = 0` and no rooms (studios, some hotel rooms) are left alone;
a studio legitimately has zero bedrooms and its beds go on a `living_room` or a
`studio`-ish room the host picks.

### 2.6 Photos and Property details on one inventory

They share `ListingRoom` rows. No second table, no per-section counts.

Ownership split, enforced by which action each section calls:

| Field | Owner |
| --- | --- |
| `sortOrder`, `ListingImage.roomId`, `roomOrder` | Photos |
| `roomTypeId`, `ordinal`, `displayName` | either (same action) |
| `RoomBed`, `bathroomKind`, `bathroomPrivacy` | Property details |
| existence of the row (add / delete) | either |

Mechanics:

- The room-mutating actions (`addListingRoom`, `renameListingRoom`,
  `deleteListingRoom`, `reorderListingRooms`) **move out of
  `listing-photos.actions.ts` into `listing-rooms.actions.ts`**, unchanged in behaviour,
  and gain the `recomputeListingRoomAggregates` call. Photos imports them from the new
  module. This is a pure move — no behavioural diff — and it is the one refactor this
  design requires of already-shipped code.
- `getListingEditorData` gains `beds` and bathroom attributes on `ListingRoomSummary`,
  so both sections render from the same payload shape. Property details additionally
  needs the `BedType` catalog, fetched the same way `getRoomTypeCatalogIncluding` works.
- **Deletion gets a consequence warning in both places.** Today deleting "Bedroom 2" in
  Photos silently releases its photos; after this change it also drops the listing's
  bedroom count and its beds. The existing dialog must state both, and the action
  returns `{ releasedPhotos, removedBeds }`.
- The Photos rail's greyed suggestion rows keep working: dropping a photo on suggested
  "Bedroom" calls the same `addListingRoom`, which now also bumps `Listing.bedrooms`.
  This is correct — a host who has a bedroom photo has a bedroom — but it means Photos
  can change a published listing's headline numbers. Gated by
  `roomInventoryConfirmedAt` (§2.5), so it cannot happen to a legacy listing before the
  host has looked at Property details once.
- `seedStandardRooms` stays dead and should be deleted in this work: Property details is
  the place a host declares rooms, and auto-seeding one bedroom + one bathroom into
  every listing is exactly the fabrication §2.5 is built to avoid.

---

## 3. What Property details contains

One page, six blocks, saved per-block (the editor's existing `save-state.ts` pattern).

1. **Property type** — `Property.propertyType`, a picker over the active `PropertyType`
   catalog. Changing it re-runs `spaceTypeForPropertyType`
   ([listing-space-type.ts:54](src/lib/types/listing-space-type.ts:54)), which already
   handles the Hotel↔space-type coupling. Note this writes `Property`, not `Listing` —
   and a `Property` can have several `Listing`s, so the UI must say so when it does.
2. **What guests book** — `Listing.spaceType`, options from
   `allowedListingSpaceTypes(propertyType, current)`; the current value is always kept
   in the list even when the rules would drop it.
3. **Maximum guests** — `Listing.maxGuests`, stepper 1–20, host-authored. Shows
   "your beds sleep about N" from `SUM(quantity × sleepsDefault)` as a hint, with no
   enforcement beyond the soft warning in §4.
4. **Rooms and spaces** — the inventory list: add / remove / rename / retype, grouped by
   `RoomTypeCategory`, with each row showing its photo count and linking into Photos
   filtered to that room. Bedrooms and bathrooms sit at the top because they are the
   ones that move the headline numbers.
5. **Bed arrangements** — per room (any room, not only bedrooms), a `BedType` × quantity
   list. The listing-level "N beds" is displayed as a computed total and is not editable.
6. **Bathrooms** — per bathroom-typed room, `bathroomKind` and `bathroomPrivacy`.
   Summary line "2 full, 1 half · 1 shared" computed, not typed.

Blocks 4–6 all mutate the same rows; block 4's list is the spine and 5–6 are expansions
of its rows, not separate inventories.

---

## 4. Invariants and constraints

Application-enforced (Zod + service):

- `maxGuests` 1–20; `RoomBed.quantity` 1–10; ≤ 6 `RoomBed` rows per room; ≤ 50
  `ListingRoom` rows per listing.
- `bathroomKind` / `bathroomPrivacy` are non-null **iff** the room's type is `bathroom`
  or `toilet`; writing them onto a kitchen is rejected, not ignored.
- `EN_SUITE` requires ≥ 1 bedroom on the listing.
- A non-repeatable `RoomType` gets at most one room — already enforced in
  `addListingRoom`, must be re-enforced on retype.
- `ordinal` from `nextOrdinal` (max + 1, never count + 1) — reusing a freed ordinal
  collides with a room the host is still looking at.
- Retyping a room recomputes its `ordinal` in the destination type and revalidates
  repeatability.
- **Soft** warning, never a block: `maxGuests` > total `sleepsDefault`, or a listing with
  bedrooms and zero beds. Hosts have legitimate reasons for both and a publish blocker
  here would be a support burden.

Database:

- `RoomBed`: `@@unique([listingRoomId, bedTypeId])`, `onDelete: Cascade`, indexes on both
  FKs.
- `BedType.key` and `.name` unique; `BedTypeTranslation @@unique([bedTypeId, locale])`
  with `onDelete: Cascade` on both sides — same shape as `RoomTypeTranslation`.
- New `Listing` columns `halfBathrooms`, `sharedBathrooms` `Int @default(0)`;
  `roomInventoryConfirmedAt DateTime?`; `ListingRoom.origin` with a default.
- `ListingRoom` keeps `@@unique([listingId, roomTypeId, ordinal])`.
- No new index on `halfBathrooms`/`sharedBathrooms` — nothing filters on them; the
  existing `bedrooms`/`maxGuests` filtering is unindexed today too and is out of scope.
- **A CHECK constraint tying `Listing.bedrooms` to the row count is not proposed.**
  Prisma cannot express it, it would have to be raw SQL in a migration, and it would
  make the legacy dual-read state in §2.5 unrepresentable. The repair script plus the
  in-transaction recompute are the enforcement.

---

## 5. Migration and rollout sequence

Expand → migrate → confirm → contract. Each step ships and is deployed independently.

1. **Schema, additive.** `BedType`, `BedTypeTranslation`, `RoomBed`; `ListingRoom`
   bathroom columns + `origin`; `Listing.halfBathrooms`, `sharedBathrooms`,
   `roomInventoryConfirmedAt`. All nullable or defaulted. Nothing reads them.
   Migration name: `<timestamp>_room_inventory`.
2. **Bed catalog.** `prisma/data/bed-type-catalog.json` +
   `scripts/import-bed-type-catalog.ts` / `export-bed-type-catalog.ts`, copied from the
   room-type pair. Admin Settings tab mirrors `rooms-tab.tsx`.
3. **Service layer.** `listing-rooms.service.ts` with the recompute; move the room
   actions out of `listing-photos.actions.ts`; extend `getListingEditorData`. Photos
   behaviour unchanged. Full test suite green here, before any UI.
4. **Backfill, `--dry-run` on production data first.** Review the diff for a sample of
   listings by hand. Then run for real. `roomInventoryConfirmedAt` stays null.
5. **UI.** Property details section; flip `built: true` in `editor-sections.ts` — a
   change that belongs to the final integration pass, not to this work, since that file
   is shared with the other in-flight editor sections.
6. **Confirm loop.** Hosts confirm; each confirmation sets the timestamp and switches
   that listing to rooms-as-truth. Track the confirmed percentage.
7. **Contract, later and separately.** Once confirmation is high, optionally show
   per-room beds on the public listing page and group the gallery by room. Only at that
   point does any of this become guest-visible.

The scalar columns are never dropped.

i18n: every new label is a new UI string, so the reviewed-translation test will fail
until the final integration pass regenerates the catalog. That is expected and is not
this work's job to fix.

---

## 6. What breaks if we are careless

- `search.service.ts` `_max.bedrooms` feeds the filter sheet's maximum. If the recompute
  ever writes a wrong high value, the public filter UI grows a phantom option.
- `deleteListingPhotos` promotes a replacement cover; `deleteListingRoom` does not touch
  covers because photos survive. Deleting a *bedroom* now also deletes beds — a
  different blast radius from the same button. The dialog copy matters.
- The importer parses decimal bathrooms (`(\d+(?:\.\d+)?)` at
  [importer.ts:413](src/lib/listing-import/importer.ts:413)) and then truncates into an
  `Int` — "2.5 baths" imports as 2 today. With `halfBathrooms` this becomes recoverable;
  wiring it is a small follow-up, not a blocker.
- `revalidatePublicListingCaches()` must fire on room mutations once rooms are truth, or
  a bedroom added in Photos will not show on the cached card.

---

## 7. Tests required before UI work

Vitest (`npm run test`), mocked Prisma, matching the existing
`src/lib/services/__tests__` and `src/lib/host/v2/__tests__` style.

**Pure units** (no DB, highest value first):

1. `recomputeListingRoomAggregates` — bedrooms/beds/bathrooms/half/shared from a room
   set; studio with zero bedrooms; beds in a living room counted in `beds` but not
   `bedrooms`; a `toilet` room counted as half, not full.
2. Backfill planner extracted as a pure function: given (scalars, existing rooms) →
   rooms and beds to create. Idempotency — running the planner on its own output yields
   an empty plan. Never proposes a delete. `beds < bedrooms` leaves bedrooms bedless.
3. Bathroom validation matrix — kind/privacy required iff bathroom-typed; `EN_SUITE`
   without a bedroom rejected.
4. `formatBathrooms(full, half)` — 2/0 → "2 baths", 2/1 → "2.5 baths", 0/1 →
   "Half bath", 1/0 singular.
5. `nextOrdinal` on retype — existing coverage of `roomDisplayName`/`nextOrdinal` is
   **absent today**; add it as part of this work.

**Action-level** (mocked `db`, following `listing.actions.test.ts`):

6. Every new/moved room action rejects a listing the caller does not own, and a `roomId`
   belonging to another listing.
7. `addListingRoom` / `deleteListingRoom` recompute aggregates in the same transaction.
8. Recompute is a no-op while `roomInventoryConfirmedAt` is null.
9. `deleteListingRoom` returns `{ releasedPhotos, removedBeds }` and leaves photos in
   place.
10. Non-repeatable type rejected on both add and retype.

**Regression:**

11. `search.service.test.ts` — the `bedrooms >= n` filter and the `_max` facet still
    behave with the new columns present.
12. `listing.schema.test.ts` — unchanged create/update paths still accept the scalars,
    since mobile and the importer keep writing them.

---

## 8. Open product decisions

1. **Does `maxGuests` stay hand-typed forever?** Recommended yes. If product wants it
   derived, that is a different design and changes §2.1.
2. **Confirmation prompt strength.** Is "check your rooms" a dismissible banner, a
   publish blocker, or an email campaign? Affects how long the dual-read state in §2.5
   must be supported.
3. **Do beds go on the public page in this cycle?** §5 step 7 assumes not. If yes, the
   confirmation rate becomes a launch gate rather than a metric.
4. **`EN_SUITE` — third privacy value or a boolean on `PRIVATE`?** Proposed as a third
   value; a boolean is defensible and cheaper to render.
5. **Property type on a shared `Property`.** Two listings on one property share
   `propertyType`; editing it from one listing changes the other. Needs either a warning
   or a decision that this is fine.
6. **Half-bath vocabulary in Macedonian/Albanian/Serbian.** "Half bath" is an American
   idiom. The `toilet` room type already exists in the catalog and may be the better
   guest-facing framing for this market — worth asking before the labels are written.
7. **Should `bathroom` room rows be required to have photos?** Today rooms and photos are
   independent; a bathroom declared in Property details with no photo is fine. Confirm
   that is acceptable rather than accidental.
