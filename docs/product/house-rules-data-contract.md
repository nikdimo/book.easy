# House rules: what is stored, and how it moves

Companion to the House rules screen, which is one component
(`components/host/v2/house-rules/house-rules-rows.tsx`) rendered in two places:

- the create flow's step, `/host/start/house-rules`;
- the post-publish editor's tab, `/host/v2/listings/[id]/house-rules`.

They share the screen, the wording and the validation deliberately. Two implementations
of "what is a house rule" would have drifted apart within a release.

An earlier version of this document proposed these columns and explained why the screen
could not offer them yet. They exist now; what follows describes what was built.

## What is stored

All on `Listing`. Every policy is **nullable, and NULL means the host has not answered** —
which is not the same as "not allowed", and the difference is load-bearing. Listings
published before these columns existed have never been asked, so the public page prints
nothing for them rather than inventing a refusal their host never chose.

| Rule | Column | Type | Guest-facing consequence |
| --- | --- | --- | --- |
| Check-in | `checkInTime` | `String?` | Printed on the listing page and in the House rules block. NULL means flexible, and prints nothing. |
| Check-out | `checkOutTime` | `String?` | Same. |
| Maximum guests | `maxGuests` | `Int` | `booking.service` refuses a larger party; `search.service` filters the listing out of searches for one; the booking widget caps its guest picker. |
| Pets | `petPolicy` | `ListingPetPolicy?` | `ALLOWED` / `NOT_ALLOWED` / `ASK_HOST`. Backs the guest "Pets allowed" search filter. |
| Smoking | `smokingPolicy` | `ListingSmokingPolicy?` | `NOT_ALLOWED` / `OUTDOORS_ONLY` / `ALLOWED`. |
| Parties and events | `eventPolicy` | `ListingEventPolicy?` | `ALLOWED` / `NOT_ALLOWED`. |
| Quiet hours | `quietHoursPolicy` | `ListingQuietHoursPolicy?` | `NONE` (explicitly none) or `SET`, with the two times below. |
| Quiet hours, from/until | `quietHoursStart` / `quietHoursEnd` | `String?` | Both set or both NULL. |
| The host's own rules | `additionalRules` | `String?` `@db.Text` | Free text, at most `ADDITIONAL_RULES_MAX` (1000) characters. |
| Reviewed at | `houseRulesReviewedAt` | `DateTime?` | Not guest-facing. The editor's completion marker — see below. |

### Why enums rather than booleans

Because the two most common real policies cannot be expressed as yes/no. "Smoking
outdoors only" is neither allowed nor forbidden, and "pets by arrangement" is the policy
of every host who takes a small dog but not a Great Dane. A boolean forces both into an
answer the host did not give.

### Wall-clock times

Every time here is an `"HH:MM"` string, never a `DateTime` — see the note on `checkInTime`
in `prisma/schema.prisma`. The pickers offer half hours and accept any valid minute back,
so an imported off-grid `"14:15"` survives an unrelated edit.

**Quiet hours cross midnight**, which is the ordinary case (`22:00`–`08:00`). The two ends
are never compared, and a `start < end` rule would reject almost every real answer. What
*is* enforced is both ends or neither.

## Where each rule is required

Only in the create flow. `listingHouseRulesIssues(rules, { requireAnswers: true })` makes
the four policies mandatory, and the step's Next stops leading anywhere until they are
answered — at the step that asks, never deferred to Review or to publish.

The editor passes no such option. A listing published before these columns existed has
four unanswered policies, and a tab that refused to save until its host answered questions
they were never asked would make the whole section uneditable.

`publishBlockers` reports missing policies too, for drafts that reached Review some other
way (an import, the mobile app, a row written before the screen existed). `submitNewListing`
itself accepts them as NULL — publishing must not stall a client that has no rules screen.

## Draft to published listing

The create flow writes to `ListingDraft.data` (JSON, all strings), and publishing maps
that to columns. Each field passes through five places, and
`lib/host/v2/listing-house-rules-draft.ts` owns the field list so none of them can be
forgotten:

1. `ListingDraftData` — the draft's shape (`lib/types/listing-draft.ts`).
2. `HOUSE_RULES_DRAFT_FIELDS` — read by the host-start publish whitelist
   (`actions/host-start.actions.ts`) and by the mobile publish route.
3. `mobileListingDraftPatchSchema` — the mobile/web draft-save contract. Policies are
   validated as closed sets; `""` is accepted, because "unanswered" is a real answer to
   send.
4. `listingFormSchema` — the publish gate. `""` and anything unrecognised become NULL.
5. `submitNewListing` / `updateListing` — `houseRulesCreateData` writes the columns.

Quiet-hours times are dropped unless the policy is `SET`, at every layer, so a draft that
once had times and was later switched off cannot publish a rule its host turned off.

## Pets: one home, and the filter that survived it

Pets used to be the `pets_allowed` amenity. Migration `20260822120000_listing_house_rules`,
in this order:

1. backfilled `petPolicy = 'ALLOWED'` for every listing holding the amenity;
2. deleted those `ListingAmenity` rows;
3. set the catalog row `isActive = false`.

The row is deactivated rather than deleted: amenity aliases and translations reference its
id, and guest search still names it.

The guest filter token is unchanged — `?amenities=Pets+allowed` is a URL guests have
bookmarked and shared. What changed is where the answer comes from:

- `search.service.buildListingWhere` translates that one token into `petPolicy: ALLOWED`
  instead of an amenity join. `ASK_HOST` does not match: a guest filtering for pets wants
  somewhere they can bring one, not somewhere they may ask.
- `getAvailableAmenityNames` and `getSearchFilterPreview` count listings with
  `petPolicy: ALLOWED` to decide whether the chip is offered.
- `getAmenityCatalogWithPetsFilter` keeps the deactivated row on the guest filter panel.
  Host pickers use `getAmenityCatalog` and never see it.
- The importer diverts pet labels into the policy (`lib/amenities/pets.ts`) rather than
  recreating the amenity on every import.

Constants and label matching live in `lib/amenities/pets.ts`.

## Guest-facing rendering

`components/public/house-rules-list.tsx` renders a `HouseRulesSnapshot` — the shape both a
listing's current rules and a booking's frozen ones take. One component serves the listing
page and the booking sheet, so a guest accepts exactly the words they were shown.

Unanswered rules are omitted rather than shown as blanks. A guest has no use for the
knowledge that a host skipped a question, and a row saying so invites them to read it as a
restriction.

## Booking acceptance

The UI says guests agree to these rules when they book, so they do:

- The booking widget shows the rules in full and requires an explicit checkbox.
- `createBookingSchema` requires `houseRulesAccepted === "true"`. A request without it
  fails — the widget's own check exists only so the guest is told which control they
  missed.
- **No rules snapshot is accepted from the client.** The request carries the acceptance and
  nothing else. `createBooking` reads the listing row inside its own transaction and builds
  `Booking.houseRulesSnapshot` from it, alongside `houseRulesAcceptedAt`.
- The snapshot is never rewritten. A host editing their rules changes what the next guest
  agrees to, not what this one already did.
- `houseRulesSnapshot` is NULL on every booking taken before this existed, and on any
  booking created without an acceptance. "No record" is a different fact from "agreed to
  nothing", which is why the column is nullable rather than defaulted. `parseHouseRulesSnapshot`
  returns null for anything that is not a v1 object.

Versioned (`version: 1`) for the same reason `priceBreakdownVersion` is: a later shape
change has to be readable against rows written before it, not a migration of history.

## Guest-facing copy

`additionalRules` is the host's own words, and gets exactly what title and description get:

- stored as written, and **never overwritten with a machine translation** — translation
  happens at render time or not at all;
- an edit to it on a live listing sets `needsReview`, putting the listing back in the admin
  queue.

## Completion

House rules **is** counted in the editor's completion total, on the strength of
`houseRulesReviewedAt`. Every field the section edits has a value the moment a listing
exists, so "has values" cannot distinguish a host who reviewed the page from one who never
opened it — only a recorded visit can. The column is stamped on every save, including a
save that changed nothing: a host who read the section and agreed with every answer has
reviewed it.

Arrival guide still has no such column and is still excluded, for the reason this section
used to be.

## Not here, on purpose

- **Shortest / longest stay** — `PricingRule.minNights` / `maxNights`, edited in Pricing.
- **Which dates are bookable, and advance notice** — `AvailabilityBlock`,
  `ListingAvailabilityWindow`, `Listing.availabilityMode`, edited on the Calendar.
- **Arrival instructions and check-in method** — the Arrival guide's territory. The *times*
  are house rules; *how* the guest gets in is not.
- **Cancellation policy** — a money rule, with no column yet, and it belongs with Pricing.
- **Suitability for children, and commercial photography** — proposed in the earlier draft
  of this document and deliberately left out of the first version, to keep the screen
  scannable. Both would be new nullable columns following exactly the pattern above.
