"use client";

import Link from "next/link";
import { AlertTriangle, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n, interpolate } from "@/lib/i18n/client";
import type { HostCalendarListing } from "@/lib/host/v2/calendar-types";
import {
  statedStayCap,
  type ChangeoverWeekdayName,
} from "@/lib/utils/weekly-stay";

/**
 * How this listing sells its dates — stated here, edited on Availability.
 *
 * This used to be the editor. It is now a report, and the move is the point: booking
 * style, minimum stay, maximum stay and changeover day are listing-wide rules about
 * *when and how* a guest may book, which is what the Availability section owns. The
 * Calendar owns particular dates — opening them, blocking them, pricing them — and a
 * second editable copy of a listing-wide rule beside them is how the two answers
 * eventually disagree.
 *
 * So what is left here is the one-line summary a host needs in order to read the grid
 * correctly ("why can I only pick Saturdays?") and a link to the one place that answers
 * it. Nothing on this screen writes.
 */

/**
 * What a connected channel cannot be told.
 *
 * The export publishes which nights are open and which are held, and that is the whole
 * of what iCalendar can say. It has no vocabulary for "Saturdays only" or minimum and
 * maximum stays, so a channel may accept a range this listing would refuse unless the
 * host sets the same rules there. Stated, never enforced: refusing weekly mode
 * because a calendar is connected would be this product deciding a host's channel
 * strategy for them.
 */
export function FixedStaySyncWarning({ className }: { className?: string }) {
  const i18n = useI18n();
  return (
    <div
      role="note"
      data-fixed-stay-sync-warning
      className={cn(
        "flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50/70 px-3 py-2.5",
        className,
      )}
    >
      <AlertTriangle
        className="mt-0.5 size-4 shrink-0 text-amber-700"
        aria-hidden
      />
      <p className="min-w-0 text-[0.8125rem] leading-5 text-amber-900">
        {
          i18n.resolve(
            "host.v2.calendar.booking_method.sync_warning",
            "Calendar sync shares open and blocked nights, but it cannot enforce weekly arrivals or stay limits. Set the same changeover day, minimum stay and maximum stay on every connected channel.",
          ).text
        }
      </p>
    </div>
  );
}

/** English source strings for the seven days; the catalog carries the translations. */
const WEEKDAY_SOURCE: Record<ChangeoverWeekdayName, string> = {
  MONDAY: "Monday",
  TUESDAY: "Tuesday",
  WEDNESDAY: "Wednesday",
  THURSDAY: "Thursday",
  FRIDAY: "Friday",
  SATURDAY: "Saturday",
  SUNDAY: "Sunday",
};

/**
 * This listing's booking rules, in one line, with the way to change them.
 *
 * The line is built from the same three stored values the Availability editor writes —
 * booking style, changeover day, maximum stay — and reads as the host set them:
 * "Weekly stays · Saturday · Maximum 28 nights". Parts that say nothing are left out
 * rather than spelled as absences, so a flexible listing with no cap is simply
 * "Flexible dates" — and a maximum sitting on the column's default of 365 counts as no
 * cap, because it is the schema talking rather than the host.
 *
 * The one exception is a weekly listing with no changeover day. That is not a quiet
 * default, it is a listing nobody can book, so it is called out where the host is
 * looking at the dates it silently closed.
 */
export function BookingRulesSummary({
  listing,
}: {
  listing: HostCalendarListing;
}) {
  const i18n = useI18n();
  const weekly = listing.bookingMode === "FIXED_STAYS";
  const cap = statedStayCap(listing.pricing?.maxNights);
  const missingChangeover = weekly && !listing.changeoverWeekday;

  const parts: string[] = [
    weekly
      ? i18n.resolve("host.v2.calendar.booking_method.weekly", "Weekly stays").text
      : i18n.resolve("host.v2.calendar.booking_method.flexible", "Flexible dates")
          .text,
  ];
  if (weekly) {
    parts.push(
      listing.changeoverWeekday
        ? i18n.resolve(
            "host.v2.calendar.weekday." + listing.changeoverWeekday.toLowerCase(),
            WEEKDAY_SOURCE[listing.changeoverWeekday],
          ).text
        : i18n.resolve(
            "host.v2.calendar.changeover.none_short",
            "no changeover day",
          ).text,
    );
  }
  if (cap !== null) {
    parts.push(
      interpolate(
        i18n.plural(
          "host.v2.calendar.stay_limits.maximum_summary",
          cap,
          "Maximum {n} night",
          "Maximum {n} nights",
        ),
        {},
      ).text,
    );
  }

  return (
    <div data-booking-rules-summary className="flex flex-col gap-3">
      <p
        className={cn(
          "rounded-xl border px-3 py-2.5 text-[0.875rem] font-medium",
          missingChangeover
            ? "border-amber-200 bg-amber-50/70 text-amber-900"
            : "border-slate-200 bg-slate-50 text-slate-900",
        )}
      >
        {parts.join(" · ")}
      </p>

      {missingChangeover ? (
        <p
          role="alert"
          className="flex items-start gap-2 text-[0.8125rem] leading-5 text-amber-800"
        >
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {
            i18n.resolve(
              "host.v2.calendar.changeover.required",
              "Choose a changeover day. Until you do, guests cannot book any dates.",
            ).text
          }
        </p>
      ) : null}

      <p className="text-[0.75rem] leading-5 text-slate-500">
        {
          i18n.resolve(
            "host.v2.calendar.booking_method.rules_elsewhere",
            "These rules apply to every date. The calendar sets what happens on particular dates.",
          ).text
        }
      </p>

      <Link
        href={`/host/listings/${listing.id}/availability`}
        className="inline-flex min-h-11 items-center gap-1 self-start text-[0.875rem] font-semibold text-[#0f172a] underline underline-offset-2 transition-colors duration-150 hover:text-slate-600 motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0f172a]"
      >
        {
          i18n.resolve(
            "host.v2.calendar.booking_method.edit_rules",
            "Edit booking rules",
          ).text
        }
        <ChevronRight className="size-4" aria-hidden />
      </Link>

      {weekly ? <FixedStaySyncWarning /> : null}
    </div>
  );
}
