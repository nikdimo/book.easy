"use client";

import { useMemo } from "react";
import { Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import { interpolate, useI18n } from "@/lib/i18n/client";
import { CALENDAR_ANCHOR, anchorProps } from "@/lib/host/v2/calendar-anchors";
import { resolveDay, type ListingCalendarIndex } from "@/lib/host/v2/calendar-model";
import type { HostCalendarListing } from "@/lib/host/v2/calendar-types";
import type { HostListingStatusSummary } from "@/lib/host/v2/listing-status";
import {
  formatMonthYear,
  type CalendarFormats,
} from "@/lib/host/v2/calendar-format";
import { addDaysToYmd } from "@/lib/utils/date-only";
import { bookabilityLine, dayStateLabel } from "./calendar-labels";

const TIMELINE_DAYS = 28;

/**
 * Read-only on purpose.
 *
 * A cross-listing edit would have to reconcile different availability rules, prices and
 * reservation states in a single confirmation, and this workspace's whole premise is
 * that a host knows exactly which property and which dates they are changing. The
 * overview answers "where do I need to look", then hands over to the single-listing
 * calendar to do anything about it.
 */
export function AllListingsTimeline({
  entries,
  today,
  formats,
  onSelectListing,
}: {
  entries: { listing: HostCalendarListing; index: ListingCalendarIndex; summary: HostListingStatusSummary }[];
  today: string;
  formats: CalendarFormats;
  onSelectListing: (id: string) => void;
}) {
  const i18n = useI18n();

  const days = useMemo(
    () =>
      Array.from({ length: TIMELINE_DAYS }, (_, offset) =>
        addDaysToYmd(today, offset),
      ),
    [today],
  );

  // Day numbers are plain digits and month names come from the server snapshot, so
  // this table renders identically on both sides of hydration.
  const dayNumber = (date: string) => String(Number(date.slice(8, 10)));

  return (
    <section
      {...anchorProps(CALENDAR_ANCHOR.allListings)}
      className="flex min-w-0 flex-1 flex-col gap-3 md:min-h-0 md:overflow-y-auto"
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold tracking-tight text-slate-900">
            {
              i18n.resolve(
                "host.v2.calendar.timeline_title",
                "All properties at a glance",
              ).text
            }
          </h2>
          <p className="mt-0.5 text-[0.75rem] text-slate-500">
            {
              interpolate(
                i18n.resolve(
                  "host.v2.calendar.timeline_range",
                  "The next {days} days from {month}",
                ),
                {
                  days: TIMELINE_DAYS,
                  month: formatMonthYear(today, formats),
                },
              ).text
            }
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-[0.6875rem] font-bold uppercase tracking-wider text-slate-500">
          <Eye className="size-3.5" aria-hidden />
          {i18n.resolve("host.v2.calendar.read_only", "View only").text}
        </span>
      </header>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full min-w-[46rem] border-collapse text-left">
          <caption className="sr-only">
            {
              i18n.resolve(
                "host.v2.calendar.timeline_caption",
                "Availability for each property over the next four weeks. Select a property to make changes.",
              ).text
            }
          </caption>
          <thead>
            <tr>
              <th
                scope="col"
                className="sticky left-0 z-10 bg-white px-3 py-2 text-[0.6875rem] font-bold uppercase tracking-wider text-slate-400"
              >
                {i18n.resolve("host.v2.calendar.timeline_property", "Property").text}
              </th>
              {days.map((date) => (
                <th
                  key={date}
                  scope="col"
                  className="px-0 py-2 text-center text-[0.625rem] font-semibold text-slate-400 tabular-nums"
                >
                  {dayNumber(date)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {entries.map(({ listing, index, summary }) => {
              const status = bookabilityLine(i18n, summary);
              return (
                <tr key={listing.id} className="border-t border-slate-100">
                  <th
                    scope="row"
                    className="sticky left-0 z-10 max-w-[13rem] bg-white px-3 py-2 font-normal"
                  >
                    <button
                      type="button"
                      onClick={() => onSelectListing(listing.id)}
                      className="block max-w-full text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0f172a]"
                    >
                      <span className="block truncate text-[0.8125rem] font-semibold text-slate-900 underline-offset-2 hover:underline">
                        {listing.title}
                      </span>
                      <span
                        className={cn(
                          "mt-0.5 block truncate text-[0.6875rem]",
                          summary.tone === "warning"
                            ? "text-amber-700"
                            : "text-slate-500",
                          status.translated && "notranslate",
                        )}
                      >
                        {status.text}
                      </span>
                    </button>
                  </th>
                  {days.map((date) => {
                    const day = resolveDay(listing, index, date, today);
                    const label = dayStateLabel(i18n, day);
                    return (
                      <td key={date} className="p-0.5">
                        <span
                          title={`${listing.title} · ${label.text}`}
                          className={cn(
                            "block h-6 w-full rounded-[3px]",
                            day.state === "booked"
                              ? "bg-[#16304a]"
                              : day.state === "blocked"
                                ? "bg-slate-300"
                                // Open but unsellable never reads as a positive
                                // state: teal here is a promise the listing
                                // cannot keep.
                                : day.state === "open_not_bookable"
                                  ? "bg-amber-200"
                                  : "bg-teal-400/70",
                          )}
                        >
                          <span className="sr-only">
                            {`${dayNumber(date)} ${label.text}`}
                          </span>
                        </span>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-[0.75rem] leading-4 text-slate-500">
        {
          i18n.resolve(
            "host.v2.calendar.timeline_hint",
            "This overview cannot be edited. Choose a property to change its dates, prices or promotions.",
          ).text
        }
      </p>
    </section>
  );
}
