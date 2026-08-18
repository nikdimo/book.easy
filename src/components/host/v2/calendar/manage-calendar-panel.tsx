"use client";

import { ArrowLeft, CalendarSync, ListChecks, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { interpolate, useI18n } from "@/lib/i18n/client";
import { Button } from "@/components/ui/button";
import { CALENDAR_ANCHOR, anchorProps } from "@/lib/host/v2/calendar-anchors";
import type { CalendarFormats } from "@/lib/host/v2/calendar-format";
import {
  resolveSelectionPromotion,
  type ProposedPromotion,
} from "@/lib/host/v2/calendar-quote";
import {
  summarizeSelectionAvailability,
  summarizeSelectionPrices,
  type ListingCalendarIndex,
} from "@/lib/host/v2/calendar-model";
import type { HostCalendarListing } from "@/lib/host/v2/calendar-types";
import type { HostListingStatusSummary } from "@/lib/host/v2/listing-status";
import {
  selectionDates,
  type CalendarSelection,
} from "@/lib/host/v2/calendar-selection";
import type { DateChange, ListingChange } from "@/lib/host/v2/calendar-review";
import {
  ctaForEditor,
  scopeOfSelection,
  WORKBENCH_MENU,
  type WorkbenchEditor,
  type WorkbenchView,
} from "@/lib/host/v2/calendar-workbench";
import type { ScheduledChange } from "@/lib/host/v2/calendar-schedule";
import {
  DefaultPricingEditor,
  ListingVisibilityEditor,
  OngoingPromotionEditor,
} from "./listing-editors";
import {
  AvailabilityEditor,
  PricingEditor,
  PromotionEditor,
  type DateActionResult,
} from "./date-editors";
import type { AvailabilityDirection } from "@/lib/host/v2/calendar-availability-action";
import { ScheduledChanges } from "./scheduled-changes";
import { QuietRow, SummaryRow } from "./workbench-ui";
import { listingCtaFor } from "@/lib/host/v2/calendar-listing-draft";
import {
  availabilitySummaryWord,
  listingCtaLabel,
  money,
  promotionSummary,
  visibilityLabel,
  workbenchCtaLabel,
  workbenchEditorLabel,
  workbenchScopeLabel,
} from "./calendar-labels";

/**
 * The right-hand editor: a summary menu that transforms into one focused editor.
 *
 * The panel this replaces stacked three accordions in a column. Opening one left the
 * other two on screen with their own outlines and their own summaries, so the host had
 * to work out which of three things the single save belonged to, under a permanent
 * footer explaining that it could only be one. Here there is exactly one destination at
 * a time: a menu of where you can go, or the place you went, with a Back control and
 * one primary action that names what it will review.
 *
 * The scope — "Selected dates" or "All future dates" — is stated once, in the header,
 * and comes from the selection rather than from any state of this component, so what
 * the panel says it will change cannot drift from what the calendar has selected.
 */
export function ManageCalendarPanel({
  listing,
  index,
  summary,
  formats,
  today,
  horizonEnd,
  horizonMonths,
  selection,
  rangeLabel,
  change,
  onChange,
  onClearSelection,
  onReviewDate,
  actionPending,
  actionResult,
  onApplyAvailability,
  onApplyPrice,
  onApplyPromotion,
  onUndoAction,
  onDismissActionResult,
  listingDraft,
  onListingDraftChange,
  onReviewListing,
  onEditListingWideStayRules,
  focusMinimumStay,
  view,
  onOpenEditor,
  onOpenSchedule,
  onBack,
  onOpenScheduledEntry,
  onRemoveScheduledPromotion,
  connectionsHref,
}: {
  listing: HostCalendarListing;
  index: ListingCalendarIndex;
  summary: HostListingStatusSummary;
  formats: CalendarFormats;
  today: string;
  horizonEnd: string;
  horizonMonths: number;
  selection: CalendarSelection | null;
  rangeLabel: string;
  change: DateChange | null;
  onChange: (change: DateChange | null) => void;
  onClearSelection: () => void;
  onReviewDate: () => void;
  /**
   * Availability and price act rather than stage: both write through these instead of
   * raising a review, so the footer below carries no action for either. Promotions and
   * every listing-wide change still go through the review dialog — a wrong discount or
   * a hidden listing is not something a host can spot and undo at a glance.
   */
  actionPending: boolean;
  actionResult: DateActionResult | null;
  onApplyAvailability: (
    direction: AvailabilityDirection,
    note: string | null,
  ) => void;
  /** `null` puts the dates back on the base price. */
  onApplyPrice: (nightlyRate: number | null) => void;
  onApplyPromotion: (offer: ProposedPromotion) => void;
  onUndoAction: () => void;
  onDismissActionResult: () => void;
  /** The single listing-wide change staged by whichever editor is open. */
  listingDraft: ListingChange | null;
  onListingDraftChange: (change: ListingChange | null) => void;
  onReviewListing: () => void;
  onEditListingWideStayRules: () => void;
  focusMinimumStay: boolean;
  view: WorkbenchView;
  /** Guarded by the caller, so leaving an editor with a draft still prompts. */
  onOpenEditor: (editor: WorkbenchEditor) => void;
  onOpenSchedule: () => void;
  onBack: () => void;
  onOpenScheduledEntry: (entry: ScheduledChange) => void;
  onRemoveScheduledPromotion: (entry: ScheduledChange) => void;
  /** The existing calendar-connections management surface for this listing. */
  connectionsHref: string;
}) {
  const i18n = useI18n();
  const scope = scopeOfSelection(selection);
  const currency = listing.pricing?.currency ?? "EUR";

  const scopeText = workbenchScopeLabel(i18n, scope).text;
  const headline = selection
    ? `${rangeLabel} · ${
        interpolate(
          i18n.plural(
            "host.v2.calendar.schedule.nights",
            selectionDates(selection).length,
            "{n} night",
            "{n} nights",
          ),
          {},
        ).text
      }`
    : listing.title;

  const editor = view.kind === "editor" ? view.editor : null;

  /** The truthful one-line state behind each menu row. */
  function menuValue(candidate: WorkbenchEditor): {
    text: string;
    attention?: boolean;
  } {
    if (candidate === "availability" && selection) {
      const counts = summarizeSelectionAvailability(
        listing,
        index,
        selectionDates(selection),
        today,
      );
      const word = availabilitySummaryWord(i18n, counts);
      return { text: word.text, attention: counts.available === 0 };
    }
    if (candidate === "pricing" && selection) {
      if (!listing.pricing) {
        return {
          text: i18n.resolve("host.v2.calendar.no_pricing_short", "No pricing set")
            .text,
          attention: true,
        };
      }
      const prices = summarizeSelectionPrices(
        listing,
        index,
        selectionDates(selection),
      );
      return {
        text: prices.mixed
          ? `${money(prices.min ?? 0, currency, formats)} – ${money(
              prices.max ?? 0,
              currency,
              formats,
            )}`
          : money(prices.min ?? 0, currency, formats),
      };
    }
    if (candidate === "promotions" && selection) {
      const existing = resolveSelectionPromotion(listing, selection);
      // Through the same summary as the listing-wide row, so an offer that is only
      // free cleaning reads as that rather than as "0% off".
      return { text: promotionSummary(i18n, existing ? [existing] : []).text };
    }
    if (candidate === "listing_visibility") {
      return {
        text: visibilityLabel(i18n, summary.visibility).text,
        attention: summary.tone === "warning",
      };
    }
    if (candidate === "listing_defaults") {
      return {
        text: listing.pricing
          ? money(listing.pricing.baseNightlyRate, currency, formats)
          : i18n.resolve("host.v2.calendar.no_pricing_short", "No pricing set").text,
        attention: !listing.pricing,
      };
    }
    const ongoing = listing.promotions.filter(
      (promotion) => !promotion.startDate && !promotion.endDate,
    );
    return { text: promotionSummary(i18n, ongoing).text };
  }

  /**
   * The one action, for either scope.
   *
   * Both editors now report a single staged change upwards and neither raises its own
   * review, so the button is enabled by exactly one rule — there is something to
   * review — and named by the change itself. A draft that is a no-op or half-typed
   * resolves to `null`, which is why an unchanged or invalid form leaves it disabled
   * rather than opening a dialog that would only refuse.
   */
  // Availability, price, and starting or updating an offer all act from their own
  // buttons. The footer survives for one act in this scope: taking a saved offer away,
  // which is the only one that removes something guests can already see.
  const reviewable =
    editor !== null &&
    editor !== "availability" &&
    editor !== "pricing" &&
    (editor !== "promotions" || change?.kind === "PROMOTION_REMOVE");
  const staged = scope === "DATES" ? change : listingDraft;
  const canReview = reviewable && staged !== null;
  const ctaText = !editor
    ? ""
    : scope === "DATES"
      ? workbenchCtaLabel(i18n, ctaForEditor(editor)).text
      : listingDraft
        ? listingCtaLabel(i18n, listingCtaFor(listingDraft)).text
        : workbenchCtaLabel(i18n, ctaForEditor(editor)).text;

  return (
    <div
      {...anchorProps(CALENDAR_ANCHOR.managePanel)}
      className="flex min-h-0 flex-1 flex-col"
    >
      {/* Header: one scope statement, a way back, and a way out. Stays put while the
          body scrolls, on desktop and inside the drawer alike. */}
      <header className="flex shrink-0 items-start gap-2 border-b border-slate-100 pb-3">
        {view.kind !== "menu" ? (
          <button
            type="button"
            onClick={onBack}
            className="-ml-1 grid size-11 shrink-0 place-items-center rounded-lg text-slate-500 transition-colors duration-150 hover:bg-slate-50 motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#a94b28]"
            aria-label={i18n.resolve("host.v2.calendar.back", "Back").text}
          >
            <ArrowLeft className="size-4" aria-hidden />
          </button>
        ) : null}
        <div className="min-w-0 flex-1 pt-1.5">
          <p
            {...anchorProps(CALENDAR_ANCHOR.manageScope)}
            className="truncate text-[0.9375rem] font-semibold text-slate-900"
          >
            {view.kind === "editor" && editor
              ? workbenchEditorLabel(i18n, editor).text
              : view.kind === "schedule"
                ? i18n.resolve(
                    "host.v2.calendar.schedule.title",
                    "Scheduled changes",
                  ).text
                : headline}
          </p>
          <p className="mt-0.5 truncate text-[0.75rem] text-slate-500">
            {view.kind === "menu" ? scopeText : `${scopeText} · ${headline}`}
          </p>
        </div>
        {selection ? (
          <button
            type="button"
            onClick={onClearSelection}
            className="-mr-1 grid size-11 shrink-0 place-items-center rounded-lg text-slate-400 transition-colors duration-150 hover:bg-slate-50 hover:text-slate-600 motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#a94b28]"
            aria-label={
              i18n.resolve("host.v2.calendar.clear_selection", "Clear selection").text
            }
          >
            <X className="size-4" aria-hidden />
          </button>
        ) : null}
      </header>

      {/* The only thing that scrolls. */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-3">
        {view.kind === "menu" ? (
          <div className="flex flex-col gap-1">
            <h3 className="px-2 pb-1 text-[0.75rem] font-semibold uppercase tracking-wide text-slate-400">
              {
                i18n.resolve(
                  "host.v2.calendar.manage_prompt",
                  "What would you like to change?",
                ).text
              }
            </h3>
            {WORKBENCH_MENU[scope].map((candidate) => {
              const value = menuValue(candidate);
              return (
                <SummaryRow
                  key={candidate}
                  label={workbenchEditorLabel(i18n, candidate).text}
                  value={value.text}
                  attention={value.attention}
                  onClick={() => onOpenEditor(candidate)}
                />
              );
            })}

            <div className="mt-2 flex flex-col gap-1 border-t border-slate-100 pt-2">
              <QuietRow
                icon={ListChecks}
                label={
                  i18n.resolve(
                    "host.v2.calendar.schedule.title",
                    "Scheduled changes",
                  ).text
                }
                onClick={onOpenSchedule}
              />
              {/* Secondary on purpose: connecting a channel is real work, but it is
                  not what a host opened the calendar to do. The link goes to the
                  existing connections surface rather than repeating it here. */}
              <QuietRow
                icon={CalendarSync}
                label={
                  i18n.resolve(
                    "host.v2.calendar.connections.title",
                    "Connected calendars",
                  ).text
                }
                hint={
                  i18n.resolve(
                    "host.v2.calendar.connections.hint",
                    "Manage Airbnb, Booking.com and other calendar connections",
                  ).text
                }
                href={connectionsHref}
              />
            </div>
          </div>
        ) : view.kind === "schedule" ? (
          <ScheduledChanges
            listing={listing}
            formats={formats}
            today={today}
            horizonEnd={horizonEnd}
            onOpenEntry={onOpenScheduledEntry}
            onRemovePromotion={onRemoveScheduledPromotion}
          />
        ) : editor && scope === "DATES" && selection ? (
          <div key={`${listing.id}:${selection.start}:${selection.end}:${editor}`}>
            {editor === "availability" ? (
              <AvailabilityEditor
                listing={listing}
                index={index}
                summary={summary}
                formats={formats}
                today={today}
                selection={selection}
                pending={actionPending}
                result={actionResult}
                onApply={onApplyAvailability}
                onUndo={onUndoAction}
                onDismissResult={onDismissActionResult}
              />
            ) : editor === "pricing" ? (
              <PricingEditor
                listing={listing}
                index={index}
                formats={formats}
                today={today}
                selection={selection}
                pending={actionPending}
                result={actionResult}
                onApply={onApplyPrice}
                onUndo={onUndoAction}
                onDismissResult={onDismissActionResult}
                onEditListingWide={onEditListingWideStayRules}
              />
            ) : (
              <PromotionEditor
                listing={listing}
                formats={formats}
                selection={selection}
                change={change}
                onChange={onChange}
                pending={actionPending}
                result={actionResult}
                onApply={onApplyPromotion}
                onUndo={onUndoAction}
                onDismissResult={onDismissActionResult}
              />
            )}
          </div>
        ) : editor ? (
          // Keyed on the listing, so switching property starts each editor from the
          // values that property actually has rather than the last one's.
          <div key={`${listing.id}:${editor}`}>
            {editor === "listing_visibility" ? (
              <ListingVisibilityEditor
                listing={listing}
                summary={summary}
                horizonMonths={horizonMonths}
                onDraftChange={onListingDraftChange}
              />
            ) : editor === "listing_defaults" ? (
              <DefaultPricingEditor
                listing={listing}
                formats={formats}
                today={today}
                focusMinimumStay={focusMinimumStay}
                onDraftChange={onListingDraftChange}
              />
            ) : (
              <OngoingPromotionEditor
                listing={listing}
                formats={formats}
                today={today}
                onDraftChange={onListingDraftChange}
              />
            )}
          </div>
        ) : null}
      </div>

      {/* One primary action, and the "one change at a time" caveat only where it is
          about to matter — immediately above the button that starts a save. */}
      {reviewable ? (
        <div
          className="shrink-0 border-t border-slate-100 bg-white pt-3"
          style={{ paddingBottom: "calc(0.25rem + env(safe-area-inset-bottom))" }}
        >
          <Button
            type="button"
            size="lg"
            disabled={!canReview}
            onClick={scope === "DATES" ? onReviewDate : onReviewListing}
            className={cn(
              "min-h-11 w-full bg-[#d9774f] text-white hover:bg-[#c2643e]",
              "disabled:bg-slate-100 disabled:text-slate-400",
            )}
            {...anchorProps(CALENDAR_ANCHOR.reviewChanges)}
          >
            {ctaText}
          </Button>
          {canReview ? (
            <p className="mt-1.5 text-center text-[0.6875rem] leading-4 text-slate-400">
              {
                i18n.resolve(
                  "host.v2.calendar.one_change_note",
                  "One change is saved at a time. Nothing is saved until you review and confirm.",
                ).text
              }
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
