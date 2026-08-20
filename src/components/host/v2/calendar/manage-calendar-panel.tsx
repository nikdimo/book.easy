"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, CalendarSync, ListChecks, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { interpolate, useI18n } from "@/lib/i18n/client";
import { Button } from "@/components/ui/button";
import { CALENDAR_ANCHOR, anchorProps } from "@/lib/host/v2/calendar-anchors";
import type { CalendarFormats } from "@/lib/host/v2/calendar-format";
import {
  selectionPromotionSummaries,
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
import { compareYmd } from "@/lib/utils/date-only";
import {
  DefaultPricingEditor,
  ListingVisibilityEditor,
  OngoingPromotionEditor,
  type OngoingPromotionMode,
} from "./listing-editors";
import {
  AvailabilityEditor,
  PricingEditor,
  PromotionEditor,
  type DateActionResult,
} from "./date-editors";
import type { AvailabilityDirection } from "@/lib/host/v2/calendar-availability-action";
import { ScheduledChanges } from "./scheduled-changes";
import { ConnectedCalendars } from "./connected-calendars";
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
  promotionEditorId,
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
  onSelectDatePromotion,
  onClearPromotionTarget,
  onOpenConnections,
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
  promotionEditorId: string | null;
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
  onSelectDatePromotion: (
    promotion: HostCalendarListing["promotions"][number],
  ) => void;
  onClearPromotionTarget: () => void;
  onOpenConnections: () => void;
}) {
  const i18n = useI18n();
  const scope = scopeOfSelection(selection);
  const currency = listing.pricing?.currency ?? "EUR";
  const selectedDateCount = selectionDates(selection).length;
  const hasSelection = selectedDateCount > 0;

  /**
   * The first selected date activates the panel once. More Ctrl/⌘-clicks only animate
   * the count in the header, so building a selection never turns into repeated flashes.
   */
  const previouslyHadSelection = useRef(hasSelection);
  const [selectionAttention, setSelectionAttention] = useState(false);
  useEffect(() => {
    const hadSelection = previouslyHadSelection.current;
    previouslyHadSelection.current = hasSelection;
    const timers: number[] = [];

    if (!hasSelection || view.kind !== "menu") {
      timers.push(window.setTimeout(() => setSelectionAttention(false), 0));
    } else if (!hadSelection) {
      timers.push(window.setTimeout(() => setSelectionAttention(true), 0));
      timers.push(window.setTimeout(() => setSelectionAttention(false), 1_200));
    }

    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [hasSelection, view.kind]);

  const scopeText = workbenchScopeLabel(i18n, scope).text;
  const selectionCountText = interpolate(
    i18n.plural(
      "host.v2.calendar.schedule.nights",
      selectedDateCount,
      "{n} night",
      "{n} nights",
    ),
    {},
  ).text;
  const headline = selection
    ? `${rangeLabel} · ${selectionCountText}`
    : listing.title;

  const editor = view.kind === "editor" ? view.editor : null;
  const [ongoingPromotionState, setOngoingPromotionState] = useState<{
    listingId: string;
    mode: OngoingPromotionMode;
  }>({ listingId: listing.id, mode: "list" });
  const storedOngoingPromotionMode =
    ongoingPromotionState.listingId === listing.id
      ? ongoingPromotionState.mode
      : "list";
  const ongoingPromotionMode =
    editor === "listing_promotions" && promotionEditorId
      ? "edit"
      : storedOngoingPromotionMode;
  const setOngoingPromotionMode = (mode: OngoingPromotionMode) => {
    if (mode === "list") onClearPromotionTarget();
    setOngoingPromotionState({ listingId: listing.id, mode });
  };

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
      const count = selectionPromotionSummaries(listing, selection).length;
      return {
        text: interpolate(
          i18n.plural(
            "host.v2.calendar.menu.promotions_count",
            count,
            "{n} promotion",
            "{n} promotions",
          ),
          {},
        ).text,
      };
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
    const activeOrUpcoming = listing.promotions.filter(
      (promotion) =>
        !promotion.endDate || compareYmd(promotion.endDate, today) > 0,
    );
    return { text: promotionSummary(i18n, activeOrUpcoming).text };
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
  // Availability and price act from their own buttons. Promotions use this footer both
  // to open a clean builder and to name its create, edit, or removal action.
  const reviewable =
    editor !== null &&
    editor !== "availability" &&
    editor !== "pricing" &&
    (editor !== "promotions" || change?.kind === "PROMOTION_REMOVE");
  const staged = scope === "DATES" ? change : listingDraft;
  const promotionListOpen =
    editor === "listing_promotions" && ongoingPromotionMode === "list";
  const canReview = promotionListOpen || (reviewable && staged !== null);
  const ctaText = promotionListOpen
    ? i18n.resolve(
        "host.v2.calendar.cta.add_promotion",
        "Add another promotion",
      ).text
    : editor === "listing_promotions" &&
        listingDraft?.kind === "EVERGREEN_PROMOTION" &&
        listingDraft.action === "REMOVE"
      ? listingCtaLabel(i18n, listingCtaFor(listingDraft)).text
      : editor === "listing_promotions" && ongoingPromotionMode === "create"
        ? i18n.resolve(
            "host.v2.calendar.cta.create_promotion",
            "Create promotion",
          ).text
        : editor === "listing_promotions" && ongoingPromotionMode === "edit"
          ? i18n.resolve(
              "host.v2.calendar.cta.save_promotion",
              "Save changes",
            ).text
    : !editor
    ? ""
    : scope === "DATES"
      ? workbenchCtaLabel(i18n, ctaForEditor(editor)).text
      : listingDraft
        ? listingCtaLabel(i18n, listingCtaFor(listingDraft)).text
        : workbenchCtaLabel(i18n, ctaForEditor(editor)).text;

  return (
    <div
      {...anchorProps(CALENDAR_ANCHOR.managePanel)}
      className="relative flex min-h-0 flex-1 flex-col"
    >
      {selectionAttention ? (
        <span
          aria-hidden
          className="calendar-panel-attention-rail pointer-events-none absolute -left-3 top-0 z-10 h-40 w-1 rounded-full bg-[#d9774f]"
        />
      ) : null}
      {/* Header: one scope statement, a way back, and a way out. Stays put while the
          body scrolls, on desktop and inside the drawer alike. */}
      <header
        className={cn(
          "flex shrink-0 items-start gap-2 rounded-t-lg border-b border-slate-100 pb-3 transition-colors duration-500 motion-reduce:transition-none",
          selectionAttention && "bg-[#fff7f2]",
        )}
      >
        {view.kind !== "menu" ? (
          <button
            type="button"
            onClick={() => {
              setOngoingPromotionMode("list");
              onBack();
            }}
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
            {view.kind === "menu" ? (
              /* The listing's name, selection or not. It used to be replaced by the
                 date range the moment a date was clicked, which took the name off the
                 screen at exactly the point the host was working on that listing. The
                 range moved down into the band below, where it sits with the question
                 it answers. */
              listing.title
            ) : view.kind === "editor" && editor ? (
              workbenchEditorLabel(i18n, editor).text
            ) : view.kind === "schedule" ? (
              i18n.resolve(
                "host.v2.calendar.schedule.title",
                "Scheduled changes",
              ).text
            ) : view.kind === "connections" ? (
              i18n.resolve(
                "host.v2.calendar.connections.title",
                "Connected calendars",
              ).text
            ) : (
              headline
            )}
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
            {/* The selected cell's own treatment, moved into the panel: the same peach
                fill, warm hairline and rounding the grid draws around a picked date. The
                shape is there in both states so nothing resizes when a date is clicked —
                only the colour changes, and the panel visibly belongs to the run the host
                just selected.

                The dates sit under the question rather than up in the header, which lets
                the listing's name stay put and puts the range beside the menu that acts
                on it. */}
            <div
              className={cn(
                "mx-1 mb-2 rounded-[0.625rem] border px-3 py-2.5 transition-colors duration-300 motion-reduce:transition-none",
                selection
                  ? "border-[#eec7ae] bg-[#ffe2cd]"
                  : "border-slate-200 bg-slate-50",
              )}
            >
              <h3
                className={cn(
                  "text-[0.75rem] font-semibold transition-colors duration-300 motion-reduce:transition-none",
                  selection ? "text-[#8f3d21]" : "text-slate-600",
                )}
              >
                {
                  selection
                    ? i18n.resolve(
                        "host.v2.calendar.choose_change",
                        "Choose what to change",
                      ).text
                    : i18n.resolve(
                        "host.v2.calendar.manage_prompt",
                        "What would you like to change?",
                      ).text
                }
              </h3>
              {selection ? (
                <p
                  key={selectedDateCount}
                  className="calendar-selection-count-change mt-0.5 truncate text-[0.8125rem] font-semibold text-[#a94b28]"
                >
                  {rangeLabel} · {selectionCountText}
                </p>
              ) : (
                /* An empty panel used to say only what it was for. Saying how to fill it
                   is the part a host opening the calendar for the first time is missing. */
                <p className="mt-0.5 truncate text-[0.6875rem] text-slate-400">
                  {
                    i18n.resolve(
                      "host.v2.calendar.pick_dates_hint",
                      "Pick dates on the calendar",
                    ).text
                  }
                </p>
              )}
            </div>
            {WORKBENCH_MENU[scope].map((candidate) => {
              const value = menuValue(candidate);
              return (
                <SummaryRow
                  key={candidate}
                  label={workbenchEditorLabel(i18n, candidate).text}
                  value={value.text}
                  attention={value.attention}
                  highlight={selectionAttention}
                  onClick={() => {
                    if (candidate === "listing_promotions") {
                      setOngoingPromotionMode("list");
                    }
                    onOpenEditor(candidate);
                  }}
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
                  not what a host opened the calendar to do. It opens here rather than
                  on another page — a host who leaves for it loses the property and the
                  month they were looking at. */}
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
                onClick={onOpenConnections}
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
        ) : view.kind === "connections" ? (
          // Keyed on the listing: the feeds belong to one property, and switching
          // property while this is open must not show the previous one's calendars.
          <ConnectedCalendars key={listing.id} listingId={listing.id} />
        ) : editor && scope === "DATES" && selection ? (
          <div
            key={`${listing.id}:${selection.start}:${selection.end}:${editor}:${promotionEditorId ?? ""}`}
          >
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
                promotionEditorId={promotionEditorId}
                change={change}
                onChange={onChange}
                pending={actionPending}
                result={actionResult}
                onApply={onApplyPromotion}
                onSelectPromotion={onSelectDatePromotion}
                onUndo={onUndoAction}
                onDismissResult={onDismissActionResult}
              />
            )}
          </div>
        ) : editor ? (
          // Keyed on the listing, so switching property starts each editor from the
          // values that property actually has rather than the last one's.
          <div key={`${listing.id}:${editor}:${promotionEditorId ?? ""}`}>
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
                promotionEditorId={promotionEditorId}
                mode={ongoingPromotionMode}
                onModeChange={setOngoingPromotionMode}
                onDraftChange={onListingDraftChange}
                onSelectDatePromotion={onSelectDatePromotion}
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
            onClick={
              promotionListOpen
                ? () => setOngoingPromotionMode("create")
                : scope === "DATES"
                  ? onReviewDate
                  : onReviewListing
            }
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
