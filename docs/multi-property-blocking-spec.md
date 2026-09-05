# Multi-property date blocking — implementation specification

## Goal

Let a host block (or open) the same date range on several properties in one action,
from the v2 host calendar, without leaving the single-property calendar they already
understand.

The motivating case: a host reserving dates across their portfolio for family use
currently has to repeat the same block property by property.

## Scope

**In scope**

- Blocking and opening dates across two or more properties in one gesture.
- A multi-select mode on the calendar's property rail, hidden until the host asks for it.
- The equivalent on small viewports, where there is no rail.
- Honest per-property reporting before and after the write.
- A single undo that reverses the whole action.

Desktop and mobile web are both first-class here. They share one state model and one
write path, and differ only in how the target set is presented — the same split the rest
of this workspace already makes between the desktop editor column and the mobile drawer.

The Expo app (`mobile/`) is a separate codebase with a different shape — its availability
screen is `/availability/[id]`, one listing per route — and is not covered here. The
server action this spec adds is reusable by a future mobile endpoint.

**Out of scope — do not build**

- Cross-property price, promotion, minimum-nights, or availability-mode edits. These
  stage through the review dialog for a reason and must stay single-property.
- Different date ranges per property.
- A new page or a separate "bulk edit" screen.
- Any change to the `(host)` v1 calendar, or to `AllListingsTimeline`, which stays
  read-only.

## Product rules

1. Multi-select is **off by default**. The rail behaves exactly as it does today until
   the host explicitly enters the mode.
2. The mode applies to the **availability editor only**. Opening any other editor
   (price, promotion) while the mode is on collapses the target set back to the shown
   property and exits the mode.
3. One property is always the **shown** property — its grid is the one dates are
   selected on. It is always a target and cannot be deselected.
4. Other properties are **additional targets**. Selecting them never changes the grid,
   the month, or the date selection.
5. A booked night, and a night held by a connected calendar, is **never** inside a range
   this writes — on any property. This is already guaranteed per listing by
   `buildAvailabilityAction`; the multi-property path runs it once per target.
6. The panel states the true totals **before** the press, including how many nights will
   not move and on which properties.
7. Undo restores only the nights this action actually moved, on the properties it moved
   them on.
8. Every write re-checks session and ownership per listing on the server. The client
   never asserts which listings a host may touch.
9. The mode is unavailable while the rail's "All listings" card is selected — that view
   has no grid to select dates on.
10. "All targets selected" is not the same thing as the `ALL_LISTINGS` view sentinel.
    The two must not be conflated in state.

## User flow — desktop

1. Host selects a property in the rail and drags a date range on its grid.
2. The availability editor opens with its existing `Block N nights` / `Open N nights`
   buttons.
3. Below them, a new control: **"Block on more properties"**.
4. Pressing it turns the rail into checkbox mode. The shown property is checked and
   locked. A **Select all** control appears at the top of the rail, and an **Exit**
   control leaves the mode.
5. The host checks additional properties. The editor's summary recomputes on every
   change.
6. The host presses Block. The buttons carry the combined count.
7. The result line reports what landed, with Undo.

## User flow — mobile web

There is no rail below `md`; the host taps a property button at the top of the screen,
which opens `ListingChooserSheet`, and the editor is a full-height drawer over the
calendar.

1. Host taps the property button, picks a property. The sheet closes, as today.
2. Host drags a date range on the grid.
3. Host opens the manage drawer and taps into the availability editor.
4. The same **"Block on more properties"** control is there. Tapping it opens a
   **second, distinct sheet** — the multi-select sheet — portalled above the drawer.
5. That sheet lists the properties with checkboxes, a **Select all**, and an explicit
   **Done** button. The shown property is checked and locked.
6. Done returns to the drawer, which now shows the combined summary. Nothing was written
   yet.
7. Host presses Block. Same result line, same Undo.

## UI specification

### Rail — selection mode

`ListingRail` (`src/components/host/v2/calendar/listing-rail.tsx`) gains an optional
multi-select mode. **Do not push this into `EntityRail`**; that component is shared with
`host-reservations-workspace.tsx`, which must be unaffected. Implement it by passing a
checkbox node into the existing `RailItem.trailing` slot and adding a small header slot
for Select all / Exit.

| State | Card appearance |
| --- | --- |
| Shown property | Selected styling as today, plus a checked, disabled checkbox |
| Checked companion | Normal styling, checked checkbox |
| Unchecked | Normal styling, empty checkbox |
| "All listings" card | Hidden while the mode is on |

Clicking a companion card's body in this mode toggles its checkbox rather than
navigating. Clicking the shown property is a no-op. Switching the shown property is
still possible from the chooser sheet; doing so exits the mode.

The compact (collapsed) rail must still render checkboxes legibly. Because
`RailItem.trailing` already overrides the selected-state check mark (`entity-rail.tsx`
line ~224), a checkbox in that slot replaces the check rather than fighting it.

### Small viewports — a second sheet, not a mode

**Do not add multi-select to `EntityChooserSheet`.** That component switches the pane on
tap and closes, and its own comment states why an Apply button would be wrong there: it
"can only ever confirm what was just tapped." That reasoning is correct for a navigator
and does not survive contact with multi-select, which cannot self-terminate and therefore
*needs* an explicit Done.

Add a sibling component in the same file instead:

```ts
export function EntityMultiSelectSheet({
  open,
  title,
  items,
  lockedId,        // the shown property: checked, not togglable
  checkedIds,
  onToggle,
  onSelectAll,
  onDone,
  onOpenChange,
  anchor,
}: { /* ... */ }): React.ReactElement;
```

It reuses the exported `RailCard` with a checkbox in `trailing`, so both surfaces speak
the same property vocabulary. Reservations simply never renders it, so its sheet
behaviour is untouched.

Mobile-specific requirements:

- The sheet is portalled **above** the manage drawer. This already happens for the
  review/discard dialog, and the drawer's focus trap already yields when focus leaves it
  (`host-calendar-workspace.tsx` ~line 291) — verify that path holds for this sheet too.
- Dismissing the sheet without Done keeps whatever was toggled. Toggling is not a draft;
  nothing is written until Block is pressed. Do **not** route this through `guard()` /
  the discard prompt.
- The sheet header states the date range, so the host is never choosing properties
  without seeing what will happen to them.
- Done is the only way to return; there is no Cancel that reverts toggles. If the host
  wants out, they exit the mode from the editor.
- The property button at the top of the calendar shows the target count while the set is
  larger than one, so the state is visible with every sheet closed.

### Availability editor

`AvailabilityEditor` (`src/components/host/v2/calendar/date-editors.tsx`) takes new
optional props:

```ts
/** Includes the shown listing, first, always. */
targets: { listing: HostCalendarListing; index: ListingCalendarIndex }[];
/** False when there is only one property to aim at. Hides the row entirely. */
canChooseTargets: boolean;
/** Null once the rail is the chooser: the row then reports rather than opens. */
onChooseTargets: (() => void) | null;
```

The exit lives on the rail's own banner (desktop) and the sheet's Done (mobile), so the
editor never carries a second control that competes with it.

When `targets.length === 1` the editor renders exactly as it does today.

When `targets.length > 1` it renders a combined summary. Build one
`AvailabilityActionModel` per target with the existing `buildAvailabilityAction`, then
sum. All listings and their calendar indexes are already in the client snapshot that
feeds `AllListingsTimeline`, so this needs **no additional fetch**.

Copy shape:

> **Block 24–28 Aug · 3 properties**
> 12 nights will be blocked.
> 3 nights stay open — booked on *Apartment Vodno*.

The "stay open" line names properties. With more than two, name two and count the rest.
A property where nothing can move must still be counted, not silently dropped.

The button label carries the combined movable count, keeping the existing rule that a
press can never do less than its label says.

The private-note field applies to every target. Say so in the confirm dialog.

## State specification

In `host-calendar-workspace.tsx`, the set is stored **with the act it belongs to** and
read back through it — not stored loose and cleared by an effect:

```ts
const availabilityScope =
  view.kind === "editor" && view.editor === "availability" && selection
    ? `${selectedId}:${selection.start}:${selection.end}`
    : null;

const [targetChoice, setTargetChoice] =
  useState<{ scope: string; ids: string[] } | null>(null);

const liveTargets =
  targetChoice && targetChoice.scope === availabilityScope ? targetChoice : null;
const companionIds = liveTargets?.ids ?? [];
const targetMode = liveTargets !== null;
```

This is the treatment `dateAction` already gets, and it matters for the same reason:
comparing scopes during render means a stale set can never be *used*, where clearing it
from an effect leaves one render in which it still applies. It also keeps the file free
of a `setState`-in-effect, which the repo's lint rules reject.

The set therefore stops applying — with no bookkeeping — when the shown property
changes, the dates change, or the editor changes. `null` doubles as "mode off", so an
empty set and no set are distinguishable, which is what lets the rail draw its first
empty checkbox.

`actionScope` gains the sorted target ids, so a result from a 3-property action cannot
survive into a 1-property context.

## Write path

Add one server action rather than looping `runMutationSteps` from the client — N client
round trips, each triggering a full `revalidatePath` cascade, is the wrong shape.

In `src/lib/actions/calendar-v2.actions.ts`:

```ts
export async function applyAvailabilityToListings(input: {
  listings: { listingId: string; ranges: { startDate: string; endDate: string }[] }[];
  direction: "BLOCK" | "OPEN";
  reason?: string | null;
}): Promise<{
  results: { listingId: string; nights: number; error?: string }[];
}>;
```

Requirements:

- Ranges are computed **client-side per listing** from that listing's own
  `buildAvailabilityAction` result, via the existing `contiguousRuns` /
  `stepsForDates`. The server does not re-derive which nights are movable, but it does
  re-verify ownership.
- Each listing goes through the existing `managedCalendarListing` ownership check.
  A listing that fails it produces an error entry and does not abort the rest.
- Reuse `blockRangeForManagedListing` and the existing open pair. Do not add a second
  implementation of blocking.
- Process listings sequentially. Portfolio sizes here are small; parallel writes buy
  nothing and complicate the failure report.
- Revalidate once at the end, not once per listing per range.
- Return a per-listing outcome. Never collapse it to a single boolean.

## Undo

`dateAction` held `{ scope, result, undoSteps }` with an implicit single listing.
`undoSteps` becomes per-listing:

```ts
undo: { listingId: string; steps: MutationStep[] }[];
```

Availability undo calls the same `applyAvailabilityToListings` with the inverse
direction and each listing's own ranges. Price and promotion undo keep their existing
single-listing path — they have exactly one entry, and the same field carries it, so
there is one shape rather than two.

Only what actually landed is stored: a property whose write failed contributes no undo
entry, so undoing a partial success reverses exactly the part that happened.

## Failure handling

- If some listings succeed and others fail, the write is partial and must be reported as
  partial: *"Blocked on 2 of 3 properties. Villa Ohrid could not be updated."*
- The date selection and rail state are not cleared on partial failure.
- Undo after a partial success reverses only the listings that succeeded.
- A total failure behaves as today: nothing cleared, one toast, no result recorded.

## Internationalization

New strings go through the normal pipeline. After adding them:

```bash
npm run i18n:extract && npm run i18n:generate-reviewed && npm run i18n:export-reviewed
```

Do not hand-edit `reviewed-ai-translations.json`. Macedonian register: short imperative
on buttons, polite plural in prose.

Keys as shipped (English defaults; every `{n}` one resolves through `i18n.plural`):

| Key | Default |
| --- | --- |
| `host.v2.calendar.editor.multi_enter` | Block on more properties |
| `host.v2.calendar.editor.multi_enter_hint` | Apply these dates to your other properties too |
| `host.v2.calendar.editor.multi_change` | Tap to change which ones |
| `host.v2.calendar.editor.multi_rail_hint` | Tick properties in the list on the left |
| `host.v2.calendar.multi_banner_label` | Blocking on |
| `host.v2.calendar.multi_target_count` | {n} properties |
| `host.v2.calendar.multi_exit` | Just this property |
| `host.v2.calendar.multi_clear` | Only this one |
| `host.v2.calendar.rail_select_all` | Select all |
| `host.v2.calendar.multi_sheet_title` | Block on more properties |
| `host.v2.calendar.multi_sheet_done` | Done - {n} properties |
| `host.v2.calendar.editor.multi_state_mixed` | {open} open - {blocked} blocked, across {properties} properties |
| `host.v2.calendar.editor.multi_state_open` | {n} nights are open across {properties} properties. |
| `host.v2.calendar.editor.multi_state_blocked` | {n} nights are unavailable across {properties} properties. |
| `host.v2.calendar.editor.multi_locked` | {n} nights will not change - {properties} already have them booked or held. |
| `host.v2.calendar.editor.names_pair` | {first} and {second} |
| `host.v2.calendar.editor.names_overflow` | {first}, {second} and {n} others |
| `host.v2.calendar.editor.done_blocked_multi` | {n} nights blocked across {properties} properties. |
| `host.v2.calendar.editor.done_opened_multi` | {n} nights are available again across {properties} properties. |
| `host.v2.calendar.editor.done_partial` | {properties} could not be updated. |
| `host.v2.calendar.block_note_prompt_multi` | This will block the dates on {properties} properties... |

## Tests

Unit, in `src/lib/host/v2/`:

- A multi-target summary sums movable nights across listings with different
  `availabilityMode` values.
- A listing whose selected nights are all booked contributes zero movable nights and is
  still named in the locked line.
- Inverse steps for a multi-listing action reverse only the nights each listing moved —
  in particular, a night already blocked on listing B before the action is not reopened
  by undo.

Component, alongside the existing calendar tests:

- Entering selection mode does not change the rendered grid or the date selection.
- Changing the shown property, or the date selection, clears companions.
- The Block button label matches the combined movable count.
- A partial-failure response renders the partial result line and keeps the selection.
- `EntityChooserSheet` still selects-and-closes on tap — a regression test, since the
  whole point of the sibling component is leaving it alone.
- The multi-select sheet keeps its toggles when dismissed without Done, and does not
  trigger the discard prompt.
- The locked (shown) property cannot be unchecked from either surface.
- Desktop rail and mobile sheet drive the same `companionIds`: toggling in one and
  resizing across the breakpoint shows the same target set.

Action-level:

- A listing the host does not manage produces an error entry and does not prevent the
  others from being written.

## Files touched

| File | Change |
| --- | --- |
| `src/components/host/v2/entity-rail.tsx` | New `EntityMultiSelectSheet`; no change to `EntityRail` or `EntityChooserSheet` |
| `src/components/host/v2/calendar/listing-rail.tsx` | Optional multi-select mode, Select all / Exit, calendar wrapper for the new sheet |
| `src/components/host/v2/calendar/date-editors.tsx` | Multi-target summary, mode entry control |
| `src/components/host/v2/calendar/host-calendar-workspace.tsx` | `companionIds` / `selectionMode` state, per-listing undo, scope key |
| `src/components/host/v2/calendar/calendar-actions.ts` | Bridge to the new action |
| `src/lib/host/v2/calendar-availability-action.ts` | Multi-listing summary and per-listing step builder |
| `src/lib/actions/calendar-v2.actions.ts` | `applyAvailabilityToListings` |
| `src/lib/i18n/*` | Generated; do not hand-edit |

No Prisma migration. No change to any public or guest-facing surface.

## Rationale for the boundary

`AllListingsTimeline` documents why cross-listing edits were refused: they would have to
reconcile different availability rules, prices, and reservation states in one
confirmation. That argument holds for prices and does not hold for blocking — which is
why blocking already bypasses the review dialog while prices do not. This spec extends
multi-property editing to exactly the operation that is uniform and reversible, and to
nothing else. If a future change makes prices multi-property, this rationale does not
cover it and the review model has to be revisited first.
