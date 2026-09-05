"use client";

import { useEffect, useRef, useState } from "react";
import { BASE_CURRENCY } from "@/lib/currency/currency-preference";
import {
  ArrowLeft,
  CalendarSync,
  ListChecks,
  Tag,
  Unlock,
  X,
} from "lucide-react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
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
import type { DateChange } from "@/lib/host/v2/calendar-review";
import { editorSectionHref } from "@/lib/host/v2/editor-sections";
import type { CalendarIntent } from "@/lib/host/v2/calendar-href";
import {
  ctaForEditor,
  scopeOfSelection,
  WORKBENCH_MENU,
  type WorkbenchEditor,
  type WorkbenchView,
} from "@/lib/host/v2/calendar-workbench";
import type { ScheduledChange } from "@/lib/host/v2/calendar-schedule";
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
import { BookingRulesSummary } from "./booking-method-editor";
import {
  availabilitySummaryWord,
  intentPromptLabel,
  money,
  workbenchCtaLabel,
  workbenchEditorLabel,
  workbenchScopeLabel,
} from "./calendar-labels";

/**
 * The band that states which dates the panel is acting on. Shared shape, so the menu
 * and every editor under it put the same box in the same place and only the words
 * inside change.
 */
/** English sources for the seven days; the catalog carries the translations. */
const WEEKDAY_SUMMARY_SOURCE: Record<string, string> = {
  MONDAY: "Monday",
  TUESDAY: "Tuesday",
  WEDNESDAY: "Wednesday",
  THURSDAY: "Thursday",
  FRIDAY: "Friday",
  SATURDAY: "Saturday",
  SUNDAY: "Sunday",
};

const BAND_CLASS =
  "mx-1 mb-2 flex items-center gap-2 rounded-[0.625rem] border px-3 py-2.5";

/**
 * Letting go of the dates.
 *
 * It was a small underlined word in the header, sat among grey supporting text, and
 * hosts did not find it. A bordered chip with its own × reads as a control at a
 * glance, and it lives inside the band so the thing it removes is the thing beside
 * it. There is one per screen and no second copy anywhere else.
 */
function ClearDatesChip({ onClick }: { onClick: () => void }) {
  const i18n = useI18n();
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex shrink-0 items-center gap-1 rounded-full border border-[#94a3b8] bg-white/70 py-1 pl-2 pr-2.5 text-[0.75rem] font-medium text-slate-700 transition-colors duration-150 hover:border-slate-500 hover:bg-white hover:text-slate-900 motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#0f172a]"
    >
      <X className="size-3.5" aria-hidden />
      {i18n.resolve("host.v2.calendar.clear_dates", "Clear dates").text}
    </button>
  );
}

/**
 * One listing-wide setting, stated rather than offered.
 *
 * The calendar shows these so a host looking at a grid of nights can see what those
 * nights start from — and it links out rather than editing, because a setting with two
 * editable homes is a setting that will eventually hold two different values. The link
 * is a real link with its own words ("Change base price and ongoing offers"), not a
 * chevron on the row: the row is a fact, the link is the action, and a screen reader
 * should not have to guess which.
 */
function ListingDefaultRow({
  icon: Icon,
  label,
  value,
  attention,
  href,
  linkLabel,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  attention?: boolean;
  href: string;
  linkLabel: string;
}) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2.5">
      <div className="flex items-baseline gap-2">
        <Icon className="size-3.5 shrink-0 translate-y-0.5 text-slate-400" aria-hidden />
        <dt className="min-w-0 flex-1 text-[0.75rem] text-slate-500">{label}</dt>
        <dd
          className={cn(
            "min-w-0 max-w-[55%] truncate text-right text-[0.8125rem] font-medium",
            attention ? "text-amber-700" : "text-slate-900",
          )}
        >
          {/* Amber alone would be the only thing saying "this is missing", and a host
              who cannot separate those two greys learns nothing from it. The value
              itself already reads as an absence in words. */}
          {value}
        </dd>
      </div>
      <Link
        href={href}
        className="mt-1.5 inline-flex min-h-9 items-center text-[0.75rem] font-semibold text-[#0f172a] underline underline-offset-2 transition-colors duration-150 hover:text-slate-600 motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0f172a]"
      >
        {linkLabel}
      </Link>
    </div>
  );
}

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
 * Date editors still act only on selected dates. With nothing selected, the panel has
 * one listing-wide editor: Booking method, because it changes what every date in the
 * adjacent calendar means. Other listing defaults remain read-only facts with links to
 * the screens that own them, so none has two editable homes.
 */
export function ManageCalendarPanel({
  listing,
  index,
  summary,
  formats,
  today,
  horizonEnd,
  selection,
  rangeLabel,
  change,
  promotionEditorId,
  onChange,
  onClearSelection,
  onCloseDrawer,
  onReviewDate,
  actionPending,
  actionResult,
  availabilityTargets,
  canChooseTargets,
  onChooseTargets,
  onApplyAvailability,
  onApplyPrice,
  onApplyPromotion,
  onUndoAction,
  onDismissActionResult,
  view,
  onOpenEditor,
  onOpenSchedule,
  onBack,
  onOpenScheduledEntry,
  onRemoveScheduledPromotion,
  onSelectDatePromotion,
  onOpenConnections,
  pendingIntent,
  onCancelIntent,
}: {
  listing: HostCalendarListing;
  index: ListingCalendarIndex;
  summary: HostListingStatusSummary;
  formats: CalendarFormats;
  today: string;
  horizonEnd: string;
  selection: CalendarSelection | null;
  rangeLabel: string;
  change: DateChange | null;
  promotionEditorId: string | null;
  onChange: (change: DateChange | null) => void;
  onClearSelection: () => void;
  /** Closes the compact-width drawer. The panel owns the only header there is now, so
   *  the way out has to live in it; desktop has no drawer and hides the control. */
  onCloseDrawer?: () => void;
  onReviewDate: () => void;
  /**
   * Availability and price act rather than stage: both write through these instead of
   * raising a review, so the footer below carries no action for either. Promotions
   * retain review for destructive actions such as removing an existing offer.
   */
  actionPending: boolean;
  actionResult: DateActionResult | null;
  /**
   * Every property an availability change would reach, starting with this one. Blocking
   * is the only edit here that can be aimed at more than one property — see
   * `calendar-availability-action.ts` for why it is the only one.
   */
  availabilityTargets: {
    listing: HostCalendarListing;
    index: ListingCalendarIndex;
  }[];
  canChooseTargets: boolean;
  /** Null while the rail is the chooser: the editor then only reports the set. */
  onChooseTargets: (() => void) | null;
  onApplyAvailability: (
    direction: AvailabilityDirection,
    note: string | null,
  ) => void;
  /** `null` puts the dates back on the base price. */
  onApplyPrice: (nightlyRate: number | null) => void;
  onApplyPromotion: (offer: ProposedPromotion) => void;
  onUndoAction: () => void;
  onDismissActionResult: () => void;
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
  onOpenConnections: () => void;
  /**
   * The action the host arrived to perform but has no dates for yet.
   *
   * Set only while the calendar is waiting: it turns the empty band into a prompt for
   * that specific job, and the first selection both opens the editor and clears it.
   */
  pendingIntent: CalendarIntent | null;
  /** Declines the intent without leaving the calendar. */
  onCancelIntent: () => void;
}) {
  const i18n = useI18n();
  const scope = scopeOfSelection(selection);
  const currency = listing.pricing?.currency ?? BASE_CURRENCY;
  const selectedDateCount = selectionDates(selection).length;
  const hasSelection = selectedDateCount > 0;

  /**
   * The first selected date plays the menu's arrival once. More Ctrl/⌘-clicks only
   * animate the count on the band, so building a selection never turns into repeated
   * flashes. The flag is held a little past the animation so the last row finishes.
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
      timers.push(window.setTimeout(() => setSelectionAttention(false), 800));
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
  const availabilityHref = editorSectionHref(listing.id, "availability");
  const pricingHref = editorSectionHref(listing.id, "pricing");

  /** The truthful one-line state behind each menu row. */
  function menuValue(candidate: WorkbenchEditor): {
    text: string;
    attention?: boolean;
    /** The value names an absence, so the row shows it without a pill. */
    empty?: boolean;
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
    if (candidate === "booking-method") {
      if (listing.bookingMode !== "FIXED_STAYS") {
        return {
          text: i18n.resolve(
            "host.v2.calendar.booking_method.flexible",
            "Flexible dates",
          ).text,
        };
      }
      // The day the weeks turn over, which is the whole of what a host set. No day
      // chosen is the one state worth flagging: the listing is live and bookable by
      // nobody until the host picks one.
      const weekly = i18n.resolve(
        "host.v2.calendar.booking_method.weekly",
        "Weekly stays",
      ).text;
      if (!listing.changeoverWeekday) {
        return {
          text: `${weekly} · ${
            i18n.resolve(
              "host.v2.calendar.changeover.none_short",
              "no changeover day",
            ).text
          }`,
          attention: true,
        };
      }
      return {
        text: `${weekly} · ${
          i18n.resolve(
            "host.v2.calendar.weekday." + listing.changeoverWeekday.toLowerCase(),
            WEEKDAY_SUMMARY_SOURCE[listing.changeoverWeekday],
          ).text
        }`,
      };
    }
    if (candidate === "promotions" && selection) {
      const count = selectionPromotionSummaries(listing, selection).length;
      return {
        empty: count === 0,
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
    // Every menu row belongs to the date scope, and the menu is only rendered with a
    // selection, so there is no remaining branch to write. An empty string would still
    // be a truthful "nothing to say" if one were ever reached.
    return { text: "" };
  }

  /**
   * The one action, and the one rule that enables it.
   *
   * Availability and price act from their own buttons inside their editors, so the
   * footer carries nothing for them. Only a promotion still stages a change here, and
   * only a removal of one — creating or editing an offer applies directly, the way a
   * price does. A draft that is a no-op or half-typed resolves to `null`, which is why
   * an unchanged form leaves the button disabled rather than opening a dialog that
   * would only refuse.
   */
  const reviewable = editor === "promotions" && change?.kind === "PROMOTION_REMOVE";
  const canReview = reviewable && change !== null;
  // Null for an editor that carries its own actions instead of one sticky review — see
  // `ctaForEditor`. The footer below renders nothing at all in that case.
  const cta = editor ? ctaForEditor(editor) : null;
  const ctaText = cta ? workbenchCtaLabel(i18n, cta).text : "";

  return (
    <div
      {...anchorProps(CALENDAR_ANCHOR.managePanel)}
      className="relative flex min-h-0 flex-1 flex-col"
    >
      {/* Header: one scope statement, a way back, and a way out. Stays put while the
          body scrolls, on desktop and inside the drawer alike.

          On a phone this is the drawer's header too — there is no second bar above it.
          A fixed "Manage calendar" said less than this one does ("Promotion", the
          listing name) and stacked a second × beside this one, one closing the sheet
          and one clearing the dates, with nothing to tell them apart. Now the × means
          close, the way it does in every other sheet, and clearing lives on the band
          below, against the dates it removes. */}
      <header className="flex shrink-0 items-start gap-2 rounded-t-lg border-b border-slate-100 pb-3">
        {view.kind !== "menu" ? (
          <button
            type="button"
            onClick={onBack}
            className="-ml-1 grid size-11 shrink-0 place-items-center rounded-lg text-slate-500 transition-colors duration-150 hover:bg-slate-50 motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#0f172a]"
            aria-label={i18n.resolve("host.v2.calendar.back", "Back").text}
          >
            <ArrowLeft className="size-4" aria-hidden />
          </button>
        ) : null}
        <div className="min-w-0 flex-1 pt-1.5">
          <p
            {...anchorProps(CALENDAR_ANCHOR.manageScope)}
            id="host-v2-manage-drawer-title"
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
          {/* One line of context under the title. On the menu that is the scope; on
              every screen below it that is the property, because the dates moved to
              the band and the name is the thing that would otherwise leave the
              screen. */}
          <p className="mt-0.5 min-w-0 truncate text-[0.75rem] text-slate-500">
            {view.kind === "menu" ? scopeText : listing.title}
          </p>
        </div>
        {onCloseDrawer ? (
          <button
            type="button"
            onClick={onCloseDrawer}
            className="-mr-1 grid size-11 shrink-0 place-items-center rounded-lg text-slate-500 transition-colors duration-150 hover:bg-slate-50 hover:text-slate-900 motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#0f172a] lg:hidden"
            aria-label={i18n.resolve("common.close", "Close").text}
          >
            <X className="size-4" aria-hidden />
          </button>
        ) : null}
      </header>

      {/* The only thing that scrolls. */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-3">
        {view.kind === "menu" ? (
          <div className="flex flex-col gap-1">
            {/* The selected cell's own treatment, moved into the panel: the same tint
                fill, warm hairline and rounding the grid draws around a picked date. The
                shape is there in both states so nothing resizes when a date is clicked —
                only the colour changes, and the panel visibly belongs to the run the host
                just selected.

                The dates sit under the question rather than up in the header, which lets
                the listing's name stay put and puts the range beside the menu that acts
                on it. */}
            <div
              className={cn(
                BAND_CLASS,
                "transition-colors duration-300 motion-reduce:transition-none",
                selection
                  ? "border-[#cbd5e1] bg-[#e2e8f0]"
                  : "border-slate-200 bg-slate-50",
              )}
            >
              <div className="min-w-0 flex-1">
                <h3
                  className={cn(
                    "text-[0.75rem] font-semibold transition-colors duration-300 motion-reduce:transition-none",
                    selection ? "text-[#0f172a]" : "text-slate-600",
                  )}
                >
                  {
                    selection
                      ? i18n.resolve(
                          "host.v2.calendar.choose_change",
                          "Choose what to change",
                        ).text
                      : pendingIntent
                        ? i18n.resolve(
                            "host.v2.calendar.intent_prompt",
                            "Choose the dates for this change",
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
                    className="calendar-selection-count-change mt-0.5 truncate text-[0.8125rem] font-semibold text-[#0f172a]"
                  >
                    {rangeLabel} · {selectionCountText}
                  </p>
                ) : (
                  /* With nothing selected this really is a precondition now, and
                     saying so is the honest thing: every editor below the band acts on
                     dates. What used to be reachable from here without a selection —
                     the base price, the cleaning fee, the offers that run on every
                     date — is named underneath as current state with a link to the
                     page that owns it, so nobody has to guess that clearing dates was
                     the way to reach a setting. */
                  <p className="mt-0.5 text-[0.6875rem] leading-4 text-slate-500">
                    {pendingIntent
                      ? intentPromptLabel(i18n, pendingIntent).text
                      : i18n.resolve(
                          "host.v2.calendar.menu_start_hint",
                          "Select dates on the calendar to open, block or price them.",
                        ).text}
                  </p>
                )}
              </div>
              {selection ? <ClearDatesChip onClick={onClearSelection} /> : null}
              {/* Declining is always available, and it is a control rather than a
                  keyboard trick: an intent the host no longer wants must not be
                  something they have to select dates to escape. */}
              {!selection && pendingIntent ? (
                <button
                  type="button"
                  onClick={onCancelIntent}
                  className="min-h-9 shrink-0 rounded-full border border-slate-300 bg-white/70 px-2.5 text-[0.75rem] font-medium text-slate-700 transition-colors duration-150 hover:bg-white hover:text-slate-900 motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#0f172a]"
                >
                  {
                    i18n.resolve(
                      "host.v2.calendar.intent_cancel",
                      "Not now",
                    ).text
                  }
                </button>
              ) : null}
            </div>
            {/* Cards, not hairlines: a hairline gives a row an edge, but not a
                surface, and a row with no surface reads as a line in a summary table
                rather than as somewhere to go. The gap between them is what separates
                these three destinations from the quiet list underneath. */}
            <div className="flex flex-col gap-2">
              {WORKBENCH_MENU[scope].map((candidate, rowIndex) => {
                const value = menuValue(candidate);
                return (
                  <SummaryRow
                    key={candidate}
                    label={workbenchEditorLabel(i18n, candidate).text}
                    value={value.text}
                    attention={value.attention}
                    emptyValue={value.empty}
                    reveal={selectionAttention}
                    revealIndex={rowIndex}
                    onClick={() => onOpenEditor(candidate)}
                  />
                );
              })}
            </div>

            {/* No selection: the listing's own settings, reported rather than edited,
                each next to the way to its one editable home. */}
            {scope === "ALL_FUTURE" ? (
              <dl className="mt-1 flex flex-col gap-2">
                <ListingDefaultRow
                  icon={Unlock}
                  label={
                    i18n.resolve(
                      "host.v2.calendar.default_availability",
                      "Default availability",
                    ).text
                  }
                  value={
                    listing.availabilityMode === "CLOSED"
                      ? i18n.resolve(
                          "host.v2.calendar.default_closed",
                          "Only dates you open",
                        ).text
                      : i18n.resolve(
                          "host.v2.calendar.default_open",
                          "Available by default",
                        ).text
                  }
                  href={availabilityHref}
                  linkLabel={
                    i18n.resolve(
                      "host.v2.calendar.change_default_availability",
                      "Change default availability",
                    ).text
                  }
                />
                <ListingDefaultRow
                  icon={Tag}
                  label={
                    i18n.resolve("host.v2.calendar.base_price", "Base price").text
                  }
                  value={
                    listing.pricing
                      ? money(listing.pricing.baseNightlyRate, currency, formats)
                      : i18n.resolve(
                          "host.v2.calendar.no_pricing_short",
                          "No pricing set",
                        ).text
                  }
                  attention={!listing.pricing}
                  href={pricingHref}
                  linkLabel={
                    i18n.resolve(
                      "host.v2.calendar.change_base_price",
                      "Change base price and ongoing offers",
                    ).text
                  }
                />
              </dl>
            ) : null}

            <div className="mt-2 flex flex-col divide-y divide-slate-100 border-t border-slate-100 pt-2">
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
          <ConnectedCalendars
            key={listing.id}
            listingId={listing.id}
            sellsFixedStays={listing.bookingMode === "FIXED_STAYS"}
          />
        ) : editor === "booking-method" ? (
          // Not an editor any more: booking style, stay limits and the changeover day
          // are edited on Availability, and this states them so the host can read the
          // grid beside it. Keyed on the listing so switching property re-reads.
          <BookingRulesSummary key={listing.id} listing={listing} />
        ) : editor && scope === "DATES" && selection ? (
          <>
            {/* The same band as the menu, on every screen the menu leads to. A host
                deep in a promotion should never have to go back a screen to find out
                which nights they are pricing, and the way out of the selection is on
                the band that names it rather than up in a header that changes shape
                from screen to screen. */}
            <div className={cn(BAND_CLASS, "border-[#cbd5e1] bg-[#e2e8f0]")}>
              <div className="min-w-0 flex-1">
                <h3 className="text-[0.75rem] font-semibold text-[#0f172a]">
                  {
                    i18n.resolve(
                      "host.v2.calendar.editing_dates",
                      "Editing these dates",
                    ).text
                  }
                </h3>
                <p
                  key={selectedDateCount}
                  className="calendar-selection-count-change mt-0.5 truncate text-[0.8125rem] font-semibold text-[#0f172a]"
                >
                  {rangeLabel} · {selectionCountText}
                </p>
              </div>
              <ClearDatesChip onClick={onClearSelection} />
            </div>
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
                targets={availabilityTargets}
                canChooseTargets={canChooseTargets}
                onChooseTargets={onChooseTargets}
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
                listingPricingHref={pricingHref}
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
          </>
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
            onClick={onReviewDate}
            className={cn(
              "min-h-11 w-full bg-[#0f172a] text-white hover:bg-[#1e293b]",
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
