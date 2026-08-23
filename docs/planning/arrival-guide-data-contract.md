# Arrival guide — data contract

Status: `/host/v2/listings/[id]/arrival-guide` is implemented as a **read-only summary
and handoff**. Check-in / check-out remain editable only in House rules. Everything else
on this page is a **proposal** blocked on schema and security work this document does not
perform.

Scope: the `arrival-guide` editor section (`EDITOR_SECTIONS` slug `arrival-guide`, label
"Arrival guide", flagged `built: true`). What exists, what does not, what a guest
can see and when, and what has to be decided before a door code or a Wi-Fi password is
allowed anywhere near the database.

---

## 1. What exists today

### The only stored fields

`prisma/schema.prisma:540` — `Listing.checkInTime String?` and
`Listing.checkOutTime String?`. Wall-clock house rules ("15:00"), not instants; `NULL`
means "flexible, agree with the guest".

Written by:

- the classic listing form — [listing.actions.ts:458](src/lib/actions/listing.actions.ts:458)
  (create) and [:605](src/lib/actions/listing.actions.ts:605) (update), validated by the
  `stayTime` transform at [listing.schema.ts:6](src/lib/validations/listing.schema.ts:6)
  (`/^([01]\d|2[0-3]):(00|30)$/`, anything else silently becomes `""`);
- the URL importer — [listing-import/types.ts:39](src/lib/listing-import/types.ts:39);
- the mobile draft pipeline — [listing-draft.ts](src/lib/types/listing-draft.ts);
- the v2 House rules action — [listing-house-rules.actions.ts](src/lib/actions/listing-house-rules.actions.ts).

Read by:

- the **public listing page**, [properties/[slug]/page.tsx:179](src/app/(public)/properties/[slug]/page.tsx:179)
  — visible to anyone, no booking required;
- host-side reservation surfaces — [reservation-panel.tsx](src/components/host/v2/reservations/reservation-panel.tsx),
  [reservation-rail.tsx](src/components/host/v2/messages/reservation-rail.tsx),
  [host-reservations.service.ts](src/lib/services/host-reservations.service.ts),
  [host-inbox.service.ts](src/lib/services/host-inbox.service.ts);
- the host form serializer, [host-listing-form.ts:62](src/lib/serializers/host-listing-form.ts:62).

Neither field is sensitive. Both are advertised before anyone books. Arrival guide shows
them for context but links to House rules for changes so the columns have one editor.

### The visibility gate that already exists

[street-view-access.ts](src/lib/utils/street-view-access.ts) —
`EXACT_LOCATION_UNLOCK_DAYS = 3`, `exactLocationUnlocksAt(checkIn)`, and
`canSeeExactLocation(booking, now)`. Two gates, both required: the booking is `CONFIRMED`,
and `now >= checkIn - 3 days`. `COMPLETED` stays unlocked (the guest has already been
there); every cancelled/rejected/expired status locks back down.

Its own doc comment already names arrival instructions as a future consumer:

> "the exact-location details (Street View, and later the host's arrival instructions)"

Its only consumer today is
[booking-arrival-details.tsx](src/components/booking/booking-arrival-details.tsx), rendered
on the guest booking detail page,
[account/bookings/[id]/page.tsx:202](src/app/(account)/account/bookings/[id]/page.tsx:202).
That card shows the full street address and the host's chosen Street View pano when
unlocked, and a "this appears on {date}" sentence when not. Ownership is enforced upstream
by `getGuestBookingWithHost(id, session.user.id)`
([booking.service.ts:183](src/lib/services/booking.service.ts:183)).

The public listing page deliberately shows the area only, and says so in a comment at
[properties/[slug]/page.tsx:290](src/app/(public)/properties/[slug]/page.tsx:290).

### Nothing else exists

There is **no** column, service, action, API field or UI anywhere in the repo for:

check-in method · arrival/check-in instructions · parking directions · Wi-Fi network or
password · door, lockbox or keypad codes · directions to the door · host contact guidance.

Verified by grep across `prisma/schema.prisma` and `src/**` — the only hits for
`wifi`/`parking` are amenity catalog labels
([amenities/catalog.ts](src/lib/amenities/catalog.ts),
[listing-import/route.ts](src/app/api/listing-import/route.ts)), which are booleans on a
listing, not instructions.

`Booking.hostNote String?` (`prisma/schema.prisma:1166`) exists and is **dead** — nothing
in `src/**` reads or writes it. It is the closest thing to a per-stay arrival note, and
repurposing it is one of the open decisions in §4.

---

## 2. Data-flow inventory

| Value | Stored where | Written by | Guest sees it | When it becomes visible |
|---|---|---|---|---|
| **Check-in time** | `Listing.checkInTime` | classic form, importer, mobile draft, House rules action | Public listing page | Immediately on publish — **before booking, to anyone** |
| **Check-out time** | `Listing.checkOutTime` | same | Public listing page | Same |
| **Exact address** | `Property.address` / `postalCode` / `city` / `country` | classic form / location editor | Guest booking detail card | `canSeeExactLocation` — `CONFIRMED` **and** ≥ 3 days before check-in; or `COMPLETED` |
| **Street View of the entrance** | `Property.streetViewPanoId` / `Heading` / `Pitch` | location editor | Same card | Same gate |
| **Approximate location** | `Property.city` / `area` / `latitude` / `longitude` | location editor | Public listing page, cards, search, booking confirmation | Immediately on publish |
| **Host display name** | `Profile.hostDisplayName` | profile editor | Listing page, booking pages | Immediately |
| **Host contact** | — no field; contact happens in booking chat (`Conversation`) | — | Chat thread only | Once a conversation exists for the booking |
| **Check-in method** | ❌ nothing | — | — | — |
| **Arrival / check-in instructions** | ❌ nothing | — | — | — |
| **Parking directions** | ❌ nothing (only a `freeparkingonpremises` amenity boolean) | — | — | — |
| **Wi-Fi network + password** | ❌ nothing (only a `wifi` amenity boolean) | — | — | — |
| **Door / lockbox / keypad code** | ❌ nothing | — | — | — |
| **Directions to the door** | ❌ nothing (Street View is the nearest thing) | — | — | — |
| **Per-stay host note** | `Booking.hostNote` — **dead column, never read or written** | — | — | — |

Surfaces checked and confirmed to carry **no** arrival instructions today: the booking
confirmation page ([bookings/confirm/page.tsx:108](src/app/(public)/bookings/confirm/page.tsx:108)
shows city + country only), every template under `src/lib/email/`, the mobile booking API
([api/mobile/v1/bookings/[id]/route.ts:37](src/app/api/mobile/v1/bookings/[id]/route.ts:37)
selects `city` and `country` only), and the admin panel.

---

## 3. Security blockers

Each of these has to be answered by whoever owns the migration. None of them can be
answered by an editor screen.

**3.1 — Storage class.** A door code, a lockbox combination and a Wi-Fi password are
credentials for a physical space. `Listing.description` is a `String` in plaintext and that
is fine, because it is public. A `doorCode String?` on the same table would be plaintext in
the same dumps, the same backups, the same `SELECT *` in a console, and in every
`include: true` any future query writes. Decide: application-level encryption at rest, a
separate restricted table, or an explicit accepted-risk plaintext with the blast radius
written down.

**3.2 — `include: true` is already the wrong default.**
[getGuestBookingWithHost](src/lib/services/booking.service.ts:183) uses
`include: { listing: { include: { property: true, host: { include: { profile: true } } } } }`.
Today that is safe: the consumer is a Server Component and the gate is applied before
render, so nothing un-gated crosses to the client. But it means a sensitive column added to
`Property` or `Listing` is *automatically* loaded onto that page, and the day someone makes
a child component `"use client"` it is in the RSC payload. Before any arrival secret lands
on either table, that query needs an explicit `select`. The new
[listing-arrival-guide.service.ts](src/lib/services/listing-arrival-guide.service.ts)
uses an explicit `select` for this reason and says so.

**3.3 — Which gate, and is it the right one.** `canSeeExactLocation` is a good fit for
directions and parking. It is probably **not** the right gate for a door code:
`COMPLETED` returns `true` forever, so a guest from two years ago keeps read access to a
code that may not have been rotated. A credential wants a narrower window (unlock at
`checkIn - 1 day`, revoke at `checkOut + n`) and, ideally, a rotation prompt. Deciding this
is a product call with a security consequence, not a default to inherit.

**3.4 — Audit and retention.** Revealing a code to a guest is an access event. There is an
[audit.service.ts](src/lib/services/audit.service.ts) and a GDPR export path
([gdpr.service.ts](src/lib/services/gdpr.service.ts)) — decide whether a reveal is audited,
and whether the code appears in a guest's data export (it is the host's secret, held about
the guest's stay).

**3.5 — Every other reader.** The mobile API, the email templates and the admin panel all
select their own field lists. Each is a separate decision about whether the new fields
appear there, and admin in particular should probably never see a door code.

**3.6 — Free-text leakage the schema cannot stop.** Hosts will paste a Wi-Fi password into
a plain "arrival instructions" textarea. If that field is gated the same way as a code,
fine; if it is not, a gated `doorCode` column buys nothing. Either gate the instructions
field identically, or say in the UI that it is not the place for secrets. The implemented
screen already says the second thing.

---

## 4. Proposed contract (not implemented)

For whoever picks this up. Two tiers, gated differently.

**Tier A — arrival information, not secret.** `Listing.checkInMethod` (enum:
`SELF_CHECK_IN_LOCKBOX | SELF_CHECK_IN_KEYPAD | SELF_CHECK_IN_SMART_LOCK | HOST_GREETS |
BUILDING_STAFF | OTHER`), `Listing.arrivalDirections Text?`, `Listing.parkingNotes Text?`.
Gate: `canSeeExactLocation`, alongside the address in `BookingArrivalDetails`. Rationale:
these describe how to reach a building whose address the guest already has at that point,
so a stricter gate would be theatre.

**Tier B — credentials.** A separate `ListingAccessSecret` row
(`listingId`, `kind`, `value`, `updatedAt`, `rotatedAt`), never on `Listing`, never
selected by a wildcard include, encrypted per 3.1, with its own `canSeeAccessSecret(booking,
now)` in `street-view-access.ts`'s neighbourhood — narrower than `canSeeExactLocation`, and
`false` once the stay is over. Reveal is audited. Never in email, never in the mobile list
endpoint, never in admin.

The editor UI for Tier A is straightforward once the columns exist. It should follow the
host-scoped service/action patterns used by House rules while keeping credential fields
behind their stricter contract.
Tier B should not be built until 3.1, 3.3 and 3.4 have written answers.

---

## 5. What is implemented

Route `/host/v2/listings/[id]/arrival-guide` — a real static segment marked built in
`EDITOR_SECTIONS`.

- [page.tsx](src/app/(host-editor)/host/v2/listings/[id]/arrival-guide/page.tsx) — both
  reads host-scoped, `notFound` on a listing the caller does not own.
- [listing-arrival-guide.ts](src/lib/host/v2/listing-arrival-guide.ts) — the explicit list
  of topics with no storage.
- [listing-arrival-guide.service.ts](src/lib/services/listing-arrival-guide.service.ts) —
  `server-only`, explicit `select`, scoped to `hostId` inside the query, and read-only.
- [arrival-guide-workspace.tsx](src/components/host/v2/editor/arrival-guide/arrival-guide-workspace.tsx) —
  read-only stay-time summary, link to the House rules editor, and a plain-language panel
  naming what is not stored.

No schema change. No new field accepts a secret. The unavailable topics are listed as
prose, never as disabled inputs — a greyed-out "Wi-Fi password" box tells a host the
product has somewhere safe to put it, and it does not.
