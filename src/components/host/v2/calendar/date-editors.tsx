"use client";

import { useState } from "react";
import {
  Check,
  LoaderCircle,
  LockKeyhole,
  Plus,
  StickyNote,
  UnlockKeyhole,
  Undo2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { interpolate, useI18n } from "@/lib/i18n/client";
import { Input } from "@/components/ui/input";
import { CALENDAR_ANCHOR, anchorProps } from "@/lib/host/v2/calendar-anchors";
import {
  formatShortDate,
  type CalendarFormats,
} from "@/lib/host/v2/calendar-format";
import {
  resolveSelectionStayBookability,
  selectionManualBlockNote,
  summarizeSelectionAvailability,
  type ListingCalendarIndex,
} from "@/lib/host/v2/calendar-model";
import {
  buildAvailabilityAction,
  lockedCount,
  type AvailabilityDirection,
} from "@/lib/host/v2/calendar-availability-action";
import {
  buildPriceAction,
  percentFromPrice,
  priceFromPercent,
  PRICE_PERCENT_PRESETS,
  PRICE_PERCENT_RANGE,
} from "@/lib/host/v2/calendar-price-action";
import type { HostCalendarListing } from "@/lib/host/v2/calendar-types";
import {
  listingSaleBlockers,
  type HostListingStatusSummary,
} from "@/lib/host/v2/listing-status";
import {
  selectionDates,
  type CalendarSelection,
} from "@/lib/host/v2/calendar-selection";
import {
  computeSelectionQuote,
  promotionSaveMode,
  resolveSelectionPromotion,
  type ProposedPromotion,
} from "@/lib/host/v2/calendar-quote";
import {
  promotionDraftProblem,
  selectionLadder,
  type PromotionBand,
  type PromotionDraftProblem,
  type PromotionRow,
} from "@/lib/host/v2/calendar-promotion-action";
import type { DateChange } from "@/lib/host/v2/calendar-review";
import { GuestQuotePanel } from "./guest-quote";
import { PanelSlider } from "./panel-slider";
import { HowOffersWork, PromotionBandList } from "./promotion-help";
import { ListingSafetyExplanation } from "./safety-banner";
import {
  ColumnPair,
  ConsequenceLine,
  Disclosure,
  Field,
  InfoRow,
  NumberColumn,
  StepperColumn,
} from "./workbench-ui";
import {
  currencySymbol,
  formatSignedPercent,
  money,
} from "./calendar-labels";

/**
 * The three focused editors for a date selection.
 *
 * Each one owns the whole panel body while it is open, which is what lets it drop the
 * defensive summarising the accordion needed. A card that might be read with two other
 * cards open had to restate its own scope and its own counts; an editor that is the
 * only thing on screen, under a header that already says which dates it is about, does
 * not. Everything that used to be permanently visible and is still true — the counts,
 * why a stay is unbookable, the full arithmetic — is one disclosure away.
 */

/**
 * What the last direct action did, so the panel can report it and take it back.
 *
 * Held by the workspace rather than by an editor: an action leaves the editor's own
 * inputs behind, and the result has to outlive them and the refresh that follows.
 */
export type DateActionResult = {
  /** How many nights actually moved. */
  dates: number;
  /** Whether the inverse can still be offered. False once it has been taken. */
  undoable: boolean;
} & (
  | { kind: "AVAILABILITY"; direction: AvailabilityDirection }
  /** `amount` is null when the dates were put back on the base price. */
  | { kind: "PRICE"; amount: string | null }
  /**
   * `undoable` is false for a newly created offer. The save actions report success but
   * not the id they created, so there is nothing for an inverse step to name — the host
   * removes it through the editor instead, where it now appears as a saved offer.
   */
  | { kind: "PROMOTION"; discountPercent: number; edited: boolean }
);

/**
 * Availability: two buttons, and no confirmation step.
 *
 * Every other editor here stages a change and sends it to a review dialog, because a
 * mistyped price or a wrong discount is not something a host can see and reverse at a
 * glance. Blocking and opening dates is: the calendar behind this panel repaints
 * immediately, and the result line offers the exact inverse. So the dialog is gone and
 * the buttons act.
 *
 * What the dialog used to be responsible for is not gone with it. It named the nights a
 * save could not touch, and that is now on the buttons themselves — each one carries the
 * number it will move — with a line underneath for the ones staying put. A press can
 * never do less than its label says.
 */
export function AvailabilityEditor({
  listing,
  index,
  summary,
  formats,
  today,
  selection,
  pending,
  result,
  onApply,
  onUndo,
  onDismissResult,
}: {
  listing: HostCalendarListing;
  index: ListingCalendarIndex;
  summary: HostListingStatusSummary;
  formats: CalendarFormats;
  today: string;
  selection: CalendarSelection;
  /** A write is in flight. Both buttons and Undo are held shut until it lands. */
  pending: boolean;
  result: DateActionResult | null;
  onApply: (direction: AvailabilityDirection, note: string | null) => void;
  onUndo: () => void;
  onDismissResult: () => void;
}) {
  const i18n = useI18n();
  const dates = selectionDates(selection);
  const model = buildAvailabilityAction({ listing, index, dates, today });
  const locked = lockedCount(model);
  const canBlock = model.blockable.length > 0;
  const canOpen = model.openable.length > 0;
  /**
   * Whether an open date on this listing means anything to a guest.
   *
   * A listing that is off the site, or has no price, has open dates nobody can book. The
   * state line must not call those "open for booking", and the reason belongs on screen
   * — it is the one thing the removed "How this works" disclosure was hiding that a host
   * genuinely needs.
   */
  const saleBlockers = listingSaleBlockers(listing);
  const sellable = saleBlockers.length === 0;

  /**
   * CLOSED mode has no manual block for a note to live on — closing a date there removes
   * an explicit open window instead — so the field is never offered in that mode.
   */
  const supportsNote = listing.availabilityMode === "OPEN";
  const [note, setNote] = useState("");
  const [noteOpen, setNoteOpen] = useState(false);
  /**
   * The note already stored against these exact dates. Shown, never edited: the
   * canonical block service writes a note only onto the blocks it creates, so a field
   * offering to rewrite this one would be a promise the save could not keep.
   */
  const storedNote = selectionManualBlockNote(listing, selection);

  return (
    <div
      {...anchorProps(CALENDAR_ANCHOR.availabilityEditor)}
      className="flex flex-col gap-4"
    >
      {result ? (
        <ActionResult
          result={result}
          pending={pending}
          onUndo={onUndo}
          onDismiss={() => {
            // The note went with the block that was just written. Dismissing the
            // result is the host saying they are done with it, so the field starts
            // empty rather than re-offering words already saved somewhere.
            setNote("");
            setNoteOpen(false);
            onDismissResult();
          }}
        />
      ) : null}

      <div className="flex flex-col gap-1">
        <h3 className="text-[0.9375rem] font-semibold text-slate-900">
          {
            interpolate(
              i18n.plural(
                "host.v2.calendar.editor.availability_heading",
                dates.length,
                "Availability for {n} night",
                "Availability for {n} nights",
              ),
              {},
            ).text
          }
        </h3>
        <ConsequenceLine tone={canBlock && sellable ? "good" : "neutral"}>
          {canBlock && canOpen
            ? interpolate(
                i18n.resolve(
                  "host.v2.calendar.editor.state_mixed",
                  "{open} open · {blocked} blocked",
                ),
                { open: model.blockable.length, blocked: model.openable.length },
              ).text
            : canBlock
              ? sellable
                ? interpolate(
                    i18n.plural(
                      "host.v2.calendar.editor.state_all_open",
                      model.blockable.length,
                      "This night is open for booking.",
                      "These {n} nights are open for booking.",
                    ),
                    {},
                  ).text
                : interpolate(
                    i18n.plural(
                      "host.v2.calendar.editor.state_all_open_unsellable",
                      model.blockable.length,
                      "This night is open, but nothing can be booked yet.",
                      "These {n} nights are open, but nothing can be booked yet.",
                    ),
                    {},
                  ).text
              : canOpen
                ? interpolate(
                    i18n.plural(
                      "host.v2.calendar.editor.state_all_blocked",
                      model.openable.length,
                      "This night is blocked.",
                      "These {n} nights are blocked.",
                    ),
                    {},
                  ).text
                : i18n.resolve(
                    "host.v2.calendar.editor.state_all_locked",
                    "Nothing here can be changed from this panel.",
                  ).text}
        </ConsequenceLine>
      </div>

      {/* One button per thing there is to do, each naming its own count. A selection
          that is entirely open offers only Block; entirely blocked, only Open. */}
      {canBlock || canOpen ? (
        <div className="flex flex-col gap-2 sm:flex-row">
          {canBlock ? (
            <ActionButton
              tone={canOpen ? "quiet" : "strong"}
              icon={LockKeyhole}
              disabled={pending}
              onClick={() => onApply("BLOCK", supportsNote ? note : null)}
              label={
                interpolate(
                  i18n.plural(
                    "host.v2.calendar.editor.cta_block",
                    model.blockable.length,
                    "Block {n} night",
                    "Block {n} nights",
                  ),
                  {},
                ).text
              }
            />
          ) : null}
          {canOpen ? (
            <ActionButton
              tone="strong"
              icon={UnlockKeyhole}
              disabled={pending}
              onClick={() => onApply("OPEN", null)}
              label={
                interpolate(
                  i18n.plural(
                    "host.v2.calendar.editor.cta_open",
                    model.openable.length,
                    "Make {n} night available",
                    "Make {n} nights available",
                  ),
                  {},
                ).text
              }
            />
          ) : null}
        </div>
      ) : null}

      {/* Why opening a date would still not sell it. Shown only when that is true —
          the "everything is fine" version of this line is exactly the reassurance the
          panel no longer spends space on. */}
      {sellable ? null : (
        <ListingSafetyExplanation
          listing={listing}
          summary={summary}
          formats={formats}
        />
      )}

      {/* The nights the buttons above deliberately leave alone. Split by cause, because
          a reservation and an imported block are different problems for the host. */}
      {locked > 0 ? (
        <ConsequenceLine tone="warning">
          {model.booked > 0 && model.external > 0
            ? interpolate(
                i18n.resolve(
                  "host.v2.calendar.editor.locked_mixed",
                  "{booked} booked and {external} held by a connected calendar will not change.",
                ),
                { booked: model.booked, external: model.external },
              ).text
            : model.booked > 0
              ? interpolate(
                  i18n.plural(
                    "host.v2.calendar.editor.locked_booked",
                    model.booked,
                    "{n} night will not change — a guest has booked it.",
                    "{n} nights will not change — a guest has booked them.",
                  ),
                  {},
                ).text
              : interpolate(
                  i18n.plural(
                    "host.v2.calendar.editor.locked_external",
                    model.external,
                    "{n} night will not change — a connected calendar is holding it.",
                    "{n} nights will not change — a connected calendar is holding them.",
                  ),
                  {},
                ).text}
        </ConsequenceLine>
      ) : null}

      {/* The private note, in the panel rather than behind a dialog. It is written by
          the block that is about to be created, so it is offered only where blocking is
          what the host is about to do. */}
      {supportsNote && canBlock && !result ? (
        noteOpen ? (
          <Field
            label={
              i18n.resolve("host.v2.calendar.block_note_label_short", "Private note")
                .text
            }
            htmlFor="host-v2-block-note"
            hint={
              i18n.resolve(
                "host.v2.calendar.block_note_hint",
                "Only you can see this note.",
              ).text
            }
          >
            <Input
              id="host-v2-block-note"
              value={note}
              maxLength={200}
              autoFocus
              // Inset: the panel sits flush against the right edge of the window, so a
              // ring drawn outside the field was drawn outside the screen.
              className="min-h-11 border-0 bg-slate-50 shadow-none focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#d9774f]"
              onChange={(event) => setNote(event.target.value)}
              placeholder={
                i18n.resolve(
                  "host.v2.calendar.block_note_placeholder",
                  "e.g. Maintenance or private stay",
                ).text
              }
            />
          </Field>
        ) : (
          <button
            type="button"
            onClick={() => setNoteOpen(true)}
            className="flex min-h-11 items-center gap-1.5 self-start text-[0.8125rem] font-semibold text-[#a94b28] transition-colors duration-150 hover:text-[#8f3d21] motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#a94b28]"
          >
            <StickyNote className="size-4" aria-hidden />
            {
              i18n.resolve(
                "host.v2.calendar.editor.add_note",
                "Add a private note",
              ).text
            }
          </button>
        )
      ) : null}

      {/* A note the host already wrote against exactly these dates. */}
      {storedNote ? (
        <div className="flex items-start gap-2 rounded-xl bg-slate-50 px-3 py-2.5">
          <StickyNote className="mt-px size-4 shrink-0 text-slate-400" aria-hidden />
          <p className="min-w-0 flex-1 text-[0.8125rem] leading-5 text-slate-600">
            <span className="block text-[0.6875rem] font-semibold uppercase tracking-wide text-slate-400">
              {
                i18n.resolve(
                  "host.v2.calendar.block_note_label_short",
                  "Private note",
                ).text
              }
            </span>
            {/* The host's own words, never translated. */}
            <span className="notranslate">{storedNote}</span>
          </p>
        </div>
      ) : null}
    </div>
  );
}

/** One of the two availability acts. Coral for the single or restorative one. */
function ActionButton({
  label,
  icon: Icon,
  tone,
  disabled,
  onClick,
}: {
  label: string;
  icon: typeof LockKeyhole;
  tone: "strong" | "quiet";
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl px-4 text-[0.875rem] font-semibold",
        "transition-colors duration-150 motion-reduce:transition-none",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#a94b28]",
        "disabled:cursor-not-allowed disabled:opacity-50",
        tone === "strong"
          ? "bg-[#d9774f] text-white hover:bg-[#c2643e]"
          : "bg-slate-100 text-slate-800 hover:bg-slate-200",
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden />
      {label}
    </button>
  );
}

/** One past-tense sentence per kind of direct action. */
function resultMessage(
  i18n: ReturnType<typeof useI18n>,
  result: DateActionResult,
): string {
  if (result.kind === "PROMOTION") {
    return interpolate(
      i18n.resolve(
        result.edited
          ? "host.v2.calendar.editor.done_promotion_edited"
          : "host.v2.calendar.editor.done_promotion",
        result.edited
          ? "Offer updated — {percent}% off."
          : "{percent}% off is now running on these dates.",
      ),
      { percent: result.discountPercent },
    ).text;
  }
  if (result.kind === "PRICE") {
    return result.amount === null
      ? interpolate(
          i18n.plural(
            "host.v2.calendar.editor.done_price_base",
            result.dates,
            "{n} night is back on your base price.",
            "{n} nights are back on your base price.",
          ),
          {},
        ).text
      : interpolate(
          i18n.plural(
            "host.v2.calendar.editor.done_price",
            result.dates,
            "{n} night now costs {amount}.",
            "{n} nights now cost {amount}.",
          ),
          { amount: result.amount },
        ).text;
  }
  return result.direction === "BLOCK"
    ? interpolate(
        i18n.plural(
          "host.v2.calendar.editor.done_blocked",
          result.dates,
          "{n} night blocked.",
          "{n} nights blocked.",
        ),
        {},
      ).text
    : interpolate(
        i18n.plural(
          "host.v2.calendar.editor.done_opened",
          result.dates,
          "{n} night is available again.",
          "{n} nights are available again.",
        ),
        {},
      ).text;
}

/**
 * What just happened, and the way back.
 *
 * `aria-live` rather than a toast: the change landed inside this panel, so the
 * confirmation belongs where the host is already looking.
 */
function ActionResult({
  result,
  pending,
  onUndo,
  onDismiss,
}: {
  result: DateActionResult;
  pending: boolean;
  onUndo: () => void;
  onDismiss: () => void;
}) {
  const i18n = useI18n();
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-start gap-2 rounded-xl bg-teal-50 px-3 py-2.5"
    >
      {pending ? (
        <LoaderCircle
          className="mt-px size-4 shrink-0 animate-spin text-teal-700 motion-reduce:animate-none"
          aria-hidden
        />
      ) : (
        <Check className="mt-px size-4 shrink-0 text-teal-700" aria-hidden />
      )}
      <p className="min-w-0 flex-1 text-[0.8125rem] leading-5 text-teal-900">
        {resultMessage(i18n, result)}
      </p>
      {result.undoable ? (
        <button
          type="button"
          disabled={pending}
          onClick={onUndo}
          className="flex min-h-6 shrink-0 items-center gap-1 text-[0.8125rem] font-semibold text-teal-800 underline underline-offset-2 transition-colors duration-150 hover:text-teal-900 disabled:opacity-50 motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
        >
          <Undo2 className="size-3.5" aria-hidden />
          {i18n.resolve("host.v2.calendar.editor.undo", "Undo").text}
        </button>
      ) : null}
      <button
        type="button"
        onClick={onDismiss}
        aria-label={i18n.resolve("host.v2.calendar.editor.dismiss", "Dismiss").text}
        className="-mr-1 -mt-0.5 grid size-6 shrink-0 place-items-center rounded-md text-teal-700 transition-colors duration-150 hover:bg-teal-100 motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
      >
        <X className="size-3.5" aria-hidden />
      </button>
    </div>
  );
}

/**
 * Nightly price: one number, reachable three ways, applied on the spot.
 *
 * The amount and its percentage of the base price are the same value in two fields, and
 * either can be typed into. That is the whole of the editor's arithmetic — the
 * percentage resolves to an amount immediately and it is the amount that gets stored,
 * so a base price raised next month leaves these dates where the host put them. What
 * genuinely follows the base price is a promotion, which this workspace has separately.
 *
 * Like availability, it writes without a review dialog. Unlike availability, the guest
 * total underneath updates as the host drags, so the consequence of the change is on
 * screen before it is made rather than described in a dialog after.
 */
export function PricingEditor({
  listing,
  index,
  formats,
  today,
  selection,
  pending,
  result,
  onApply,
  onUndo,
  onDismissResult,
  onEditListingWide,
}: {
  listing: HostCalendarListing;
  index: ListingCalendarIndex;
  formats: CalendarFormats;
  today: string;
  selection: CalendarSelection;
  pending: boolean;
  result: DateActionResult | null;
  /** `null` means "drop the per-date price and follow the base price again". */
  onApply: (nightlyRate: number | null) => void;
  onUndo: () => void;
  onDismissResult: () => void;
  /** Switches scope to the listing-wide editor. Never folded into this save. */
  onEditListingWide: () => void;
}) {
  const i18n = useI18n();
  const dates = selectionDates(selection);
  const nights = dates.length;
  const model = buildPriceAction({ listing, index, dates });

  // Mixed nights open on the base price rather than on one of the amounts in play:
  // picking the cheapest would quietly propose a cut to every other night in the run.
  const opening = model ? (model.mixed ? model.base : model.min) : 0;
  const [price, setPrice] = useState(opening);
  /**
   * The price is the single source of truth and both fields read from it, so moving the
   * slider updates the percentage and typing a percentage updates the amount without
   * either field having to remember to tell the other.
   *
   * A draft exists only while a field is actually being typed into. Without it, "1" on
   * the way to "15" would be reformatted to "+1" under the cursor on every keystroke;
   * with it, the field holds exactly what the host typed until they leave it.
   */
  const [priceDraft, setPriceDraft] = useState<string | null>(null);
  const [percentDraft, setPercentDraft] = useState<string | null>(null);

  if (!listing.pricing || !model) {
    return (
      <p className="text-[0.875rem] leading-5 text-slate-600">
        {
          i18n.resolve(
            "host.v2.calendar.no_pricing_hint",
            "Set a base price for this listing before pricing individual dates.",
          ).text
        }
      </p>
    );
  }

  const currency = model.currency;
  const format = (amount: number) => money(amount, currency, formats);
  const percent = percentFromPrice(model.base, price);
  const valid = Number.isFinite(price) && price >= 1;
  // Every selected night already costs exactly this. Applying would write the same
  // number back, so the button says so instead of pretending to do something.
  const unchanged = !model.mixed && model.min === price;
  const difference = Math.abs(price - model.base);

  const setFromPercent = (next: number) => {
    setPrice(priceFromPercent(model.base, next));
  };

  const availability = summarizeSelectionAvailability(
    listing,
    index,
    dates,
    today,
  );
  const stay = resolveSelectionStayBookability({ listing, availability });
  // The guest total for the amount the host is currently proposing, from the same
  // function the booking transaction prices with. Nothing is recomputed here.
  const quote = computeSelectionQuote({
    listing,
    selection,
    proposedNightlyRate: valid ? { mode: "SET", value: price } : null,
  });

  return (
    <div
      {...anchorProps(CALENDAR_ANCHOR.priceEditor)}
      className="flex flex-col gap-4"
    >
      {result ? (
        <ActionResult
          result={result}
          pending={pending}
          onUndo={onUndo}
          onDismiss={onDismissResult}
        />
      ) : null}

      <div className="flex flex-col gap-1">
        <h3 className="text-[0.9375rem] font-semibold text-slate-900">
          {
            interpolate(
              i18n.plural(
                "host.v2.calendar.editor.price_heading",
                nights,
                "Nightly price for {n} night",
                "Nightly price for {n} nights",
              ),
              {},
            ).text
          }
        </h3>

        {/* The amount and its percentage, as two columns of the one shape every editor
            here uses: label above, value on its own underline, meaning beneath. The
            caption under the percentage is where the base price is stated, so the
            screen needs no separate sentence repeating it. */}
        <ColumnPair>
          <NumberColumn
            id="host-v2-price-input"
            label={
              i18n.resolve("host.v2.calendar.editor.price_field", "Price").text
            }
            caption={
              i18n.resolve("host.v2.calendar.editor.per_night", "per night").text
            }
            value={priceDraft ?? String(price)}
            prefix={currencySymbol(currency, formats)}
            disabled={pending}
            onChange={(next) => {
              setPriceDraft(next);
              const parsed = Number(next.replace(/[^0-9]/g, ""));
              if (Number.isFinite(parsed) && parsed >= 1) setPrice(parsed);
            }}
            onBlur={() => setPriceDraft(null)}
          />
          <NumberColumn
            label={
              i18n.resolve(
                "host.v2.calendar.editor.against_base",
                "Against base",
              ).text
            }
            ariaLabel={
              i18n.resolve(
                "host.v2.calendar.editor.percent_field",
                "Percent against base price",
              ).text
            }
            caption={
              difference === 0
                ? interpolate(
                    i18n.resolve(
                      "host.v2.calendar.editor.base_same_short",
                      "same as {amount}",
                    ),
                    { amount: format(model.base) },
                  ).text
                : interpolate(
                    i18n.resolve(
                      price > model.base
                        ? "host.v2.calendar.editor.base_above_short"
                        : "host.v2.calendar.editor.base_below_short",
                      price > model.base
                        ? "{difference} above {amount}"
                        : "{difference} below {amount}",
                    ),
                    {
                      difference: format(difference),
                      amount: format(model.base),
                    },
                  ).text
            }
            value={percentDraft ?? formatSignedPercent(percent)}
            suffix="%"
            accent={percent !== 0}
            disabled={pending}
            onChange={(next) => {
              setPercentDraft(next);
              // A field holding nothing, or just a sign, is a field mid-typing —
              // not a request to jump the price back to the base amount.
              const raw = next.replace(/[−–]/g, "-").replace(/[^0-9.+-]/g, "");
              if (!/\d/.test(raw)) return;
              const parsed = Number(raw);
              if (Number.isFinite(parsed)) setFromPercent(parsed);
            }}
            onBlur={() => setPercentDraft(null)}
          />
        </ColumnPair>

        {/* Said once, plainly: applying replaces every one of these amounts with the
            single number above. */}
        {model.mixed ? (
          <ConsequenceLine tone="warning">
            {
              interpolate(
                i18n.resolve(
                  "host.v2.calendar.editor.price_mixed",
                  "These nights cost between {min} and {max} right now.",
                ),
                { min: format(model.min), max: format(model.max) },
              ).text
            }
          </ConsequenceLine>
        ) : null}
      </div>

      <PanelSlider
        value={percent}
        min={PRICE_PERCENT_RANGE * -1}
        max={PRICE_PERCENT_RANGE}
        origin="center"
        presets={PRICE_PERCENT_PRESETS}
        disabled={pending}
        label={
          i18n.resolve(
            "host.v2.calendar.editor.price_slider",
            "Price against base price",
          ).text
        }
        onChange={setFromPercent}
        formatPreset={(value) =>
          value === 0
            ? i18n.resolve("host.v2.calendar.editor.preset_base", "Base").text
            : `${formatSignedPercent(value)}%`
        }
      />

      {Math.abs(percent) > PRICE_PERCENT_RANGE ? (
        <ConsequenceLine>
          {
            interpolate(
              i18n.resolve(
                "host.v2.calendar.editor.beyond_slider",
                "Past ±{range}% — the slider stops there, the price does not.",
              ),
              { range: PRICE_PERCENT_RANGE },
            ).text
          }
        </ConsequenceLine>
      ) : null}

      <div className="flex flex-col gap-2">
        <button
          type="button"
          disabled={pending || !valid || unchanged}
          onClick={() => onApply(price)}
          className={cn(
            "flex min-h-12 items-center justify-center gap-2 rounded-xl px-4 text-[0.875rem] font-semibold",
            "bg-[#d9774f] text-white transition-colors duration-150 hover:bg-[#c2643e]",
            "motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-50",
            "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#a94b28]",
          )}
        >
          {unchanged
            ? i18n.resolve(
                "host.v2.calendar.editor.price_unchanged",
                "These nights already cost this",
              ).text
            : interpolate(
                i18n.plural(
                  "host.v2.calendar.editor.set_price",
                  nights,
                  "Set {amount} for {n} night",
                  "Set {amount} for {n} nights",
                ),
                { amount: format(price) },
              ).text}
        </button>

        {/* Clearing the per-date price is a different act from setting one: these dates
            stop having a price of their own and follow the base price again, including
            when it changes. */}
        {model.customCount > 0 ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => onApply(null)}
            className={cn(
              "min-h-11 rounded-xl px-4 text-[0.8125rem] font-semibold",
              "bg-slate-100 text-slate-800 transition-colors duration-150 hover:bg-slate-200",
              "motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-50",
              "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#a94b28]",
            )}
          >
            {
              interpolate(
                i18n.resolve(
                  "host.v2.calendar.editor.use_base_price",
                  "Use base price: {amount}",
                ),
                { amount: format(model.base) },
              ).text
            }
          </button>
        ) : null}
      </div>

      {quote ? (
        <div className="flex flex-col gap-2 border-t border-slate-100 pt-3">
          <GuestResult
            quote={quote}
            currency={currency}
            formats={formats}
            nights={nights}
          />
          <Disclosure
            label={
              i18n.resolve(
                "host.v2.calendar.editor.price_breakdown",
                "View price breakdown",
              ).text
            }
          >
            <div className="pt-1">
              <GuestQuotePanel
                quote={quote}
                currency={currency}
                formats={formats}
                nights={nights}
                stay={stay}
              />
            </div>
          </Disclosure>
        </div>
      ) : null}

      {/* Listing-wide, and said so. Following this link changes the scope of the whole
          panel; it never becomes part of the date-price save. */}
      <InfoRow
        label={
          interpolate(
            i18n.plural(
              "host.v2.calendar.editor.minimum_stay_info",
              listing.pricing.minNights,
              "Minimum stay: {n} night · Listing-wide setting",
              "Minimum stay: {n} nights · Listing-wide setting",
            ),
            {},
          ).text
        }
        action={i18n.resolve("host.v2.calendar.editor.change", "Change").text}
        onAction={onEditListingWide}
      />
    </div>
  );
}

/** Accommodation, cleaning, any discount, and what the guest actually pays. */
function GuestResult({
  quote,
  currency,
  formats,
  nights,
}: {
  quote: NonNullable<ReturnType<typeof computeSelectionQuote>>;
  currency: string;
  formats: CalendarFormats;
  nights: number;
}) {
  const i18n = useI18n();
  const format = (amount: number) => money(amount, currency, formats);
  return (
    <dl className="flex flex-col gap-1 text-[0.8125rem]">
      <Line
        label={
          interpolate(
            i18n.plural(
              "host.v2.calendar.quote.accommodation",
              nights,
              "Accommodation, {n} night",
              "Accommodation, {n} nights",
            ),
            {},
          ).text
        }
        value={format(quote.originalAccommodationSubtotal)}
      />
      {quote.originalCleaningFee > 0 ? (
        <Line
          label={i18n.resolve("host.v2.calendar.quote.cleaning", "Cleaning fee").text}
          value={format(
            quote.cleaningDiscount > 0 ? 0 : quote.originalCleaningFee,
          )}
        />
      ) : null}
      {quote.discountAmount > 0 ? (
        <Line
          label={i18n.resolve("host.v2.calendar.quote.savings", "Guest saves").text}
          value={`−${format(quote.discountAmount)}`}
          tone="good"
        />
      ) : null}
      <Line
        label={i18n.resolve("host.v2.calendar.quote.total", "Guest total").text}
        value={format(quote.total)}
        strong
      />
    </dl>
  );
}

function Line({
  label,
  value,
  strong,
  tone,
}: {
  label: string;
  value: string;
  strong?: boolean;
  tone?: "good";
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className={cn(strong ? "font-semibold text-slate-900" : "text-slate-600")}>
        {label}
      </dt>
      <dd
        className={cn(
          "shrink-0 tabular-nums",
          strong ? "font-bold text-slate-900" : "text-slate-700",
          tone === "good" && "text-teal-700",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

/** The discounts the chips offer. Five to thirty covers what hosts actually run. */
const QUICK_DISCOUNTS = [5, 10, 15, 20, 25, 30] as const;

/** The hard ceiling the promotion service enforces. The slider stops where it does. */
const MAX_DISCOUNT = 50;

/**
 * One offer, and an honest account of whether a guest would ever see it.
 *
 * Offers stack — that is the design, and it is what makes "10% for ten nights, 20% for
 * twenty" possible — but only one ever reaches a guest. The panel used to hide that
 * behind a line promising a new dated offer "will take priority", which is untrue
 * against another dated offer with a bigger discount. So the editor now shows the whole
 * ladder underneath it, computed by the rule the booking transaction actually uses, and
 * says out loud when the offer being drafted would never win.
 *
 * Creating and editing apply immediately, like price and availability. Taking a saved
 * offer away still goes through the review dialog: it is the one act here that removes
 * something guests can already see.
 */
export function PromotionEditor({
  listing,
  formats,
  selection,
  change,
  onChange,
  pending,
  result,
  onApply,
  onUndo,
  onDismissResult,
}: {
  listing: HostCalendarListing;
  formats: CalendarFormats;
  selection: CalendarSelection;
  /** Still used for the one reviewed act: removing a saved offer. */
  change: DateChange | null;
  onChange: (change: DateChange | null) => void;
  pending: boolean;
  result: DateActionResult | null;
  onApply: (offer: ProposedPromotion) => void;
  onUndo: () => void;
  onDismissResult: () => void;
}) {
  const i18n = useI18n();
  const existing = resolveSelectionPromotion(listing, selection);
  const saveMode = promotionSaveMode(existing, selection);
  const currency = listing.pricing?.currency ?? "EUR";
  const nights = selectionDates(selection).length;

  /**
   * Deliberately writing a second offer on dates that already carry one.
   *
   * Without it, an offer covering exactly this range is always *edited* — which is why
   * a ladder could never be built on one range. Set from the list below, and it only
   * changes which offer the save names: an id updates, no id creates.
   */
  const [addingAnother, setAddingAnother] = useState(false);

  // An offer whose own dates are exactly this range is the one being edited; anything
  // else on screen is context, and its numbers must not become this draft's defaults.
  const editing = saveMode === "EDIT" && !addingAnother ? existing : null;
  const [percent, setPercent] = useState(editing?.discountPercent ?? 10);
  const [percentDraft, setPercentDraft] = useState<string | null>(null);
  const [minimumNights, setMinimumNights] = useState(
    editing?.minimumNights ?? 1,
  );
  const [freeCleaning, setFreeCleaning] = useState(
    editing?.freeCleaning ?? false,
  );
  const [roundToWholeUnit, setRoundToWholeUnit] = useState(
    editing?.roundToWholeUnit ?? true,
  );

  const draft: ProposedPromotion = {
    promotionId: editing?.id,
    discountPercent: percent,
    minimumNights,
    freeCleaning,
    roundToWholeUnit: percent > 0 && roundToWholeUnit,
  };
  const rows = selectionLadder({ listing, selection, draft });
  const bands = rows.flatMap((row) => row.bands);
  const problem = promotionDraftProblem({ draft, bands, nights });
  const removingSaved = change?.kind === "PROMOTION_REMOVE";

  // The guest total for the offer as drafted, from the same function the booking
  // transaction prices with. Nothing is recomputed here.
  const quote = computeSelectionQuote({
    listing,
    selection,
    proposedPromotion: problem?.code === "NO_BENEFIT" ? null : draft,
  });

  if (removingSaved) {
    return (
      <div
        {...anchorProps(CALENDAR_ANCHOR.promotionEditor)}
        className="flex flex-col gap-4"
      >
        <ConsequenceLine tone="warning">
          {
            i18n.resolve(
              "host.v2.calendar.editor.removing_saved",
              "This saved offer will stop running on these dates when you confirm.",
            ).text
          }
        </ConsequenceLine>
        <button
          type="button"
          onClick={() => onChange(null)}
          className="min-h-11 self-start rounded-lg bg-slate-50 px-3 text-[0.8125rem] font-semibold text-slate-700 transition-colors duration-150 hover:bg-slate-100 motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#a94b28]"
        >
          {i18n.resolve("host.v2.calendar.editor.keep_offer", "Keep this offer").text}
        </button>
      </div>
    );
  }

  return (
    <div
      {...anchorProps(CALENDAR_ANCHOR.promotionEditor)}
      className="flex flex-col gap-4"
    >
      {result ? (
        <ActionResult
          result={result}
          pending={pending}
          onUndo={onUndo}
          onDismiss={onDismissResult}
        />
      ) : null}

      <h3 className="text-[0.9375rem] font-semibold text-slate-900">
        {
          interpolate(
            i18n.plural(
              "host.v2.calendar.editor.promotion_heading",
              nights,
              "Discount for {n} night",
              "Discount for {n} nights",
            ),
            {},
          ).text
        }
      </h3>

      {/* The two numbers an offer is made of, in the same two-column shape the price
          editor uses, spaced evenly so each sits under its own label. */}
      <ColumnPair>
        <NumberColumn
          id="host-v2-promotion-percent"
          label={i18n.resolve("host.v2.calendar.promotion_percent", "Discount").text}
          caption={i18n.resolve("host.v2.calendar.promotion_off", "off").text}
          value={percentDraft ?? String(percent)}
          suffix="%"
          disabled={pending}
          onChange={(next) => {
            setPercentDraft(next);
            const parsed = Number(next.replace(/[^0-9]/g, ""));
            if (/\d/.test(next) && Number.isFinite(parsed)) {
              setPercent(Math.min(MAX_DISCOUNT, parsed));
            }
          }}
          onBlur={() => setPercentDraft(null)}
        />
        <StepperColumn
          label={
            i18n.resolve("host.v2.calendar.promotion_minimum", "Minimum stay").text
          }
          // At one night the number means "no condition at all", and "1 night or more"
          // invites the host to read it as a restriction they have imposed.
          caption={
            minimumNights <= 1
              ? i18n.resolve(
                  "host.v2.calendar.promotion_every_stay",
                  "every stay",
                ).text
              : i18n.resolve(
                  "host.v2.calendar.promotion_nights_or_more",
                  "nights or more",
                ).text
          }
          value={minimumNights}
          disabled={pending}
          decrementLabel={
            i18n.resolve(
              "host.v2.calendar.promotion_fewer_nights",
              "Fewer nights",
            ).text
          }
          incrementLabel={
            i18n.resolve(
              "host.v2.calendar.promotion_more_nights",
              "More nights",
            ).text
          }
          onChange={setMinimumNights}
        />
      </ColumnPair>

      <PanelSlider
        value={percent}
        min={0}
        max={MAX_DISCOUNT}
        origin="start"
        presets={QUICK_DISCOUNTS}
        disabled={pending}
        label={
          i18n.resolve(
            "host.v2.calendar.editor.discount_slider",
            "Discount percent",
          ).text
        }
        onChange={setPercent}
        formatPreset={(value) => `${value}%`}
      />

      {problem ? <DraftProblem problem={problem} /> : null}

      {quote && problem?.code !== "NO_BENEFIT" ? (
        <div className="border-t border-slate-100 pt-3">
          <GuestResult
            quote={quote}
            currency={currency}
            formats={formats}
            nights={nights}
          />
        </div>
      ) : null}

      <button
        type="button"
        disabled={pending || problem?.code === "NO_BENEFIT"}
        onClick={() => onApply(draft)}
        className={cn(
          "flex min-h-12 items-center justify-center gap-2 rounded-xl px-4 text-[0.875rem] font-semibold",
          "bg-[#d9774f] text-white transition-colors duration-150 hover:bg-[#c2643e]",
          "motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-50",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#a94b28]",
        )}
      >
        {editing
          ? i18n.resolve(
              "host.v2.calendar.editor.update_offer",
              "Update this offer",
            ).text
          : i18n.resolve(
              "host.v2.calendar.editor.start_offer",
              "Start this offer",
            ).text}
      </button>

      <Disclosure
        label={i18n.resolve("host.v2.calendar.editor.more_options", "More options").text}
      >
        <div className="flex flex-col gap-2 pt-1">
          {listing.pricing && listing.pricing.cleaningFee > 0 ? (
            <label className="flex min-h-11 items-center gap-2 text-slate-700">
              <input
                type="checkbox"
                checked={freeCleaning}
                onChange={(event) => setFreeCleaning(event.target.checked)}
                className="size-4 rounded border-slate-300 accent-[#d9774f]"
              />
              {
                i18n.resolve(
                  "host.v2.calendar.promotion_free_cleaning",
                  "Also waive the cleaning fee",
                ).text
              }
            </label>
          ) : null}
          <label className="flex min-h-11 items-start gap-2 py-2 text-slate-700">
            <input
              type="checkbox"
              checked={percent > 0 && roundToWholeUnit}
              disabled={percent <= 0}
              onChange={(event) => setRoundToWholeUnit(event.target.checked)}
              className="mt-0.5 size-4 rounded border-slate-300 accent-[#d9774f] disabled:opacity-50"
            />
            <span>
              {
                i18n.resolve(
                  "host.v2.calendar.promotion_round",
                  "Round the discounted nightly price to a whole amount",
                ).text
              }
            </span>
          </label>
        </div>
      </Disclosure>

      <PromotionLadder
        rows={rows}
        bands={bands}
        nights={nights}
        rangeLabel={`${formatShortDate(selection.start, formats)} – ${formatShortDate(
          selection.end,
          formats,
        )}`}
        // Only where saving would otherwise replace what is already here. On any other
        // range a save already creates, so the control would promise nothing new.
        onAddAnother={
          saveMode === "EDIT" && !addingAnother
            ? () => {
                setAddingAnother(true);
                // A new rung on the ladder needs a minimum of its own; starting it on
                // the one already taken would only produce two offers that collide.
                setMinimumNights((editing?.minimumNights ?? 1) + 1);
              }
            : undefined
        }
      />

      {editing ? (
        <button
          type="button"
          onClick={() =>
            onChange({ kind: "PROMOTION_REMOVE", promotionId: editing.id })
          }
          className="min-h-11 self-start text-[0.8125rem] font-semibold text-red-700 underline underline-offset-2 transition-colors duration-150 hover:text-red-800 motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700"
        >
          {
            i18n.resolve(
              "host.v2.calendar.editor.remove_saved_offer",
              "Remove this saved offer",
            ).text
          }
        </button>
      ) : null}
    </div>
  );
}

/** Why this draft would never reach a guest. Never silent, never a blocker. */
function DraftProblem({ problem }: { problem: PromotionDraftProblem }) {
  const i18n = useI18n();
  if (problem.code === "NO_BENEFIT") {
    return (
      <ConsequenceLine>
        {
          i18n.resolve(
            "host.v2.calendar.editor.promotion_no_benefit",
            "Set a discount, or waive the cleaning fee, to make this an offer.",
          ).text
        }
      </ConsequenceLine>
    );
  }
  if (problem.code === "MINIMUM_ABOVE_SELECTION") {
    return (
      <ConsequenceLine tone="warning">
        {
          interpolate(
            i18n.resolve(
              "host.v2.calendar.editor.promotion_minimum_unreachable",
              "Your minimum is {minimum} nights but you have selected {nights}, so a guest booking exactly these dates will not qualify. A longer stay covering them still can.",
            ),
            { minimum: problem.minimumNights, nights: problem.nights },
          ).text
        }
      </ConsequenceLine>
    );
  }
  return (
    <ConsequenceLine tone="warning">
      {
        interpolate(
          i18n.resolve(
            "host.v2.calendar.editor.promotion_never_wins",
            "This offer would never reach a guest. An existing {percent}% offer already covers these dates and wins, because a bigger discount takes priority.",
          ),
          { percent: problem.discountPercent },
        ).text
      }
    </ConsequenceLine>
  );
}

/**
 * Every offer on these dates, and the stay lengths each one actually wins.
 *
 * The bands come from the booking rule itself, so this cannot drift from what a guest is
 * charged. The rules behind it sit in a disclosure: they are the answer to "why is only
 * one applying", which is a question a host asks once and then needs again months later.
 */
function PromotionLadder({
  rows,
  bands,
  nights,
  rangeLabel,
  onAddAnother,
}: {
  rows: PromotionRow[];
  bands: PromotionBand[];
  nights: number;
  rangeLabel: string;
  /**
   * Start a second offer on the same dates instead of editing the one already there.
   * Offered only where an offer covers exactly this range — anywhere else, saving
   * already creates rather than replaces.
   */
  onAddAnother?: () => void;
}) {
  const i18n = useI18n();
  const winner = bands.find(
    (band) => nights >= band.fromNights && nights <= band.toNights,
  );

  return (
    <div className="flex flex-col gap-2 border-t border-slate-100 pt-3">
      <h4 className="text-[0.8125rem] font-semibold text-slate-900">
        {
          interpolate(
            i18n.resolve(
              "host.v2.calendar.editor.offers_on",
              "Offers on {range}",
            ),
            { range: rangeLabel },
          ).text
        }
      </h4>

      <PromotionBandList rows={rows} showScope />

      <ConsequenceLine tone={winner ? "good" : "neutral"}>
        {winner
          ? interpolate(
              i18n.plural(
                "host.v2.calendar.editor.winner_for_selection",
                nights,
                "A guest booking this night gets {percent}% off.",
                "A guest booking these {n} nights gets {percent}% off.",
              ),
              { percent: winner.discountPercent },
            ).text
          : interpolate(
              i18n.plural(
                "host.v2.calendar.editor.winner_none",
                nights,
                "A guest booking this night gets no discount.",
                "A guest booking these {n} nights gets no discount.",
              ),
              {},
            ).text}
      </ConsequenceLine>

      {onAddAnother ? (
        <button
          type="button"
          onClick={onAddAnother}
          className="flex min-h-11 items-center gap-1.5 self-start text-[0.8125rem] font-semibold text-[#a94b28] transition-colors duration-150 hover:text-[#8f3d21] motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#a94b28]"
        >
          <Plus className="size-4" aria-hidden />
          {
            i18n.resolve(
              "host.v2.calendar.editor.add_another_offer",
              "Add another offer on these dates",
            ).text
          }
        </button>
      ) : null}

      <HowOffersWork />
    </div>
  );
}