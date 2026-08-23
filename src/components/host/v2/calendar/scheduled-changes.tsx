"use client";

import { useMemo, useState } from "react";
import { BASE_CURRENCY } from "@/lib/currency/currency-preference";
import {
  CalendarCheck,
  CalendarSync,
  CircleDollarSign,
  Lock,
  LockOpen,
  Tag,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { interpolate, useI18n } from "@/lib/i18n/client";
import type { CalendarFormats } from "@/lib/host/v2/calendar-format";
import { formatShortDate } from "@/lib/host/v2/calendar-format";
import type { HostCalendarListing } from "@/lib/host/v2/calendar-types";
import {
  buildScheduledChanges,
  filterScheduledChanges,
  scheduledChangeCounts,
  SCHEDULED_FILTERS,
  type ScheduledChange,
  type ScheduledFilter,
} from "@/lib/host/v2/calendar-schedule";
import {
  money,
  reviewValueText,
  scheduledFilterLabel,
  scheduledKindLabel,
  scheduledProtectionText,
} from "./calendar-labels";

const KIND_ICON: Record<ScheduledChange["kind"], LucideIcon> = {
  MANUAL_BLOCK: Lock,
  OPEN_WINDOW: LockOpen,
  DATE_PRICE: CircleDollarSign,
  DATED_PROMOTION: Tag,
  RESERVATION: CalendarCheck,
  EXTERNAL_BLOCK: CalendarSync,
};

/**
 * Everything already scheduled, as one focused destination.
 *
 * This is the answer to "what have I already told this calendar to do", which the
 * calendar grid itself cannot give: a shaded square says a date is blocked, not that
 * it belongs to a run the host set up in March and can now change in one place.
 *
 * Rows are ranges, never individual dates — see `calendar-schedule` for where the
 * grouping is done and why it only ever groups what is genuinely contiguous.
 */
export function ScheduledChanges({
  listing,
  formats,
  today,
  horizonEnd,
  onOpenEntry,
  onRemovePromotion,
}: {
  listing: HostCalendarListing;
  formats: CalendarFormats;
  today: string;
  horizonEnd: string;
  /** Selects the entry's dates and opens the editor that owns it. */
  onOpenEntry: (entry: ScheduledChange) => void;
  /** Selects the dates, opens the promotion editor, and arms the removal. */
  onRemovePromotion: (entry: ScheduledChange) => void;
}) {
  const i18n = useI18n();
  const [filter, setFilter] = useState<ScheduledFilter>("all");
  const currency = listing.pricing?.currency ?? BASE_CURRENCY;

  const entries = useMemo(
    () => buildScheduledChanges({ listing, today, horizonEnd }),
    [listing, today, horizonEnd],
  );
  const counts = useMemo(() => scheduledChangeCounts(entries), [entries]);
  const shown = filterScheduledChanges(entries, filter);

  function rangeText(entry: ScheduledChange) {
    const from = formatShortDate(entry.from, formats);
    if (entry.from === entry.to) return from;
    return `${from} – ${formatShortDate(entry.to, formats)}`;
  }

  /** The one line that says what this entry actually is. */
  function detailText(entry: ScheduledChange): string {
    if (entry.kind === "DATE_PRICE" && entry.nightlyRate !== null) {
      return interpolate(
        i18n.resolve("host.v2.calendar.value.price", "{amount} per night"),
        { amount: money(entry.nightlyRate, currency, formats) },
      ).text;
    }
    if (entry.kind === "DATED_PROMOTION" && entry.promotion) {
      return reviewValueText(
        i18n,
        {
          code: "PROMOTION_OFFER",
          discountPercent: entry.promotion.discountPercent,
          freeCleaning: entry.promotion.freeCleaning,
          minimumNights: entry.promotion.minimumNights ?? 1,
          roundToWholeUnit: entry.promotion.roundToWholeUnit,
          evergreen: false,
        },
        currency,
        formats,
      ).text;
    }
    if (entry.kind === "RESERVATION") {
      return (
        entry.guestName ??
        i18n.resolve("host.v2.calendar.schedule.guest", "Guest reservation").text
      );
    }
    return scheduledKindLabel(i18n, entry.kind).text;
  }

  if (entries.length === 0) {
    return (
      <div className="flex flex-col gap-2 py-6 text-center">
        <p className="text-[0.875rem] font-medium text-slate-700">
          {
            i18n.resolve(
              "host.v2.calendar.schedule.empty_title",
              "Nothing scheduled yet",
            ).text
          }
        </p>
        <p className="text-[0.8125rem] leading-5 text-slate-500">
          {
            i18n.resolve(
              "host.v2.calendar.schedule.empty_body",
              "Blocked dates, custom prices, date-specific offers and reservations all show up here once they exist, so you can change them without hunting through the calendar.",
            ).text
          }
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div
        role="group"
        aria-label={
          i18n.resolve("host.v2.calendar.schedule.filters", "Filter changes").text
        }
        className="-mx-1 flex flex-wrap gap-1.5 px-1"
      >
        {SCHEDULED_FILTERS.filter(
          (candidate) => candidate === "all" || counts[candidate] > 0,
        ).map((candidate) => (
          <button
            key={candidate}
            type="button"
            aria-pressed={filter === candidate}
            onClick={() => setFilter(candidate)}
            className={cn(
              "min-h-11 rounded-full px-3 text-[0.8125rem] font-medium",
              "transition-colors duration-150 motion-reduce:transition-none",
              "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0f172a]",
              filter === candidate
                ? "bg-[#f8fafc] text-[#0f172a] ring-1 ring-inset ring-[#0f172a]"
                : "bg-slate-50 text-slate-600 hover:bg-slate-100",
            )}
          >
            {scheduledFilterLabel(i18n, candidate).text}
            <span className="ml-1 tabular-nums text-slate-400">
              {counts[candidate]}
            </span>
          </button>
        ))}
      </div>

      <ul className="flex flex-col divide-y divide-slate-100">
        {shown.map((entry) => {
          const Icon = KIND_ICON[entry.kind];
          const protection = entry.protection
            ? scheduledProtectionText(i18n, entry.protection)
            : null;
          return (
            <li key={`${entry.kind}:${entry.id}`} className="py-1">
              <button
                type="button"
                onClick={() => onOpenEntry(entry)}
                className={cn(
                  "flex min-h-11 w-full items-start gap-2.5 rounded-lg px-2 py-2 text-left",
                  "transition-colors duration-150 hover:bg-slate-50 motion-reduce:transition-none",
                  "focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#0f172a]",
                )}
              >
                <Icon
                  className={cn(
                    "mt-0.5 size-4 shrink-0",
                    entry.protection ? "text-slate-300" : "text-slate-400",
                  )}
                  aria-hidden
                />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-[0.8125rem] font-semibold text-slate-900">
                      {rangeText(entry)}
                    </span>
                    <span className="text-[0.75rem] tabular-nums text-slate-400">
                      {
                        interpolate(
                          i18n.plural(
                            "host.v2.calendar.schedule.nights",
                            entry.nights,
                            "{n} night",
                            "{n} nights",
                          ),
                          {},
                        ).text
                      }
                    </span>
                  </span>
                  <span className="mt-0.5 block text-[0.8125rem] leading-5 text-slate-600">
                    {detailText(entry)}
                  </span>
                  {/* The host's own words, shown back to them and to nobody else. */}
                  {entry.note ? (
                    <span className="mt-0.5 block text-[0.75rem] leading-4 text-slate-500 italic">
                      {entry.note}
                    </span>
                  ) : null}
                  {protection ? (
                    <span className="mt-1 block text-[0.75rem] leading-4 text-slate-400">
                      {protection.text}
                    </span>
                  ) : null}
                </span>
              </button>

              {/* A saved dated offer is the one thing here with two distinct actions,
                  so it gets both rather than making removal a hunt inside the editor. */}
              {entry.kind === "DATED_PROMOTION" ? (
                <span className="flex gap-1 px-2 pb-1">
                  <button
                    type="button"
                    onClick={() => onOpenEntry(entry)}
                    className="min-h-11 rounded-lg px-2 text-[0.75rem] font-semibold text-[#0f172a] transition-colors duration-150 hover:bg-[#f8fafc] motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#0f172a]"
                  >
                    {i18n.resolve("host.v2.calendar.schedule.edit", "Edit").text}
                  </button>
                  <button
                    type="button"
                    onClick={() => onRemovePromotion(entry)}
                    className="min-h-11 rounded-lg px-2 text-[0.75rem] font-semibold text-red-700 transition-colors duration-150 hover:bg-red-50 motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-red-700"
                  >
                    {i18n.resolve("host.v2.calendar.schedule.remove", "Remove").text}
                  </button>
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
