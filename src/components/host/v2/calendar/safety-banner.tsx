"use client";

import { CircleAlert, CircleCheck, EyeOff, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { interpolate, useI18n } from "@/lib/i18n/client";
import { CALENDAR_ANCHOR, anchorProps } from "@/lib/host/v2/calendar-anchors";
import type { CalendarFormats } from "@/lib/host/v2/calendar-format";
import type { HostCalendarListing } from "@/lib/host/v2/calendar-types";
import type { HostListingStatusSummary } from "@/lib/host/v2/listing-status";
import {
  bookableDatesLabel,
  discoverabilityLabel,
  money,
  visibilityLabel,
} from "./calendar-labels";

/**
 * The whole truth about whether this listing can sell anything, in the one place a
 * host can act on it.
 *
 * It was a full-width banner across the top of the workspace, then a card at the top of
 * the panel; both stated it before the host had asked anything, and the panel version
 * repeated a warning the property card was already showing. It now lives inside the
 * expanded Availability editor — reachable in both scopes, including with dates
 * selected — while the short flag ("Needs attention · Guests cannot book any dates")
 * stays on the property card and the panel header.
 *
 * Nothing was shortened on the way in. It still never says "live" and stops there:
 * visibility, discoverability and how many dates are actually bookable are three
 * separate facts, and the warning states are the ones a host most needs to read.
 */
export function ListingSafetyExplanation({
  listing,
  summary,
  formats,
}: {
  listing: HostCalendarListing;
  summary: HostListingStatusSummary;
  formats: CalendarFormats;
}) {
  const i18n = useI18n();
  const visibility = visibilityLabel(i18n, summary.visibility);
  const discoverability = discoverabilityLabel(i18n, summary.discoverability);
  const bookable = bookableDatesLabel(
    i18n,
    summary.counts.bookable,
    summary.horizonMonths,
  );

  const warning =
    summary.bookability === "NO_PRICING"
      ? i18n.resolve(
          "host.v2.calendar.banner.no_pricing",
          "No pricing yet — guests cannot book any date until you set a nightly price.",
        )
      : summary.live && summary.bookability === "NONE_BOOKABLE"
        ? i18n.resolve(
            "host.v2.calendar.banner.no_bookable_dates",
            "No dates are currently available to book.",
          )
        : !summary.live
          ? interpolate(
              i18n.resolve(
                "host.v2.calendar.banner.not_live",
                "{status} — guests cannot find or book this listing right now.",
              ),
              { status: visibility.text },
            )
          : null;

  const usesDefaultPrice =
    summary.bookability === "BOOKABLE" &&
    listing.pricing !== null &&
    listing.datePrices.length === 0;

  const tone = warning ? (summary.live ? "warning" : "neutral") : "positive";
  const Icon = warning ? (summary.live ? CircleAlert : EyeOff) : CircleCheck;

  return (
    <section
      {...anchorProps(CALENDAR_ANCHOR.safetyBanner)}
      aria-label={
        i18n.resolve("host.v2.calendar.banner.label", "Listing status").text
      }
      className={cn(
        "flex items-start gap-2 rounded-lg px-2.5 py-2 text-[0.75rem]",
        tone === "warning"
          ? "bg-amber-50 text-amber-900"
          : tone === "neutral"
            ? "bg-slate-50 text-slate-700"
            : "bg-teal-50/70 text-teal-900",
      )}
    >
      <Icon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        {warning ? (
          <p
            className={cn(
              "font-semibold leading-4",
              warning.translated && "notranslate",
            )}
          >
            {warning.text}
          </p>
        ) : (
          <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 font-medium leading-4">
            <span className={visibility.translated ? "notranslate" : undefined}>
              {visibility.text}
            </span>
            <span aria-hidden>·</span>
            <span className={discoverability.translated ? "notranslate" : undefined}>
              {discoverability.text}
            </span>
            <span aria-hidden>·</span>
            <span className={bookable.translated ? "notranslate" : undefined}>
              {bookable.text}
            </span>
          </p>
        )}
        {usesDefaultPrice && listing.pricing ? (
          <p className="mt-1 flex items-start gap-1.5 leading-4 text-slate-600">
            <Info className="mt-px size-3 shrink-0" aria-hidden />
            {
              interpolate(
                i18n.resolve(
                  "host.v2.calendar.banner.default_price",
                  "Guests can book every open date at your default price of {price}.",
                ),
                {
                  price: money(
                    listing.pricing.baseNightlyRate,
                    listing.pricing.currency,
                    formats,
                  ),
                },
              ).text
            }
          </p>
        ) : null}
      </div>
    </section>
  );
}
